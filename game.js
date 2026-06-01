// Wallz - Classic Quoridor Board Game Engine
// Developed with rich aesthetics, standard rules, smart AI, and Web Audio SFX

class GameState {
  constructor() {
    this.boardSize = 9;
    this.difficulty = 'medium';
    
    // Players: P1 = Pink (Human, bottom center -> top goal)
    //          P2 = Teal (Human or AI, top center -> bottom goal)
    this.p1 = { r: 8, c: 4, walls: 10, time: 180 };
    this.p2 = { r: 0, c: 4, walls: 10, time: 180 };
    
    this.turn = 1; // Current player: 1 or 2
    this.walls = []; // Array of { r, c, dir, player } (r, c are intersections)
    
    this.mode = 'ai'; // 'ai' or 'friend'
    this.status = 'lobby'; // 'lobby', 'playing', 'gameover'
    this.winner = null;
    
    this.timerId = null;
    this.timeIncrement = 1; // 3+1 format: +1 second per move
    this.history = []; // Undo state history
  }

  reset() {
    const wallCount = this.boardSize === 7 ? 6 : (this.boardSize === 11 ? 14 : 10);
    const midCol = Math.floor(this.boardSize / 2);
    
    this.p1 = { r: this.boardSize - 1, c: midCol, walls: wallCount, time: 180 };
    this.p2 = { r: 0, c: midCol, walls: wallCount, time: 180 };
    
    this.turn = 1;
    this.walls = [];
    this.status = 'playing';
    this.winner = null;
    this.history = []; // Reset history
    
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  saveHistory() {
    const snapshot = {
      p1: { r: this.p1.r, c: this.p1.c, walls: this.p1.walls, time: this.p1.time },
      p2: { r: this.p2.r, c: this.p2.c, walls: this.p2.walls, time: this.p2.time },
      turn: this.turn,
      walls: this.walls.map(w => ({ r: w.r, c: w.c, dir: w.dir, player: w.player })),
      status: this.status,
      winner: this.winner
    };
    this.history.push(snapshot);
  }
}

const game = new GameState();

// --- PATHFINDING & RULES ---

// Verify if coordinates are inside the variable cell grid
function inBounds(r, c) {
  return r >= 0 && r < game.boardSize && c >= 0 && c < game.boardSize;
}

// Check if a direct movement between adjacent cells (r1, c1) and (r2, c2) is blocked by a wall
function isMoveBlocked(r1, c1, r2, c2, wallsList) {
  // If not adjacent, it's blocked by definition
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return true;

  const minR = Math.min(r1, r2);
  const minC = Math.min(c1, c2);

  // Vertical move
  if (c1 === c2) {
    // Movement is between row minR and minR + 1 at column c1
    // Blocked if a horizontal wall exists at (minR, c1) or (minR, c1 - 1)
    for (const w of wallsList) {
      if (w.dir === 'h' && w.r === minR && (w.c === c1 || w.c === c1 - 1)) {
        return true;
      }
    }
  } 
  // Horizontal move
  else if (r1 === r2) {
    // Movement is between column minC and minC + 1 at row r1
    // Blocked if a vertical wall exists at (r1, minC) or (r1 - 1, minC)
    for (const w of wallsList) {
      if (w.dir === 'v' && w.c === minC && (w.r === r1 || w.r === r1 - 1)) {
        return true;
      }
    }
  }

  return false;
}

// Find path using BFS and return path length or null if no path
function findShortestPath(playerNum, startR, startC, wallsList) {
  const goalR = playerNum === 1 ? 0 : game.boardSize - 1;
  const queue = [[startR, startC, 0]];
  const visited = Array.from({ length: game.boardSize }, () => Array(game.boardSize).fill(false));
  visited[startR][startC] = true;

  let head = 0;
  while (head < queue.length) {
    const [r, c, dist] = queue[head++];

    if (r === goalR) {
      return dist;
    }

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;

      if (inBounds(nr, nc) && !visited[nr][nc]) {
        if (!isMoveBlocked(r, c, nr, nc, wallsList)) {
          visited[nr][nc] = true;
          queue.push([nr, nc, dist + 1]);
        }
      }
    }
  }

  return null;
}

// Check if a path to the goal exists for a player under a set of walls
function hasPathToGoal(playerNum, startR, startC, wallsList) {
  return findShortestPath(playerNum, startR, startC, wallsList) !== null;
}

// Get all valid moves for a pawn at (r, c) on the board
function getValidPawnMoves(playerNum, wallsList) {
  const self = playerNum === 1 ? game.p1 : game.p2;
  const opp = playerNum === 1 ? game.p2 : game.p1;
  const r = self.r;
  const c = self.c;
  
  const validMoves = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;

    if (!inBounds(nr, nc)) continue;

    // Is move blocked by a wall?
    if (isMoveBlocked(r, c, nr, nc, wallsList)) continue;

    // Is the opponent pawn here?
    if (nr === opp.r && nc === opp.c) {
      // Jump move
      const jr = nr + dr;
      const jc = nc + dc;

      // Check straight jump
      if (inBounds(jr, jc) && !isMoveBlocked(nr, nc, jr, jc, wallsList)) {
        validMoves.push({ r: jr, c: jc });
      } else {
        // Straight jump is blocked or off board -> can jump diagonally!
        // If jump was vertical (up/down), diagonal jumps are left/right
        // If jump was horizontal (left/right), diagonal jumps are up/down
        if (dr !== 0) { // Vertical jump blocked
          const diagCols = [nc - 1, nc + 1];
          for (const dcDiag of diagCols) {
            if (inBounds(nr, dcDiag) && !isMoveBlocked(nr, nc, nr, dcDiag, wallsList)) {
              validMoves.push({ r: nr, c: dcDiag });
            }
          }
        } else { // Horizontal jump blocked
          const diagRows = [nr - 1, nr + 1];
          for (const drDiag of diagRows) {
            if (inBounds(drDiag, nc) && !isMoveBlocked(nr, nc, drDiag, nc, wallsList)) {
              validMoves.push({ r: drDiag, c: nc });
            }
          }
        }
      }
    } else {
      // Regular move
      validMoves.push({ r: nr, c: nc });
    }
  }

  return validMoves;
}

// Check if placing a wall at intersection (r, c) with orientation dir is valid
function isValidWallPlacement(r, c, dir, wallsList) {
  // Must be within dynamic intersections range: 0 to boardSize - 2
  if (r < 0 || r > game.boardSize - 2 || c < 0 || c > game.boardSize - 2) return false;

  for (const w of wallsList) {
    if (w.r === r && w.c === c) {
      // Exact intersection overlap
      return false;
    }
    if (dir === 'h' && w.dir === 'h' && w.r === r && (w.c === c - 1 || w.c === c + 1)) {
      // Overlap with adjacent horizontal wall segment
      return false;
    }
    if (dir === 'v' && w.dir === 'v' && w.c === c && (w.r === r - 1 || w.r === r + 1)) {
      // Overlap with adjacent vertical wall segment
      return false;
    }
  }

  // Path blocking check: placing this wall must not completely trap either player
  const tempWalls = [...wallsList, { r, c, dir }];
  const p1Ok = hasPathToGoal(1, game.p1.r, game.p1.c, tempWalls);
  const p2Ok = hasPathToGoal(2, game.p2.r, game.p2.c, tempWalls);

  return p1Ok && p2Ok;
}

// --- AI ENGINE (SMART PATHFINDING HEURISTICS) ---

function getBestAIMove() {
  const wallsList = game.walls;
  const ai = game.p2;
  const hu = game.p1;

  const dAI = findShortestPath(2, ai.r, ai.c, wallsList) || 99;
  const dHU = findShortestPath(1, hu.r, hu.c, wallsList) || 99;

  // --- EASY DIFFICULTY ---
  if (game.difficulty === 'easy') {
    // 60% chance of random moves or random valid wall placements
    if (Math.random() < 0.60) {
      // 30% chance to try placing a random wall (if walls left)
      if (ai.walls > 0 && Math.random() < 0.30) {
        const possibleWalls = [];
        for (let r = 0; r < game.boardSize - 1; r++) {
          for (let c = 0; c < game.boardSize - 1; c++) {
            for (const dir of ['h', 'v']) {
              if (isValidWallPlacement(r, c, dir, wallsList)) {
                possibleWalls.push({ r, c, dir });
              }
            }
          }
        }
        if (possibleWalls.length > 0) {
          const w = possibleWalls[Math.floor(Math.random() * possibleWalls.length)];
          return { type: 'wall', r: w.r, c: w.c, dir: w.dir };
        }
      }

      // Move randomly
      const validPawnMoves = getValidPawnMoves(2, wallsList);
      if (validPawnMoves.length > 0) {
        const randomMove = validPawnMoves[Math.floor(Math.random() * validPawnMoves.length)];
        return { type: 'move', r: randomMove.r, c: randomMove.c };
      }
    }
  }

  // --- MEDIUM & HARD DIFFICULTY ---
  let bestAction = null;
  let maxScore = -999;

  // Decide if we should try to place a wall to block human
  let shouldBlock = false;
  if (ai.walls > 0) {
    if (game.difficulty === 'hard') {
      // Hard mode aggressively blocks when human has progress or is ahead
      shouldBlock = (dHU <= 5 || dHU <= dAI);
    } else {
      // Medium balanced heuristic
      shouldBlock = (dHU <= 4 || dHU < dAI || Math.random() < 0.4);
    }
  }

  if (shouldBlock) {
    // Search for a wall placement that maximizes human's path length while minimizing AI's path increase
    for (let r = 0; r < game.boardSize - 1; r++) {
      for (let c = 0; c < game.boardSize - 1; c++) {
        for (const dir of ['h', 'v']) {
          if (isValidWallPlacement(r, c, dir, wallsList)) {
            const tempWalls = [...wallsList, { r, c, dir }];
            
            const newHUPath = findShortestPath(1, hu.r, hu.c, tempWalls);
            const newAIPath = findShortestPath(2, ai.r, ai.c, tempWalls);

            if (newHUPath !== null && newAIPath !== null) {
              const increaseHU = newHUPath - dHU;
              const increaseAI = newAIPath - dAI;

              let score = 0;
              if (game.difficulty === 'hard') {
                // Hard mode puts aggressive weight on blocking human and minimal self-disruption, zero randomness
                score = increaseHU * 2.8 - increaseAI * 1.2;
              } else {
                // Medium standard heuristic
                score = increaseHU * 2.0 - increaseAI * 1.5;
                // Add a tiny random variance to make play feel natural and unpredictable
                score += Math.random() * 0.2;
              }

              if (score > maxScore && increaseHU > 0) {
                maxScore = score;
                bestAction = { type: 'wall', r, c, dir };
              }
            }
          }
        }
      }
    }
  }

  // If a good blocking wall is found, place it. Otherwise, move pawn towards goal.
  const blockThreshold = game.difficulty === 'hard' ? 0.0 : 0.5;
  if (bestAction && maxScore > blockThreshold) {
    return bestAction;
  }

  // Move pawn along shortest path
  const validPawnMoves = getValidPawnMoves(2, wallsList);
  let bestPawnMove = null;
  let minPath = 999;

  for (const move of validPawnMoves) {
    const d = findShortestPath(2, move.r, move.c, wallsList);
    if (d !== null && d < minPath) {
      minPath = d;
      bestPawnMove = move;
    }
  }

  if (bestPawnMove) {
    return { type: 'move', r: bestPawnMove.r, c: bestPawnMove.c };
  }

  // Fallback: choose any valid pawn move
  if (validPawnMoves.length > 0) {
    const randomMove = validPawnMoves[Math.floor(Math.random() * validPawnMoves.length)];
    return { type: 'move', r: randomMove.r, c: randomMove.c };
  }

  return null;
}

// --- DOM RENDERER & INTERACTIVE SYSTEM ---

// DOM Elements
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
const p2DescEl = document.getElementById('p2-desc');
const p2NameEl = document.getElementById('p2-name');

// Modal Elements
const modalOverlay = document.getElementById('modal-overlay');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const playAgainBtn = document.getElementById('play-again-btn');
const modalLobbyBtn = document.getElementById('modal-lobby-btn');

// Preview State
let hoverIntersection = null; // { r, c, dir }
let isValidPreview = false;

// Recalculate cellSize based on dynamic board dimensions and window width/height
function recalculateCellSize() {
  const maxBoardDim = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.55);
  const calculatedCellSize = Math.floor((maxBoardDim - 16 - (game.boardSize - 1) * 10) / game.boardSize);
  const cellSize = Math.max(Math.min(calculatedCellSize, 46), 22);
  document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
}

// Create elements for board grid cells
function initBoardDOM() {
  // Recalculate optimal responsive cell size
  recalculateCellSize();

  boardEl.innerHTML = '';
  
  // Dynamically set CSS Grid Row/Column Templates based on Board Size
  boardEl.style.gridTemplateColumns = `var(--cell-size) repeat(${game.boardSize - 1}, var(--wall-width) var(--cell-size))`;
  boardEl.style.gridTemplateRows = `var(--cell-size) repeat(${game.boardSize - 1}, var(--wall-width) var(--cell-size))`;

  const totalGridRows = game.boardSize * 2 - 1;
  const totalGridCols = game.boardSize * 2 - 1;

  for (let gridR = 0; gridR < totalGridRows; gridR++) {
    for (let gridC = 0; gridC < totalGridCols; gridC++) {
      const isCellRow = gridR % 2 === 0;
      const isCellCol = gridC % 2 === 0;

      if (isCellRow && isCellCol) {
        // Grid cell
        const cellR = gridR / 2;
        const cellC = gridC / 2;
        
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (cellR === 0) cell.classList.add('goal-p1');
        if (cellR === game.boardSize - 1) cell.classList.add('goal-p2');
        cell.dataset.row = cellR;
        cell.dataset.col = cellC;
        
        // CSS Grid Placement (1-indexed)
        cell.style.gridRow = gridR + 1;
        cell.style.gridColumn = gridC + 1;
        
        boardEl.appendChild(cell);
      } else {
        // Interstitial spaces (no visual element initially, but helps with gaps)
        const gap = document.createElement('div');
        if (!isCellRow && !isCellCol) {
          gap.className = 'gap-i'; // Intersection
        } else if (!isCellRow) {
          gap.className = 'gap-h'; // Horizontal channel
        } else {
          gap.className = 'gap-v'; // Vertical channel
        }
        gap.style.gridRow = gridR + 1;
        gap.style.gridColumn = gridC + 1;
        boardEl.appendChild(gap);
      }
    }
  }

  // Create absolute elements for Pawns
  const pawn1 = document.createElement('div');
  pawn1.id = 'pawn-p1';
  pawn1.className = 'pawn p1';
  boardEl.appendChild(pawn1);

  const pawn2 = document.createElement('div');
  pawn2.id = 'pawn-p2';
  pawn2.className = 'pawn p2';
  boardEl.appendChild(pawn2);

  // Setup wall preview element
  const preview = document.createElement('div');
  preview.id = 'wall-preview';
  preview.className = 'wall-preview hidden';
  boardEl.appendChild(preview);
}

// Format seconds into minutes:seconds
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Tick timers every second
function tickTimer() {
  if (game.status !== 'playing') return;

  const currentActive = game.turn === 1 ? game.p1 : game.p2;
  currentActive.time--;

  // Update timer display
  updateTimerDisplay();

  if (currentActive.time <= 0) {
    // Time forfeit victory
    const winner = game.turn === 1 ? 2 : 1;
    endGame(winner, "Time expired!");
  }
}

function updateTimerDisplay() {
  timerValP1.innerText = formatTime(game.p1.time);
  timerValP2.innerText = formatTime(game.p2.time);
  
  if (game.p1.time <= 15) {
    timerValP1.style.color = 'var(--color-pink)';
  } else {
    timerValP1.style.color = '';
  }

  if (game.p2.time <= 15) {
    timerValP2.style.color = 'var(--color-pink)';
  } else {
    timerValP2.style.color = '';
  }
}

// Main Render Loop
function render() {
  // 1. Position the pawns
  positionPawn(1, game.p1.r, game.p1.c);
  positionPawn(2, game.p2.r, game.p2.c);

  // 2. Clear out existing walls and re-render them
  document.querySelectorAll('.wall').forEach(w => w.remove());
  game.walls.forEach(w => drawWall(w.r, w.c, w.dir, w.player));

  // 3. Highlight player panels
  if (game.turn === 1) {
    panelP1.classList.add('active');
    panelP2.classList.remove('active');
  } else {
    panelP2.classList.add('active');
    panelP1.classList.remove('active');
  }

  // 4. Update wall racks
  updateWallRacks();

  // 5. Update timers
  updateTimerDisplay();

  // 6. Highlight valid moves if it's Player 1's turn, or if Player 2's turn in 'friend' mode
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('valid-move'));
  
  const isHumanTurn = (game.turn === 1) || (game.turn === 2 && game.mode === 'friend');
  if (isHumanTurn && game.status === 'playing') {
    const moves = getValidPawnMoves(game.turn, game.walls);
    moves.forEach(m => {
      const cellEl = document.querySelector(`.cell[data-row="${m.r}"][data-col="${m.c}"]`);
      if (cellEl) cellEl.classList.add('valid-move');
    });
  }
}

// Set absolute positioning on pawn element relative to grid cells
function positionPawn(playerNum, r, c) {
  const pawn = document.getElementById(`pawn-p2`);
  const pawn1 = document.getElementById(`pawn-p1`);
  const activePawn = playerNum === 1 ? pawn1 : pawn;
  
  const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  if (cell && activePawn) {
    const padding = parseInt(window.getComputedStyle(boardEl).paddingLeft) || 8;
    // Add dynamic transitions offsetting the grid container padding
    activePawn.style.left = `${cell.offsetLeft - padding + 6}px`;
    activePawn.style.top = `${cell.offsetTop - padding + 6}px`;
  }
}

// Draw a placed wall on the board grid using CSS Grid Positioning
function drawWall(r, c, dir, player) {
  const wall = document.createElement('div');
  wall.className = `wall ${dir === 'h' ? 'horizontal' : 'vertical'} p${player}`;

  // Assign to CSS Grid tracks natively
  if (dir === 'h') {
    wall.style.gridRow = r * 2 + 2;
    wall.style.gridColumn = `${c * 2 + 1} / span 3`;
  } else {
    wall.style.gridColumn = c * 2 + 2;
    wall.style.gridRow = `${r * 2 + 1} / span 3`;
  }

  boardEl.appendChild(wall);
}

// Update the visually satisfying wall pillars remaining
function updateWallRacks() {
  const maxWalls = game.boardSize === 7 ? 6 : (game.boardSize === 11 ? 14 : 10);
  updateRack(wallsRackP1, game.p1.walls, maxWalls);
  updateRack(wallsRackP2, game.p2.walls, maxWalls);
}

function updateRack(rackEl, wallsLeft, maxWalls) {
  rackEl.innerHTML = '';
  for (let i = 0; i < maxWalls; i++) {
    const ind = document.createElement('div');
    ind.className = 'wall-indicator';
    if (i < wallsLeft) {
      ind.className += ' filled';
    } else {
      ind.className += ' spent';
    }
    rackEl.appendChild(ind);
  }
}

// --- CURSOR / HOVER ACTIONS & CALCULATIONS ---

function getClosestWallIntersection(mouseX, mouseY) {
  const cells = document.querySelectorAll('.cell');
  if (cells.length === 0) return null;

  // Compute intersections dynamically based on board size
  // Intersection (r, c) is between cell (r,c) and (r+1, c+1)
  const intersections = [];
  
  for (let r = 0; r < game.boardSize - 1; r++) {
    for (let c = 0; c < game.boardSize - 1; c++) {
      const cellTL = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
      const cellBR = document.querySelector(`.cell[data-row="${r+1}"][data-col="${c+1}"]`);
      
      if (cellTL && cellBR) {
        // Center coordinates of intersection
        const x = (cellTL.offsetLeft + cellTL.offsetWidth + cellBR.offsetLeft) / 2;
        const y = (cellTL.offsetTop + cellTL.offsetHeight + cellBR.offsetTop) / 2;
        intersections.push({ r, c, x, y });
      }
    }
  }

  // Find the closest intersection
  let closest = null;
  let minDist = 99999;

  for (const inter of intersections) {
    const dx = mouseX - inter.x;
    const dy = mouseY - inter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      closest = inter;
    }
  }

  // Return the closest coordinates and vector offset from center to calculate orientation
  if (closest) {
    const dx = mouseX - closest.x;
    const dy = mouseY - closest.y;
    // If |dx| < |dy|, cursor is closer to vertical line -> vertical wall!
    // If |dy| < |dx|, cursor is closer to horizontal line -> horizontal wall!
    const dir = Math.abs(dx) < Math.abs(dy) ? 'v' : 'h';
    
    return { r: closest.r, c: closest.c, dir, dist: minDist };
  }

  return null;
}

function handleBoardMouseMove(e) {
  if (game.status !== 'playing') return;

  // If it's AI turn in AI mode, human cannot do anything
  const isHumanTurn = (game.turn === 1) || (game.turn === 2 && game.mode === 'friend');
  if (!isHumanTurn) {
    hideWallPreview();
    return;
  }

  // Calculate mouse position relative to board
  const rect = boardEl.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Check if we are hovering a cell first (for movements)
  const hoveredCell = e.target.closest('.cell');
  if (hoveredCell && hoveredCell.classList.contains('valid-move')) {
    hideWallPreview();
    return;
  }

  const closest = getClosestWallIntersection(mouseX, mouseY);
  if (!closest) {
    hideWallPreview();
    return;
  }

  // Ensure current player has walls left
  const activePlayer = game.turn === 1 ? game.p1 : game.p2;
  if (activePlayer.walls <= 0) {
    hideWallPreview();
    return;
  }

  // Threshold check to avoid wall flickering in cell center
  const cellWidth = document.querySelector('.cell').offsetWidth;
  if (closest.dist > cellWidth * 0.9) {
    hideWallPreview();
    return;
  }

  // Preview is valid
  hoverIntersection = { r: closest.r, c: closest.c, dir: closest.dir };
  isValidPreview = isValidWallPlacement(closest.r, closest.c, closest.dir, game.walls);

  showWallPreview(closest.r, closest.c, closest.dir, isValidPreview);
}

function showWallPreview(r, c, dir, isValid) {
  const preview = document.getElementById('wall-preview');
  if (!preview) return;

  preview.classList.remove('hidden');
  preview.className = `wall-preview ${dir === 'h' ? 'horizontal' : 'vertical'} ${isValid ? 'valid' : 'invalid'}`;

  // Assign to CSS Grid tracks natively
  if (dir === 'h') {
    preview.style.gridRow = r * 2 + 2;
    preview.style.gridColumn = `${c * 2 + 1} / span 3`;
  } else {
    preview.style.gridColumn = c * 2 + 2;
    preview.style.gridRow = `${r * 2 + 1} / span 3`;
  }
}

function hideWallPreview() {
  const preview = document.getElementById('wall-preview');
  if (preview) {
    preview.classList.add('hidden');
  }
  hoverIntersection = null;
}

function handleBoardMouseLeave() {
  hideWallPreview();
}

// --- CLICK HANDLERS (TURN ACTIONS) ---

function handleBoardClick(e) {
  if (game.status !== 'playing') return;

  const isHumanTurn = (game.turn === 1) || (game.turn === 2 && game.mode === 'friend');
  if (!isHumanTurn) return;

  // 1. Check if clicking a valid pawn movement cell
  const cell = e.target.closest('.cell');
  if (cell && cell.classList.contains('valid-move')) {
    const tr = parseInt(cell.dataset.row);
    const tc = parseInt(cell.dataset.col);
    
    executePawnMove(game.turn, tr, tc);
    return;
  }

  // 2. Check if placing a wall at the hovered preview intersection
  if (hoverIntersection) {
    if (isValidPreview) {
      executeWallPlacement(game.turn, hoverIntersection.r, hoverIntersection.c, hoverIntersection.dir);
      hideWallPreview();
    } else {
      audio.playInvalid();
      // Visual wobble shake on preview wall
      const preview = document.getElementById('wall-preview');
      if (preview) {
        preview.style.animation = 'none';
        void preview.offsetWidth; // Trigger reflow
        preview.style.animation = 'shake 0.3s ease';
      }
    }
  }
}

function executePawnMove(playerNum, r, c) {
  // Save history state before changing it
  game.saveHistory();

  const player = playerNum === 1 ? game.p1 : game.p2;
  
  // Update state
  player.r = r;
  player.c = c;
  
  // Apply time increment (3+1 ruleset)
  player.time += game.timeIncrement;
  
  audio.playMove();

  // Check victory condition
  // P1 needs to reach Row 0, P2 needs to reach Row game.boardSize - 1
  const goalRow = playerNum === 1 ? 0 : game.boardSize - 1;
  if (r === goalRow) {
    endGame(playerNum, "Goal baseline reached!");
    return;
  }

  // Alternate turn
  alternateTurn();
}

function executeWallPlacement(playerNum, r, c, dir) {
  // Save history state before changing it
  game.saveHistory();

  const player = playerNum === 1 ? game.p1 : game.p2;
  
  // Place wall
  game.walls.push({ r, c, dir, player: playerNum });
  player.walls--;
  
  // Apply increment
  player.time += game.timeIncrement;

  audio.playWallPlace();

  // Alternate turn
  alternateTurn();
}

function alternateTurn() {
  game.turn = game.turn === 1 ? 2 : 1;
  render();

  // If AI's turn, trigger the AI move
  if (game.turn === 2 && game.mode === 'ai' && game.status === 'playing') {
    // Smooth artificial delay to feel premium and thoughtful (500-1000ms)
    setTimeout(executeAIMove, 600 + Math.random() * 400);
  }
}

function executeAIMove() {
  if (game.status !== 'playing' || game.turn !== 2) return;

  const bestMove = getBestAIMove();
  if (bestMove) {
    if (bestMove.type === 'move') {
      executePawnMove(2, bestMove.r, bestMove.c);
    } else if (bestMove.type === 'wall') {
      executeWallPlacement(2, bestMove.r, bestMove.c, bestMove.dir);
    }
  } else {
    // AI has no moves (impossible in standard rules, but fallback)
    alternateTurn();
  }
}

// --- GAME STATE MANAGER (START / STOP) ---

function startGame(mode) {
  // Initialize audio on first click
  audio.init();
  
  game.mode = mode;
  game.reset();
  
  // Set AI status label
  if (mode === 'ai') {
    p2NameEl.innerText = "Computer AI";
    p2DescEl.innerText = "Shortest-path heuristic engine";
  } else {
    p2NameEl.innerText = "Player 2";
    p2DescEl.innerText = "Local Pass & Play";
  }

  initBoardDOM();
  
  // Transitions
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  
  // Start ticking timer
  game.timerId = setInterval(tickTimer, 1000);

  render();
}

function endGame(winnerNum, reason) {
  game.status = 'gameover';
  game.winner = winnerNum;
  
  if (game.timerId) {
    clearInterval(game.timerId);
  }

  // Play result sound
  if (winnerNum === 1) {
    audio.playVictory();
  } else {
    if (game.mode === 'ai') {
      audio.playDefeat();
    } else {
      audio.playVictory(); // Still a human victory in local multiplayer
    }
  }

  // Populate victory modal
  modalOverlay.classList.remove('hidden');
  modalIcon.className = `modal-icon ${winnerNum === 1 ? 'victory' : (game.mode === 'ai' ? 'defeat' : 'victory')}`;
  modalIcon.innerText = winnerNum === 1 ? '🏆' : (game.mode === 'ai' ? '💀' : '🏆');
  
  if (game.mode === 'ai') {
    modalTitle.innerText = winnerNum === 1 ? "Victory is Yours!" : "Defeated by AI";
    modalDesc.innerText = winnerNum === 1 
      ? `Spectacular work! You outsmarted the pathfinding algorithm. (${reason})`
      : `The computer prevailed this time. Ready to refine your blocking strategy? (${reason})`;
  } else {
    modalTitle.innerText = `Player ${winnerNum} Wins!`;
    modalDesc.innerText = `Congratulations Player ${winnerNum}! A beautifully executed strategy. (${reason})`;
  }
}

function exitToLobby() {
  if (game.timerId) {
    clearInterval(game.timerId);
  }
  game.status = 'lobby';
  
  // Transitions
  modalOverlay.classList.add('hidden');
  gameScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
}

// --- LOBBY GAME CONFIGURATION SELECTORS HANDLER ---

function initLobbyConfigDOM() {
  const difficultyButtons = document.querySelectorAll('#difficulty-select .config-tab');
  const boardSizeButtons = document.querySelectorAll('#boardsize-select .config-tab');

  difficultyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      difficultyButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      game.difficulty = btn.dataset.value;
    });
  });

  boardSizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      boardSizeButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      game.boardSize = parseInt(btn.dataset.value);
    });
  });
}

// --- UNDO MOVE SYSTEM ---

function executeUndo() {
  if (game.status !== 'playing') return;
  
  // Prevent undoing during the AI's brief visual thinking turn delay
  const isHumanTurn = (game.turn === 1) || (game.turn === 2 && game.mode === 'friend');
  if (!isHumanTurn) return;

  if (game.history.length === 0) {
    audio.playInvalid();
    return;
  }

  let targetState = null;
  if (game.mode === 'ai') {
    // In AI mode, revert both the AI's move and the human's last move
    // We pop states until we find a state representing Player 1's turn
    while (game.history.length > 0) {
      const state = game.history.pop();
      if (state.turn === 1) {
        targetState = state;
        break;
      }
    }
  } else {
    // In local friend mode, just revert the single last move
    targetState = game.history.pop();
  }

  if (targetState) {
    game.p1 = targetState.p1;
    game.p2 = targetState.p2;
    game.turn = targetState.turn;
    game.walls = targetState.walls;
    game.status = targetState.status;
    game.winner = targetState.winner;
    
    audio.playMove(); // Audio feedback for state reversion
    render();
  } else {
    audio.playInvalid();
  }
}

// --- SETUP EVENT LISTENERS ---

document.getElementById('play-ai').addEventListener('click', () => startGame('ai'));
document.getElementById('play-friend').addEventListener('click', () => startGame('friend'));
backToLobbyBtn.addEventListener('click', exitToLobby);
document.getElementById('undo-btn').addEventListener('click', executeUndo);
playAgainBtn.addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
  startGame(game.mode);
});
modalLobbyBtn.addEventListener('click', exitToLobby);

// Register board actions once globally
boardEl.addEventListener('mousemove', handleBoardMouseMove);
boardEl.addEventListener('mouseleave', handleBoardMouseLeave);
boardEl.addEventListener('click', handleBoardClick);

// Scale grid board automatically to be highly responsive on window resize
window.addEventListener('resize', () => {
  if (game.status === 'playing') {
    recalculateCellSize();
    render();
  }
});

// Initialize configuration selectors in lobby
initLobbyConfigDOM();
