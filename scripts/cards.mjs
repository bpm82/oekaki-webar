import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import qrcode from './vendor/qrcode.mjs';

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
  const samples = Array.from({ length: 16 }, () => Array(16).fill(0));
  const step = panel / 16;
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!qr.isDark(row, col)) continue;
      const x = col + quiet,
        y = row + quiet;
      paths.push(`M${x} ${y}h1v1h-1z`);
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
  return { svg, pattern: turns.join('\n\n') + '\n' };
}

const [base, output] = process.argv.slice(2);
if (!base || !output) throw new Error('Usage: node scripts/cards.mjs BASE_URL OUTPUT_DIR');
const root = new URL(base.endsWith('/') ? base : base + '/');
for (let number = 1; number <= 100; number++) {
  const slot = String(number).padStart(2, '0');
  const url = new URL(`v/?id=${slot}`, root);
  const { svg, pattern } = card(url.href);
  const dir = path.join(output, 'assets', slot);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'marker.svg'), svg);
  await writeFile(path.join(dir, 'pattern.patt'), pattern);
}
