import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../audio';
import { OnlineNet } from '../online';
import {
  cellLabel,
  createInitialState,
  findPathCells,
  getBestAIMove,
  getPlayerLabels,
  getValidPawnMoves,
  isHumanTurn,
  isValidWallPlacement,
  loadStats,
  recordMatchResult,
  resetMatch,
  snapshotHistory,
  TUTORIAL_KEY,
} from './logic';

export function useGame() {
  const [state, setState] = useState(createInitialState);
  const [stats, setStats] = useState(loadStats);
  const [muted, setMuted] = useState(false);
  const [modals, setModals] = useState({
    victory: false,
    tutorial: false,
    confirm: false,
    online: false,
    history: false,
  });
  const [victoryInfo, setVictoryInfo] = useState(null);
  const [onlineStatus, setOnlineStatus] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [wallPreview, setWallPreview] = useState(null);
  const [shakePreview, setShakePreview] = useState(false);

  const stateRef = useRef(state);
  const timerRef = useRef(null);
  const aiTimeoutRef = useRef(null);
  const hoverRef = useRef(null);
  const previewValidRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const bump = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      stateRef.current = next;
      return next;
    });
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
  }, []);

  const hideWallPreview = useCallback(() => {
    hoverRef.current = null;
    setWallPreview(null);
  }, []);

  const endGame = useCallback(
    (winnerNum, reason, current = stateRef.current) => {
      clearTimers();
      let humanWon = false;
      if (current.mode === 'ai') {
        humanWon = winnerNum === current.humanSide;
        setStats(recordMatchResult(current.mode, humanWon));
      }

      const youWin =
        current.mode === 'ai'
          ? humanWon
          : current.mode === 'online'
            ? (current.onlineRole === 'host' && winnerNum === 1) ||
              (current.onlineRole === 'guest' && winnerNum === 2)
            : true;

      if (
        winnerNum === current.humanSide ||
        current.mode === 'friend' ||
        (current.mode === 'online' &&
          ((current.onlineRole === 'host' && winnerNum === 1) ||
            (current.onlineRole === 'guest' && winnerNum === 2)))
      ) {
        audio.playVictory();
      } else if (current.mode === 'ai') {
        audio.playDefeat();
      } else {
        audio.playVictory();
      }

      let title;
      let desc;
      if (current.mode === 'ai') {
        title = humanWon ? 'Victory is Yours!' : 'Defeated by AI';
        desc = humanWon
          ? `You outsmarted the ${current.difficulty} AI. (${reason})`
          : `The computer prevailed. Try again? (${reason})`;
      } else if (current.mode === 'online') {
        title = youWin ? 'You Win!' : 'You Lose';
        desc = `Online match over. (${reason})`;
      } else {
        title = `Player ${winnerNum} Wins!`;
        desc = `Congratulations Player ${winnerNum}! (${reason})`;
      }

      setVictoryInfo({
        title,
        desc,
        icon: youWin || current.mode === 'friend' ? '🏆' : '💀',
        victory: youWin || current.mode === 'friend',
      });

      bump({
        ...current,
        status: 'gameover',
        winner: winnerNum,
        aiPending: false,
      });
      setModals((m) => ({ ...m, victory: true }));
    },
    [bump, clearTimers]
  );

  const alternateTurn = useCallback(
    (afterState) => {
      let next = {
        ...afterState,
        turn: afterState.turn === 1 ? 2 : 1,
        keyboardFocus: null,
      };
      bump(next);

      if (next.mode === 'ai' && next.status === 'playing' && next.turn !== next.humanSide) {
        next = { ...next, aiPending: true };
        bump(next);
        const delay = next.difficulty === 'hard' ? 700 + Math.random() * 500 : 500 + Math.random() * 400;
        aiTimeoutRef.current = setTimeout(() => {
          const cur = stateRef.current;
          if (cur.status !== 'playing') {
            bump({ ...cur, aiPending: false });
            return;
          }
          const aiNum = cur.humanSide === 1 ? 2 : 1;
          if (cur.turn !== aiNum) {
            bump({ ...cur, aiPending: false });
            return;
          }
          const bestMove = getBestAIMove(cur);
          const cleared = { ...cur, aiPending: false };
          if (bestMove) {
            if (bestMove.type === 'move') {
              executePawnMoveRef.current(aiNum, bestMove.r, bestMove.c, false, cleared);
            } else {
              executeWallPlacementRef.current(aiNum, bestMove.r, bestMove.c, bestMove.dir, false, cleared);
            }
          } else {
            alternateTurn(cleared);
          }
        }, delay);
      }
    },
    [bump]
  );

  const executePawnMoveRef = useRef(null);
  const executeWallPlacementRef = useRef(null);

  const executePawnMove = useCallback(
    (playerNum, r, c, fromNet = false, base = stateRef.current) => {
      const history = [...base.history, snapshotHistory(base)];
      const player = playerNum === 1 ? { ...base.p1 } : { ...base.p2 };
      const from = cellLabel(base.boardSize, player.r, player.c);
      player.r = r;
      player.c = c;
      if (base.timersEnabled) player.time += base.timeIncrement;

      let next = {
        ...base,
        history,
        moveLog: [...base.moveLog, `P${playerNum} ${from}→${cellLabel(base.boardSize, r, c)}`],
        actionLog: [...base.actionLog, { type: 'move', playerNum, r, c }],
        p1: playerNum === 1 ? player : base.p1,
        p2: playerNum === 2 ? player : base.p2,
        forcedWallDir: null,
      };

      audio.playMove();
      hideWallPreview();

      if (!fromNet && next.mode === 'online') {
        OnlineNet.send({ type: 'move', playerNum, r, c });
      }

      const goalRow = playerNum === 1 ? 0 : next.boardSize - 1;
      if (r === goalRow) {
        bump(next);
        endGame(playerNum, 'Goal baseline reached!', next);
        return;
      }
      alternateTurn(next);
    },
    [alternateTurn, bump, endGame, hideWallPreview]
  );

  const executeWallPlacement = useCallback(
    (playerNum, r, c, dir, fromNet = false, base = stateRef.current) => {
      const history = [...base.history, snapshotHistory(base)];
      const player = playerNum === 1 ? { ...base.p1 } : { ...base.p2 };
      player.walls--;
      if (base.timersEnabled) player.time += base.timeIncrement;

      const next = {
        ...base,
        history,
        walls: [...base.walls, { r, c, dir, player: playerNum }],
        moveLog: [...base.moveLog, `P${playerNum} wall ${dir.toUpperCase()} @${r},${c}`],
        actionLog: [...base.actionLog, { type: 'wall', playerNum, r, c, dir }],
        p1: playerNum === 1 ? player : base.p1,
        p2: playerNum === 2 ? player : base.p2,
        forcedWallDir: null,
      };

      audio.playWallPlace();
      hideWallPreview();

      if (!fromNet && next.mode === 'online') {
        OnlineNet.send({ type: 'wall', playerNum, r, c, dir });
      }
      alternateTurn(next);
    },
    [alternateTurn, hideWallPreview]
  );

  executePawnMoveRef.current = executePawnMove;
  executeWallPlacementRef.current = executeWallPlacement;

  const startGame = useCallback(
    (mode, opts = {}) => {
      audio.init();
      clearTimers();
      hideWallPreview();

      let next = {
        ...stateRef.current,
        mode,
        onlineRole: opts.onlineRole ?? stateRef.current.onlineRole,
      };
      next = resetMatch(next);
      bump(next);
      setModals((m) => ({ ...m, victory: false, online: false, confirm: false, history: false }));
      setVictoryInfo(null);

      if (next.timersEnabled) {
        timerRef.current = setInterval(() => {
          const cur = stateRef.current;
          if (cur.status !== 'playing' || !cur.timersEnabled || cur.aiPending) return;
          const activeKey = cur.turn === 1 ? 'p1' : 'p2';
          const active = { ...cur[activeKey], time: cur[activeKey].time - 1 };
          const updated = { ...cur, [activeKey]: active };
          bump(updated);
          if (active.time <= 0) {
            endGame(cur.turn === 1 ? 2 : 1, 'Time expired!', updated);
          }
        }, 1000);
      }

      if (next.mode === 'ai' && next.humanSide === 2) {
        bump({ ...next, aiPending: true });
        aiTimeoutRef.current = setTimeout(() => {
          const cur = stateRef.current;
          const aiNum = 1;
          const bestMove = getBestAIMove(cur);
          const cleared = { ...cur, aiPending: false };
          if (bestMove) {
            if (bestMove.type === 'move') {
              executePawnMoveRef.current(aiNum, bestMove.r, bestMove.c, false, cleared);
            } else {
              executeWallPlacementRef.current(aiNum, bestMove.r, bestMove.c, bestMove.dir, false, cleared);
            }
          } else {
            alternateTurn(cleared);
          }
        }, 600);
      }
    },
    [alternateTurn, bump, clearTimers, endGame, hideWallPreview]
  );

  const doExitToLobby = useCallback(() => {
    clearTimers();
    if (stateRef.current.mode === 'online') OnlineNet.destroy();
    hideWallPreview();
    bump({ ...stateRef.current, status: 'lobby', aiPending: false });
    setModals({ victory: false, tutorial: false, confirm: false, online: false, history: false });
    setStats(loadStats());
    setOnlineStatus('');
    setRoomCode('');
  }, [bump, clearTimers, hideWallPreview]);

  const requestExitToLobby = useCallback(() => {
    if (stateRef.current.status === 'playing' && stateRef.current.moveLog.length > 0) {
      setModals((m) => ({ ...m, confirm: true }));
    } else {
      doExitToLobby();
    }
  }, [doExitToLobby]);

  const executeUndo = useCallback(() => {
    const cur = stateRef.current;
    if (!isHumanTurn(cur) || cur.mode === 'online') return;
    if (cur.history.length === 0) {
      audio.playInvalid();
      return;
    }

    const history = [...cur.history];
    let targetState = null;
    if (cur.mode === 'ai') {
      while (history.length > 0) {
        const snap = history.pop();
        if (snap.turn === cur.humanSide) {
          targetState = snap;
          break;
        }
      }
    } else {
      targetState = history.pop();
    }

    if (targetState) {
      bump({
        ...cur,
        history,
        p1: targetState.p1,
        p2: targetState.p2,
        turn: targetState.turn,
        walls: targetState.walls,
        status: targetState.status,
        winner: targetState.winner,
        moveLog: targetState.moveLog || [],
        actionLog: targetState.actionLog || [],
        keyboardFocus: null,
      });
      audio.playMove();
      hideWallPreview();
    } else {
      audio.playInvalid();
    }
  }, [bump, hideWallPreview]);

  const flipWallDir = useCallback(() => {
    const cur = stateRef.current;
    if (hoverRef.current) {
      const dir = hoverRef.current.dir === 'h' ? 'v' : 'h';
      hoverRef.current = { ...hoverRef.current, dir };
      const valid = isValidWallPlacement(cur, hoverRef.current.r, hoverRef.current.c, dir);
      previewValidRef.current = valid;
      bump({ ...cur, forcedWallDir: dir });
      setWallPreview({ ...hoverRef.current, valid });
    } else {
      const forced = cur.forcedWallDir === 'h' ? 'v' : cur.forcedWallDir === 'v' ? 'h' : 'h';
      bump({ ...cur, forcedWallDir: forced });
    }
  }, [bump]);

  const updateConfig = useCallback(
    (key, value) => {
      bump((prev) => ({ ...prev, [key]: value }));
    },
    [bump]
  );

  const toggleMute = useCallback(() => {
    audio.init();
    const isMuted = audio.toggleMute();
    setMuted(isMuted);
  }, []);

  const toggleWallMode = useCallback(() => {
    bump((prev) => ({ ...prev, wallMode: !prev.wallMode }));
  }, [bump]);

  const togglePathPreview = useCallback(() => {
    bump((prev) => ({ ...prev, pathPreview: !prev.pathPreview }));
  }, [bump]);

  const setKeyboardFocus = useCallback(
    (focus) => {
      bump((prev) => ({ ...prev, keyboardFocus: focus }));
    },
    [bump]
  );

  // Online handlers
  useEffect(() => {
    OnlineNet.onStatus = (msg) => setOnlineStatus(msg);
    OnlineNet.onDisconnected = () => {
      if (stateRef.current.status === 'playing') {
        endGame(stateRef.current.onlineRole === 'host' ? 1 : 2, 'Opponent disconnected');
      }
    };
    OnlineNet.onMessage = (data) => {
      if (!data || !data.type) return;
      if (data.type === 'sync') {
        bump((prev) => ({ ...prev, boardSize: data.boardSize, timerPreset: data.timerPreset }));
        // start after state flush
        setTimeout(() => startGame('online', { onlineRole: 'guest' }), 0);
        return;
      }
      if (data.type === 'move') {
        executePawnMoveRef.current(data.playerNum, data.r, data.c, true);
      } else if (data.type === 'wall') {
        executeWallPlacementRef.current(data.playerNum, data.r, data.c, data.dir, true);
      }
    };
    OnlineNet.onReady = ({ role }) => {
      if (role === 'host') {
        setTimeout(() => {
          OnlineNet.send({
            type: 'sync',
            boardSize: stateRef.current.boardSize,
            timerPreset: stateRef.current.timerPreset,
          });
          startGame('online', { onlineRole: 'host' });
        }, 150);
      }
    };
  }, [bump, endGame, startGame]);

  // Tutorial on first visit
  useEffect(() => {
    if (!localStorage.getItem(TUTORIAL_KEY)) {
      const t = setTimeout(() => setModals((m) => ({ ...m, tutorial: true })), 400);
      return () => clearTimeout(t);
    }
  }, []);

  // Keyboard
  useEffect(() => {
    const handleKeyboard = (e) => {
      const cur = stateRef.current;
      if (cur.status !== 'playing') return;
      if (e.target.tagName === 'INPUT') return;

      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        flipWallDir();
        return;
      }
      if (key === 'w') {
        e.preventDefault();
        toggleWallMode();
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        togglePathPreview();
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

      if (!isHumanTurn(cur) || cur.wallMode) return;

      const moves = getValidPawnMoves(cur, cur.turn);
      if (!moves.length) return;

      let focus = cur.keyboardFocus || { r: moves[0].r, c: moves[0].c };

      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        const dr = key === 'arrowup' ? -1 : key === 'arrowdown' ? 1 : 0;
        const dc = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0;
        const pawn = cur.turn === 1 ? cur.p1 : cur.p2;
        const candidates = moves.filter((m) => {
          if (dr === -1) return m.r < focus.r || (focus.r === pawn.r && m.r < pawn.r);
          if (dr === 1) return m.r > focus.r || (focus.r === pawn.r && m.r > pawn.r);
          if (dc === -1) return m.c < focus.c;
          if (dc === 1) return m.c > focus.c;
          return false;
        });
        const pool = candidates.length ? candidates : moves;
        let best = pool[0];
        let bestScore = Infinity;
        for (const m of pool) {
          const score = Math.abs(m.r - (focus.r + dr)) + Math.abs(m.c - (focus.c + dc));
          if (score < bestScore) {
            bestScore = score;
            best = m;
          }
        }
        bump({ ...cur, keyboardFocus: best });
      }

      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        focus = stateRef.current.keyboardFocus || focus;
        if (focus) {
          const ok = moves.some((m) => m.r === focus.r && m.c === focus.c);
          if (ok) executePawnMove(cur.turn, focus.r, focus.c);
        }
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [bump, executePawnMove, executeUndo, flipWallDir, toggleMute, togglePathPreview, toggleWallMode]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const validMoves =
    isHumanTurn(state) && state.status === 'playing' ? getValidPawnMoves(state, state.turn) : [];

  const pathCells =
    state.pathPreview && state.status === 'playing'
      ? findPathCells(
          state.boardSize,
          state.turn,
          (state.turn === 1 ? state.p1 : state.p2).r,
          (state.turn === 1 ? state.p1 : state.p2).c,
          state.walls
        )
      : [];

  const labels = getPlayerLabels(state);
  const canUndo = isHumanTurn(state) && state.history.length > 0 && state.mode !== 'online';

  const placeWallFromPreview = useCallback(() => {
    const cur = stateRef.current;
    if (!hoverRef.current || !isHumanTurn(cur)) return false;
    if (previewValidRef.current) {
      executeWallPlacement(cur.turn, hoverRef.current.r, hoverRef.current.c, hoverRef.current.dir);
      return true;
    }
    audio.playInvalid();
    setShakePreview(true);
    setTimeout(() => setShakePreview(false), 300);
    return false;
  }, [executeWallPlacement]);

  const setHoverIntersection = useCallback(
    (intersection, valid) => {
      hoverRef.current = intersection;
      previewValidRef.current = valid;
      if (intersection) {
        setWallPreview({ ...intersection, valid });
      } else {
        setWallPreview(null);
      }
    },
    []
  );

  return {
    state,
    stats,
    muted,
    modals,
    setModals,
    victoryInfo,
    onlineStatus,
    roomCode,
    joinCode,
    setJoinCode,
    wallPreview,
    shakePreview,
    validMoves,
    pathCells,
    labels,
    canUndo,
    updateConfig,
    startGame,
    requestExitToLobby,
    doExitToLobby,
    executeUndo,
    executePawnMove,
    executeWallPlacement,
    toggleMute,
    toggleWallMode,
    togglePathPreview,
    flipWallDir,
    hideWallPreview,
    placeWallFromPreview,
    setHoverIntersection,
    setKeyboardFocus,
    openOnline: () => {
      audio.init();
      setOnlineStatus('');
      setRoomCode('');
      setJoinCode('');
      setModals((m) => ({ ...m, online: true }));
    },
    closeOnline: () => {
      OnlineNet.destroy();
      setModals((m) => ({ ...m, online: false }));
    },
    hostRoom: async () => {
      try {
        const { roomCode: code } = await OnlineNet.host();
        setRoomCode(code);
      } catch (err) {
        setOnlineStatus(err.message || 'Failed to host');
      }
    },
    joinRoom: async () => {
      try {
        await OnlineNet.join(joinCode);
      } catch (err) {
        setOnlineStatus(err.message || 'Failed to join');
      }
    },
    copyRoomCode: async () => {
      try {
        await navigator.clipboard.writeText(roomCode);
        setOnlineStatus('Code copied!');
      } catch {
        setOnlineStatus(roomCode);
      }
    },
    hideTutorial: () => {
      localStorage.setItem(TUTORIAL_KEY, '1');
      setModals((m) => ({ ...m, tutorial: false }));
    },
    showTutorial: () => setModals((m) => ({ ...m, tutorial: true })),
    playAgain: () => {
      setModals((m) => ({ ...m, victory: false }));
      if (state.mode === 'online') {
        requestExitToLobby();
        return;
      }
      startGame(state.mode);
    },
    replayFromStart: async () => {
      const cur = stateRef.current;
      if (!cur.actionLog.length) return;
      const actions = cur.actionLog.map((a) => ({ ...a }));
      const savedMoveLog = [...cur.moveLog];
      const savedMode = cur.mode;

      clearTimers();
      let next = resetMatch({ ...cur, mode: 'friend' });
      bump(next);
      setModals((m) => ({ ...m, victory: false }));

      for (const action of actions) {
        await new Promise((r) => setTimeout(r, 320));
        if (stateRef.current.status === 'lobby') return;

        if (action.type === 'wall') {
          const player = action.playerNum === 1 ? { ...stateRef.current.p1 } : { ...stateRef.current.p2 };
          player.walls--;
          next = {
            ...stateRef.current,
            walls: [
              ...stateRef.current.walls,
              { r: action.r, c: action.c, dir: action.dir, player: action.playerNum },
            ],
            p1: action.playerNum === 1 ? player : stateRef.current.p1,
            p2: action.playerNum === 2 ? player : stateRef.current.p2,
            turn: action.playerNum === 1 ? 2 : 1,
          };
          audio.playWallPlace();
        } else {
          const player = action.playerNum === 1 ? { ...stateRef.current.p1 } : { ...stateRef.current.p2 };
          player.r = action.r;
          player.c = action.c;
          next = {
            ...stateRef.current,
            p1: action.playerNum === 1 ? player : stateRef.current.p1,
            p2: action.playerNum === 2 ? player : stateRef.current.p2,
            turn: action.playerNum === 1 ? 2 : 1,
          };
          audio.playMove();
          const goalRow = action.playerNum === 1 ? 0 : next.boardSize - 1;
          if (action.r === goalRow) {
            next = {
              ...next,
              moveLog: savedMoveLog,
              actionLog: actions,
              mode: savedMode,
            };
            bump(next);
            endGame(action.playerNum, 'Replay finished', next);
            return;
          }
        }
        bump(next);
      }

      bump({
        ...stateRef.current,
        moveLog: savedMoveLog,
        actionLog: actions,
        mode: savedMode,
        status: 'gameover',
      });
    },
  };
}
