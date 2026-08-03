import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isHumanTurn, isValidWallPlacement } from '../game/logic';

export default function Board({
  state,
  validMoves,
  pathCells,
  wallPreview,
  shakePreview,
  onPawnMove,
  onPlaceWall,
  onFlipWall,
  onHidePreview,
  onHover,
}) {
  const boardRef = useRef(null);
  const cellRefs = useRef(new Map());
  const [layoutTick, setLayoutTick] = useState(0);

  const setCellRef = useCallback((r, c, el) => {
    const key = `${r},${c}`;
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  }, []);

  const recalculateCellSize = useCallback(() => {
    const maxBoardDim = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.5);
    const calculated = Math.floor(
      (maxBoardDim - 16 - (state.boardSize - 1) * 10) / state.boardSize
    );
    const cellSize = Math.max(Math.min(calculated, 46), 20);
    document.documentElement.style.setProperty('--cell-size', `${cellSize}px`);
  }, [state.boardSize]);

  useLayoutEffect(() => {
    recalculateCellSize();
    setLayoutTick((t) => t + 1);
  }, [recalculateCellSize, state.status, state.boardSize, state.p1.r, state.p1.c, state.p2.r, state.p2.c]);

  useEffect(() => {
    const onResize = () => {
      if (state.status === 'playing' || state.status === 'gameover') {
        recalculateCellSize();
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recalculateCellSize, state.status]);

  useEffect(() => {
    boardRef.current?.focus({ preventScroll: true });
  }, [state.status, state.boardSize]);

  const getClosestWallIntersection = useCallback(
    (mouseX, mouseY) => {
      const intersections = [];
      for (let r = 0; r < state.boardSize - 1; r++) {
        for (let c = 0; c < state.boardSize - 1; c++) {
          const cellTL = cellRefs.current.get(`${r},${c}`);
          const cellBR = cellRefs.current.get(`${r + 1},${c + 1}`);
          if (cellTL && cellBR) {
            intersections.push({
              r,
              c,
              x: (cellTL.offsetLeft + cellTL.offsetWidth + cellBR.offsetLeft) / 2,
              y: (cellTL.offsetTop + cellTL.offsetHeight + cellBR.offsetTop) / 2,
            });
          }
        }
      }

      let closest = null;
      let minDist = 99999;
      for (const inter of intersections) {
        const dist = Math.hypot(mouseX - inter.x, mouseY - inter.y);
        if (dist < minDist) {
          minDist = dist;
          closest = inter;
        }
      }

      if (!closest) return null;
      let dir = Math.abs(mouseX - closest.x) < Math.abs(mouseY - closest.y) ? 'v' : 'h';
      if (state.forcedWallDir) dir = state.forcedWallDir;
      return { r: closest.r, c: closest.c, dir, dist: minDist };
    },
    [state.boardSize, state.forcedWallDir]
  );

  const updateWallPreviewAt = useCallback(
    (clientX, clientY, target) => {
      if (!isHumanTurn(state)) {
        onHidePreview();
        return;
      }

      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      const hoveredCell = target?.closest?.('.cell');
      if (!state.wallMode && hoveredCell?.classList.contains('valid-move')) {
        onHidePreview();
        return;
      }

      const closest = getClosestWallIntersection(mouseX, mouseY);
      if (!closest) {
        onHidePreview();
        return;
      }

      const activePlayer = state.turn === 1 ? state.p1 : state.p2;
      if (activePlayer.walls <= 0) {
        onHidePreview();
        return;
      }

      const cellWidth = cellRefs.current.get('0,0')?.offsetWidth || 40;
      const threshold = state.wallMode ? cellWidth * 1.4 : cellWidth * 0.9;
      if (closest.dist > threshold && !state.wallMode) {
        onHidePreview();
        return;
      }

      const valid = isValidWallPlacement(state, closest.r, closest.c, closest.dir);
      onHover({ r: closest.r, c: closest.c, dir: closest.dir }, valid);
    },
    [getClosestWallIntersection, onHidePreview, onHover, state]
  );

  const handleMouseMove = (e) => {
    if (state.status !== 'playing') return;
    updateWallPreviewAt(e.clientX, e.clientY, e.target);
  };

  const handleClick = (e) => {
    if (!isHumanTurn(state)) return;
    const cell = e.target.closest('.cell');
    if (!state.wallMode && cell?.classList.contains('valid-move')) {
      onPawnMove(state.turn, parseInt(cell.dataset.row, 10), parseInt(cell.dataset.col, 10));
      return;
    }
    onPlaceWall();
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    if (!isHumanTurn(state)) return;
    onFlipWall();
  };

  const handleTouchMove = (e) => {
    if (state.status !== 'playing' || !isHumanTurn(state)) return;
    const t = e.touches[0];
    if (!t) return;
    if (state.wallMode) e.preventDefault();
    updateWallPreviewAt(t.clientX, t.clientY, document.elementFromPoint(t.clientX, t.clientY));
  };

  const handleTouchEnd = (e) => {
    if (state.status !== 'playing' || !isHumanTurn(state)) return;
    const t = e.changedTouches[0];
    if (!t) return;

    if (state.wallMode && wallPreview) {
      e.preventDefault();
      onPlaceWall();
      return;
    }

    const el = document.elementFromPoint(t.clientX, t.clientY);
    const cell = el?.closest?.('.cell');
    if (cell?.classList.contains('valid-move')) {
      onPawnMove(state.turn, parseInt(cell.dataset.row, 10), parseInt(cell.dataset.col, 10));
    } else if (wallPreview?.valid) {
      onPlaceWall();
    }
  };

  const total = state.boardSize * 2 - 1;
  const gridItems = [];
  for (let gridR = 0; gridR < total; gridR++) {
    for (let gridC = 0; gridC < total; gridC++) {
      const isCellRow = gridR % 2 === 0;
      const isCellCol = gridC % 2 === 0;
      if (isCellRow && isCellCol) {
        const cellR = gridR / 2;
        const cellC = gridC / 2;
        const isValid = validMoves.some((m) => m.r === cellR && m.c === cellC);
        const turnClass = state.turn === 1 ? 'valid-move-p1' : 'valid-move-p2';
        const onPath = pathCells.some((p, i) => i > 0 && p.r === cellR && p.c === cellC);
        const isFocus =
          state.keyboardFocus?.r === cellR && state.keyboardFocus?.c === cellC;
        const classes = [
          'cell',
          cellR === 0 ? 'goal-p1' : '',
          cellR === state.boardSize - 1 ? 'goal-p2' : '',
          isValid ? `valid-move ${turnClass}` : '',
          onPath && !isValid ? 'path-hint' : '',
          isFocus ? 'kb-focus' : '',
        ]
          .filter(Boolean)
          .join(' ');

        gridItems.push(
          <div
            key={`c-${cellR}-${cellC}`}
            ref={(el) => setCellRef(cellR, cellC, el)}
            className={classes}
            data-row={cellR}
            data-col={cellC}
            style={{ gridRow: gridR + 1, gridColumn: gridC + 1 }}
          />
        );
      } else {
        const gapClass = !isCellRow && !isCellCol ? 'gap-i' : !isCellRow ? 'gap-h' : 'gap-v';
        gridItems.push(
          <div
            key={`g-${gridR}-${gridC}`}
            className={gapClass}
            style={{ gridRow: gridR + 1, gridColumn: gridC + 1 }}
          />
        );
      }
    }
  }

  // layoutTick ensures pawn positions refresh after cells measure
  void layoutTick;

  const board = boardRef.current;
  const padding = board ? parseInt(window.getComputedStyle(board).paddingLeft, 10) || 8 : 8;

  const pawnStyle = (player) => {
    const pos = player === 1 ? state.p1 : state.p2;
    const cell = cellRefs.current.get(`${pos.r},${pos.c}`);
    if (!cell) return { visibility: 'hidden' };
    return {
      left: `${cell.offsetLeft - padding + 6}px`,
      top: `${cell.offsetTop - padding + 6}px`,
    };
  };

  const wallStyle = (w) => {
    if (w.dir === 'h') {
      return { gridRow: w.r * 2 + 2, gridColumn: `${w.c * 2 + 1} / span 3` };
    }
    return { gridColumn: w.c * 2 + 2, gridRow: `${w.r * 2 + 1} / span 3` };
  };

  const previewStyle = wallPreview
    ? wallPreview.dir === 'h'
      ? { gridRow: wallPreview.r * 2 + 2, gridColumn: `${wallPreview.c * 2 + 1} / span 3` }
      : { gridColumn: wallPreview.c * 2 + 2, gridRow: `${wallPreview.r * 2 + 1} / span 3` }
    : null;

  return (
    <div className="board-stage">
      <div
        className="board"
        id="board"
        tabIndex={0}
        ref={boardRef}
        style={{
          gridTemplateColumns: `var(--cell-size) repeat(${state.boardSize - 1}, var(--wall-width) var(--cell-size))`,
          gridTemplateRows: `var(--cell-size) repeat(${state.boardSize - 1}, var(--wall-width) var(--cell-size))`,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={onHidePreview}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {gridItems}
        <div id="pawn-p1" className="pawn p1" style={pawnStyle(1)} />
        <div id="pawn-p2" className="pawn p2" style={pawnStyle(2)} />
        {state.walls.map((w, i) => (
          <div
            key={`w-${i}-${w.r}-${w.c}-${w.dir}`}
            className={`wall ${w.dir === 'h' ? 'horizontal' : 'vertical'} p${w.player}`}
            style={wallStyle(w)}
          />
        ))}
        {wallPreview && (
          <div
            id="wall-preview"
            className={`wall-preview ${wallPreview.dir === 'h' ? 'horizontal' : 'vertical'} ${
              wallPreview.valid ? 'valid' : 'invalid'
            }`}
            style={{
              ...previewStyle,
              animation: shakePreview ? 'shake 0.3s ease' : undefined,
            }}
          />
        )}
      </div>
      <div id="ai-thinking" className={`ai-thinking${state.aiPending ? '' : ' hidden'}`} aria-live="polite">
        AI thinking…
      </div>
    </div>
  );
}
