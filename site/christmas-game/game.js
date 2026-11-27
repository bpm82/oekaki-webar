"use strict";

const WIDTH = 400;
const HEIGHT = 500;
const LEFT = 21;
const RIGHT = 379;
const FLOOR = 478;
const LIMIT = 94;
const STEP = 1 / 120;
const ROUND_COUNTDOWN_SECONDS = 3;
const ROUND_START_BANNER_DURATION = 650;
const ROUND_START_DURATION = ROUND_COUNTDOWN_SECONDS * 1000 + ROUND_START_BANNER_DURATION;
const ROUND_DURATION = 180;
const DEMO_GENERATION_DURATION = 180;
const DROPPABLE = 4;
const TREE_BONUS = 100;
const PLAY_RANKING_LIMIT = 5;
const RANKING_NEIGHBORS = 3;
const MERGE_GLINT_DURATION = 0.17;
const TREE_GLINT_DURATION = 0.25;
const STORAGE_KEY = "christmas-workshop:scores:v1";

const engine = Matter.Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 });
engine.gravity.scale = 0.00092;
const walls = [
  Matter.Bodies.rectangle(LEFT - 40, 180, 80, 680, { isStatic: true, friction: 0.35 }),
  Matter.Bodies.rectangle(RIGHT + 40, 180, 80, 680, { isStatic: true, friction: 0.35 }),
  Matter.Bodies.rectangle(WIDTH / 2, FLOOR + 30, WIDTH, 60, { isStatic: true, friction: 0.48 })
];
Matter.Composite.add(engine.world, walls);
const mergeQueue = [];

const pieceBounds = pieces.map(({ parts, radius }) => {
  const points = parts.flatMap((part) => part.points);
  const scale = radius / 25;
  return {
    minX: Math.min(...points.map(([x]) => x)) * scale,
    maxX: Math.max(...points.map(([x]) => x)) * scale,
    maxY: Math.max(...points.map(([, y]) => y)) * scale
  };
});


const byId = (id) => document.getElementById(id);
const board = byId("board");
const nextCanvas = byId("next-piece");
const context = board.getContext("2d");
const boardArt = document.createElement("canvas");
const scoreNumber = byId("score");
const scoreGain = byId("score-gain");
const nameField = byId("player-name");
const nicknameError = byId("nickname-error");
const sessionClock = byId("session-clock");
const timeRemaining = byId("time-remaining");
const roundStartCue = byId("round-start");
const roundStartLabel = byId("round-start-label");
const generationProgress = byId("progress");
const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
const leaderboard = byId("leaderboard");
const rankingScroll = byId("ranking-scroll");
const workDialog = byId("work-dialog");
const workCanvas = byId("work-preview");
const format = new Intl.NumberFormat("ja-JP");
const inWaitingViewer = typeof window !== "undefined" && window.parent !== window &&
  new URLSearchParams(window.location.search).get("embedded") === "1";

let scores = readScores();
let name = "";
let mode = "intro";
let generationCompletesAt = 0;
let roundStartsAt = 0;
let roundEndsAt = 0;
let displayedSeconds = ROUND_DURATION;
let ready = false;
let generationFailed = false;
let bodies = [];
let effects = [];
let score = 0;
let current = 0;
let next = 0;
let aim = WIDTH / 2;
let cooldown = 0;
let lastFrame = 0;
let pendingTime = 0;
let activePointer = null;
let scoreBump;
let gainFlash;

function readScores() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(records)) return [];
    return records.filter((entry) =>
      entry && typeof entry.name === "string" && Number.isSafeInteger(entry.score) &&
      entry.score >= 0 && Number.isFinite(entry.updatedAt)
    );
  } catch {
    return [];
  }
}

function rankedScores() {
  const entries = scores.filter((entry) => !hasProhibitedNickname(entry.name))
    .sort((first, second) => second.score - first.score ||
      first.updatedAt - second.updatedAt || first.name.localeCompare(second.name, "ja"));
  let rank = 1;
  return entries.map((entry, index) => {
    if (index > 0 && entry.score !== entries[index - 1].score) rank = index + 1;
    return { ...entry, rank };
  });
}

function recordScore() {
  const savedScores = readScores();
  for (const entry of savedScores) {
    const existing = scores.findIndex((record) => record.name === entry.name);
    if (existing < 0) scores.push(entry);
    else if (entry.score > scores[existing].score) scores[existing] = entry;
  }

  const index = scores.findIndex((entry) => entry.name === name);
  const result = { name, score, updatedAt: Date.now() };
  if (index < 0) scores.push(result);
  else if (score > scores[index].score) scores[index] = result;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // The game keeps the scores for this page when storage is unavailable.
  }
}

function ownPlacement(entries) {
  const entry = entries.find((record) => record.name === name);
  if (!entry) return "";
  return `${entries.length}人中 ${entry.rank}位`;
}

function setRankingPadding(id, emptyRows) {
  const spacer = byId(id);
  spacer.hidden = emptyRows === 0;
  spacer.style.setProperty("--empty-rows", String(emptyRows));
}

function alignResultRanking(playerRow) {
  rankingScroll.scrollTop = 0;
  if (!playerRow) return;
  const viewport = rankingScroll.getBoundingClientRect();
  const columnsHeight = byId("ranking-columns").getBoundingClientRect().height;
  const player = playerRow.getBoundingClientRect();
  const viewportCenter = (rankingScroll.clientHeight + columnsHeight) / 2;
  rankingScroll.scrollTop = player.top - viewport.top + player.height / 2 - viewportCenter;
}

function renderScores() {
  const entries = rankedScores();
  const position = ownPlacement(entries);
  const resultView = mode === "between" || mode === "complete";
  byId("my-ranking").hidden = !position;
  byId("my-ranking").textContent = position ? `あなたの順位  ${position}` : "";
  byId("open-work").hidden = mode !== "complete" || !ready;
  byId("empty-ranking").hidden = entries.length > 0;
  byId("ranking-list").hidden = entries.length === 0;
  rankingScroll.setAttribute("data-result-view", String(resultView));

  const rows = document.createDocumentFragment();
  const podium = document.createDocumentFragment();
  let playerRow = null;
  let playerIndex = -1;
  entries.forEach((entry, index) => {
    const fields = [`${entry.rank}位`, entry.name, format.format(entry.score)];
    const row = document.createElement("tr");
    if (entry.name === name) {
      row.className = "own-score";
      row.setAttribute("aria-current", "true");
      if (resultView) {
        playerRow = row;
        playerIndex = index;
      }
    }
    fields.forEach((field, fieldIndex) => {
      const cell = row.insertCell();
      cell.textContent = field;
      if (fieldIndex === 1) cell.title = field;
    });
    rows.append(row);

    if (index < 3) {
      const card = document.createElement("div");
      card.className = "podium-card";
      const rankLabel = document.createElement("strong");
      rankLabel.textContent = fields[0];
      const playerLabel = document.createElement("span");
      playerLabel.textContent = fields[1];
      const pointsLabel = document.createElement("span");
      pointsLabel.textContent = `${fields[2]} 点`;
      card.append(rankLabel, playerLabel, pointsLabel);
      podium.append(card);
    }
  });
  byId("ranking-rows").replaceChildren(rows);
  byId("podium").replaceChildren(podium);
  setRankingPadding("ranking-padding-start", playerRow ? Math.max(0, RANKING_NEIGHBORS - playerIndex) : 0);
  const followingRows = entries.length - playerIndex - 1;
  setRankingPadding("ranking-padding-end", playerRow ? Math.max(0, RANKING_NEIGHBORS - followingRows) : 0);
  if (leaderboard.open) alignResultRanking(playerRow);
  return playerRow;
}

function renderPlayRanking() {
  const entries = rankedScores();
  const leaders = entries.slice(0, PLAY_RANKING_LIMIT);
  const ownEntry = entries.find((entry) => entry.name === name);
  // Include the player when a tie at the cutoff extends past the displayed rows.
  if (ownEntry && ownEntry.rank <= PLAY_RANKING_LIMIT && !leaders.includes(ownEntry)) {
    leaders[leaders.length - 1] = ownEntry;
  }
  const rows = document.createDocumentFragment();
  for (let slot = 0; slot < PLAY_RANKING_LIMIT; slot += 1) {
    const entry = leaders[slot];
    const position = entry?.rank ?? slot + 1;
    const row = document.createElement("li");
    row.setAttribute("data-rank", position);
    if (!entry) row.setAttribute("data-empty", "true");
    const isOwnEntry = entry?.name === name;
    if (isOwnEntry) row.setAttribute("aria-current", "true");
    const rank = document.createElement("span");
    rank.className = "rank-chip";
    rank.textContent = `${position}位`;
    const player = document.createElement("span");
    player.className = "rank-player";
    player.title = entry?.name ?? "記録なし";
    const nickname = document.createElement("span");
    nickname.className = "rank-name";
    nickname.textContent = entry?.name ?? "—";
    player.append(nickname);
    if (isOwnEntry) {
      const label = document.createElement("span");
      label.className = "rank-owner";
      label.textContent = "あなた";
      player.append(label);
    }
    const points = document.createElement("strong");
    points.textContent = entry ? format.format(entry.score) : "—";
    row.append(rank, player, points);
    rows.append(row);
  }
  byId("play-leaders").replaceChildren(rows);
}

function updateScore() {
  scoreNumber.textContent = format.format(score);
  const best = scores.find((entry) => entry.name === name);
  byId("best-score").textContent = best ? format.format(best.score) : "—";
  const opponents = scores.filter((entry) => entry.name !== name && !hasProhibitedNickname(entry.name));
  const currentRank = 1 + opponents.filter((entry) => entry.score > score).length;
  byId("play-rank").textContent = opponents.length ? `${currentRank}位` : "—";
}

function clearScoreFeedback() {
  scoreBump?.cancel();
  gainFlash?.cancel();
  scoreBump = undefined;
  gainFlash = undefined;
  scoreGain.textContent = "";
}

function showScoreGain(points) {
  clearScoreFeedback();
  scoreGain.textContent = `+${format.format(points)}`;
  if (!reduceMotion?.matches) {
    scoreBump = scoreNumber.animate?.([
      { transform: "scale(1)" },
      { transform: "scale(1.1, 1.16)", offset: 0.34 },
      { transform: "scale(1)" }
    ], { duration: 245, easing: "ease-out" });
  }
  gainFlash = scoreGain.animate?.([
    { opacity: 0 },
    { opacity: 1, offset: 0.12 },
    { opacity: 1, offset: 0.66 },
    { opacity: 0 }
  ], { duration: 630 });
}

function randomPiece() {
  return Math.floor(Math.random() * DROPPABLE);
}

function setRoundStartLabel(secondsLeft) {
  const counting = secondsLeft > 0;
  const label = counting ? String(secondsLeft) : "ゲームスタート！";
  if (roundStartLabel.textContent === label) return;
  roundStartLabel.textContent = label;
  roundStartCue.setAttribute("data-counting", String(counting));
}

function startRound(now = performance.now()) {
  mode = "starting";
  roundStartsAt = now + ROUND_START_DURATION;
  roundEndsAt = roundStartsAt + ROUND_DURATION * 1000;
  setRoundClock(ROUND_DURATION);
  Matter.Composite.remove(engine.world, bodies);
  mergeQueue.length = 0;
  bodies = [];
  effects = [];
  score = 0;
  current = randomPiece();
  next = randomPiece();
  aim = WIDTH / 2;
  cooldown = 0;
  pendingTime = 0;
  activePointer = null;
  byId("round-result").hidden = true;
  byId("game-overlay").hidden = true;
  setRoundStartLabel(ROUND_COUNTDOWN_SECONDS);
  roundStartCue.hidden = false;
  clearScoreFeedback();
  updateScore();
  renderPlayRanking();
  updateNextPiece();
  drawBoard();
  board.focus({ preventScroll: true });
}

function showRoundResult(timedOut = false) {
  const entries = rankedScores();
  const position = ownPlacement(entries);
  const personalRank = entries.find((entry) => entry.name === name)?.rank ?? Infinity;
  byId("round-title").textContent = timedOut ? "タイムアップ！"
    : ready ? "作品ができました！"
      : generationFailed ? "立体化を確認してください" : "箱がいっぱい！";
  byId("round-score").textContent = `${format.format(score)} 点`;
  const rankBadge = byId("round-top-five");
  rankBadge.hidden = personalRank > PLAY_RANKING_LIMIT;
  rankBadge.textContent = rankBadge.hidden ? "" : `トップ${personalRank}位！`;
  byId("round-rank").textContent = `ベストスコアで ${position}`;
  byId("retry").hidden = generationFinished();
  byId("show-results").hidden = !generationFinished();
  byId("show-results").textContent = ready ? "ランキングと作品へ" : "ランキングを見る";
  byId("round-result").hidden = false;
  byId("game-overlay").hidden = false;
  if (leaderboard.open) renderScores();
}

function endRound(timedOut = false) {
  mode = generationFinished() ? "complete" : "between";
  roundEndsAt = 0;
  setRoundClock(generationFinished() ? 0 : ROUND_DURATION);
  effects = [];
  clearScoreFeedback();
  recordScore();
  updateScore();
  renderPlayRanking();
  showRoundResult(timedOut);
  if (!leaderboard.open) byId("round-title").focus({ preventScroll: true });
}

function generationFinished() {
  return ready || generationFailed;
}

function showWorkInViewer() {
  window.parent.postMessage({ type: "oekaki-wait-game:show-work" }, window.location.origin);
}

function finishGeneration(state = "ready") {
  if (generationFinished()) return;
  ready = state === "ready";
  generationFailed = state === "failed";
  generationProgress.value = DEMO_GENERATION_DURATION;
  generationProgress.hidden = generationFailed;
  byId("status-title").textContent = ready ? "作品ができました！" : "立体化を確認してください";
  byId("status-icon").textContent = ready ? "✓" : "!";
  if (inWaitingViewer && (mode === "intro" || mode === "rules")) showWorkInViewer();
  if (mode === "between") {
    const focusWasOnRetry = document.activeElement === byId("retry");
    mode = "complete";
    setRoundClock(0);
    showRoundResult();
    if (focusWasOnRetry) byId("show-results").focus({ preventScroll: true });
  }
}

function setRoundClock(secondsLeft) {
  if (secondsLeft === displayedSeconds) return;
  displayedSeconds = secondsLeft;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  timeRemaining.textContent = `${minutes}:${seconds}`;
  sessionClock.setAttribute("data-ending", String(secondsLeft <= 15));
}

function updateSessionTime(now) {
  if (generationCompletesAt && !generationFinished()) {
    const secondsLeft = Math.max(0, Math.ceil((generationCompletesAt - now) / 1000));
    const elapsed = DEMO_GENERATION_DURATION - secondsLeft;
    if (generationProgress.value !== elapsed) generationProgress.value = elapsed;
    if (secondsLeft === 0) finishGeneration();
  }

  if (mode === "starting") {
    if (now < roundStartsAt) {
      const countdownSeconds = Math.ceil((roundStartsAt - ROUND_START_BANNER_DURATION - now) / 1000);
      setRoundStartLabel(countdownSeconds);
      return;
    }
    mode = "playing";
    roundStartCue.hidden = true;
  }
  if (mode !== "playing") return;
  const secondsLeft = Math.max(0, Math.ceil((roundEndsAt - now) / 1000));
  setRoundClock(secondsLeft);
  if (secondsLeft === 0) {
    endRound(true);
    drawBoard();
  }
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function boundedAim(x, level) {
  const { minX, maxX } = pieceBounds[level];
  return clamp(x, LEFT - minX, RIGHT - maxX);
}

function dropHeight(level) {
  return LIMIT - pieceBounds[level].maxY - 9;
}

const bodyOptions = { friction: 0.4, frictionStatic: 0.65, frictionAir: 0.012, restitution: 0.14 };

function body(level, x, y, velocity = { x: 0, y: 0 }) {
  const scale = pieces[level].radius / 25;
  const parts = pieces[level].parts.map(({ points }) => {
    const vertices = Matter.Vertices.clockwiseSort(points.map(([x, y]) => ({ x: x * scale, y: y * scale })));
    return Matter.Body.create({ ...bodyOptions, position: Matter.Vertices.centre(vertices), vertices });
  });
  const piece = Matter.Body.create({ ...bodyOptions, parts });
  const origin = { ...piece.position };
  piece.decoration = { level, origin, danger: 0 };
  Matter.Body.setPosition(piece, { x: x + origin.x, y: y + origin.y });
  Matter.Body.setVelocity(piece, velocity);
  return piece;
}

function addPiece(piece) {
  bodies.push(piece);
  Matter.Composite.add(engine.world, piece);
}

function drop() {
  updateSessionTime(performance.now());
  if (mode !== "playing" || cooldown > 0 || leaderboard.open || workDialog.open) return;
  addPiece(body(current, boundedAim(aim, current), dropHeight(current), { x: 0, y: 1.25 }));
  current = next;
  next = randomPiece();
  cooldown = 0.32;
  updateNextPiece();
}

Matter.Events.on(engine, "collisionStart", ({ pairs }) => {
  for (const { collision } of pairs) {
    const { parentA, parentB } = collision;
    if (parentA.decoration && parentA.decoration.level === parentB.decoration?.level) {
      mergeQueue.push([parentA, parentB]);
    }
  }
});

function merge(first, second) {
  Matter.Composite.remove(engine.world, first);
  Matter.Composite.remove(engine.world, second);

  const x = (first.position.x + second.position.x) / 2;
  const y = (first.position.y + second.position.y) / 2;
  const level = first.decoration.level + 1;
  const combined = pieces[level];
  const points = combined ? combined.points : TREE_BONUS;
  const duration = combined ? MERGE_GLINT_DURATION : TREE_GLINT_DURATION;
  score += points;
  effects.push({
    x,
    y,
    radius: (combined ?? pieces.at(-1)).radius,
    treeBonus: !combined,
    duration,
    time: duration,
    color: combined?.light ?? "#ffe5a0"
  });

  if (combined) {
    const firstVelocity = Matter.Body.getVelocity(first);
    const secondVelocity = Matter.Body.getVelocity(second);
    addPiece(body(level, boundedAim(x, level), Math.min(y, FLOOR - pieceBounds[level].maxY), {
      x: (firstVelocity.x + secondVelocity.x) / 2,
      y: (firstVelocity.y + secondVelocity.y) / 2
    }));
  }
}

function step() {
  cooldown = Math.max(0, cooldown - STEP);
  effects = effects.filter((effect) => {
    effect.time -= STEP;
    return effect.time > 0;
  });

  Matter.Engine.update(engine, STEP * 1000);
  if (mergeQueue.length) {
    const previousScore = score;
    const merged = new Set();
    for (const [first, second] of mergeQueue) {
      if (merged.has(first) || merged.has(second)) continue;
      merged.add(first);
      merged.add(second);
      merge(first, second);
    }
    mergeQueue.length = 0;
    bodies = bodies.filter((piece) => !merged.has(piece));
    updateScore();
    showScoreGain(score - previousScore);
  }

  for (const piece of bodies) {
    const info = piece.decoration;
    info.danger = piece.bounds.min.y < LIMIT ? info.danger + STEP : 0;
    if (info.danger >= 0.85) {
      endRound();
      break;
    }
  }
}


function updateNextPiece() {
  const ctx = nextCanvas.getContext("2d");
  ctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  paintPiece(ctx, next, 42, 42, 37);
  nextCanvas.setAttribute("aria-label", `次の飾り ${pieces[next].name}`);
}

function drawMergeGlints() {
  const directions = [[-0.88, -0.48], [0.47, -0.88], [0.86, 0.51], [-0.58, 0.81]];
  for (const effect of effects) {
    const fade = effect.time / effect.duration;
    const distance = effect.radius * 0.94 + 3 + (1 - fade) * 7;
    const length = effect.treeBonus ? 10 : 5;
    const count = effect.treeBonus ? directions.length : directions.length - 1;
    context.save();
    context.globalAlpha = fade * 0.95;
    context.lineWidth = effect.treeBonus ? 3.2 : 2.3;
    context.lineCap = "round";
    context.beginPath();
    for (let index = 0; index < count; index += 1) {
      const [dx, dy] = directions[index];
      context.moveTo(effect.x + dx * distance, effect.y + dy * distance);
      context.lineTo(effect.x + dx * (distance + length), effect.y + dy * (distance + length));
    }
    context.strokeStyle = effect.treeBonus ? "#865017" : "#4c7768";
    context.lineWidth += 1.4;
    context.stroke();
    context.strokeStyle = effect.color;
    context.lineWidth -= 1.4;
    context.stroke();
    context.restore();
  }
}

function drawBoardArt() {
  boardArt.width = board.width;
  boardArt.height = board.height;
  const ctx = boardArt.getContext("2d");
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  const mint = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  mint.addColorStop(0, "#d5f5e7");
  mint.addColorStop(1, "#a9dccd");
  ctx.fillStyle = mint;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const tray = ctx.createLinearGradient(0, LIMIT, 0, FLOOR);
  tray.addColorStop(0, "#fcfff4");
  tray.addColorStop(1, "#e3f5e9");
  ctx.fillStyle = tray;
  ctx.fillRect(LEFT, LIMIT, RIGHT - LEFT, FLOOR - LIMIT);
  for (let index = 0; index < 27; index += 1) {
    const x = 6 + ((index * 137) % 389);
    const y = 14 + ((index * 53) % 470);
    circle(ctx, x, y, index % 4 ? 1.4 : 2.5, y < LIMIT ? "#fffef2" : "#a3d2bf55");
  }

  ctx.beginPath();
  ctx.moveTo(LEFT - 4, LIMIT - 4);
  ctx.lineTo(LEFT - 4, FLOOR + 5);
  ctx.lineTo(RIGHT + 4, FLOOR + 5);
  ctx.lineTo(RIGHT + 4, LIMIT - 4);
  ctx.strokeStyle = "#5a9f8c";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.strokeStyle = "#b5e7d0";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.setLineDash([5, 6]);
  ctx.moveTo(LEFT + 5, LIMIT);
  ctx.lineTo(RIGHT - 5, LIMIT);
  ctx.strokeStyle = "#b45263";
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBoard() {
  context.setTransform(2, 0, 0, 2, 0, 0);
  context.drawImage(boardArt, 0, 0, WIDTH, HEIGHT);

  if (mode === "playing") {
    const x = boundedAim(aim, current);
    context.beginPath();
    context.moveTo(x, LIMIT);
    context.lineTo(x, FLOOR);
    context.strokeStyle = "#4d8e7b80";
    context.lineWidth = 1.25;
    context.stroke();
    paintPiece(context, current, x, dropHeight(current), pieces[current].radius, { alpha: cooldown > 0 ? 0.42 : 1 });
  }
  for (const piece of bodies) {
    const { level, origin } = piece.decoration;
    paintPiece(context, level, piece.position.x, piece.position.y, pieces[level].radius, { angle: piece.angle, origin });
  }

  drawMergeGlints();
}

function frame(now) {
  const elapsed = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  updateSessionTime(performance.now());
  if (mode === "playing" && !leaderboard.open && !workDialog.open) {
    pendingTime += elapsed;
    while (pendingTime >= STEP && mode === "playing") {
      step();
      pendingTime -= STEP;
    }
    drawBoard();
  }
  requestAnimationFrame(frame);
}

function buildPieceGuide() {
  pieces.forEach((piece, index) => {
    const item = document.createElement("li");
    item.title = piece.name;
    const art = document.createElement("canvas");
    art.width = 84;
    art.height = 84;
    art.setAttribute("role", "img");
    art.setAttribute("aria-label", piece.name);
    paintPiece(art.getContext("2d"), index, 42, 42, 22 + index * 2.7);
    item.append(art);
    byId("piece-guide").append(item);
  });
}

function showNicknameError(message) {
  nicknameError.textContent = message;
  nicknameError.hidden = !message;
  nameField.setAttribute("aria-invalid", message ? "true" : "false");
  if (message) nameField.focus();
}

byId("start-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const candidate = nameField.value.trim();
  if (!candidate.replace(/[\p{Cf}\p{M}]/gu, "").trim()) return showNicknameError("ニックネームを入れてください。");
  if (candidate.length > nameField.maxLength) return showNicknameError("16文字以内で入力してください。");
  if (hasProhibitedNickname(candidate)) {
    return showNicknameError("使えない言葉が含まれています。別のニックネームにしてください。");
  }
  showNicknameError("");
  name = candidate;
  mode = "rules";
  byId("welcome-screen").hidden = true;
  byId("rules-screen").hidden = false;
  byId("rules-title").focus();
});

byId("back-to-welcome").addEventListener("click", () => {
  mode = "intro";
  byId("rules-screen").hidden = true;
  byId("welcome-screen").hidden = false;
  nameField.focus();
});

byId("begin-game").addEventListener("click", () => {
  if (mode !== "rules" || generationFinished()) return;
  byId("rules-screen").hidden = true;
  byId("game-screen").hidden = false;
  const now = performance.now();
  if (!inWaitingViewer) generationCompletesAt = now + DEMO_GENERATION_DURATION * 1000;
  sessionClock.hidden = false;
  byId("status-title").textContent = "立体化中";
  startRound(now);
});

nameField.addEventListener("input", () => showNicknameError(""));
byId("retry").addEventListener("click", () => {
  const now = performance.now();
  updateSessionTime(now);
  if (!generationFinished() && mode === "between") startRound(now);
});

function openRanking() {
  const playerRow = renderScores();
  if (leaderboard.open) return;
  leaderboard.showModal();
  leaderboard.scrollTop = 0;
  alignResultRanking(playerRow);
}

byId("open-leaderboard").addEventListener("click", openRanking);
byId("show-results").addEventListener("click", openRanking);

function aimAt(event) {
  const bounds = board.getBoundingClientRect();
  aim = (event.clientX - bounds.left) * WIDTH / bounds.width;
}

board.addEventListener("pointerdown", (event) => {
  if (mode !== "playing" || !event.isPrimary || event.button !== 0) return;
  activePointer = event.pointerId;
  board.setPointerCapture(event.pointerId);
  board.focus({ preventScroll: true });
  aimAt(event);
});

board.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse" || event.pointerId === activePointer) aimAt(event);
});

board.addEventListener("pointerup", (event) => {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  aimAt(event);
  drop();
});

board.addEventListener("lostpointercapture", (event) => {
  if (event.pointerId === activePointer) activePointer = null;
});

board.addEventListener("keydown", (event) => {
  if (mode !== "playing") return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    aim = boundedAim(aim + (event.key === "ArrowLeft" ? -15 : 15), current);
  }
  if (event.code === "Space" || event.key === "Enter") {
    event.preventDefault();
    if (!event.repeat) drop();
  }
});

let workAngle = 0.7;
let dragX = null;

function drawWork() {
  const ctx = workCanvas.getContext("2d");
  const facets = [];
  const sides = 9;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.fillStyle = "#d9f3e9";
  ctx.fillRect(0, 0, 400, 270);
  circle(ctx, 200, 119, 95, "#f8fdef");
  ctx.fillStyle = "#9bcdbc";
  ctx.beginPath();
  ctx.ellipse(200, 222, 112, 19, 0, 0, Math.PI * 2);
  ctx.fill();

  function point(radius, height, sector) {
    const angle = (sector * Math.PI * 2 / sides) + workAngle;
    const depth = Math.sin(angle) * radius;
    return { x: 200 + Math.cos(angle) * radius, y: 218 - height + depth * 0.28, depth };
  }

  const tiers = [
    { radius: 15, bottom: 1, top: 46, tip: 15, hue: 24 },
    { radius: 84, bottom: 24, top: 119, tip: 4, hue: 153 },
    { radius: 63, bottom: 63, top: 158, tip: 3, hue: 151 },
    { radius: 42, bottom: 105, top: 191, tip: 0, hue: 148 }
  ];

  for (const tier of tiers) {
    const layer = [];
    for (let sector = 0; sector < sides; sector += 1) {
      const vertices = [
        point(tier.radius, tier.bottom, sector),
        point(tier.radius, tier.bottom, sector + 1),
        point(tier.tip, tier.top, sector + 1),
        point(tier.tip, tier.top, sector)
      ];
      const depth = (vertices[0].depth + vertices[1].depth) / 2;
      const lightness = 32 + Math.cos(sector * Math.PI * 2 / sides + workAngle - 0.7) * 13;
      layer.push({ vertices, depth, fill: `hsl(${tier.hue} 39% ${lightness}%)` });
    }
    facets.push(...layer.sort((first, second) => first.depth - second.depth));
  }
  for (const facet of facets) {
    shape(ctx, facet.vertices.map(({ x, y }) => [x, y]), facet.fill);
  }
  for (const [index, tier] of tiers.slice(1).entries()) {
    for (let sector = 0; sector < sides; sector += 1) {
      const ornament = point(tier.radius * 0.84, tier.bottom + 12, sector + index * 0.7);
      if (ornament.depth > 0) circle(ctx, ornament.x, ornament.y, 3.7, sector % 2 ? "#f6d681" : "#e68168");
    }
  }
  ctx.save();
  ctx.translate(200, 27);
  ctx.scale(0.5 + 0.5 * Math.abs(Math.cos(workAngle)), 1);
  star(ctx, 0, 0, 13, "#ffd779");
  ctx.restore();
}

byId("open-work").addEventListener("click", () => {
  if (inWaitingViewer) {
    showWorkInViewer();
    return;
  }
  leaderboard.close();
  drawWork();
  workDialog.showModal();
  workCanvas.focus();
});
workDialog.addEventListener("close", () => byId("show-results").focus({ preventScroll: true }));
workCanvas.addEventListener("pointerdown", (event) => {
  dragX = event.clientX;
  workCanvas.setPointerCapture(event.pointerId);
});
workCanvas.addEventListener("pointermove", (event) => {
  if (dragX === null) return;
  workAngle += (event.clientX - dragX) * 0.018;
  dragX = event.clientX;
  drawWork();
});
workCanvas.addEventListener("lostpointercapture", () => { dragX = null; });
workCanvas.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  workAngle += event.key === "ArrowLeft" ? -0.22 : 0.22;
  drawWork();
});

buildPieceGuide();
roundStartCue.style.setProperty("--round-start-duration", `${ROUND_START_DURATION}ms`);
drawBoardArt();
drawBoard();
if (inWaitingViewer) {
  generationProgress.removeAttribute("value");
  byId("open-work").textContent = "立体化した作品を見る";
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type === "oekaki-wait-game:state" &&
      (event.data.state === "ready" || event.data.state === "failed")) {
      finishGeneration(event.data.state);
    }
  });
  window.parent.postMessage({ type: "oekaki-wait-game:connected" }, window.location.origin);
}
requestAnimationFrame(frame);
