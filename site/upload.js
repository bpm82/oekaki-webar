const repository = 'https://api.github.com/repos/bpm82/oekaki-webar';
const registry = 'reservations/cards.json';
const hour = 60 * 60 * 1000;
export const renewBefore = hour / 2;
export const slotIds = Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(2, '0'));

async function api(key, path, method = 'GET', body) {
  const response = await fetch(repository + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(key ? { Authorization: 'Bearer ' + key } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const message = [401, 403, 404].includes(response.status)
      ? '通信と、このリポジトリの Contents に書き込めるトークンを確認してください。'
      : 'GitHubに接続できませんでした（' + response.status + '）。もう一度お試しください。';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response.json();
}

export async function cardInventory(key) {
  const { commit } = await api(key, '/branches/main');
  const root = commit.commit.tree.sha;
  const { tree, truncated } = await api(key, '/git/trees/' + root + '?recursive=1');
  if (truncated || !Array.isArray(tree))
    throw new Error('カードの空き状況をすべて確認できませんでした。');
  const files = new Map(tree.map(({ path, sha }) => [path, sha]));
  const used = new Map();
  for (const id of slotIds) {
    const sha = files.get('assets/' + id + '/drawing.png') || files.get('drawings/' + id + '.png');
    if (sha) used.set(id, sha);
  }
  let cards = {};
  if (files.has(registry)) {
    const blob = await api(key, '/git/blobs/' + files.get(registry));
    cards = JSON.parse(atob(blob.content));
    if (
      !cards ||
      Array.isArray(cards) ||
      typeof cards !== 'object' ||
      !Object.entries(cards).every(
        ([id, card]) =>
          slotIds.includes(id) &&
          card &&
          typeof card.owner === 'string' &&
          (Number.isFinite(card.expires) || typeof card.drawing === 'string'),
      )
    )
      throw new Error('カードの予約状況を読み取れませんでした。スタッフにお知らせください。');
  }
  return { head: commit.sha, root, used, cards };
}

// Publish the drawing and its registry change together, only against the snapshot we checked.
async function updateCards(key, change) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const state = await cardInventory(key);
    const { message, result, files = [] } = change(state);
    if (!message) return result;
    const tree = await api(key, '/git/trees', 'POST', {
      base_tree: state.root,
      tree: [
        {
          path: registry,
          mode: '100644',
          type: 'blob',
          content: JSON.stringify(state.cards, null, 2) + '\n',
        },
        ...files,
      ],
    });
    const commit = await api(key, '/git/commits', 'POST', {
      message,
      tree: tree.sha,
      parents: [state.head],
    });
    try {
      await api(key, '/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
      return result;
    } catch (error) {
      if (error.status !== 409 && error.status !== 422) throw error;
      // Another station or the converter advanced main. Re-evaluate availability on the new head.
      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 180 * (attempt + 1)),
      );
    }
  }
  throw new Error('ほかの端末が受付中です。少し待ってから、もう一度お試しください。');
}

export function reserveCard(key, owner, preferred = '') {
  return updateCards(key, ({ used, cards }) => {
    const now = Date.now();
    const received = slotIds.find(
      (id) => cards[id]?.owner === owner && cards[id].drawing && used.has(id),
    );
    if (received)
      throw new Error(
        received + '番はこの絵を受付済みです。「完成」をもう一度押して確認してください。',
      );
    const owned = slotIds.find(
      (id) => cards[id]?.owner === owner && cards[id].expires && !used.has(id),
    );
    const available = (id) =>
      !used.has(id) && !(cards[id]?.expires > now && cards[id].owner !== owner);
    const slot = preferred || owned || slotIds.find(available);
    if (!slot) throw new Error('すべての番号が使用済みか描画中です。');
    if (!slotIds.includes(slot) || !available(slot)) {
      const status = used.has(slot) ? '使用済み' : 'ほかの端末で描画中';
      throw new Error(slot + '番は' + status + 'です。端末設定で空いている番号を選んでください。');
    }
    if (owned === slot && cards[slot].expires - now > renewBefore)
      return { result: { slot, expires: cards[slot].expires } };
    if (owned) delete cards[owned];
    const expires = now + hour;
    cards[slot] = { owner, expires };
    return { message: 'Reserve card ' + slot, result: { slot, expires } };
  });
}

export function releaseCard(key, owner) {
  return updateCards(key, ({ cards }) => {
    const id = slotIds.find((id) => cards[id]?.owner === owner && cards[id].expires);
    if (!id) return {};
    delete cards[id];
    return { message: 'Release card ' + id };
  });
}

export async function prepareUpload(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { content: btoa(binary) };
}

export async function submitDrawing(key, upload, owner, slot) {
  if (!upload.sha) {
    const blob = await api(key, '/git/blobs', 'POST', {
      content: upload.content,
      encoding: 'base64',
    });
    upload.sha = blob.sha;
  }
  return updateCards(key, ({ used, cards }) => {
    const card = cards[slot];
    if (card?.owner === owner && card.drawing === upload.sha && used.get(slot) === upload.sha)
      return { result: slot }; // The previous submission succeeded but its reply was lost.
    if (used.has(slot) || card?.owner !== owner || !card?.expires)
      throw new Error(
        slot + '番を使用できません。絵は残っています。端末設定で空き番号を選んでください。',
      );
    cards[slot] = { owner, drawing: upload.sha };
    return {
      message: 'Receive drawing ' + slot,
      files: [
        { path: 'assets/' + slot + '/drawing.png', mode: '100644', type: 'blob', sha: upload.sha },
      ],
      result: slot,
    };
  });
}
