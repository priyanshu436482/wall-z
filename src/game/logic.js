/** Pure Quoridor rules, pathfinding, and AI — operates on a game state object. */

export function createInitialState() {
  return {
    boardSize: 9,
    difficulty: 'medium',
    timerPreset: '3+1',
    humanSide: 1,
    pathPreview: false,
    wallMode: false,
    forcedWallDir: null,
    moveLog: [],
    actionLog: [],
    keyboardFocus: null,
    p1: { r: 8, c: 4, walls: 10, time: 180 },
    p2: { r: 0, c: 4, walls: 10, time: 180 },
    turn: 1,
    walls: [],
    mode: 'ai',
    onlineRole: null,
    status: 'lobby',
    winner: null,
    timeIncrement: 1,
    timersEnabled: true,
    history: [],
    aiPending: false,
  };
}

export function getTimerConfig(timerPreset) {
  if (timerPreset === '5+0') return { time: 300, increment: 0, enabled: true };
  if (timerPreset === 'untimed') return { time: 9999, increment: 0, enabled: false };
  return { time: 180, increment: 1, enabled: true };
}

export function resetMatch(state) {
  const wallCount = state.boardSize === 7 ? 6 : state.boardSize === 11 ? 14 : 10;
  const midCol = Math.floor(state.boardSize / 2);
  const tc = getTimerConfig(state.timerPreset);

  return {
    ...state,
    p1: { r: state.boardSize - 1, c: midCol, walls: wallCount, time: tc.time },
    p2: { r: 0, c: midCol, walls: wallCount, time: tc.time },
    timeIncrement: tc.increment,
    timersEnabled: tc.enabled,
    turn: 1,
    walls: [],
    status: 'playing',
    winner: null,
    history: [],
    moveLog: [],
    actionLog: [],
    keyboardFocus: null,
    forcedWallDir: null,
    wallMode: false,
    aiPending: false,
  };
}

export function snapshotHistory(state) {
  return {
    p1: { ...state.p1 },
    p2: { ...state.p2 },
    turn: state.turn,
    walls: state.walls.map((w) => ({ ...w })),
    status: state.status,
    winner: state.winner,
    moveLog: [...state.moveLog],
    actionLog: state.actionLog.map((a) => ({ ...a })),
  };
}

export function inBounds(boardSize, r, c) {
  return r >= 0 && r < boardSize && c >= 0 && c < boardSize;
}

export function isMoveBlocked(r1, c1, r2, c2, wallsList) {
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

export function findShortestPath(boardSize, playerNum, startR, startC, wallsList) {
  const goalR = playerNum === 1 ? 0 : boardSize - 1;
  const queue = [[startR, startC, 0]];
  const visited = Array.from({ length: boardSize }, () => Array(boardSize).fill(false));
  visited[startR][startC] = true;
  let head = 0;

  while (head < queue.length) {
    const [r, c, dist] = queue[head++];
    if (r === goalR) return dist;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(boardSize, nr, nc) && !visited[nr][nc] && !isMoveBlocked(r, c, nr, nc, wallsList)) {
        visited[nr][nc] = true;
        queue.push([nr, nc, dist + 1]);
      }
    }
  }
  return null;
}

export function findPathCells(boardSize, playerNum, startR, startC, wallsList) {
  const goalR = playerNum === 1 ? 0 : boardSize - 1;
  const queue = [[startR, startC]];
  const visited = Array.from({ length: boardSize }, () => Array(boardSize).fill(false));
  const parent = Array.from({ length: boardSize }, () => Array(boardSize).fill(null));
  visited[startR][startC] = true;
  let head = 0;
  let end = null;

  while (head < queue.length) {
    const [r, c] = queue[head++];
    if (r === goalR) {
      end = [r, c];
      break;
    }
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(boardSize, nr, nc) && !visited[nr][nc] && !isMoveBlocked(r, c, nr, nc, wallsList)) {
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

export function hasPathToGoal(boardSize, playerNum, startR, startC, wallsList) {
  return findShortestPath(boardSize, playerNum, startR, startC, wallsList) !== null;
}

export function getValidPawnMoves(state, playerNum, wallsList = state.walls) {
  const self = playerNum === 1 ? state.p1 : state.p2;
  const opp = playerNum === 1 ? state.p2 : state.p1;
  const { r, c } = self;
  const validMoves = [];
  const { boardSize } = state;

  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(boardSize, nr, nc) || isMoveBlocked(r, c, nr, nc, wallsList)) continue;

    if (nr === opp.r && nc === opp.c) {
      const jr = nr + dr;
      const jc = nc + dc;
      if (inBounds(boardSize, jr, jc) && !isMoveBlocked(nr, nc, jr, jc, wallsList)) {
        validMoves.push({ r: jr, c: jc });
      } else if (dr !== 0) {
        for (const dcDiag of [nc - 1, nc + 1]) {
          if (inBounds(boardSize, nr, dcDiag) && !isMoveBlocked(nr, nc, nr, dcDiag, wallsList)) {
            validMoves.push({ r: nr, c: dcDiag });
          }
        }
      } else {
        for (const drDiag of [nr - 1, nr + 1]) {
          if (inBounds(boardSize, drDiag, nc) && !isMoveBlocked(nr, nc, drDiag, nc, wallsList)) {
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

export function isValidWallPlacement(state, r, c, dir, wallsList = state.walls) {
  const { boardSize } = state;
  if (r < 0 || r > boardSize - 2 || c < 0 || c > boardSize - 2) return false;
  for (const w of wallsList) {
    if (w.r === r && w.c === c) return false;
    if (dir === 'h' && w.dir === 'h' && w.r === r && (w.c === c - 1 || w.c === c + 1)) return false;
    if (dir === 'v' && w.dir === 'v' && w.c === c && (w.r === r - 1 || w.r === r + 1)) return false;
  }
  const tempWalls = [...wallsList, { r, c, dir }];
  return (
    hasPathToGoal(boardSize, 1, state.p1.r, state.p1.c, tempWalls) &&
    hasPathToGoal(boardSize, 2, state.p2.r, state.p2.c, tempWalls)
  );
}

function scoreWallForAI(state, r, c, dir, wallsList, aiNum, huNum, dAI, dHU) {
  const tempWalls = [...wallsList, { r, c, dir }];
  const hu = huNum === 1 ? state.p1 : state.p2;
  const ai = aiNum === 1 ? state.p1 : state.p2;
  const newHU = findShortestPath(state.boardSize, huNum, hu.r, hu.c, tempWalls);
  const newAI = findShortestPath(state.boardSize, aiNum, ai.r, ai.c, tempWalls);
  if (newHU === null || newAI === null) return -999;

  const increaseHU = newHU - dHU;
  const increaseAI = newAI - dAI;
  let score = increaseHU * 2.5 - increaseAI * 1.3;

  if (state.difficulty === 'hard') {
    score = increaseHU * 3.2 - increaseAI * 1.1;
    if (dAI + 1 < dHU) score -= 0.8;
    if (increaseHU >= 2) score += 1.5;
    if (increaseHU >= 3) score += 2.0;

    const working = {
      ...state,
      p1: { ...state.p1 },
      p2: { ...state.p2 },
    };
    const huMoves = getValidPawnMoves(working, huNum, tempWalls);
    let bestHuCut = 0;
    for (const m of huMoves.slice(0, 8)) {
      if (huNum === 1) {
        working.p1.r = m.r;
        working.p1.c = m.c;
      } else {
        working.p2.r = m.r;
        working.p2.c = m.c;
      }
      const after = findShortestPath(state.boardSize, aiNum, ai.r, ai.c, tempWalls);
      if (huNum === 1) {
        working.p1.r = hu.r;
        working.p1.c = hu.c;
      } else {
        working.p2.r = hu.r;
        working.p2.c = hu.c;
      }
      if (after !== null && dAI !== null) bestHuCut = Math.max(bestHuCut, after - dAI);
    }
    score -= bestHuCut * 0.4;
  } else {
    score += Math.random() * 0.25;
  }
  return increaseHU > 0 ? score : -999;
}

export function getBestAIMove(state) {
  const wallsList = state.walls;
  const aiNum = state.mode === 'ai' ? (state.humanSide === 1 ? 2 : 1) : 2;
  const huNum = aiNum === 1 ? 2 : 1;
  const ai = aiNum === 1 ? state.p1 : state.p2;
  const hu = huNum === 1 ? state.p1 : state.p2;

  const dAI = findShortestPath(state.boardSize, aiNum, ai.r, ai.c, wallsList) || 99;
  const dHU = findShortestPath(state.boardSize, huNum, hu.r, hu.c, wallsList) || 99;

  if (state.difficulty === 'easy' && Math.random() < 0.55) {
    if (ai.walls > 0 && Math.random() < 0.3) {
      const possible = [];
      for (let r = 0; r < state.boardSize - 1; r++) {
        for (let c = 0; c < state.boardSize - 1; c++) {
          for (const dir of ['h', 'v']) {
            if (isValidWallPlacement(state, r, c, dir, wallsList)) possible.push({ r, c, dir });
          }
        }
      }
      if (possible.length) {
        const w = possible[Math.floor(Math.random() * possible.length)];
        return { type: 'wall', r: w.r, c: w.c, dir: w.dir };
      }
    }
    const moves = getValidPawnMoves(state, aiNum, wallsList);
    if (moves.length) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      return { type: 'move', r: m.r, c: m.c };
    }
  }

  let bestAction = null;
  let maxScore = -999;
  let shouldBlock = false;

  if (ai.walls > 0) {
    if (state.difficulty === 'hard') {
      shouldBlock = dHU <= 6 || dHU <= dAI + 1 || (dHU <= 8 && ai.walls >= 3);
    } else {
      shouldBlock = dHU <= 4 || dHU < dAI || Math.random() < 0.4;
    }
  }

  if (shouldBlock) {
    const candidates = [];
    for (let r = 0; r < state.boardSize - 1; r++) {
      for (let c = 0; c < state.boardSize - 1; c++) {
        for (const dir of ['h', 'v']) {
          if (!isValidWallPlacement(state, r, c, dir, wallsList)) continue;
          const score = scoreWallForAI(state, r, c, dir, wallsList, aiNum, huNum, dAI, dHU);
          if (score > maxScore) {
            maxScore = score;
            bestAction = { type: 'wall', r, c, dir };
          }
          if (state.difficulty === 'hard' && score > 0.5) {
            candidates.push({ score, action: { type: 'wall', r, c, dir } });
          }
        }
      }
    }
    if (state.difficulty === 'hard' && candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      const top = candidates.slice(0, Math.min(5, candidates.length));
      if (dHU <= dAI || top[0].score >= 1.2) {
        bestAction = top[0].action;
        maxScore = top[0].score;
      }
    }
  }

  const blockThreshold = state.difficulty === 'hard' ? (dHU <= dAI ? -0.2 : 1.0) : 0.5;
  if (bestAction && maxScore > blockThreshold) return bestAction;

  const validPawnMoves = getValidPawnMoves(state, aiNum, wallsList);
  let bestPawnMove = null;
  let minPath = 999;

  for (const move of validPawnMoves) {
    const d = findShortestPath(state.boardSize, aiNum, move.r, move.c, wallsList);
    if (d === null) continue;
    if (d < minPath) {
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

export function cellLabel(boardSize, r, c) {
  return `${String.fromCharCode(97 + c)}${boardSize - r}`;
}

export function formatTime(timersEnabled, sec) {
  if (!timersEnabled) return '∞';
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function maxWallsForBoard(boardSize) {
  return boardSize === 7 ? 6 : boardSize === 11 ? 14 : 10;
}

export const STATS_KEY = 'wallz_stats_v1';
export const TUTORIAL_KEY = 'wallz_tutorial_seen';

export function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0 };
  } catch {
    return { wins: 0, losses: 0, streak: 0 };
  }
}

export function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function recordMatchResult(mode, humanWon) {
  if (mode !== 'ai') return loadStats();
  const s = loadStats();
  if (humanWon) {
    s.wins++;
    s.streak++;
  } else {
    s.losses++;
    s.streak = 0;
  }
  saveStats(s);
  return s;
}

export function isHumanTurn(state) {
  if (state.status !== 'playing') return false;
  if (state.mode === 'friend') return true;
  if (state.mode === 'online') {
    const mySide = state.onlineRole === 'host' ? 1 : 2;
    return state.turn === mySide && !state.aiPending;
  }
  return state.turn === state.humanSide && !state.aiPending;
}

export function getPlayerLabels(state) {
  const timerLabel = state.timerPreset === 'untimed' ? 'UNTIMED' : state.timerPreset.toUpperCase();
  if (state.mode === 'ai') {
    if (state.humanSide === 1) {
      return {
        p1Name: 'You',
        p1Desc: 'Goal: Top Row',
        p2Name: 'Computer AI',
        p2Desc: `${state.difficulty} · pathfinding`,
        hud: `AI ${state.difficulty.toUpperCase()} · ${timerLabel}`,
      };
    }
    return {
      p1Name: 'Computer AI',
      p1Desc: `${state.difficulty} · pathfinding`,
      p2Name: 'You',
      p2Desc: 'Goal: Bottom Row',
      hud: `AI ${state.difficulty.toUpperCase()} · ${timerLabel}`,
    };
  }
  if (state.mode === 'friend') {
    return {
      p1Name: 'Player 1',
      p1Desc: 'Goal: Top Row',
      p2Name: 'Player 2',
      p2Desc: 'Local Pass & Play',
      hud: `LOCAL · ${timerLabel}`,
    };
  }
  const host = state.onlineRole === 'host';
  return {
    p1Name: host ? 'You (Host)' : 'Opponent',
    p1Desc: 'Goal: Top Row',
    p2Name: host ? 'Opponent' : 'You (Guest)',
    p2Desc: 'Online P2P',
    hud: `ONLINE · ${timerLabel}`,
  };
}
