import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { personalBests, queueRound, pendingRounds, syncEventRounds } from '../site/event-ranking.js';

function storage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    setItem(key, value) { entries.set(key, value); },
    getItem(key) { return entries.get(key) ?? null; },
    removeItem(key) { entries.delete(key); },
  };
}

test('event rounds survive concurrent stations, a lost reply and leaving the game offline', async (t) => {
  const station = storage();
  t.after(() => { delete globalThis.localStorage; delete globalThis.sessionStorage; });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: station });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage() });
  station.setItem('oekaki-webar:staff-token', 'fixture');
  const round = (card, score) => ({ card, name: 'ゆき', score, updatedAt: Date.now(), id: randomUUID() });
  const first = round('01', 20), second = round('02', 20), retry = round('01', 3);
  let history = [], revision = 1, conflict = true, loseReply = false, offline = false;
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer fixture');
    assert.equal(new URL(url).pathname, '/repos/bpm82/oekaki-webar/contents/rankings/itami-christmas-2026.json');
    if (offline) throw new TypeError('offline');
    if (options.method === 'GET') {
      return response({ sha: String(revision), content: Buffer.from(JSON.stringify(history)).toString('base64') });
    }
    assert.equal(options.method, 'PUT');
    const edit = JSON.parse(options.body);
    assert.equal(edit.branch, 'main');
    if (conflict) {
      history.push(second);
      revision++;
      conflict = false;
    }
    if (edit.sha !== String(revision)) return response({}, 409);
    history = JSON.parse(Buffer.from(edit.content, 'base64').toString());
    revision++;
    if (loseReply) { loseReply = false; throw new TypeError('lost reply'); }
    return response({});
  });

  queueRound(first);
  assert.deepEqual(await syncEventRounds(), [second, first]);
  queueRound(retry);
  loseReply = true;
  await assert.rejects(syncEventRounds(), /lost reply/);
  assert.equal(pendingRounds().length, 1);
  assert.deepEqual(await syncEventRounds(), [second, first, retry]);
  assert.equal(pendingRounds().length, 0);
  assert.deepEqual(personalBests(history), [second, first]);

  const last = round('02', 0);
  queueRound(last);
  offline = true;
  await assert.rejects(syncEventRounds(), /offline/);
  const reopened = await import('../site/event-ranking.js?new-station-page');
  assert.deepEqual(reopened.pendingRounds(), [last]);
  offline = false;
  assert.deepEqual(await reopened.syncEventRounds(), [second, first, retry, last]);
  assert.equal(reopened.pendingRounds().length, 0);
});
