import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  cardInventory,
  prepareUpload,
  releaseCard,
  reserveCard,
  submitDrawing,
} from '../site/upload.js';

test('two stations reserve, switch, expire, and submit cards against competing commits', async (t) => {
  let now = Date.now();
  let head = 'initial';
  let conflicts = 0;
  let loseReply = false;
  const blobs = new Map();
  const trees = new Map([
    ['root', { 'assets/01/drawing.png': 'original', 'drawings/04.png': 'legacy' }],
  ]);
  const commits = new Map([[head, { tree: 'root' }]]);
  const hash = (value) => createHash('sha1').update(value).digest('hex');
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname.split('/oekaki-webar')[1];
    const body = init.body && JSON.parse(init.body);
    if (path === '/branches/main')
      return response({ commit: { sha: head, commit: { tree: { sha: commits.get(head).tree } } } });
    if (path.startsWith('/git/trees/')) {
      const files = trees.get(path.split('/').pop());
      return response({
        tree: Object.entries(files).map(([path, sha]) => ({ path, sha })),
        truncated: false,
      });
    }
    if (path.startsWith('/git/blobs/'))
      return response({ content: blobs.get(path.split('/').pop()) });
    if (path === '/git/blobs') {
      const sha = hash(body.content);
      blobs.set(sha, body.content);
      return response({ sha }, 201);
    }
    if (path === '/git/trees') {
      const files = { ...trees.get(body.base_tree) };
      for (const file of body.tree) {
        if (file.content) blobs.set(hash(file.content), btoa(file.content));
        files[file.path] = file.sha || hash(file.content);
      }
      const sha = hash(JSON.stringify(files));
      trees.set(sha, files);
      return response({ sha }, 201);
    }
    if (path === '/git/commits') {
      const sha = hash(init.body);
      commits.set(sha, body);
      return response({ sha }, 201);
    }
    assert.equal(path, '/git/refs/heads/main');
    assert.equal(init.method, 'PATCH');
    assert.equal(body.force, false);
    if (commits.get(body.sha).parents[0] !== head) {
      conflicts++;
      return response({}, 422);
    }
    head = body.sha;
    if (loseReply) {
      loseReply = false;
      throw new TypeError('lost reply after commit');
    }
    return response({ object: { sha: head } });
  });

  const reserve = (owner, id) => reserveCard('key', owner, id);
  const [first, second] = await Promise.all([reserve('A'), reserve('B')]);
  assert.deepEqual([first.slot, second.slot].sort(), ['02', '03']);
  assert.ok(conflicts > 0, 'two stations raced on the same snapshot');
  await assert.rejects(reserve('C', first.slot), /描画中/);
  await assert.rejects(reserve('C', '04'), /使用済み/);
  const drawing = await prepareUpload(new Blob(['same image']));
  await submitDrawing('key', drawing, 'B', second.slot);
  loseReply = true;
  await assert.rejects(submitDrawing('key', drawing, 'A', first.slot), /lost reply/);
  assert.equal(await submitDrawing('key', drawing, 'A', first.slot), first.slot);
  await assert.rejects(reserve('A'), /受付済み/);
  await assert.rejects(submitDrawing('key', drawing, 'C', first.slot), /使用できません/);
  assert.equal((await cardInventory('key')).used.get('01'), 'original');

  const c = await reserve('C', '05');
  now += 31 * 60_000;
  assert.ok((await reserve('C', '05')).expires > c.expires);
  now += 30 * 60_000;
  await assert.rejects(reserve('D', '05'), /描画中/);
  now += 31 * 60_000;
  assert.equal((await reserve('D', '05')).slot, '05');
  await assert.rejects(submitDrawing('key', drawing, 'C', '05'), /使用できません/);
  await reserve('D', '06');
  assert.equal((await reserve('E')).slot, '05');
  await releaseCard('key', 'D');
  assert.equal((await reserve('F')).slot, '06');
});
