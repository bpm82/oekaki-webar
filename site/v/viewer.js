import { slot, currentWork, asset } from './slot.js';
const $ = (id) => document.getElementById(id);
const gameButton = $('play-waiting');
const gameDialog = $('wait-game-dialog');
const gameFrame = $('wait-game-frame');
const fromReceipt = new URLSearchParams(location.search).get('play') === '1';
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
  if (!gameFrame.hasAttribute('src')) gameFrame.src = '../christmas-game/?embedded=1';
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
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== gameFrame.contentWindow) return;
  if (event.data?.type === 'oekaki-wait-game:connected') sendGameState();
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
  $('card').hidden = false;
  $('card').href = '../cards/?id=' + slot;
  checking = true;
  try {
    const work = await currentWork();
    updateWaitingGame(work);
    const modelVersion = work?.modelVersion || work?.source;
    if (activeModel && activeModel.dataset.source !== modelVersion) {
      activeModel.remove();
      activeModel = null;
    }
    if (work?.state === 'ready') {
      $('ar').href = 'ar.html?id=' + slot;
      $('ar').hidden = false;
      if (activeModel) return;
      showDrawing(work);
      message(
        '立体ができました！',
        '指で回して見てみよう。カードの上に出すときは「カードにかざす」を押してね。',
      );
      try {
        await import('../vendor/model-viewer.js');
      } catch {
        message(
          '立体ができました！',
          '3Dプレビューを読み込めませんでした。「カードにかざす」からARを開けます。',
        );
        return;
      }
      const model = document.createElement('model-viewer');
      model.setAttribute('camera-controls', '');
      model.setAttribute('touch-action', 'pan-y');
      model.setAttribute('shadow-intensity', '0.7');
      model.setAttribute('alt', slot + '番の絵からできた3D作品');
      model.setAttribute('camera-orbit', '180deg 80deg auto');
      model.setAttribute('loading', 'eager');
      model.addEventListener('load', () => {
        $('drawing').hidden = true;
      });
      model.addEventListener('error', () => {
        message('プレビューを表示できませんでした', '下のボタンでカードのARを開けます。');
      });
      model.dataset.source = modelVersion;
      model.src = asset(slot + '.glb', modelVersion);
      $('media').hidden = false;
      $('media').append(model);
      activeModel = model;
      return;
    }
    $('ar').hidden = true;
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
check();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !activeModel) check();
});
