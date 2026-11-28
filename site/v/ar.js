import { cardNumber, slot, workCatalog } from './slot.js?v=2';
import { charmScene } from './charm-scene.js';

const status = document.getElementById('status');
const video = document.getElementById('camera');
const overlay = document.getElementById('charms');
const viewerPaths = new Set([
  new URL('./', location.href).href,
  'https://bpm82.github.io/oekaki-webar/v/', // URL on existing printed cards
]);
const guide = '見たいカードのQRをカメラに映してね。何枚か一緒に映しても見られるよ。';
let catalog, scene, worker, stream;
let scanTimer, catalogTimer;
let started = false, closed = false;

function tell(text) {
  if (status.textContent !== text) status.textContent = text;
}

function printedNumber(text) {
  try {
    const url = new URL(text);
    if (viewerPaths.has(url.origin + url.pathname)) return cardNumber(url.searchParams);
  } catch { /* Other QR codes can contain plain text. */ }
  return null;
}

function waiting(id) {
  const work = catalog[id];
  if (work?.state === 'failed') return id + '番は立体化をやり直す必要があります。スタッフに番号を伝えてください。';
  if (work?.state === 'pending') return id + '番を立体化しています。完成するとここに表示されます。';
  return id + '番の絵を待っています。';
}

function showStatus(cards, result) {
  const messages = [];
  if (result.ready.length === 1) messages.push(result.ready[0] + '番の作品を表示中。');
  if (result.ready.length > 1) messages.push(result.ready.length + '枚のカードに作品を表示中。');
  if (result.loading.length) messages.push(result.loading.length + '作品を読み込み中…');
  if (result.error.length) messages.push(result.error.join('・') + '番を読み込めませんでした。自動で再試行します。');
  const unfinished = new Set(cards.map(({ id }) => id).filter((id) => catalog[id]?.state !== 'ready'));
  for (const id of unfinished) messages.push(waiting(id));
  if (!messages.length) {
    if (catalog[slot]?.state !== 'ready') messages.push(waiting(slot));
    messages.push(guide);
  }
  tell(messages.join(' '));
}

function stop() {
  if (closed) return;
  closed = true;
  clearTimeout(scanTimer);
  clearTimeout(catalogTimer);
  worker?.terminate();
  stream?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  scene?.dispose();
}

function fail(message) {
  if (closed) return;
  stop();
  tell(message);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    fail('カメラを使えるブラウザで、このカードのURLを開いてください。');
    return;
  }
  tell('カメラを準備しています… 利用を聞かれたら「許可」を選んでね。');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    if (closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    video.srcObject = stream;
    await video.play();
  } catch {
    fail('カメラを開けませんでした。カメラの利用を許可して、ページを開き直してください。');
    return;
  }
  const cameraError = () => fail('カメラが停止しました。ページを開き直してください。');
  stream.getVideoTracks()[0].addEventListener('ended', cameraError);
  video.addEventListener('error', cameraError);
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.onload = resolve;
    script.onerror = reject;
    script.src = '../vendor/aframe.js';
    document.head.append(script);
  });
  if (closed) return;
  scene = charmScene(window.AFRAME.THREE, overlay);
  const frame = document.createElement('canvas');
  const context = frame.getContext('2d', { willReadFrequently: true });
  worker = new Worker('./qr-worker.js');
  const scanError = () => fail('QRの読み取りを開始できませんでした。通信を確認してページを開き直してください。');
  worker.onerror = scanError;
  worker.onmessageerror = scanError;
  let lastScan = 0, lastVideoTime = -1;
  function scan() {
    if (closed) return;
    if (document.hidden || video.readyState < 2 || video.currentTime === lastVideoTime) {
      scanTimer = setTimeout(scan, document.hidden ? 400 : 50);
      return;
    }
    // Read the exact centre crop shown by the full-screen object-fit: cover video.
    const fit = Math.max(overlay.clientWidth / video.videoWidth, overlay.clientHeight / video.videoHeight);
    const width = overlay.clientWidth / fit, height = overlay.clientHeight / fit;
    const scale = Math.min(1, 1440 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    if (frame.width !== w || frame.height !== h) {
      frame.width = w;
      frame.height = h;
    }
    context.drawImage(video, (video.videoWidth - width) / 2, (video.videoHeight - height) / 2,
      width, height, 0, 0, w, h);
    const pixels = context.getImageData(0, 0, w, h);
    lastScan = performance.now();
    lastVideoTime = video.currentTime;
    worker.postMessage(pixels, [pixels.data.buffer]);
  }
  worker.onmessage = ({ data }) => {
    if (closed) return;
    if (data.error) return scanError();
    const cards = [];
    for (const { text, position } of data.cards) {
      const id = printedNumber(text);
      if (id) cards.push({ id, position });
    }
    const result = scene.update(cards, catalog, frame.width, frame.height);
    showStatus(cards, result);
    // One frame in flight. Slower phones naturally scan less often.
    scanTimer = setTimeout(scan, Math.max(0, 80 - (performance.now() - lastScan)));
  };
  tell('QRを読み取る準備をしています…');
  scan();
}

async function refreshCatalog() {
  if (!document.hidden) {
    try {
      catalog = await workCatalog();
    } catch {
      if (!catalog) tell('作品を確認できませんでした。通信が戻ると自動で確認します。');
    }
    if (closed) return;
    if (catalog && !started) {
      if (Object.values(catalog).some((entry) => entry.state === 'ready')) {
        started = true;
        startCamera().catch(() => fail('ARを読み込めませんでした。通信を確認してページを開き直してください。'));
      } else {
        tell(waiting(slot));
      }
    }
  }
  if (!closed) catalogTimer = setTimeout(refreshCatalog, 15000);
}

window.addEventListener('pagehide', stop, { once: true });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
if (slot) refreshCatalog();
else tell('番号付きのカードのQRから開いてください。');
