import { api, storedToken } from './upload.js?v=5';

const path = '/contents/rankings/itami-christmas-2026.json';
const pendingPrefix = 'oekaki-webar:itami-christmas-2026:round:';
const inMemory = new Map();
let syncing;

function validRound(round) {
  return round && typeof round.id === 'string' && /^[0-9a-f-]{36}$/i.test(round.id) &&
    typeof round.card === 'string' && /^(?:0[1-9]|[1-9]\d|100)$/.test(round.card) &&
    typeof round.name === 'string' && round.name.trim().length > 0 && round.name.length <= 16 &&
    Number.isSafeInteger(round.score) && round.score >= 0 && Number.isSafeInteger(round.updatedAt);
}

export function queueRound(round) {
  if (!validRound(round)) throw new Error('ゲームの記録を確認してください。');
  inMemory.set(round.id, round);
  try {
    // One key per round lets two open tabs finish without overwriting each other.
    localStorage.setItem(pendingPrefix + round.id, JSON.stringify(round));
  } catch {
    try { sessionStorage.setItem(pendingPrefix + round.id, JSON.stringify(round)); } catch { /* Send from memory. */ }
  }
}

export function pendingRounds() {
  for (const store of ['localStorage', 'sessionStorage']) {
    try {
      const storage = globalThis[store];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(pendingPrefix)) continue;
        try {
          const round = JSON.parse(storage.getItem(key));
          if (validRound(round) && key === pendingPrefix + round.id) inMemory.set(round.id, round);
        } catch { /* One damaged item must not block other pending rounds. */ }
      }
    } catch {
      // The current tab also retains its unconfirmed rounds in memory.
    }
  }
  return Array.from(inMemory.values());
}

function acknowledge(rounds) {
  for (const round of rounds) {
    inMemory.delete(round.id);
    for (const store of ['localStorage', 'sessionStorage']) {
      try { globalThis[store].removeItem(pendingPrefix + round.id); } catch { /* IDs prevent duplicates on retry. */ }
    }
  }
}

export function personalBests(rounds) {
  const best = new Map();
  for (const round of rounds) {
    const previous = best.get(round.card);
    if (!previous || round.score > previous.score ||
        (round.score === previous.score && round.updatedAt < previous.updatedAt)) {
      best.set(round.card, round);
    }
  }
  return Array.from(best.values());
}

async function sync() {
  const key = storedToken();
  if (!key) throw new Error('スタッフに端末設定を確認してもらってください。');
  for (let attempt = 0; attempt < 7; attempt++) {
    const file = await api(key, path + '?ref=main');
    const bytes = Uint8Array.from(atob(file.content), (character) => character.charCodeAt(0));
    const rounds = JSON.parse(new TextDecoder().decode(bytes));
    if (!file.sha || !Array.isArray(rounds) || !rounds.every(validRound))
      throw new Error('会場の記録を読み取れません。スタッフにお知らせください。');
    const ids = new Set(rounds.map((round) => round.id));
    const pending = pendingRounds();
    const additions = pending.filter((round) => !ids.has(round.id));
    if (additions.length) {
      rounds.push(...additions);
      const data = new TextEncoder().encode(JSON.stringify(rounds, null, 2) + '\n');
      let binary = '';
      for (let i = 0; i < data.length; i += 8192)
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      try {
        await api(key, path, 'PUT', {
          message: 'Record workshop game scores', branch: 'main', sha: file.sha, content: btoa(binary),
        });
      } catch (error) {
        if (![409, 422].includes(error.status) || attempt === 6) throw error;
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * (100 + Math.random() * 180)));
        continue;
      }
    }
    acknowledge(pending);
    // A new round may have finished during the upload.
    for (const round of additions) ids.add(round.id);
    if (pendingRounds().every((round) => ids.has(round.id))) return rounds;
  }
  throw new Error('ほかの端末が記録中です。自動で再送します。');
}

export function syncEventRounds() {
  if (!syncing) syncing = sync().finally(() => { syncing = null; });
  return syncing;
}

// Also recover if the player went straight back to the artwork or the next reception.
export function retryPendingRounds() {
  if (storedToken() && pendingRounds().length) syncEventRounds().catch(() => {});
}
