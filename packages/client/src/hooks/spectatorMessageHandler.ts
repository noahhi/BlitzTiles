/**
 * Spectator mode network message handler.
 *
 * Receives read-only state updates from host.
 */

import type { SpectatorGameState } from '@blitztiles/shared';
import type { GameStore } from './storeTypes';
import { syncFromSpectatorGameState } from './stateSync';
import { saveSession, clearSession } from './sessionPersistence';

export function handleSpectatorMessage(
  msg: { type: string; [key: string]: unknown },
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
) {
  switch (msg.type) {
    case 'GAME_STATE': {
      if (typeof msg.state !== 'object' || msg.state === null) {
        console.warn('[BlitzTiles] Invalid GAME_STATE message: missing state', msg);
        return;
      }
      const spectatorState = msg.state as SpectatorGameState;
      set({
        ...syncFromSpectatorGameState(spectatorState),
        placedTiles: [],
        selectedTileId: null,
        lastMoveError: null,
      });

      // Persist for session recovery
      const { _roomCode } = get();
      if (_roomCode) {
        if (spectatorState.phase === 'finished') {
          clearSession();
        } else {
          saveSession({
            savedAt: new Date().toISOString(),
            role: 'spectator',
            roomCode: _roomCode,
            gameState: null,
            clientGameState: null,
            spectatorGameState: spectatorState,
            stateVersion: spectatorState.stateVersion,
          });
        }
      }
      break;
    }
    case 'ERROR': {
      if (typeof msg.message !== 'string') return;
      set({ lastMoveError: msg.message });
      break;
    }
  }
}
