/**
 * Host mode network message handler.
 *
 * Processes guest intents (SUBMIT_MOVE, PASS, EXCHANGE, RESIGN)
 * through the game engine and broadcasts results.
 */

import type { PlacedTile } from '@blitztiles/shared';
import {
  submitMove,
  passTurn,
  exchangePlayerTiles,
  resignGame,
  submitRacingMove,
} from '@blitztiles/shared';
import type { GameStore } from './storeTypes';
import { syncFromGameState, filterStateForPlayer } from './stateSync';
import {
  broadcastToSpectators,
  broadcastGhostTilesToSpectators,
  persistGameSession,
  clearSession,
} from './broadcast';
import { scheduleTurnTimeout, scheduleRacingRoundTimeout } from './turnTimeout';

export function handleHostMessage(
  msg: { type: string; [key: string]: unknown },
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
) {
  const { _gameState, _dictionary, _sendFn } = get();
  if (!_gameState || !_dictionary) return;

  // REQUEST_SYNC is allowed regardless of phase
  if (msg.type === 'REQUEST_SYNC') {
    _sendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(_gameState, 1) });
    return;
  }

  // SPECTATE_JOIN should not reach here - it's handled in useGameConnection
  if (msg.type === 'SPECTATE_JOIN') {
    return;
  }

  // Phase guard: reject game actions unless the game is in progress
  if (_gameState.phase !== 'playing') {
    _sendFn?.({ type: 'MOVE_REJECTED', reason: 'Game is not in progress' });
    return;
  }

  const isRacing = _gameState.config.gameVariant === 'racing';

  switch (msg.type) {
    case 'SUBMIT_MOVE': {
      if (!Array.isArray(msg.tiles)) {
        _sendFn?.({ type: 'MOVE_REJECTED', reason: 'Invalid move data' });
        return;
      }
      const tiles = msg.tiles as PlacedTile[];

      if (isRacing) {
        // Racing: no turn check, guest submits as player 1
        const result = submitRacingMove(_gameState, 1, tiles, _dictionary);
        if (result.success) {
          set({
            ...syncFromGameState(result.state, 0),
            placedTiles: [],
            lastMoveError: null,
            ghostTiles: [],
          });
          _sendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
          _sendFn?.({
            type: 'ROUND_RESULT',
            winnerIndex: 1,
            score: result.score,
            words: result.formedWords,
            roundNumber: _gameState.racingRound ?? 0,
          });
          broadcastToSpectators(get, result.state);
          scheduleRacingRoundTimeout(get, set);
          persistGameSession(get);
        } else {
          _sendFn?.({ type: 'MOVE_REJECTED', reason: result.reason });
        }
      } else {
        // Classic: turn-based
        if (_gameState.currentPlayerIndex !== 1) {
          _sendFn?.({ type: 'MOVE_REJECTED', reason: 'Not your turn' });
          return;
        }
        const result = submitMove(_gameState, 1, tiles, _dictionary);
        if (result.success) {
          set({
            ...syncFromGameState(result.state, 0),
            placedTiles: [],
            lastMoveError: null,
          });
          _sendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
          broadcastToSpectators(get, result.state);
          scheduleTurnTimeout(get, set);
          persistGameSession(get);
        } else {
          _sendFn?.({ type: 'MOVE_REJECTED', reason: result.reason });
        }
      }
      break;
    }
    case 'PLACEMENT_UPDATE': {
      if (Array.isArray(msg.tiles)) {
        // Racing: show ghost tiles on host's board (both players see each other's placements)
        if (isRacing) {
          set({ ghostTiles: msg.tiles as PlacedTile[] });
        }
        // Always relay to spectators so they see live placement previews
        broadcastGhostTilesToSpectators(get, msg.tiles as PlacedTile[]);
      }
      break;
    }
    case 'PASS': {
      if (_gameState.currentPlayerIndex !== 1) {
        _sendFn?.({ type: 'MOVE_REJECTED', reason: 'Not your turn' });
        return;
      }
      const result = passTurn(_gameState, 1);
      set({
        ...syncFromGameState(result.state, 0),
        placedTiles: [],
        lastMoveError: null,
      });
      _sendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
      broadcastToSpectators(get, result.state);
      scheduleTurnTimeout(get, set);
      persistGameSession(get);
      break;
    }
    case 'EXCHANGE': {
      if (!Array.isArray(msg.tileIds)) {
        _sendFn?.({ type: 'MOVE_REJECTED', reason: 'Invalid exchange data' });
        return;
      }
      if (_gameState.currentPlayerIndex !== 1) {
        _sendFn?.({ type: 'MOVE_REJECTED', reason: 'Not your turn' });
        return;
      }
      const tileIds = msg.tileIds as string[];
      const result = exchangePlayerTiles(_gameState, 1, tileIds);
      if (result.success) {
        set({
          ...syncFromGameState(result.state, 0),
          placedTiles: [],
          lastMoveError: null,
        });
        _sendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
        broadcastToSpectators(get, result.state);
        scheduleTurnTimeout(get, set);
        persistGameSession(get);
      } else {
        _sendFn?.({ type: 'MOVE_REJECTED', reason: result.reason });
      }
      break;
    }
    case 'RESIGN': {
      const result = resignGame(_gameState, 1);
      set({
        ...syncFromGameState(result, 0),
        placedTiles: [],
      });
      _sendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(result, 1) });
      broadcastToSpectators(get, result);
      clearSession();
      break;
    }
  }
}
