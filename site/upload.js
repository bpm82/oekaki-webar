const repository = 'https://api.github.com/repos/bpm82/oekaki-webar';
export const slotIds = Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(2, '0'));

function drawingUrl(slot) {
  return repository + '/contents/assets/' + slot + '/drawing.png';
}

function auth(key) {
  return {
    ...(key ? { Authorization: 'Bearer ' + key } : {}),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function apiError(response) {
  if ([401, 403, 404].includes(response.status))
    return new Error('端末設定で、このリポジトリの Contents に書き込めるトークンを確認してください。');
  if (response.status === 429)
    return new Error('送信が混み合っています。少し待ってから、もう一度押してください。');
  return new Error(
    'GitHubへの送信に失敗しました（' + response.status + '）。絵はこの画面に残っています。',
  );
}

async function fileSha(key, slot) {
  const response = await fetch(drawingUrl(slot) + '?ref=main', {
    headers: auth(key),
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw apiError(response);
  return (await response.json()).sha;
}

export async function prepareUpload(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const head = new TextEncoder().encode('blob ' + bytes.length + '\0');
  const object = new Uint8Array(head.length + bytes.length);
  object.set(head);
  object.set(bytes, head.length);
  const hash = await crypto.subtle.digest('SHA-1', object);
  const sha = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { content: btoa(binary), sha, attempted: null };
}

export async function occupiedSlots(key) {
  const response = await fetch(repository + '/git/trees/main?recursive=1', {
    headers: auth(key),
    cache: 'no-store',
  });
  if (!response.ok) throw apiError(response);
  const { tree, truncated } = await response.json();
  if (truncated || !Array.isArray(tree))
    throw new Error('カードの空き状況をすべて確認できませんでした。');
  const paths = new Set(tree.map((entry) => entry.path));
  return new Set(
    slotIds.filter((id) => paths.has('assets/' + id + '/drawing.png') || paths.has('drawings/' + id + '.png')),
  );
}

export async function submitDrawing(key, upload, preferred) {
  const headers = auth(key);
  for (let attempt = 0; attempt < 6; attempt++) {
    // An interrupted PUT may already have committed. Reconcile it before assigning a second card.
    if (upload.attempted && (await fileSha(key, upload.attempted)) === upload.sha)
      return upload.attempted;
    const used = await occupiedSlots(key);
    if (preferred && used.has(preferred))
      throw new Error(preferred + '番は使用中です。端末設定で空き番号を選んでください。');
    const slot = preferred || slotIds.find((id) => !used.has(id));
    if (!slot) throw new Error('100枚のカードをすべて使用しました。スタッフにお知らせください。');
    upload.attempted = slot;
    const response = await fetch(drawingUrl(slot), {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Receive drawing ' + slot,
        content: upload.content,
        branch: 'main',
      }),
    });
    if (response.status === 201) return slot;
    if (response.status !== 409 && response.status !== 422) throw apiError(response);
    // The API rejects a create if another station has taken the path. No update SHA is sent.
    upload.attempted = null;
    if (response.status === 422 && !(await fileSha(key, slot))) throw apiError(response);
  }
  throw new Error('ほかの端末が送信中です。少し待ってからもう一度押してください。');
}
