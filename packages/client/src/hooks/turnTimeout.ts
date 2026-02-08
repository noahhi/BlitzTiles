/**
 * Turn timeout and racing round timeout scheduling.
 *
 * Module-level timers — only one timeout active at a time.
 * Runs in 'local' or 'host' mode (guest/spectator rely on host).
 */

import { handleTurnTimeout, handleRacingRoundTimeout } from '@blitztiles/shared';
import type { GameStore } from './storeTypes';
import { syncFromGameState } from './stateSync';
import { filterStateForPlayer } from './stateSync';
import { broadcastToSpectators, persistGameSession, clearSession } from './broadcast';

let turnTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function clearTurnTimeout() {
  if (turnTimeoutId !== null) {
    clearTimeout(turnTimeoutId);
    turnTimeoutId = null;
  }
}

/**
 * Schedule an auto-pass when the current turn's time runs out.
 * Only runs in 'local' or 'host' mode (guest relies on host).
 */
export function scheduleTurnTimeout(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
) {
  clearTurnTimeout();

  const { _gameState, mode } = get();
  if (!_gameState) return;
  if (_gameState.config.timerMode !== 'per_turn') return;
  if (_gameState.phase !== 'playing') return;
  if (mode === 'guest' || mode === 'spectator') return;

  const elapsed = Date.now() - Date.parse(_gameState.turnStartTimestamp);
  const remaining = Math.max(0, _gameState.config.turnTimeLimitMs - elapsed);

  turnTimeoutId = setTimeout(() => {
    const currentState = get()._gameState;
    if (!currentState || currentState.phase !== 'playing') return;

    const result = handleTurnTimeout(currentState);
    const { mode: currentMode, playerIndex, _sendFn } = get();

    const viewAs = currentMode === 'local' ? result.state.currentPlayerIndex : playerIndex;
    set({
      ...syncFromGameState(result.state, viewAs),
      placedTiles: [],
      selectedTileId: null,
      lastMoveError: null,
    });

    // Host: broadcast to guest and spectators
    if (currentMode === 'host') {
      if (_sendFn) {
        _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
      }
      broadcastToSpectators(get, result.state);
    }

    // Schedule the next turn's timeout
    scheduleTurnTimeout(get, set);

    // Persist or clear session
    if (currentMode !== 'local') {
      if (result.state.phase === 'finished') {
        clearSession();
      } else {
        persistGameSession(get);
      }
    }
  }, remaining);
}

/**
 * Schedule a racing round timeout. Reuses the turnTimeoutId slot.
 * Only runs in 'host' mode (guest relies on host).
 */
export function scheduleRacingRoundTimeout(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
) {
  clearTurnTimeout();

  const { _gameState, mode } = get();
  if (!_gameState) return;
  if (_gameState.config.gameVariant !== 'racing') return;
  if (_gameState.phase !== 'playing') return;
  if (mode !== 'host') return;

  const startTs = _gameState.roundStartTimestamp;
  if (!startTs) return;

  const elapsed = Date.now() - Date.parse(startTs);
  const remaining = Math.max(0, _gameState.config.racingRoundTimeLimitMs - elapsed);

  turnTimeoutId = setTimeout(() => {
    const currentState = get()._gameState;
    if (!currentState || currentState.phase !== 'playing') return;

    const result = handleRacingRoundTimeout(currentState);
    const { _sendFn } = get();

    set({
      ...syncFromGameState(result.state, 0),
      placedTiles: [],
      selectedTileId: null,
      lastMoveError: null,
      ghostTiles: [],
    });

    // Host: broadcast to guest
    if (_sendFn) {
      _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
      _sendFn({
        type: 'ROUND_RESULT',
        winnerIndex: null,
        score: 0,
        words: [],
        roundNumber: currentState.racingRound ?? 0,
      });
    }

    // Schedule next round's timeout
    if (!result.gameOver) {
      scheduleRacingRoundTimeout(get, set);
    }

    if (result.state.phase === 'finished') {
      clearSession();
    } else {
      persistGameSession(get);
    }
  }, remaining);
}
