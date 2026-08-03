// Wallz — Quoridor engine with AI, local, online, keyboard, touch, stats, path preview

class GameState {
  constructor() {
    this.boardSize = 9;
    this.difficulty = 'medium';
    this.timerPreset = '3+1'; // '3+1' | '5+0' | 'untimed'
    this.humanSide = 1; // 1 or 2 (vs AI)
    this.pathPreview = false;
    this.wallMode = false;
    this.forcedWallDir = null; // 'h' | 'v' | null
    this.moveLog = [];
    this.actionLog = [];
    this.keyboardFocus = null; // { r, c }

    this.p1 = { r: 8, c: 4, walls: 10, time: 180 };
    this.p2 = { r: 0, c: 4, walls: 10, time: 180 };

    this.turn = 1;
    this.walls = [];
    this.mode = 'ai'; // 'ai' | 'friend' | 'online'
    this.onlineRole = null; // 'host' | 'guest'
    this.status = 'lobby';
    this.winner = null;

    this.timerId = null;
    this.timeIncrement = 1;
    this.timersEnabled = true;
    this.history = [];
    this.aiPending = false;
    this.suppressNetSend = false;
  }

  getTimerConfig() {
    if (this.timerPreset === '5+0') return { time: 300, increment: 0, enabled: true };
    if (this.timerPreset === 'untimed') return { time: 9999, increment: 0, enabled: false };
    return { time: 180, increment: 1, enabled: true };
  }

  reset() {
    const wallCount = this.boardSize === 7 ? 6 : (this.boardSize === 11 ? 14 : 10);
    const midCol = Math.floor(this.boardSize / 2);
    const tc = this.getTimerConfig();

    this.p1 = { r: this.boardSize - 1, c: midCol, walls: wallCount, time: tc.time };
    this.p2 = { r: 0, c: midCol, walls: wallCount, time: tc.time };
    this.timeIncrement = tc.increment;
    this.timersEnabled = tc.enabled;

    this.turn = 1;
    this.walls = [];
    this.status = 'playing';
    this.winner = null;
    this.history = [];
    this.moveLog = [];
    this.actionLog = [];
    this.keyboardFocus = null;
    this.forcedWallDir = null;
    this.wallMode = false;
    this.aiPending = false;
    this.suppressNetSend = false;

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  saveHistory() {
    this.history.push({
      p1: { ...this.p1 },
      p2: { ...this.p2 },
      turn: this.turn,
      walls: this.walls.map(w => ({ ...w })),
      status: this.status,
      winner: this.winner,
      moveLog: [...this.moveLog],
      actionLog: this.actionLog.map(a => ({ ...a }))
    });
  }
}

const game = new GameState();
const STATS_KEY = 'wallz_stats_v1';
const TUTORIAL_KEY = 'wallz_tutorial_seen';

// --- STATS ---
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0 };
  } catch {
    return { wins: 0, losses: 0, streak: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function updateStatsDisplay() {
  const s = loadStats();
  const w = document.getElementById('stat-wins');
  const l = document.getElementById('stat-losses');
  const st = document.getElementById('stat-streak');
  if (w) w.textContent = s.wins;
  if (l) l.textContent = s.losses;
  if (st) st.textContent = s.streak;
}

function recordMatchResult(humanWon) {
  if (game.mode !== 'ai') return;
  const s = loadStats();
  if (humanWon) {
    s.wins++;
    s.streak++;
  } else {
    s.losses++;
    s.streak = 0;
  }
  saveStats(s);
  updateStatsDisplay();
}

// --- PATHFINDING & RULES ---

function inBounds(r, c) {
  return r >= 0 && r < game.boardSize && c >= 0 && c < game.boardSize;
}

function isMoveBlocked(r1, c1, r2, c2, wallsList) {
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return true;
  const minR = Math.min(r1, r2);
  const minC = Math.min(c1, c2);

  if (c1 === c2) {
    for (const w of wallsList) {
      if (w.dir === 'h' && w.r === minR && (w.c === c1 || w.c === c1 - 1)) return true;
    }
  } else if (r1 === r2) {
    for (const w of wallsList) {
      if (w.dir === 'v' && w.c === minC && (w.r === r1 || w.r === r1 - 1)) return true;
    }
  }
  return false;
}

function findShortestPath(playerNum, startR, startC, wallsList) {
  const goalR = playerNum === 1 ? 0 : game.boardSize - 1;
  const queue = [[startR, startC, 0]];
  const visited = Array.from({ length: game.boardSize }, () => Array(game.boardSize).fill(false));
  visited[startR][startC] = true;
  let head = 0;

  while (head < queue.length) {
    const [r, c, dist] = queue[head++];
    if (r === goalR) return dist;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && !visited[nr][nc] && !isMoveBlocked(r, c, nr, nc, wallsList)) {
        visited[nr][nc] = true;
        queue.push([nr, nc, dist + 1]);
      }
    }
  }
  return null;
}

function findPathCells(playerNum, startR, startC, wallsList) {
  const goalR = playerNum === 1 ? 0 : game.boardSize - 1;
  const queue = [[startR, startC]];
  const visited = Array.from({ length: game.boardSize }, () => Array(game.boardSize).fill(false));
  const parent = Array.from({ length: game.boardSize }, () => Array(game.boardSize).fill(null));
  visited[startR][startC] = true;
  let head = 0;
  let end = null;

  while (head < queue.length) {
    const [r, c] = queue[head++];
    if (r === goalR) { end = [r, c]; break; }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && !visited[nr][nc] && !isMoveBlocked(r, c, nr, nc, wallsList)) {
        visited[nr][nc] = true;
        parent[nr][nc] = [r, c];
        queue.push([nr, nc]);
      }
    }
  }

  if (!end) return [];
  const path = [];
  let cur = end;
  while (cur) {
    path.push({ r: cur[0], c: cur[1] });
    cur = parent[cur[0]][cur[1]];
  }
  return path.reverse();
}

function hasPathToGoal(playerNum, startR, startC, wallsList) {
  return findShortestPath(playerNum, startR, startC, wallsList) !== null;
}

function getValidPawnMoves(playerNum, wallsList) {
  const self = playerNum === 1 ? game.p1 : game.p2;
  const opp = playerNum === 1 ? game.p2 : game.p1;
  const r = self.r, c = self.c;
  const validMoves = [];

  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc) || isMoveBlocked(r, c, nr, nc, wallsList)) continue;

    if (nr === opp.r && nc === opp.c) {
      const jr = nr + dr, jc = nc + dc;
      if (inBounds(jr, jc) && !isMoveBlocked(nr, nc, jr, jc, wallsList)) {
        validMoves.push({ r: jr, c: jc });
      } else if (dr !== 0) {
        for (const dcDiag of [nc - 1, nc + 1]) {
          if (inBounds(nr, dcDiag) && !isMoveBlocked(nr, nc, nr, dcDiag, wallsList)) {
            validMoves.push({ r: nr, c: dcDiag });
          }
        }
      } else {
        for (const drDiag of [nr - 1, nr + 1]) {
          if (inBounds(drDiag, nc) && !isMoveBlocked(nr, nc, drDiag, nc, wallsList)) {
            validMoves.push({ r: drDiag, c: nc });
          }
        }
      }
    } else {
      validMoves.push({ r: nr, c: nc });
    }
  }
  return validMoves;
}

function isValidWallPlacement(r, c, dir, wallsList) {
  if (r < 0 || r > game.boardSize - 2 || c < 0 || c > game.boardSize - 2) return false;
  for (const w of wallsList) {
    if (w.r === r && w.c === c) return false;
    if (dir === 'h' && w.dir === 'h' && w.r === r && (w.c === c - 1 || w.c === c + 1)) return false;
    if (dir === 'v' && w.dir === 'v' && w.c === c && (w.r === r - 1 || w.r === r + 1)) return false;
  }
  const tempWalls = [...wallsList, { r, c, dir }];
  return hasPathToGoal(1, game.p1.r, game.p1.c, tempWalls) &&
         hasPathToGoal(2, game.p2.r, game.p2.c, tempWalls);
}

// --- AI ---

function evaluatePosition(wallsList) {
  const d1 = findShortestPath(1, game.p1.r, game.p1.c, wallsList);
  const d2 = findShortestPath(2, game.p2.r, game.p2.c, wallsList);
  if (d1 === null || d2 === null) return 0;
  // Positive = good for P2 (AI when human is P1)
  return (d1 - d2) + (game.p2.walls - game.p1.walls) * 0.15;
}

function scoreWallForAI(r, c, dir, wallsList, aiNum, huNum, dAI, dHU) {
  const tempWalls = [...wallsList, { r, c, dir }];
  const newHU = findShortestPath(huNum, (huNum === 1 ? game.p1 : game.p2).r, (huNum === 1 ? game.p1 : game.p2).c, tempWalls);
  const newAI = findShortestPath(aiNum, (aiNum === 1 ? game.p1 : game.p2).r, (aiNum === 1 ? game.p1 : game.p2).c, tempWalls);
  if (newHU === null || newAI === null) return -999;

  const increaseHU = newHU - dHU;
  const increaseAI = newAI - dAI;
  let score = increaseHU * 2.5 - increaseAI * 1.3;

  if (game.difficulty === 'hard') {
    score = increaseHU * 3.2 - increaseAI * 1.1;
    // Tempo: punish wasting walls when ahead
    if (dAI + 1 < dHU) score -= 0.8;
    // Reward walls near human path corridor
    if (increaseHU >= 2) score += 1.5;
    if (increaseHU >= 3) score += 2.0;
    // Light 1-ply: if after wall human can still cut us badly, discount
    const huMoves = getValidPawnMoves(huNum, tempWalls);
    let bestHuCut = 0;
    const aiPos = aiNum === 1 ? game.p1 : game.p2;
    for (const m of huMoves.slice(0, 8)) {
      // simulate human move then check if they could place a damaging wall next — approximate via path after move
      const saved = { r: (huNum === 1 ? game.p1 : game.p2).r, c: (huNum === 1 ? game.p1 : game.p2).c };
      if (huNum === 1) { game.p1.r = m.r; game.p1.c = m.c; } else { game.p2.r = m.r; game.p2.c = m.c; }
      const after = findShortestPath(aiNum, aiPos.r, aiPos.c, tempWalls);
      if (huNum === 1) { game.p1.r = saved.r; game.p1.c = saved.c; } else { game.p2.r = saved.r; game.p2.c = saved.c; }
      if (after !== null && dAI !== null) bestHuCut = Math.max(bestHuCut, after - dAI);
    }
    score -= bestHuCut * 0.4;
  } else {
    score += Math.random() * 0.25;
  }
  return increaseHU > 0 ? score : -999;
}

function getBestAIMove() {
  const wallsList = game.walls;
  const aiNum = game.mode === 'ai' ? (game.humanSide === 1 ? 2 : 1) : 2;
  const huNum = aiNum === 1 ? 2 : 1;
  const ai = aiNum === 1 ? game.p1 : game.p2;
  const hu = huNum === 1 ? game.p1 : game.p2;

  const dAI = findShortestPath(aiNum, ai.r, ai.c, wallsList) || 99;
  const dHU = findShortestPath(huNum, hu.r, hu.c, wallsList) || 99;

  if (game.difficulty === 'easy' && Math.random() < 0.55) {
    if (ai.walls > 0 && Math.random() < 0.3) {
      const possible = [];
      for (let r = 0; r < game.boardSize - 1; r++) {
        for (let c = 0; c < game.boardSize - 1; c++) {
          for (const dir of ['h', 'v']) {
            if (isValidWallPlacement(r, c, dir, wallsList)) possible.push({ r, c, dir });
          }
        }
      }
      if (possible.length) {
        const w = possible[Math.floor(Math.random() * possible.length)];
        return { type: 'wall', r: w.r, c: w.c, dir: w.dir };
      }
    }
    const moves = getValidPawnMoves(aiNum, wallsList);
    if (moves.length) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      return { type: 'move', r: m.r, c: m.c };
    }
  }

  let bestAction = null;
  let maxScore = -999;
  let shouldBlock = false;

  if (ai.walls > 0) {
    if (game.difficulty === 'hard') {
      shouldBlock = dHU <= 6 || dHU <= dAI + 1 || (dHU <= 8 && ai.walls >= 3);
    } else {
      shouldBlock = dHU <= 4 || dHU < dAI || Math.random() < 0.4;
    }
  }

  if (shouldBlock) {
    const candidates = [];
    for (let r = 0; r < game.boardSize - 1; r++) {
      for (let c = 0; c < game.boardSize - 1; c++) {
        for (const dir of ['h', 'v']) {
          if (!isValidWallPlacement(r, c, dir, wallsList)) continue;
          const score = scoreWallForAI(r, c, dir, wallsList, aiNum, huNum, dAI, dHU);
          if (score > maxScore) {
            maxScore = score;
            bestAction = { type: 'wall', r, c, dir };
          }
          if (game.difficulty === 'hard' && score > 0.5) candidates.push({ score, action: { type: 'wall', r, c, dir } });
        }
      }
    }
    // Hard: among top walls, pick best considering race urgency
    if (game.difficulty === 'hard' && candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      const top = candidates.slice(0, Math.min(5, candidates.length));
      // Prefer wall if human is closer or equal and wall gain is meaningful
      if (dHU <= dAI || top[0].score >= 1.2) {
        bestAction = top[0].action;
        maxScore = top[0].score;
      }
    }
  }

  const blockThreshold = game.difficulty === 'hard' ? (dHU <= dAI ? -0.2 : 1.0) : 0.5;
  if (bestAction && maxScore > blockThreshold) return bestAction;

  // Race: move along shortest path; hard prefers jumps that cut distance more
  const validPawnMoves = getValidPawnMoves(aiNum, wallsList);
  let bestPawnMove = null;
  let minPath = 999;

  for (const move of validPawnMoves) {
    const d = findShortestPath(aiNum, move.r, move.c, wallsList);
    if (d === null) continue;
    let score = -d;
    if (game.difficulty === 'hard') {
      // Prefer finishing if reachable
      if (d === 0) score += 100;
      // Slight preference for advancing toward goal row
      const goalR = aiNum === 1 ? 0 : game.boardSize - 1;
      score += (aiNum === 1 ? (ai.r - move.r) : (move.r - ai.r)) * 0.05;
    }
    if (d < minPath || (d === minPath && score > (bestPawnMove ? -minPath : -999))) {
      minPath = d;
      bestPawnMove = move;
    }
  }

  if (bestPawnMove) return { type: 'move', r: bestPawnMove.r, c: bestPawnMove.c };
  if (validPawnMoves.length) {
    const m = validPawnMoves[0];
    return { type: 'move', r: m.r, c: m.c };
  }
  return null;
}

// --- DOM ---

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const boardEl = document.getElementById('board');
const timerValP1 = document.getElementById('timer-p1');
const timerValP2 = document.getElementById('timer-p2');
const panelP1 = document.getElementById('panel-p1');
const panelP2 = document.getElementById('panel-p2');
const wallsRackP1 = document.getElementById('rack-p1');
const wallsRackP2 = document.getElementById('rack-p2');
const backToLobbyBtn = document.getElementById('back-lobby');
const p1NameEl = document.getElementById('p1-name');
const p1DescEl = document.getElementById('p1-desc');
const p2NameEl = document.getElementById('p2-name');
const p2DescEl = document.getElementById('p2-desc');
const modalOverlay = document.getElementById('modal-overlay');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const playAgainBtn = document.getElementById('play-again-btn');
const modalLobbyBtn = document.getElementById('modal-lobby-btn');
const aiThinkingEl = document.getElementById('ai-thinking');
const undoBtn = document.getElementById('undo-btn');
const hudMatchType = document.getElementById('hud-match-type');

let hoverIntersection = null;
let isValidPreview = false;
let leaveCallback = null;

function recalculateCellSize() {
  const maxBoardDim = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.5);
  const calculated = Math.floor((maxBoardDim - 16 - (game.boardSize - 1) * 10) / game.boardSize);
  const cellSize = Math.max(Math.min(calculated, 46), 20);
  document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
}

function initBoardDOM() {
  recalculateCellSize();
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `var(--cell-size) repeat(${game.boardSize - 1}, var(--wall-width) var(--cell-size))`;
  boardEl.style.gridTemplateRows = `var(--cell-size) repeat(${game.boardSize - 1}, var(--wall-width) var(--cell-size))`;

  const total = game.boardSize * 2 - 1;
  for (let gridR = 0; gridR < total; gridR++) {
    for (let gridC = 0; gridC < total; gridC++) {
      const isCellRow = gridR % 2 === 0;
      const isCellCol = gridC % 2 === 0;
      if (isCellRow && isCellCol) {
        const cellR = gridR / 2, cellC = gridC / 2;
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (cellR === 0) cell.classList.add('goal-p1');
        if (cellR === game.boardSize - 1) cell.classList.add('goal-p2');
        cell.dataset.row = cellR;
        cell.dataset.col = cellC;
        cell.style.gridRow = gridR + 1;
        cell.style.gridColumn = gridC + 1;
        boardEl.appendChild(cell);
      } else {
        const gap = document.createElement('div');
        gap.className = !isCellRow && !isCellCol ? 'gap-i' : (!isCellRow ? 'gap-h' : 'gap-v');
        gap.style.gridRow = gridR + 1;
        gap.style.gridColumn = gridC + 1;
        boardEl.appendChild(gap);
      }
    }
  }

  ['pawn-p1', 'pawn-p2'].forEach((id, i) => {
    const p = document.createElement('div');
    p.id = id;
    p.className = `pawn p${i + 1}`;
    boardEl.appendChild(p);
  });

  const preview = document.createElement('div');
  preview.id = 'wall-preview';
  preview.className = 'wall-preview hidden';
  boardEl.appendChild(preview);
}

function formatTime(sec) {
  if (!game.timersEnabled) return '∞';
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function tickTimer() {
  if (game.status !== 'playing' || !game.timersEnabled || game.aiPending) return;
  const active = game.turn === 1 ? game.p1 : game.p2;
  active.time--;
  updateTimerDisplay();
  if (active.time <= 0) endGame(game.turn === 1 ? 2 : 1, 'Time expired!');
}

function updateTimerDisplay() {
  timerValP1.innerText = formatTime(game.p1.time);
  timerValP2.innerText = formatTime(game.p2.time);
  timerValP1.style.color = (game.timersEnabled && game.p1.time <= 15) ? 'var(--color-pink)' : '';
  timerValP2.style.color = (game.timersEnabled && game.p2.time <= 15) ? 'var(--color-pink)' : '';
  document.getElementById('timer-wrap-p1')?.classList.toggle('hidden-timer', !game.timersEnabled);
  document.getElementById('timer-wrap-p2')?.classList.toggle('hidden-timer', !game.timersEnabled);
}

function isHumanTurn() {
  if (game.status !== 'playing') return false;
  if (game.mode === 'friend') return true;
  if (game.mode === 'online') {
    const mySide = game.onlineRole === 'host' ? 1 : 2;
    return game.turn === mySide && !game.aiPending;
  }
  // AI mode
  return game.turn === game.humanSide && !game.aiPending;
}

function updateUndoButton() {
  const can = isHumanTurn() && game.history.length > 0 && game.mode !== 'online';
  undoBtn.disabled = !can;
}

function renderMoveHistory() {
  const list = document.getElementById('move-history-list');
  if (!list) return;
  list.innerHTML = '';
  game.moveLog.forEach((entry, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${entry}`;
    list.appendChild(li);
  });
  const replayBtn = document.getElementById('replay-btn');
  if (replayBtn) replayBtn.disabled = game.actionLog.length === 0;
}

function render() {
  positionPawn(1, game.p1.r, game.p1.c);
  positionPawn(2, game.p2.r, game.p2.c);

  document.querySelectorAll('.wall').forEach(w => w.remove());
  game.walls.forEach(w => drawWall(w.r, w.c, w.dir, w.player));

  panelP1.classList.toggle('active', game.turn === 1);
  panelP2.classList.toggle('active', game.turn === 2);

  updateWallRacks();
  updateTimerDisplay();
  updateUndoButton();
  renderMoveHistory();

  document.querySelectorAll('.cell').forEach(c => {
    c.classList.remove('valid-move', 'valid-move-p1', 'valid-move-p2', 'path-hint', 'kb-focus');
  });

  if (isHumanTurn()) {
    const moves = getValidPawnMoves(game.turn, game.walls);
    const turnClass = game.turn === 1 ? 'valid-move-p1' : 'valid-move-p2';
    moves.forEach(m => {
      const el = document.querySelector(`.cell[data-row="${m.r}"][data-col="${m.c}"]`);
      if (el) el.classList.add('valid-move', turnClass);
    });

    if (game.keyboardFocus) {
      const stillValid = moves.some(m => m.r === game.keyboardFocus.r && m.c === game.keyboardFocus.c);
      if (!stillValid && moves.length) game.keyboardFocus = { r: moves[0].r, c: moves[0].c };
      if (game.keyboardFocus) {
        const el = document.querySelector(`.cell[data-row="${game.keyboardFocus.r}"][data-col="${game.keyboardFocus.c}"]`);
        if (el) el.classList.add('kb-focus');
      }
    } else if (moves.length) {
      game.keyboardFocus = { r: moves[0].r, c: moves[0].c };
    }
  }

  if (game.pathPreview && game.status === 'playing') {
    const path = findPathCells(game.turn, (game.turn === 1 ? game.p1 : game.p2).r, (game.turn === 1 ? game.p1 : game.p2).c, game.walls);
    path.forEach((p, i) => {
      if (i === 0) return;
      const el = document.querySelector(`.cell[data-row="${p.r}"][data-col="${p.c}"]`);
      if (el && !el.classList.contains('valid-move')) el.classList.add('path-hint');
    });
  }

  document.getElementById('wall-mode-btn')?.classList.toggle('active', game.wallMode);
  document.getElementById('wall-mode-btn')?.setAttribute('aria-pressed', String(game.wallMode));
  document.getElementById('path-preview-btn')?.classList.toggle('active', game.pathPreview);
  document.getElementById('path-preview-btn')?.setAttribute('aria-pressed', String(game.pathPreview));
}

function positionPawn(playerNum, r, c) {
  const activePawn = document.getElementById(playerNum === 1 ? 'pawn-p1' : 'pawn-p2');
  const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  if (cell && activePawn) {
    const padding = parseInt(window.getComputedStyle(boardEl).paddingLeft) || 8;
    activePawn.style.left = `${cell.offsetLeft - padding + 6}px`;
    activePawn.style.top = `${cell.offsetTop - padding + 6}px`;
  }
}

function drawWall(r, c, dir, player) {
  const wall = document.createElement('div');
  wall.className = `wall ${dir === 'h' ? 'horizontal' : 'vertical'} p${player}`;
  if (dir === 'h') {
    wall.style.gridRow = r * 2 + 2;
    wall.style.gridColumn = `${c * 2 + 1} / span 3`;
  } else {
    wall.style.gridColumn = c * 2 + 2;
    wall.style.gridRow = `${r * 2 + 1} / span 3`;
  }
  boardEl.appendChild(wall);
}

function updateWallRacks() {
  const maxWalls = game.boardSize === 7 ? 6 : (game.boardSize === 11 ? 14 : 10);
  updateRack(wallsRackP1, game.p1.walls, maxWalls);
  updateRack(wallsRackP2, game.p2.walls, maxWalls);
}

function updateRack(rackEl, wallsLeft, maxWalls) {
  rackEl.innerHTML = '';
  for (let i = 0; i < maxWalls; i++) {
    const ind = document.createElement('div');
    ind.className = 'wall-indicator ' + (i < wallsLeft ? 'filled' : 'spent');
    rackEl.appendChild(ind);
  }
}

function getClosestWallIntersection(mouseX, mouseY) {
  const intersections = [];
  for (let r = 0; r < game.boardSize - 1; r++) {
    for (let c = 0; c < game.boardSize - 1; c++) {
      const cellTL = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
      const cellBR = document.querySelector(`.cell[data-row="${r + 1}"][data-col="${c + 1}"]`);
      if (cellTL && cellBR) {
        intersections.push({
          r, c,
          x: (cellTL.offsetLeft + cellTL.offsetWidth + cellBR.offsetLeft) / 2,
          y: (cellTL.offsetTop + cellTL.offsetHeight + cellBR.offsetTop) / 2
        });
      }
    }
  }

  let closest = null, minDist = 99999;
  for (const inter of intersections) {
    const dist = Math.hypot(mouseX - inter.x, mouseY - inter.y);
    if (dist < minDist) { minDist = dist; closest = inter; }
  }

  if (!closest) return null;
  let dir = Math.abs(mouseX - closest.x) < Math.abs(mouseY - closest.y) ? 'v' : 'h';
  if (game.forcedWallDir) dir = game.forcedWallDir;
  return { r: closest.r, c: closest.c, dir, dist: minDist };
}

function updateWallPreviewAt(clientX, clientY, target) {
  if (!isHumanTurn()) { hideWallPreview(); return; }

  const rect = boardEl.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const hoveredCell = target?.closest?.('.cell');
  if (!game.wallMode && hoveredCell?.classList.contains('valid-move')) {
    hideWallPreview();
    return;
  }

  const closest = getClosestWallIntersection(mouseX, mouseY);
  if (!closest) { hideWallPreview(); return; }

  const activePlayer = game.turn === 1 ? game.p1 : game.p2;
  if (activePlayer.walls <= 0) { hideWallPreview(); return; }

  const cellWidth = document.querySelector('.cell')?.offsetWidth || 40;
  const threshold = game.wallMode ? cellWidth * 1.4 : cellWidth * 0.9;
  if (closest.dist > threshold && !game.wallMode) { hideWallPreview(); return; }

  hoverIntersection = { r: closest.r, c: closest.c, dir: closest.dir };
  isValidPreview = isValidWallPlacement(closest.r, closest.c, closest.dir, game.walls);
  showWallPreview(closest.r, closest.c, closest.dir, isValidPreview);
}

function handleBoardMouseMove(e) {
  if (game.status !== 'playing') return;
  updateWallPreviewAt(e.clientX, e.clientY, e.target);
}

function handleBoardTouchMove(e) {
  if (game.status !== 'playing' || !isHumanTurn()) return;
  const t = e.touches[0];
  if (!t) return;
  if (game.wallMode) e.preventDefault();
  updateWallPreviewAt(t.clientX, t.clientY, document.elementFromPoint(t.clientX, t.clientY));
}

function handleBoardTouchEnd(e) {
  if (game.status !== 'playing' || !isHumanTurn()) return;
  const t = e.changedTouches[0];
  if (!t) return;

  if (game.wallMode && hoverIntersection) {
    e.preventDefault();
    if (isValidPreview) {
      executeWallPlacement(game.turn, hoverIntersection.r, hoverIntersection.c, hoverIntersection.dir);
      hideWallPreview();
    } else {
      audio.playInvalid();
    }
    return;
  }

  const el = document.elementFromPoint(t.clientX, t.clientY);
  const cell = el?.closest?.('.cell');
  if (cell?.classList.contains('valid-move')) {
    executePawnMove(game.turn, parseInt(cell.dataset.row), parseInt(cell.dataset.col));
  } else if (hoverIntersection && isValidPreview) {
    executeWallPlacement(game.turn, hoverIntersection.r, hoverIntersection.c, hoverIntersection.dir);
    hideWallPreview();
  }
}

function showWallPreview(r, c, dir, isValid) {
  const preview = document.getElementById('wall-preview');
  if (!preview) return;
  preview.classList.remove('hidden');
  preview.className = `wall-preview ${dir === 'h' ? 'horizontal' : 'vertical'} ${isValid ? 'valid' : 'invalid'}`;
  if (dir === 'h') {
    preview.style.gridRow = r * 2 + 2;
    preview.style.gridColumn = `${c * 2 + 1} / span 3`;
  } else {
    preview.style.gridColumn = c * 2 + 2;
    preview.style.gridRow = `${r * 2 + 1} / span 3`;
  }
}

function hideWallPreview() {
  document.getElementById('wall-preview')?.classList.add('hidden');
  hoverIntersection = null;
}

function flipWallDir() {
  if (hoverIntersection) {
    hoverIntersection.dir = hoverIntersection.dir === 'h' ? 'v' : 'h';
    game.forcedWallDir = hoverIntersection.dir;
    isValidPreview = isValidWallPlacement(hoverIntersection.r, hoverIntersection.c, hoverIntersection.dir, game.walls);
    showWallPreview(hoverIntersection.r, hoverIntersection.c, hoverIntersection.dir, isValidPreview);
  } else {
    game.forcedWallDir = game.forcedWallDir === 'h' ? 'v' : (game.forcedWallDir === 'v' ? 'h' : 'h');
  }
}

function handleBoardClick(e) {
  if (!isHumanTurn()) return;

  const cell = e.target.closest('.cell');
  if (!game.wallMode && cell?.classList.contains('valid-move')) {
    executePawnMove(game.turn, parseInt(cell.dataset.row), parseInt(cell.dataset.col));
    return;
  }

  if (hoverIntersection) {
    if (isValidPreview) {
      executeWallPlacement(game.turn, hoverIntersection.r, hoverIntersection.c, hoverIntersection.dir);
      hideWallPreview();
    } else {
      audio.playInvalid();
      const preview = document.getElementById('wall-preview');
      if (preview) {
        preview.style.animation = 'none';
        void preview.offsetWidth;
        preview.style.animation = 'shake 0.3s ease';
      }
    }
  }
}

function handleBoardContextMenu(e) {
  e.preventDefault();
  if (!isHumanTurn()) return;
  flipWallDir();
}

function cellLabel(r, c) {
  return `${String.fromCharCode(97 + c)}${game.boardSize - r}`;
}

function executePawnMove(playerNum, r, c, fromNet = false) {
  game.saveHistory();
  const player = playerNum === 1 ? game.p1 : game.p2;
  const from = cellLabel(player.r, player.c);
  player.r = r;
  player.c = c;
  if (game.timersEnabled) player.time += game.timeIncrement;
  game.moveLog.push(`P${playerNum} ${from}→${cellLabel(r, c)}`);
  game.actionLog.push({ type: 'move', playerNum, r, c });
  audio.playMove();

  if (!fromNet && game.mode === 'online') {
    OnlineNet.send({ type: 'move', playerNum, r, c });
  }

  const goalRow = playerNum === 1 ? 0 : game.boardSize - 1;
  if (r === goalRow) {
    endGame(playerNum, 'Goal baseline reached!');
    return;
  }
  alternateTurn();
}

function executeWallPlacement(playerNum, r, c, dir, fromNet = false) {
  game.saveHistory();
  const player = playerNum === 1 ? game.p1 : game.p2;
  game.walls.push({ r, c, dir, player: playerNum });
  player.walls--;
  if (game.timersEnabled) player.time += game.timeIncrement;
  game.moveLog.push(`P${playerNum} wall ${dir.toUpperCase()} @${r},${c}`);
  game.actionLog.push({ type: 'wall', playerNum, r, c, dir });
  audio.playWallPlace();
  game.forcedWallDir = null;

  if (!fromNet && game.mode === 'online') {
    OnlineNet.send({ type: 'wall', playerNum, r, c, dir });
  }
  alternateTurn();
}

function setAIThinking(on) {
  game.aiPending = on;
  aiThinkingEl?.classList.toggle('hidden', !on);
  updateUndoButton();
}

function alternateTurn() {
  game.turn = game.turn === 1 ? 2 : 1;
  game.keyboardFocus = null;
  render();

  if (game.mode === 'ai' && game.status === 'playing' && game.turn !== game.humanSide) {
    setAIThinking(true);
    const delay = game.difficulty === 'hard' ? 700 + Math.random() * 500 : 500 + Math.random() * 400;
    setTimeout(executeAIMove, delay);
  }
}

function executeAIMove() {
  if (game.status !== 'playing') { setAIThinking(false); return; }
  const aiNum = game.humanSide === 1 ? 2 : 1;
  if (game.turn !== aiNum) { setAIThinking(false); return; }

  const bestMove = getBestAIMove();
  setAIThinking(false);
  if (bestMove) {
    if (bestMove.type === 'move') executePawnMove(aiNum, bestMove.r, bestMove.c);
    else executeWallPlacement(aiNum, bestMove.r, bestMove.c, bestMove.dir);
  } else {
    alternateTurn();
  }
}

function updateMuteButtons() {
  const icon = audio.isMuted ? '🔇' : '🔊';
  document.getElementById('mute-btn-lobby')?.replaceChildren(document.createTextNode(icon));
  document.getElementById('mute-btn-game')?.replaceChildren(document.createTextNode(icon));
}

function toggleMute() {
  audio.init();
  audio.toggleMute();
  updateMuteButtons();
}

function applyLabelsForMode() {
  const timerLabel = game.timerPreset === 'untimed' ? 'UNTIMED' : game.timerPreset.toUpperCase();
  if (game.mode === 'ai') {
    if (game.humanSide === 1) {
      p1NameEl.innerText = 'You';
      p1DescEl.innerText = 'Goal: Top Row';
      p2NameEl.innerText = 'Computer AI';
      p2DescEl.innerText = `${game.difficulty} · pathfinding`;
    } else {
      p1NameEl.innerText = 'Computer AI';
      p1DescEl.innerText = `${game.difficulty} · pathfinding`;
      p2NameEl.innerText = 'You';
      p2DescEl.innerText = 'Goal: Bottom Row';
    }
    hudMatchType.textContent = `AI ${game.difficulty.toUpperCase()} · ${timerLabel}`;
  } else if (game.mode === 'friend') {
    p1NameEl.innerText = 'Player 1';
    p1DescEl.innerText = 'Goal: Top Row';
    p2NameEl.innerText = 'Player 2';
    p2DescEl.innerText = 'Local Pass & Play';
    hudMatchType.textContent = `LOCAL · ${timerLabel}`;
  } else {
    const host = game.onlineRole === 'host';
    p1NameEl.innerText = host ? 'You (Host)' : 'Opponent';
    p1DescEl.innerText = 'Goal: Top Row';
    p2NameEl.innerText = host ? 'Opponent' : 'You (Guest)';
    p2DescEl.innerText = 'Online P2P';
    hudMatchType.textContent = `ONLINE · ${timerLabel}`;
  }
}

function startGame(mode, opts = {}) {
  audio.init();
  game.mode = mode;
  if (opts.onlineRole) game.onlineRole = opts.onlineRole;
  game.reset();
  applyLabelsForMode();
  initBoardDOM();

  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  modalOverlay.classList.add('hidden');
  document.getElementById('online-overlay')?.classList.add('hidden');

  if (game.timersEnabled) {
    game.timerId = setInterval(tickTimer, 1000);
  }

  render();

  // AI goes first if human chose P2
  if (game.mode === 'ai' && game.humanSide === 2) {
    setAIThinking(true);
    setTimeout(executeAIMove, 600);
  }

  // Online: host sends sync config when starting after connect — handled in online flow
  boardEl.focus({ preventScroll: true });
}

function endGame(winnerNum, reason) {
  game.status = 'gameover';
  game.winner = winnerNum;
  setAIThinking(false);
  if (game.timerId) clearInterval(game.timerId);

  let humanWon = false;
  if (game.mode === 'ai') {
    humanWon = winnerNum === game.humanSide;
    recordMatchResult(humanWon);
  }

  if (winnerNum === game.humanSide || (game.mode === 'friend') || (game.mode === 'online' && (
    (game.onlineRole === 'host' && winnerNum === 1) || (game.onlineRole === 'guest' && winnerNum === 2)
  ))) {
    audio.playVictory();
  } else if (game.mode === 'ai') {
    audio.playDefeat();
  } else {
    audio.playVictory();
  }

  modalOverlay.classList.remove('hidden');
  const youWin = game.mode === 'ai' ? humanWon :
    (game.mode === 'online'
      ? ((game.onlineRole === 'host' && winnerNum === 1) || (game.onlineRole === 'guest' && winnerNum === 2))
      : true);

  modalIcon.className = `modal-icon ${youWin || game.mode === 'friend' ? 'victory' : 'defeat'}`;
  modalIcon.innerText = youWin || game.mode === 'friend' ? '🏆' : '💀';

  if (game.mode === 'ai') {
    modalTitle.innerText = humanWon ? 'Victory is Yours!' : 'Defeated by AI';
    modalDesc.innerText = humanWon
      ? `You outsmarted the ${game.difficulty} AI. (${reason})`
      : `The computer prevailed. Try again? (${reason})`;
  } else if (game.mode === 'online') {
    modalTitle.innerText = youWin ? 'You Win!' : 'You Lose';
    modalDesc.innerText = `Online match over. (${reason})`;
  } else {
    modalTitle.innerText = `Player ${winnerNum} Wins!`;
    modalDesc.innerText = `Congratulations Player ${winnerNum}! (${reason})`;
  }

  document.getElementById('replay-btn').disabled = game.actionLog.length === 0;
}

function doExitToLobby() {
  if (game.timerId) clearInterval(game.timerId);
  setAIThinking(false);
  game.status = 'lobby';
  if (game.mode === 'online') OnlineNet.destroy();
  modalOverlay.classList.add('hidden');
  document.getElementById('confirm-overlay')?.classList.add('hidden');
  document.getElementById('move-history-panel')?.classList.add('hidden');
  gameScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  updateStatsDisplay();
}

function requestExitToLobby() {
  if (game.status === 'playing' && game.moveLog.length > 0) {
    leaveCallback = doExitToLobby;
    document.getElementById('confirm-overlay').classList.remove('hidden');
  } else {
    doExitToLobby();
  }
}

function initLobbyConfigDOM() {
  const bindGroup = (selector, onChange) => {
    document.querySelectorAll(`${selector} .config-tab`).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`${selector} .config-tab`).forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        onChange(btn.dataset.value);
      });
    });
  };

  bindGroup('#difficulty-select', v => { game.difficulty = v; });
  bindGroup('#boardsize-select', v => { game.boardSize = parseInt(v); });
  bindGroup('#timer-select', v => { game.timerPreset = v; });
  bindGroup('#side-select', v => { game.humanSide = parseInt(v); });
}

function executeUndo() {
  if (!isHumanTurn() || game.mode === 'online') return;
  if (game.history.length === 0) { audio.playInvalid(); return; }

  let targetState = null;
  if (game.mode === 'ai') {
    while (game.history.length > 0) {
      const state = game.history.pop();
      if (state.turn === game.humanSide) {
        targetState = state;
        break;
      }
    }
  } else {
    targetState = game.history.pop();
  }

  if (targetState) {
    game.p1 = targetState.p1;
    game.p2 = targetState.p2;
    game.turn = targetState.turn;
    game.walls = targetState.walls;
    game.status = targetState.status;
    game.winner = targetState.winner;
    game.moveLog = targetState.moveLog || [];
    game.actionLog = targetState.actionLog || [];
    audio.playMove();
    render();
  } else {
    audio.playInvalid();
  }
}

function handleKeyboard(e) {
  if (game.status !== 'playing') return;
  if (e.target.tagName === 'INPUT') return;

  const key = e.key.toLowerCase();
  if (key === 'r') {
    e.preventDefault();
    flipWallDir();
    return;
  }
  if (key === 'w') {
    e.preventDefault();
    game.wallMode = !game.wallMode;
    render();
    return;
  }
  if (key === 'p') {
    e.preventDefault();
    game.pathPreview = !game.pathPreview;
    render();
    return;
  }
  if (key === 'm') {
    toggleMute();
    return;
  }
  if ((key === 'z' && (e.ctrlKey || e.metaKey)) || key === 'u') {
    e.preventDefault();
    executeUndo();
    return;
  }

  if (!isHumanTurn() || game.wallMode) return;

  const moves = getValidPawnMoves(game.turn, game.walls);
  if (!moves.length) return;

  if (!game.keyboardFocus) game.keyboardFocus = { r: moves[0].r, c: moves[0].c };

  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    e.preventDefault();
    const dr = key === 'arrowup' ? -1 : key === 'arrowdown' ? 1 : 0;
    const dc = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0;
    // Prefer a valid move in that direction from current focus or pawn
    const pawn = game.turn === 1 ? game.p1 : game.p2;
    const candidates = moves.filter(m => {
      if (dr === -1) return m.r < game.keyboardFocus.r || (game.keyboardFocus.r === pawn.r && m.r < pawn.r);
      if (dr === 1) return m.r > game.keyboardFocus.r || (game.keyboardFocus.r === pawn.r && m.r > pawn.r);
      if (dc === -1) return m.c < game.keyboardFocus.c;
      if (dc === 1) return m.c > game.keyboardFocus.c;
      return false;
    });
    const pool = candidates.length ? candidates : moves;
    // Pick closest in direction
    let best = pool[0];
    let bestScore = Infinity;
    for (const m of pool) {
      const score = Math.abs(m.r - (game.keyboardFocus.r + dr)) + Math.abs(m.c - (game.keyboardFocus.c + dc));
      if (score < bestScore) { bestScore = score; best = m; }
    }
    // Cycle through moves
    const idx = moves.findIndex(m => m.r === game.keyboardFocus.r && m.c === game.keyboardFocus.c);
    const next = moves[(idx + 1) % moves.length];
    game.keyboardFocus = key.startsWith('arrow') ? (best || next) : next;
    render();
  }

  if (key === 'enter' || key === ' ') {
    e.preventDefault();
    if (game.keyboardFocus) {
      const ok = moves.some(m => m.r === game.keyboardFocus.r && m.c === game.keyboardFocus.c);
      if (ok) executePawnMove(game.turn, game.keyboardFocus.r, game.keyboardFocus.c);
    }
  }
}

async function replayFromStart() {
  if (!game.actionLog.length) return;
  const actions = game.actionLog.map(a => ({ ...a }));
  const savedMoveLog = [...game.moveLog];

  game.reset();
  applyLabelsForMode();
  initBoardDOM();
  modalOverlay.classList.add('hidden');
  game.status = 'playing';
  // Freeze AI/online during replay
  const savedMode = game.mode;
  game.mode = 'friend';
  render();

  for (const action of actions) {
    await new Promise(r => setTimeout(r, 320));
    if (lobbyScreen.classList.contains('hidden') === false) return;

    if (action.type === 'wall') {
      const player = action.playerNum === 1 ? game.p1 : game.p2;
      game.walls.push({ r: action.r, c: action.c, dir: action.dir, player: action.playerNum });
      player.walls--;
      game.turn = action.playerNum === 1 ? 2 : 1;
      audio.playWallPlace();
    } else {
      const player = action.playerNum === 1 ? game.p1 : game.p2;
      player.r = action.r;
      player.c = action.c;
      game.turn = action.playerNum === 1 ? 2 : 1;
      audio.playMove();
      const goalRow = action.playerNum === 1 ? 0 : game.boardSize - 1;
      if (action.r === goalRow) {
        game.moveLog = savedMoveLog;
        game.actionLog = actions;
        game.mode = savedMode;
        render();
        endGame(action.playerNum, 'Replay finished');
        return;
      }
    }
    render();
  }

  game.moveLog = savedMoveLog;
  game.actionLog = actions;
  game.mode = savedMode;
  game.status = 'gameover';
  render();
}

// --- ONLINE FLOW ---

function openOnlineModal() {
  audio.init();
  const overlay = document.getElementById('online-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('online-status').classList.add('hidden');
  document.getElementById('online-room-code').classList.add('hidden');
  document.getElementById('join-code-input').value = '';
}

function setOnlineStatus(msg) {
  const el = document.getElementById('online-status');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setupOnlineHandlers() {
  OnlineNet.onStatus = setOnlineStatus;
  OnlineNet.onDisconnected = () => {
    if (game.status === 'playing') {
      endGame(game.onlineRole === 'host' ? 1 : 2, 'Opponent disconnected');
    }
  };
  OnlineNet.onMessage = (data) => {
    if (!data || !data.type) return;
    if (data.type === 'sync') {
      game.boardSize = data.boardSize;
      game.timerPreset = data.timerPreset;
      startGame('online', { onlineRole: 'guest' });
      return;
    }
    if (data.type === 'move') {
      executePawnMove(data.playerNum, data.r, data.c, true);
    } else if (data.type === 'wall') {
      executeWallPlacement(data.playerNum, data.r, data.c, data.dir, true);
    }
  };
  OnlineNet.onReady = ({ role }) => {
    if (role === 'host') {
      setTimeout(() => {
        OnlineNet.send({
          type: 'sync',
          boardSize: game.boardSize,
          timerPreset: game.timerPreset
        });
        startGame('online', { onlineRole: 'host' });
      }, 150);
    }
  };
}

// --- TUTORIAL ---

function showTutorial() {
  document.getElementById('tutorial-overlay').classList.remove('hidden');
}

function hideTutorial() {
  document.getElementById('tutorial-overlay').classList.add('hidden');
  localStorage.setItem(TUTORIAL_KEY, '1');
}

// --- EVENT LISTENERS ---

document.getElementById('play-ai').addEventListener('click', () => startGame('ai'));
document.getElementById('play-friend').addEventListener('click', () => startGame('friend'));
document.getElementById('play-online').addEventListener('click', openOnlineModal);
backToLobbyBtn.addEventListener('click', requestExitToLobby);
undoBtn.addEventListener('click', executeUndo);
playAgainBtn.addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
  if (game.mode === 'online') {
    requestExitToLobby();
    return;
  }
  startGame(game.mode);
});
modalLobbyBtn.addEventListener('click', requestExitToLobby);

document.getElementById('confirm-leave-btn').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.add('hidden');
  if (leaveCallback) leaveCallback();
  leaveCallback = null;
});
document.getElementById('cancel-leave-btn').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.add('hidden');
  leaveCallback = null;
});

document.getElementById('mute-btn-lobby').addEventListener('click', toggleMute);
document.getElementById('mute-btn-game').addEventListener('click', toggleMute);
document.getElementById('how-to-play-btn').addEventListener('click', showTutorial);
document.getElementById('tutorial-close-btn').addEventListener('click', hideTutorial);

document.getElementById('wall-mode-btn').addEventListener('click', () => {
  game.wallMode = !game.wallMode;
  render();
});
document.getElementById('rotate-wall-btn').addEventListener('click', flipWallDir);
document.getElementById('path-preview-btn').addEventListener('click', () => {
  game.pathPreview = !game.pathPreview;
  render();
});
document.getElementById('history-toggle-btn').addEventListener('click', () => {
  document.getElementById('move-history-panel').classList.toggle('hidden');
});
document.getElementById('close-history-btn').addEventListener('click', () => {
  document.getElementById('move-history-panel').classList.add('hidden');
});
document.getElementById('replay-btn').addEventListener('click', () => {
  replayFromStart();
});

document.getElementById('host-room-btn').addEventListener('click', async () => {
  setupOnlineHandlers();
  try {
    const { roomCode } = await OnlineNet.host();
    document.getElementById('room-code-display').textContent = roomCode;
    document.getElementById('online-room-code').classList.remove('hidden');
  } catch (err) {
    setOnlineStatus(err.message || 'Failed to host');
  }
});

document.getElementById('join-room-btn').addEventListener('click', async () => {
  setupOnlineHandlers();
  const code = document.getElementById('join-code-input').value;
  try {
    await OnlineNet.join(code);
  } catch (err) {
    setOnlineStatus(err.message || 'Failed to join');
  }
});

document.getElementById('copy-code-btn').addEventListener('click', async () => {
  const code = document.getElementById('room-code-display').textContent;
  try {
    await navigator.clipboard.writeText(code);
    setOnlineStatus('Code copied!');
  } catch {
    setOnlineStatus(code);
  }
});

document.getElementById('online-cancel-btn').addEventListener('click', () => {
  OnlineNet.destroy();
  document.getElementById('online-overlay').classList.add('hidden');
});

boardEl.addEventListener('mousemove', handleBoardMouseMove);
boardEl.addEventListener('mouseleave', hideWallPreview);
boardEl.addEventListener('click', handleBoardClick);
boardEl.addEventListener('contextmenu', handleBoardContextMenu);
boardEl.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
boardEl.addEventListener('touchend', handleBoardTouchEnd, { passive: false });

window.addEventListener('keydown', handleKeyboard);
window.addEventListener('resize', () => {
  if (game.status === 'playing' || game.status === 'gameover') {
    recalculateCellSize();
    render();
  }
});

initLobbyConfigDOM();
updateStatsDisplay();
updateMuteButtons();

if (!localStorage.getItem(TUTORIAL_KEY)) {
  setTimeout(showTutorial, 400);
}
