import { formatTime, maxWallsForBoard } from '../game/logic';
import Board from './Board';

function WallRack({ wallsLeft, maxWalls, id, label }) {
  return (
    <div className="wall-rack" id={id} role="img" aria-label={label}>
      {Array.from({ length: maxWalls }, (_, i) => (
        <div key={i} className={`wall-indicator ${i < wallsLeft ? 'filled' : 'spent'}`} />
      ))}
    </div>
  );
}

function PlayerPanel({
  side,
  name,
  desc,
  walls,
  maxWalls,
  time,
  timersEnabled,
  active,
}) {
  const avatarClass = side === 1 ? 'teal' : 'pink';
  return (
    <section
      className={`player-panel p${side}${active ? ' active' : ''}`}
      id={`panel-p${side}`}
      aria-label={`Player ${side}`}
    >
      <div className="player-details">
        <div className={`player-avatar ${avatarClass}`}>P{side}</div>
        <h2 className="player-name" id={`p${side}-name`}>
          {name}
        </h2>
        <div className="player-desc" id={`p${side}-desc`}>
          {desc}
        </div>
      </div>
      <div className="wall-rack-container">
        <div className="wall-rack-title">Walls Left</div>
        <WallRack
          wallsLeft={walls}
          maxWalls={maxWalls}
          id={`rack-p${side}`}
          label={`Player ${side} walls`}
        />
      </div>
      <div
        className={`timer-container${timersEnabled ? '' : ' hidden-timer'}`}
        id={`timer-wrap-p${side}`}
      >
        <div className="timer-label">Time Remaining</div>
        <div
          className="timer-value"
          id={`timer-p${side}`}
          aria-live="polite"
          style={{
            color: timersEnabled && time <= 15 ? 'var(--color-pink)' : undefined,
          }}
        >
          {formatTime(timersEnabled, time)}
        </div>
      </div>
    </section>
  );
}

export default function GameScreen({
  state,
  labels,
  muted,
  canUndo,
  validMoves,
  pathCells,
  wallPreview,
  shakePreview,
  historyOpen,
  onBack,
  onUndo,
  onTogglePath,
  onToggleHistory,
  onCloseHistory,
  onReplay,
  onToggleMute,
  onToggleWallMode,
  onRotateWall,
  onPawnMove,
  onPlaceWall,
  onFlipWall,
  onHidePreview,
  onHover,
}) {
  const maxWalls = maxWallsForBoard(state.boardSize);

  return (
    <div id="game-screen" className="screen">
      <div className="game-layout">
        <nav className="game-header" aria-label="Game navigation">
          <div className="header-left">
            <button id="back-lobby" className="back-btn" aria-label="Return to lobby" onClick={onBack}>
              <span>← Lobby</span>
            </button>
            <button
              id="undo-btn"
              className="back-btn"
              aria-label="Undo last move"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <span>↩ Undo</span>
            </button>
          </div>
          <div className="game-title-hud">WALLZ</div>
          <div className="header-right">
            <button
              type="button"
              id="path-preview-btn"
              className={`back-btn toggle-btn${state.pathPreview ? ' active' : ''}`}
              aria-pressed={state.pathPreview}
              title="Show shortest path"
              onClick={onTogglePath}
            >
              Path
            </button>
            <button
              type="button"
              id="history-toggle-btn"
              className="back-btn"
              aria-label="Toggle move history"
              onClick={onToggleHistory}
            >
              Moves
            </button>
            <button
              type="button"
              id="mute-btn-game"
              className="icon-btn"
              aria-label="Toggle mute"
              onClick={onToggleMute}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <div className="status-hud" id="hud-match-type">
              {labels.hud}
            </div>
          </div>
        </nav>

        <main className="game-arena">
          <PlayerPanel
            side={1}
            name={labels.p1Name}
            desc={labels.p1Desc}
            walls={state.p1.walls}
            maxWalls={maxWalls}
            time={state.p1.time}
            timersEnabled={state.timersEnabled}
            active={state.turn === 1}
          />

          <section className="board-container" aria-label="Game Board">
            <Board
              state={state}
              validMoves={validMoves}
              pathCells={pathCells}
              wallPreview={wallPreview}
              shakePreview={shakePreview}
              onPawnMove={onPawnMove}
              onPlaceWall={onPlaceWall}
              onFlipWall={onFlipWall}
              onHidePreview={onHidePreview}
              onHover={onHover}
            />
            <div className="board-controls">
              <button
                type="button"
                id="wall-mode-btn"
                className={`board-ctrl-btn${state.wallMode ? ' active' : ''}`}
                aria-pressed={state.wallMode}
                title="Wall placement mode (W)"
                onClick={onToggleWallMode}
              >
                🧱 Wall
              </button>
              <button
                type="button"
                id="rotate-wall-btn"
                className="board-ctrl-btn"
                title="Rotate wall (R)"
                onClick={onRotateWall}
              >
                ↻ Rotate
              </button>
            </div>
            <p className="controls-hint">
              Click cell to move · Hover gap for wall · <kbd>R</kbd> rotate · <kbd>W</kbd> wall mode ·
              Arrows + <kbd>Enter</kbd>
            </p>
          </section>

          <PlayerPanel
            side={2}
            name={labels.p2Name}
            desc={labels.p2Desc}
            walls={state.p2.walls}
            maxWalls={maxWalls}
            time={state.p2.time}
            timersEnabled={state.timersEnabled}
            active={state.turn === 2}
          />
        </main>

        <aside
          id="move-history-panel"
          className={`move-history-panel${historyOpen ? '' : ' hidden'}`}
          aria-label="Move history"
        >
          <div className="history-header">
            <h3>Move History</h3>
            <button type="button" id="close-history-btn" className="icon-btn" aria-label="Close" onClick={onCloseHistory}>
              ✕
            </button>
          </div>
          <ol id="move-history-list" className="move-history-list">
            {state.moveLog.map((entry, i) => (
              <li key={`${i}-${entry}`}>
                {i + 1}. {entry}
              </li>
            ))}
          </ol>
          <div className="history-actions">
            <button
              type="button"
              id="replay-btn"
              className="btn btn-small"
              disabled={state.actionLog.length === 0}
              onClick={onReplay}
            >
              Replay from start
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
