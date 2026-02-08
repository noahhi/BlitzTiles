/**
 * Guest mode network message handler.
 *
 * Receives state updates from host and syncs the local store.
 */

import type { ClientGameState, PlacedTile } from '@blitztiles/shared';
import type { GameStore } from './storeTypes';
import { syncFromClientGameState } from './stateSync';
import { saveSession, clearSession } from './sessionPersistence';

export function handleGuestMessage(
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
      const clientState = msg.state as ClientGameState;
      set({
        ...syncFromClientGameState(clientState),
        placedTiles: [],
        selectedTileId: null,
        lastMoveError: null,
      });
      // Persist guest state for recovery
      const { _roomCode } = get();
      if (_roomCode) {
        if (clientState.phase === 'finished') {
          clearSession();
        } else {
          saveSession({
            savedAt: new Date().toISOString(),
            role: 'guest',
            roomCode: _roomCode,
            gameState: null,
            clientGameState: clientState,
            spectatorGameState: null,
            stateVersion: clientState.stateVersion,
          });
        }
      }
      break;
    }
    case 'MOVE_REJECTED': {
      if (typeof msg.reason !== 'string') {
        console.warn('[BlitzTiles] Invalid MOVE_REJECTED message: missing reason', msg);
        return;
      }
      set({ lastMoveError: msg.reason });
      break;
    }
    case 'GHOST_TILES': {
      if (Array.isArray(msg.tiles)) {
        set({ ghostTiles: msg.tiles as PlacedTile[] });
      }
      break;
    }
    case 'ROUND_RESULT': {
      // Clear ghost tiles and placed tiles when round ends
      set({ ghostTiles: [], placedTiles: [], selectedTileId: null });
      break;
    }
  }
}
