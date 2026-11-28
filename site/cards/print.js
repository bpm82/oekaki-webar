const first = document.getElementById('first'),
  last = document.getElementById('last');
const list = document.getElementById('cards'),
  form = document.getElementById('controls');
const selected = Number(new URLSearchParams(location.search).get('id'));
if (Number.isInteger(selected) && selected >= 1 && selected <= 100) first.value = last.value = selected;
function draw() {
  const start = first.valueAsNumber,
    end = last.valueAsNumber;
  last.setCustomValidity(end < start ? '最後の番号を、最初の番号以上にしてください。' : '');
  list.replaceChildren();
  if (!form.checkValidity()) return;
  for (let number = start; number <= end; number++) {
    const id = String(number).padStart(2, '0');
    const card = document.createElement('article');
    card.className = 'printed-card';
    const heading = document.createElement('h2');
    heading.textContent = 'おえかき立体工房　' + id + '番';
    const img = document.createElement('img');
    img.src = '../assets/' + id + '/marker.svg';
    img.alt = id + '番のQR兼ARマーカー';
    const link = document.createElement('a');
    link.href = '../v/?id=' + id + '&view=3d';
    link.textContent = 'この番号の作品を見る';
    const hint = document.createElement('p');
    hint.textContent = 'QRを読んでカメラを許可し、このカードの黒い枠全体を映してね。';
    const downloads = document.createElement('div');
    downloads.className = 'card-downloads no-print';
    for (const format of ['png', 'svg']) {
      const save = document.createElement('a');
      save.href = '../assets/' + id + '/marker.' + format;
      save.download = 'QR-' + id + '.' + format;
      save.textContent = format.toUpperCase() + 'で保存';
      save.setAttribute('aria-label', id + '番のQRを' + save.textContent);
      downloads.append(save);
    }
    card.append(heading, img, link, hint, downloads);
    list.append(card);
  }
}
form.addEventListener('input', draw);
form.onsubmit = async (event) => {
  event.preventDefault();
  draw();
  try {
    await Promise.all([...list.querySelectorAll('img')].map((img) => img.decode()));
    window.print();
  } catch {
    document.getElementById('error').textContent =
      'カードを読み込めませんでした。接続を確認してください。';
  }
};
draw();
