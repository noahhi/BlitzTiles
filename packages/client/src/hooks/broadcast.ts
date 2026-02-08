/**
 * Helpers for broadcasting game state to spectators and persisting sessions.
 */

import type { GameState } from '@blitztiles/shared';
import type { GameStore } from './storeTypes';
import { filterStateForSpectator } from './stateSync';
import { saveSession, clearSession } from './sessionPersistence';

/** Broadcast current game state to all connected spectators. */
export function broadcastToSpectators(get: () => GameStore, state: GameState) {
  const { _spectatorSendFns, config } = get();
  if (_spectatorSendFns.length > 0) {
    const spectatorState = filterStateForSpectator(state, config);
    _spectatorSendFns.forEach((fn) => {
      fn({ type: 'GAME_STATE', state: spectatorState });
    });
  }
}

/** Persist game session for recovery (host mode). */
export function persistGameSession(get: () => GameStore) {
  const { mode, _roomCode, _gameState } = get();
  if (!_roomCode || mode === 'local') return;

  if (mode === 'host' && _gameState) {
    if (_gameState.phase === 'finished') {
      clearSession();
    } else {
      saveSession({
        savedAt: new Date().toISOString(),
        role: 'host',
        roomCode: _roomCode,
        gameState: _gameState,
        clientGameState: null,
        spectatorGameState: null,
        stateVersion: _gameState.stateVersion,
      });
    }
  }
  // Guest persistence is handled in handleGuestMessage when receiving GAME_STATE
}

export { clearSession };
