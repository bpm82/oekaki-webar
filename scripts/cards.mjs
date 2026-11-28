import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import qrcode from './vendor/qrcode.mjs';

function pngChunk(type, data = Buffer.alloc(0)) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

function markerPng(size, squares) {
  // Even scaling keeps the half-module panel inset on an exact pixel boundary.
  const pixelsPerModule = 16;
  const width = size * pixelsPerModule;
  const stride = width + 1;
  const rows = Buffer.alloc(stride * width, 255);
  for (let y = 0; y < width; y++) rows[y * stride] = 0; // PNG row filter: none.
  for (const [x, y, side, gray] of squares) {
    const start = x * pixelsPerModule + 1;
    const length = side * pixelsPerModule;
    for (let row = y * pixelsPerModule; row < (y + side) * pixelsPerModule; row++) {
      const offset = row * stride + start;
      rows.fill(gray, offset, offset + length);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8; // 8-bit grayscale, no alpha.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

// Adapted from the Itami workshop ticket: the center of the framed QR is
// the same image sampled by ARToolKit. The quiet zone belongs to that center.
function card(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const modules = qr.getModuleCount();
  const quiet = 4;
  const panel = modules + 2 * quiet;
  const outer = panel * 2;
  const margin = 6;
  const inset = margin + panel / 2;
  const paths = [];
  const squares = [[margin, margin, outer, 0], [inset, inset, panel, 255]];
  const samples = Array.from({ length: 16 }, () => Array(16).fill(0));
  const step = panel / 16;
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!qr.isDark(row, col)) continue;
      const x = col + quiet,
        y = row + quiet;
      paths.push(`M${x} ${y}h1v1h-1z`);
      squares.push([inset + x, inset + y, 1, 0]);
      for (let sy = Math.floor(y / step); sy <= Math.floor((y + 1) / step); sy++) {
        const height = Math.min(y + 1, (sy + 1) * step) - Math.max(y, sy * step);
        for (let sx = Math.floor(x / step); sx <= Math.floor((x + 1) / step); sx++) {
          const width = Math.min(x + 1, (sx + 1) * step) - Math.max(x, sx * step);
          samples[sy][sx] += width * height;
        }
      }
    }
  }
  const size = outer + 2 * margin;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><rect x="${margin}" y="${margin}" width="${outer}" height="${outer}"/><g transform="translate(${inset} ${inset})"><rect width="${panel}" height="${panel}" fill="white"/><path d="${paths.join('')}"/></g></svg>\n`;
  let cells = samples.map((row) => row.map((black) => Math.round(255 * (1 - black / (step * step)))));
  const turns = [];
  for (let turn = 0; turn < 4; turn++) {
    const mono = cells.map((row) => row.join(' ')).join('\n');
    turns.push([mono, mono, mono].join('\n'));
    cells = cells.map((_, y) => cells.map((row) => row[15 - y]));
  }
  return { svg, png: markerPng(size, squares), pattern: turns.join('\n\n') + '\n' };
}

const [base, output] = process.argv.slice(2);
if (!base || !output) throw new Error('Usage: node scripts/cards.mjs BASE_URL OUTPUT_DIR');
const root = new URL(base.endsWith('/') ? base : base + '/');
for (let number = 1; number <= 100; number++) {
  const slot = String(number).padStart(2, '0');
  const url = new URL(`v/?id=${slot}`, root);
  const { svg, png, pattern } = card(url.href);
  const dir = path.join(output, 'assets', slot);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'marker.svg'), svg);
  await writeFile(path.join(dir, 'marker.png'), png);
  await writeFile(path.join(dir, 'pattern.patt'), pattern);
}
