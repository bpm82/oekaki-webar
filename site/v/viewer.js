import { slot, currentWork, asset } from './slot.js';
import { clearReceipt, readGameDrawing, readReceipt } from '../receipt.js?v=3';
import { personalBests, queueRound, retryPendingRounds, syncEventRounds } from '../event-ranking.js';
import { storedToken } from '../upload.js?v=5';
const $ = (id) => document.getElementById(id);
const gameButton = $('play-waiting');
const gameDialog = $('wait-game-dialog');
const gameFrame = $('wait-game-frame');
const markerButton = $('show-marker');
const markerDialog = $('marker-dialog');
const receptionMenu = $('reception-menu');
const query = new URLSearchParams(location.search);
const fromReceipt = query.get('play') === '1';
const eventStation = slot && (Boolean(storedToken()) || readReceipt() === slot);
let openOnce = fromReceipt;
let generationState = 'pending';
let activeModel = null;
let timer;
let checking = false;

function sendGameState() {
  if (gameDialog.open) {
    gameFrame.contentWindow?.postMessage(
      { type: 'oekaki-wait-game:state', state: generationState },
      location.origin,
    );
  }
}

function openWaitingGame() {
  if (gameButton.hidden || gameDialog.open) return;
  if (!gameFrame.hasAttribute('src'))
    gameFrame.src = '../christmas-game/?embedded=1' + (eventStation ? '&id=' + slot : '');
  gameDialog.showModal();
  sendGameState();
}

function updateWaitingGame(work) {
  const state = work?.state ?? 'pending';
  if (generationState !== 'pending' && state === 'pending' && !gameDialog.open) {
    gameFrame.removeAttribute('src');
  }
  generationState = state;
  gameButton.hidden = state !== 'pending' || (!work && !fromReceipt);
  if (openOnce && !gameButton.hidden) {
    openOnce = false;
    openWaitingGame();
  } else {
    sendGameState();
  }
}

gameButton.addEventListener('click', openWaitingGame);
gameDialog.addEventListener('close', () => {
  gameFrame.contentWindow?.postMessage({ type: 'oekaki-wait-game:closed' }, location.origin);
});
markerButton.addEventListener('click', () => {
  $('card-marker').src = asset('marker.png');
  markerDialog.showModal();
});
$('new-reception').addEventListener('click', () => {
  if (receptionMenu.hidden || !receptionMenu.open) return;
  clearReceipt();
  location.replace('../');
});
function updateCompletedActions() {
  const ready = generationState === 'ready';
  document.documentElement.classList.toggle('work-ready', ready);
  markerButton.hidden = !ready;
  receptionMenu.hidden = !ready;
  if (receptionMenu.hidden) receptionMenu.open = false;
}
async function refreshGameRanking() {
  if (!eventStation) return;
  const frame = gameFrame.contentWindow;
  try {
    const rounds = await syncEventRounds();
    frame?.postMessage({
      type: 'oekaki-wait-game:ranking', scores: personalBests(rounds),
      recorded: rounds.filter((round) => round.card === slot).map((round) => round.id),
    }, location.origin);
  } catch (error) {
    frame?.postMessage({
      type: 'oekaki-wait-game:ranking-error',
      message: error instanceof TypeError ? '通信が戻ると自動で更新します。' : error.message,
    }, location.origin);
  }
}
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== gameFrame.contentWindow) return;
  if (event.data?.type === 'oekaki-wait-game:connected') {
    const drawing = readGameDrawing(slot);
    if (drawing) event.source.postMessage({ type: 'oekaki-wait-game:drawing', drawing }, location.origin);
    sendGameState();
    refreshGameRanking();
  }
  if (event.data?.type === 'oekaki-wait-game:refresh-ranking') refreshGameRanking();
  if (eventStation && event.data?.type === 'oekaki-wait-game:round') {
    queueRound({ ...event.data.round, card: slot });
    refreshGameRanking();
  }
  if (event.data?.type === 'oekaki-wait-game:show-work' && generationState !== 'pending' && gameDialog.open) {
    gameDialog.close();
    $('title').focus({ preventScroll: true });
  }
});

function message(title, description) {
  $('title').textContent = title;
  $('message').textContent = description;
}
function checkLater() {
  clearTimeout(timer);
  timer = setTimeout(check, 15000);
}
function showDrawing(work) {
  $('drawing').hidden = !work?.preview;
  if (work?.preview) $('drawing').src = asset('drawing.png', work.source);
  $('media').hidden = !work?.preview;
}
async function check() {
  if (checking) return;
  clearTimeout(timer);
  if (!slot) {
    message('カード番号が見つかりません', 'カードに印刷されたQRをもう一度読み取ってください。');
    return;
  }
  $('number').textContent = slot;
  checking = true;
  try {
    const work = await currentWork();
    updateWaitingGame(work);
    updateCompletedActions();
    const modelVersion = work?.modelVersion || work?.source;
    if (activeModel && activeModel.dataset.source !== modelVersion) {
      activeModel.remove();
      activeModel = null;
    }
    if (work?.state === 'ready') {
      if (activeModel) return;
      showDrawing(work);
      message('立体ができました！', '指で回して見てみよう。');
      try {
        await import('../vendor/model-viewer.js');
      } catch {
        message(
          '立体ができました！',
          '3Dプレビューを読み込めませんでした。ページを開き直してください。',
        );
        return;
      }
      const model = document.createElement('model-viewer');
      model.setAttribute('camera-controls', '');
      model.setAttribute('touch-action', 'none');
      model.setAttribute('shadow-intensity', '0.7');
      model.setAttribute('alt', slot + '番の絵からできた3D作品');
      model.setAttribute('camera-orbit', '180deg 80deg auto');
      model.setAttribute('loading', 'eager');
      model.addEventListener('load', () => {
        $('drawing').hidden = true;
      });
      model.addEventListener('error', () => {
        message('プレビューを表示できませんでした', 'ページを開き直してください。');
      });
      model.dataset.source = modelVersion;
      model.src = asset(slot + '.glb', modelVersion);
      $('media').hidden = false;
      $('media').append(model);
      activeModel = model;
      return;
    }
    showDrawing(work);
    if (work?.state === 'failed')
      message(
        'この絵の立体化をやり直す必要があります',
        'スタッフにカード番号を伝えてください。再生成が終わると、ここに表示されます。',
      );
    else if (work)
      message(
        'いま、絵を立体にしています',
        'この画面は自動で更新されます。カードを持ち帰って、あとから開いても大丈夫です。',
      );
    else
      message(
        'この番号の絵を待っています',
        '送信したばかりのときは、このまま少し待ってね。画面は自動で更新されます。',
      );
  } catch {
    message(
      '作品の情報を取得できませんでした',
      'インターネットの接続を確認してください。自動で再確認します。',
    );
  } finally {
    checking = false;
  }
  checkLater();
}
// Existing printed markers encode ?id=NN. The studio opts into the 3D viewer.
if (slot && query.get('id') && query.get('view') !== '3d' && !fromReceipt) {
  location.replace('ar.html?id=' + slot);
} else {
  retryPendingRounds();
  const refreshScores = () => gameDialog.open ? refreshGameRanking() : retryPendingRounds();
  window.addEventListener('online', refreshScores);
  window.setInterval(() => { if (!document.hidden) refreshScores(); }, 30000);
  check();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !activeModel) check();
  });
}
