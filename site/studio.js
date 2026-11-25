import { slotIds, prepareUpload, submitDrawing } from './upload.js';

const $ = (id) => document.getElementById(id);
const canvas = $('sheet');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const settings = $('settings');
const history = [];
const colors = [
  ['ink', 'すみ色'],
  ['coral', 'あか'],
  ['sun', 'きいろ'],
  ['leaf', 'みどり'],
  ['sky', 'みずいろ'],
  ['violet', 'むらさき'],
  ['soil', 'ちゃいろ'],
  ['snow', 'しろ'],
];
let color,
  tool = 'pen',
  pointer = null,
  lastPoint,
  token = '',
  preferred = '',
  upload = null;
let hasInk = false,
  busy = false;

function say(message) {
  $('feedback').textContent = message;
}
function refresh() {
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  hasInk = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) {
      hasInk = true;
      break;
    }
  }
  $('hint').hidden = hasInk;
  $('send').disabled = !hasInk || busy;
  $('undo').disabled = !history.length;
  $('download').disabled = !hasInk || busy;
}
function remember() {
  history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (history.length > 8) history.shift();
  upload = null;
  say('');
}
function pickTool(name) {
  tool = name;
  for (const id of ['pen', 'bucket', 'eraser']) $(id).setAttribute('aria-pressed', id === name);
}
for (const id of ['pen', 'bucket', 'eraser']) $(id).onclick = () => pickTool(id);
for (const [name, label] of colors) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.dataset.name = name;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.setAttribute('aria-pressed', name === 'ink');
  button.onclick = () => {
    for (const item of $('palette').children) item.setAttribute('aria-pressed', item === button);
    color = getComputedStyle(button).backgroundColor;
    if (tool === 'eraser') pickTool('pen');
  };
  $('palette').append(button);
}
color = getComputedStyle($('palette').firstElementChild).backgroundColor;
function point(event) {
  const r = canvas.getBoundingClientRect();
  return [
    ((event.clientX - r.left) * canvas.width) / r.width,
    ((event.clientY - r.top) * canvas.height) / r.height,
  ];
}
function stroke(from, to) {
  ctx.save();
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.lineWidth = Number($('width').value);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...from);
  ctx.lineTo(...to);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(...to, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function fillAt([px, py]) {
  const w = canvas.width,
    h = canvas.height;
  const start =
    Math.min(h - 1, Math.max(0, Math.floor(py))) * w + Math.min(w - 1, Math.max(0, Math.floor(px)));
  const frame = ctx.getImageData(0, 0, w, h),
    data = frame.data;
  const before = data.slice(start * 4, start * 4 + 4);
  const after = color.match(/\d+/g).slice(0, 3).map(Number).concat(255);
  if (after.every((v, i) => v === before[i])) return;
  const queue = new Int32Array(w * h),
    seen = new Uint8Array(w * h);
  let tail = 1;
  queue[0] = start;
  seen[start] = 1;
  function add(pixel) {
    if (seen[pixel]) return;
    seen[pixel] = 1;
    for (let i = 0; i < 4; i++) if (Math.abs(data[4 * pixel + i] - before[i]) > 30) return;
    queue[tail++] = pixel;
  }
  for (let head = 0; head < tail; head++) {
    const p = queue[head],
      x = p % w;
    if (before[3] === 0 && (x === 0 || x === w - 1 || p < w || p >= w * (h - 1))) {
      say('線で囲んだところをタップしてね。');
      return;
    }
    if (x) add(p - 1);
    if (x < w - 1) add(p + 1);
    if (p >= w) add(p - w);
    if (p < w * (h - 1)) add(p + w);
  }
  remember();
  for (let i = 0; i < tail; i++) data.set(after, queue[i] * 4);
  ctx.putImageData(frame, 0, 0);
  refresh();
}
canvas.onpointerdown = (event) => {
  if (busy || pointer !== null || event.button !== 0) return;
  event.preventDefault();
  if (tool === 'bucket') {
    fillAt(point(event));
    return;
  }
  remember();
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  lastPoint = point(event);
  stroke(lastPoint, lastPoint);
  $('hint').hidden = true;
};
canvas.onpointermove = (event) => {
  if (pointer !== event.pointerId) return;
  const next = point(event);
  stroke(lastPoint, next);
  lastPoint = next;
};
function finishStroke(event) {
  if (pointer !== event.pointerId) return;
  pointer = null;
  refresh();
}
canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = finishStroke;
$('undo').onclick = () => {
  if (history.length) ctx.putImageData(history.pop(), 0, 0);
  upload = null;
  refresh();
};
$('import').onchange = async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    if (file.type !== 'image/png' || file.size > 15_000_000)
      throw new Error('15MB以下のPNGを選んでください。');
    const image = new Image();
    image.src = url;
    await image.decode();
    if (busy) return;
    remember();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    const w = image.width * scale,
      h = image.height * scale;
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    refresh();
  } catch (error) {
    say(error.message);
  } finally {
    URL.revokeObjectURL(url);
  }
};
function png() {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNGを作れませんでした。'))),
      'image/png',
    ),
  );
}
$('download').onclick = async () => {
  const url = URL.createObjectURL(await png());
  const a = document.createElement('a');
  a.href = url;
  a.download = (preferred || 'drawing') + '.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
for (const id of slotIds) $('slot').add(new Option(id + '番', id));
function openSettings() {
  $('connection').textContent = token
    ? 'このタブは設定済みです。'
    : '送信するにはスタッフの設定が必要です。';
  $('slot').value = preferred;
  $('disconnect').hidden = !token;
  settings.showModal();
}
$('setup').onclick = openSettings;
$('close').onclick = () => settings.close();
settings.addEventListener('close', () => {
  $('token').value = '';
});
$('disconnect').onclick = () => {
  token = '';
  preferred = '';
  settings.close();
  say('このタブの接続を解除しました。');
};
$('settings-form').onsubmit = (e) => {
  e.preventDefault();
  const next = $('token').value.trim() || token;
  if (!next) {
    $('connection').textContent = 'トークンを入力してください。';
    $('token').focus();
    return;
  }
  token = next;
  preferred = $('slot').value;
  settings.close();
  say('端末を設定しました。絵ができたら「完成」を押してください。');
};
$('send').onclick = async () => {
  if (busy || !hasInk) return;
  if (!token) {
    openSettings();
    return;
  }
  busy = true;
  $('tools').disabled = true;
  $('setup').disabled = true;
  say('絵を送信しています…');
  try {
    upload ??= await prepareUpload(await png());
    const id = await submitDrawing(token, upload, preferred);
    $('assigned').textContent = id;
    $('view-link').href = 'v/?id=' + id;
    $('studio').hidden = true;
    $('receipt').hidden = false;
    $('view-link').focus();
  } catch (error) {
    say(
      error instanceof TypeError
        ? '通信が途切れました。絵は残っています。もう一度「完成」を押してください。'
        : error.message,
    );
  } finally {
    busy = false;
    $('tools').disabled = false;
    $('setup').disabled = false;
    refresh();
  }
};
$('next').onclick = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  history.length = 0;
  upload = null;
  preferred = '';
  say('');
  refresh();
  $('receipt').hidden = true;
  $('studio').hidden = false;
  pickTool('pen');
};
refresh();
