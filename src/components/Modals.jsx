export function VictoryModal({ open, info, onPlayAgain, onLobby }) {
  if (!open || !info) return null;
  return (
    <div id="modal-overlay" className="modal-overlay" aria-modal="true" role="dialog">
      <div className="modal-content">
        <div id="modal-icon" className={`modal-icon ${info.victory ? 'victory' : 'defeat'}`}>
          {info.icon}
        </div>
        <h2 id="modal-title" className="modal-title">
          {info.title}
        </h2>
        <p id="modal-desc" className="modal-desc">
          {info.desc}
        </p>
        <div className="modal-actions">
          <button id="play-again-btn" className="btn btn-primary" onClick={onPlayAgain}>
            Play Again
          </button>
          <button
            id="modal-lobby-btn"
            className="btn"
            style={{ background: 'rgba(255,255,255,0.03)' }}
            onClick={onLobby}
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

export function TutorialModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div id="tutorial-overlay" className="modal-overlay" aria-modal="true" role="dialog">
      <div className="modal-content tutorial-content">
        <h2 className="modal-title">How to Play Wallz</h2>
        <ol className="tutorial-steps">
          <li>
            <strong>Goal:</strong> Race your pawn to the opposite side of the board.
          </li>
          <li>
            <strong>Moves:</strong> Each turn, either move one square (or jump over an adjacent
            opponent) <em>or</em> place a wall.
          </li>
          <li>
            <strong>Jumps:</strong> If blocked behind the opponent, you may jump diagonally to either
            side.
          </li>
          <li>
            <strong>Walls:</strong> Hover near cell gaps (or use Wall mode on mobile). Press{' '}
            <kbd>R</kbd> or right-click to flip orientation. Walls cannot fully trap either player.
          </li>
          <li>
            <strong>Strategy:</strong> Shorten your path, lengthen theirs — and don’t waste walls.
          </li>
        </ol>
        <div className="modal-actions">
          <button id="tutorial-close-btn" className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmLeaveModal({ open, onLeave, onStay }) {
  if (!open) return null;
  return (
    <div id="confirm-overlay" className="modal-overlay" aria-modal="true" role="dialog">
      <div className="modal-content">
        <h2 className="modal-title">Leave match?</h2>
        <p className="modal-desc">Your current game progress will be lost.</p>
        <div className="modal-actions">
          <button id="confirm-leave-btn" className="btn btn-primary" onClick={onLeave}>
            Leave
          </button>
          <button
            id="cancel-leave-btn"
            className="btn"
            style={{ background: 'rgba(255,255,255,0.03)' }}
            onClick={onStay}
          >
            Stay
          </button>
        </div>
      </div>
    </div>
  );
}

export function OnlineModal({
  open,
  status,
  roomCode,
  joinCode,
  onJoinCodeChange,
  onHost,
  onJoin,
  onCopy,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div id="online-overlay" className="modal-overlay" aria-modal="true" role="dialog">
      <div className="modal-content online-content">
        <h2 className="modal-title">Play Online</h2>
        <p className="modal-desc">Host a room or join a friend’s code. Uses peer-to-peer (PeerJS).</p>
        <div className="online-actions">
          <button id="host-room-btn" className="btn btn-primary" onClick={onHost}>
            Host Room
          </button>
          <div className="join-row">
            <input
              type="text"
              id="join-code-input"
              className="join-input"
              placeholder="Room code"
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              value={joinCode}
              onChange={(e) => onJoinCodeChange(e.target.value)}
            />
            <button id="join-room-btn" className="btn btn-secondary" onClick={onJoin}>
              Join
            </button>
          </div>
        </div>
        {status ? (
          <div id="online-status" className="online-status">
            {status}
          </div>
        ) : null}
        {roomCode ? (
          <div id="online-room-code" className="online-room-code">
            <span>Share this code:</span>
            <strong id="room-code-display">{roomCode}</strong>
            <button type="button" id="copy-code-btn" className="btn btn-small" onClick={onCopy}>
              Copy
            </button>
          </div>
        ) : null}
        <button
          id="online-cancel-btn"
          className="btn"
          style={{ background: 'rgba(255,255,255,0.03)', marginTop: '0.5rem' }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
