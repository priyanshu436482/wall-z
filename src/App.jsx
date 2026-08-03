import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import {
  VictoryModal,
  TutorialModal,
  ConfirmLeaveModal,
  OnlineModal,
} from './components/Modals';
import { useGame } from './game/useGame';

export default function App() {
  const g = useGame();
  const inLobby = g.state.status === 'lobby';

  return (
    <>
      {inLobby ? (
        <Lobby
          difficulty={g.state.difficulty}
          boardSize={g.state.boardSize}
          timerPreset={g.state.timerPreset}
          humanSide={g.state.humanSide}
          stats={g.stats}
          muted={g.muted}
          onConfig={g.updateConfig}
          onPlayAi={() => g.startGame('ai')}
          onPlayFriend={() => g.startGame('friend')}
          onPlayOnline={g.openOnline}
          onToggleMute={g.toggleMute}
          onHowToPlay={g.showTutorial}
        />
      ) : (
        <GameScreen
          state={g.state}
          labels={g.labels}
          muted={g.muted}
          canUndo={g.canUndo}
          validMoves={g.validMoves}
          pathCells={g.pathCells}
          wallPreview={g.wallPreview}
          shakePreview={g.shakePreview}
          historyOpen={g.modals.history}
          onBack={g.requestExitToLobby}
          onUndo={g.executeUndo}
          onTogglePath={g.togglePathPreview}
          onToggleHistory={() => g.setModals((m) => ({ ...m, history: !m.history }))}
          onCloseHistory={() => g.setModals((m) => ({ ...m, history: false }))}
          onReplay={g.replayFromStart}
          onToggleMute={g.toggleMute}
          onToggleWallMode={g.toggleWallMode}
          onRotateWall={g.flipWallDir}
          onPawnMove={g.executePawnMove}
          onPlaceWall={g.placeWallFromPreview}
          onFlipWall={g.flipWallDir}
          onHidePreview={g.hideWallPreview}
          onHover={g.setHoverIntersection}
        />
      )}

      <VictoryModal
        open={g.modals.victory}
        info={g.victoryInfo}
        onPlayAgain={g.playAgain}
        onLobby={g.requestExitToLobby}
      />
      <TutorialModal open={g.modals.tutorial} onClose={g.hideTutorial} />
      <ConfirmLeaveModal
        open={g.modals.confirm}
        onLeave={() => {
          g.setModals((m) => ({ ...m, confirm: false }));
          g.doExitToLobby();
        }}
        onStay={() => g.setModals((m) => ({ ...m, confirm: false }))}
      />
      <OnlineModal
        open={g.modals.online}
        status={g.onlineStatus}
        roomCode={g.roomCode}
        joinCode={g.joinCode}
        onJoinCodeChange={g.setJoinCode}
        onHost={g.hostRoom}
        onJoin={g.joinRoom}
        onCopy={g.copyRoomCode}
        onCancel={g.closeOnline}
      />
    </>
  );
}
