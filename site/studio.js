import {
  slotIds,
  cardInventory,
  prepareUpload,
  submitDrawing,
  reserveCard,
  releaseCard,
  renewBefore,
} from './upload.js?v=4';
import { drawTemplate, drawingTemplates } from './drawing-templates.js';
import { readReceipt, saveReceipt } from './receipt.js?v=2';

const $ = (id) => document.getElementById(id);
const canvas = $('sheet');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const settings = $('settings');
const tokenKey = 'oekaki-webar:staff-token';
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
  temporaryToken = '',
  preferred = '',
  upload = null;
let hasInk = false,
  busy = false,
  submittedCard = '';
let owner = crypto.randomUUID();
let lease = null,
  acquiring = null,
  retryAfter = 0,
  expiryTimer,
  editingSettings = false;

function storedToken() {
  try {
    return localStorage.getItem(tokenKey) ?? '';
  } catch {
    return '';
  }
}
function currentToken() {
  return temporaryToken || storedToken();
}
function cardStatus(message) {
  $('card-status').textContent = message;
}
function claim(key, slot) {
  if (acquiring) return acquiring;
  $('setup').disabled = true;
  cardStatus('カード番号を確認しています…');
  acquiring = reserveCard(key, owner, slot)
    .then((result) => {
      lease = result;
      clearTimeout(expiryTimer);
      cardStatus(lease.slot + '番で描いています。このカードを使えます。');
      expiryTimer = setTimeout(
        () => cardStatus(lease.slot + '番の予約期限を迎えました。次の操作で空きを確認します。'),
        Math.max(0, lease.expires - Date.now()),
      );
      return lease;
    })
    .catch((error) => {
      retryAfter = Date.now() + 15000;
      cardStatus(
        (error instanceof TypeError ? '通信を確認してください。' : error.message) +
          ' 絵はこの画面に残ります。',
      );
      throw error;
    })
    .finally(() => {
      acquiring = null;
      $('setup').disabled = busy;
    });
  return acquiring;
}
function drawingActivity() {
  const token = currentToken();
  if (!token || acquiring || busy || Date.now() < retryAfter) return;
  if (lease && lease.expires - Date.now() > renewBefore) return;
  claim(token, preferred || lease?.slot || '').catch(() => {});
}
function forgetCard() {
  clearTimeout(expiryTimer);
  owner = crypto.randomUUID();
  lease = null;
  preferred = '';
  retryAfter = 0;
}

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
  $('send').disabled = !hasInk || busy || Boolean(submittedCard);
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
const templateDialog = $('templates');
$('choose-template').onclick = () => {
  if (busy || pointer !== null) return;
  $('template-help').hidden = !hasInk;
  templateDialog.showModal();
};
$('close-templates').onclick = () => templateDialog.close();
for (const template of drawingTemplates) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'template-option';
  const preview = document.createElement('canvas');
  preview.width = preview.height = 160;
  preview.setAttribute('aria-hidden', 'true');
  drawTemplate(preview, template);
  button.append(preview, template.name);
  button.onclick = () => {
    if (busy || pointer !== null) return;
    remember();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTemplate(canvas, template);
    pickTool('bucket');
    templateDialog.close();
    refresh();
    drawingActivity();
  };
  $('template-options').append(button);
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
  if (hasInk) drawingActivity();
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
  if (tool !== 'eraser' || hasInk) drawingActivity();
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
    if (hasInk) drawingActivity();
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
  a.download = (lease?.slot || preferred || 'drawing') + '.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
const slotSelect = $('slot');
for (const id of slotIds) slotSelect.add(new Option(id + '番', id));
let inventoryRequest = 0;
function renderSlots(inventory) {
  for (const option of slotSelect.options) {
    if (!option.value) continue;
    const id = option.value;
    const card = inventory?.cards[id];
    const active = card?.expires > Date.now();
    let label = '';
    if (!inventory) label = '（未確認）';
    else if (inventory.used.has(id)) label = '（使用済み）';
    else if (active) label = card.owner === owner ? '（この端末で描画中）' : '（描画中）';
    option.disabled = !inventory || inventory.used.has(id) || (active && card.owner !== owner);
    option.text = id + '番' + label;
  }
}
async function refreshSlots() {
  const request = ++inventoryRequest;
  const status = $('availability');
  $('reload-slots').disabled = true;
  status.textContent = 'カードの空き状況を確認しています…';
  try {
    const inventory = await cardInventory($('token').value.trim() || currentToken());
    if (request !== inventoryRequest) return;
    renderSlots(inventory);
    const free = slotIds.filter(
      (id) => !inventory.used.has(id) && !(inventory.cards[id]?.expires > Date.now()),
    ).length;
    if (slotSelect.selectedOptions[0]?.disabled) {
      status.textContent =
        slotSelect.selectedOptions[0].text + 'です。ほかの番号を選んでください。';
    } else {
      status.textContent = '空きは' + free + '枚です。';
    }
  } catch {
    if (request === inventoryRequest) {
      renderSlots(null);
      status.textContent =
        '空き状況を取得できませんでした。通信とトークンを確認して更新してください。';
    }
  } finally {
    if (request === inventoryRequest) $('reload-slots').disabled = false;
  }
}
$('reload-slots').onclick = refreshSlots;
function openSettings() {
  const token = currentToken();
  $('connection').textContent = '送信するにはスタッフの設定が必要です。';
  if (token) {
    $('connection').textContent = temporaryToken
      ? 'このタブは接続済みです。'
      : 'このブラウザにトークンを保存済みです。';
  }
  $('slot').value = preferred;
  $('disconnect').hidden = !token;
  renderSlots(null);
  settings.showModal();
  refreshSlots();
}
$('setup').onclick = openSettings;
$('close').onclick = () => settings.close();
settings.addEventListener('cancel', (event) => {
  if (editingSettings) event.preventDefault();
});
setInterval(() => {
  if (settings.open && !document.hidden && !editingSettings && !$('reload-slots').disabled)
    refreshSlots();
}, 30000);
settings.addEventListener('close', () => {
  inventoryRequest++;
  $('token').value = '';
});
function lockSettings(locked) {
  editingSettings = locked;
  for (const control of $('settings-form').elements) control.disabled = locked;
}
$('disconnect').onclick = async () => {
  const token = currentToken();
  lockSettings(true);
  try {
    if (storedToken()) localStorage.removeItem(tokenKey);
    temporaryToken = '';
    let released = true;
    if (token && lease) {
      try {
        await releaseCard(token, owner);
      } catch {
        released = false;
      }
    }
    forgetCard();
    settings.close();
    cardStatus('カード番号を確保するには端末設定が必要です。');
    say(
      released
        ? '接続を解除しました。'
        : '接続を解除しました。カードの予約は期限が来ると空きに戻ります。',
    );
  } catch {
    $('connection').textContent = '保存したトークンを削除できませんでした。';
  } finally {
    lockSettings(false);
  }
};
$('settings-form').onsubmit = async (e) => {
  e.preventDefault();
  if (editingSettings) return;
  const enteredToken = $('token').value.trim();
  const next = enteredToken || currentToken();
  if (!next) {
    $('connection').textContent = 'トークンを入力してください。';
    $('token').focus();
    return;
  }
  if (slotSelect.selectedOptions[0]?.disabled) {
    $('connection').textContent = '空き番号を選ぶか、自動で使う設定を選んでください。';
    slotSelect.focus();
    return;
  }
  const selection = slotSelect.value;
  lockSettings(true);
  try {
    if (hasInk || lease || selection) await claim(next, selection);
    else if (enteredToken) await cardInventory(next);
    if (!lease) cardStatus('描き始めると、空いているカード番号を確保します。');
    try {
      localStorage.setItem(tokenKey, next);
      temporaryToken = '';
    } catch {
      temporaryToken = next;
    }
    preferred = selection;
    settings.close();
    say(
      temporaryToken
        ? 'このタブは接続しました。ブラウザに保存できませんでした。'
        : 'このブラウザに端末設定を保存しました。',
    );
  } catch (error) {
    $('connection').textContent = error.message;
    await refreshSlots();
  } finally {
    lockSettings(false);
  }
};
function showReceipt(id) {
  submittedCard = id;
  clearTimeout(expiryTimer);
  $('assigned').textContent = id;
  $('view-link').href = 'v/?id=' + id;
  $('wait-game-link').href = 'v/?id=' + id + '&play=1';
  $('studio').hidden = true;
  $('receipt').hidden = false;
  $('setup').disabled = true;
  $('view-link').focus();
}
$('send').onclick = async () => {
  if (busy || submittedCard || !hasInk) return;
  const token = currentToken();
  if (!token) {
    openSettings();
    return;
  }
  busy = true;
  $('tools').disabled = true;
  $('setup').disabled = true;
  say('絵を送信しています…');
  try {
    if (acquiring) await acquiring;
    if (!lease) await claim(token, preferred);
    upload ??= await prepareUpload(await png());
    if (currentToken() !== token)
      throw new Error('端末の接続が変わりました。もう一度「完成」を押してください。');
    const id = await submitDrawing(token, upload, owner, lease.slot);
    saveReceipt(id);
    showReceipt(id);
  } catch (error) {
    say(
      error instanceof TypeError
        ? '通信が途切れました。絵は残っています。もう一度「完成」を押してください。'
        : error.message,
    );
  } finally {
    busy = false;
    $('tools').disabled = false;
    $('setup').disabled = Boolean(submittedCard);
    refresh();
  }
};
const savedCard = readReceipt();
if (slotIds.includes(savedCard)) showReceipt(savedCard);
else if (currentToken()) cardStatus('描き始めると、空いているカード番号を確保します。');
refresh();
