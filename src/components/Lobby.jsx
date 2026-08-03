function ConfigGroup({ label, id, value, options, onChange }) {
  return (
    <div className="config-group">
      <span className="config-label">{label}</span>
      <div className="config-segmented-control" id={id} role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className={`config-tab${value === opt.value ? ' active' : ''}`}
            data-value={opt.value}
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Lobby({
  difficulty,
  boardSize,
  timerPreset,
  humanSide,
  stats,
  muted,
  onConfig,
  onPlayAi,
  onPlayFriend,
  onPlayOnline,
  onToggleMute,
  onHowToPlay,
}) {
  return (
    <div id="lobby-screen" className="screen">
      <header className="lobby-header">
        <h1 className="logo" id="main-logo">
          WALL<span>Z</span>
        </h1>
        <div className="lobby-header-actions">
          <button
            type="button"
            id="mute-btn-lobby"
            className="icon-btn"
            aria-label="Toggle mute"
            title="Mute"
            onClick={onToggleMute}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            type="button"
            id="how-to-play-btn"
            className="icon-btn"
            aria-label="How to play"
            title="How to play"
            onClick={onHowToPlay}
          >
            ?
          </button>
        </div>
      </header>

      <main className="lobby-container">
        <section className="hero-card" id="hero-panel">
          <div className="hero-info">
            <h1>Race your pawn to the other side.</h1>
            <p>
              Drop walls to slow your opponent down. A React Quoridor with AI, local, and online
              play.
            </p>
          </div>

          <div className="hero-preview">
            <div className="mini-grid" aria-hidden="true">
              {Array.from({ length: 25 }, (_, i) => (
                <div key={i} className="mini-cell">
                  {i === 2 ? <div className="mini-pawn p2" /> : null}
                  {i === 22 ? <div className="mini-pawn p1" /> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="stats-strip" id="stats-strip" aria-label="Your stats">
            <div className="stat-pill">
              <span className="stat-val">{stats.wins}</span>
              <span className="stat-lbl">Wins</span>
            </div>
            <div className="stat-pill">
              <span className="stat-val">{stats.losses}</span>
              <span className="stat-lbl">Losses</span>
            </div>
            <div className="stat-pill">
              <span className="stat-val">{stats.streak}</span>
              <span className="stat-lbl">Streak</span>
            </div>
          </div>

          <div className="game-config-section">
            <ConfigGroup
              label="AI Difficulty"
              id="difficulty-select"
              value={difficulty}
              onChange={(v) => onConfig('difficulty', v)}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
            <ConfigGroup
              label="Board Size"
              id="boardsize-select"
              value={boardSize}
              onChange={(v) => onConfig('boardSize', Number(v))}
              options={[
                { value: 7, label: '7×7' },
                { value: 9, label: '9×9' },
                { value: 11, label: '11×11' },
              ]}
            />
            <ConfigGroup
              label="Timer"
              id="timer-select"
              value={timerPreset}
              onChange={(v) => onConfig('timerPreset', v)}
              options={[
                { value: '3+1', label: '3+1' },
                { value: '5+0', label: '5+0' },
                { value: 'untimed', label: 'Off' },
              ]}
            />
            <ConfigGroup
              label="Your Side (vs AI)"
              id="side-select"
              value={humanSide}
              onChange={(v) => onConfig('humanSide', Number(v))}
              options={[
                { value: 1, label: 'Teal P1' },
                { value: 2, label: 'Rose P2' },
              ]}
            />
          </div>

          <nav className="menu-actions" aria-label="Game Modes">
            <button id="play-ai" className="btn btn-primary" aria-label="Play against computer" onClick={onPlayAi}>
              <span>Play Computer</span>
              <span className="btn-icon">→</span>
            </button>
            <button
              id="play-friend"
              className="btn btn-secondary"
              aria-label="Local pass and play"
              onClick={onPlayFriend}
            >
              <span>Play a Friend (Local)</span>
              <span className="btn-icon">→</span>
            </button>
            <button id="play-online" className="btn btn-online" aria-label="Play online" onClick={onPlayOnline}>
              <span>Play Online</span>
              <span className="btn-icon">→</span>
            </button>
          </nav>
        </section>
      </main>
    </div>
  );
}
