/**
 * Zustand store for BlitzTiles game state.
 *
 * Supports four modes:
 * - Local hot-seat: Two players on the same device, using the shared game engine directly.
 * - Host: Runs the game engine locally, sends filtered state to guest via WebRTC.
 * - Guest: Sends intents to host, receives filtered state updates.
 * - Spectator: Read-only viewer, receives filtered state from host.
 *
 * Network message handling, state sync/filtering, timeout scheduling, and
 * broadcasting are split into separate modules to reduce merge conflicts.
 */

import { arrayMove } from '@dnd-kit/sortable';
import { create } from 'zustand';
import {
  createGame,
  submitMove as engineSubmitMove,
  passTurn as enginePassTurn,
  exchangePlayerTiles,
  resignGame,
  createRacingGame,
  submitRacingMove,
  Trie,
  loadCompressedDictionary,
} from '@blitztiles/shared';

// Re-export types and helpers for external consumers
export type { GameStore, GameMode } from './storeTypes';
export { filterStateForPlayer, filterStateForSpectator } from './stateSync';

import type { GameStore } from './storeTypes';
import { INITIAL_STATE } from './storeTypes';
import {
  syncFromGameState,
  syncFromClientGameState,
  syncFromSpectatorGameState,
} from './stateSync';
import { filterStateForPlayer, filterStateForSpectator } from './stateSync';
import { broadcastToSpectators, persistGameSession } from './broadcast';
import { clearTurnTimeout, scheduleTurnTimeout, scheduleRacingRoundTimeout } from './turnTimeout';
import { handleHostMessage } from './hostMessageHandler';
import { handleGuestMessage } from './guestMessageHandler';
import { handleSpectatorMessage } from './spectatorMessageHandler';
import { clearSession } from './sessionPersistence';

// ---------------------------------------------------------------------------
// Dictionary loading
// ---------------------------------------------------------------------------

let dictionaryPromise: Promise<Trie> | null = null;

export async function getDictionary(): Promise<Trie> {
  if (!dictionaryPromise) {
    dictionaryPromise = fetch(import.meta.env.BASE_URL + 'enable.dict.bin')
      .then((res) => {
        if (!res.ok) throw new Error(`Dictionary fetch failed: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (import.meta.env.DEV) {
          console.log(`[BlitzTiles] Dictionary loaded (${buf.byteLength} bytes), decompressing...`);
        }
        return loadCompressedDictionary(new Uint8Array(buf));
      })
      .then((trie) => {
        if (import.meta.env.DEV) {
          console.log(`[BlitzTiles] Dictionary ready (${trie.size} words)`);
        }
        return trie;
      })
      .catch((err) => {
        console.error('[BlitzTiles] Dictionary load failed:', err);
        dictionaryPromise = null; // allow retry
        throw err;
      });
  }
  return dictionaryPromise;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStore>((set, get) => ({
  ...INITIAL_STATE,

  // ─── Init actions ───────────────────────────────────────────────

  initLocalGame: async (config) => {
    const dictionary = await getDictionary();
    const gameState = createGame('local', 'Player 1', 'Player 2', config);

    set({
      ...INITIAL_STATE,
      ...syncFromGameState(gameState, 0),
      mode: 'local',
      playerIndex: 0,
      dictionaryLoaded: true,
      _dictionary: dictionary,
    });
    scheduleTurnTimeout(get, set);
  },

  initHostGame: async (roomCode, config) => {
    const currentSendFn = get()._sendFn;
    const dictionary = await getDictionary();
    const isRacing = config?.gameVariant === 'racing';
    const gameState = isRacing
      ? createRacingGame('online', 'You', 'Opponent', config)
      : createGame('online', 'You', 'Opponent', config);

    set({
      ...INITIAL_STATE,
      ...syncFromGameState(gameState, 0),
      mode: 'host',
      playerIndex: 0,
      dictionaryLoaded: true,
      _dictionary: dictionary,
      _sendFn: currentSendFn, // preserve the connection
      _roomCode: roomCode,
    });

    // Send initial state to guest
    currentSendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(gameState, 1) });
    if (isRacing) {
      scheduleRacingRoundTimeout(get, set);
    } else {
      scheduleTurnTimeout(get, set);
    }
    persistGameSession(get);
  },

  initGuestGame: async (roomCode) => {
    clearTurnTimeout();
    // Reset all state and set mode synchronously so incoming messages are processed immediately
    set({
      ...INITIAL_STATE,
      mode: 'guest',
      playerIndex: 1,
      _sendFn: get()._sendFn, // preserve the connection
      _roomCode: roomCode,
    });
    const dictionary = await getDictionary();
    set({
      dictionaryLoaded: true,
      _dictionary: dictionary,
    });
  },

  restoreHostGame: async (savedState, roomCode) => {
    const currentSendFn = get()._sendFn;
    const dictionary = await getDictionary();

    set({
      ...INITIAL_STATE,
      ...syncFromGameState(savedState, 0),
      mode: 'host',
      playerIndex: 0,
      dictionaryLoaded: true,
      _dictionary: dictionary,
      _sendFn: currentSendFn,
      _roomCode: roomCode,
    });
    scheduleTurnTimeout(get, set);
  },

  restoreGuestGame: async (savedClientState, roomCode) => {
    clearTurnTimeout();
    const dictionary = await getDictionary();

    set({
      ...INITIAL_STATE,
      ...syncFromClientGameState(savedClientState),
      mode: 'guest',
      playerIndex: savedClientState.yourPlayerIndex,
      dictionaryLoaded: true,
      _dictionary: dictionary,
      _sendFn: get()._sendFn,
      _roomCode: roomCode,
    });
    // Guest will REQUEST_SYNC after reconnecting to get fresh state
  },

  initSpectatorGame: async (roomCode) => {
    clearTurnTimeout();
    set({
      ...INITIAL_STATE,
      mode: 'spectator',
      playerIndex: -1,
      _sendFn: get()._sendFn,
      _roomCode: roomCode,
    });
    const dictionary = await getDictionary();
    set({
      dictionaryLoaded: true,
      _dictionary: dictionary,
    });
  },

  restoreSpectatorGame: async (spectatorState, roomCode) => {
    clearTurnTimeout();
    const dictionary = await getDictionary();

    set({
      ...INITIAL_STATE,
      ...syncFromSpectatorGameState(spectatorState),
      mode: 'spectator',
      playerIndex: -1,
      dictionaryLoaded: true,
      _dictionary: dictionary,
      _sendFn: get()._sendFn,
      _roomCode: roomCode,
    });
  },

  addSpectatorConnection: (sendFn) => {
    const current = get()._spectatorSendFns;
    set({ _spectatorSendFns: [...current, sendFn] });

    // Immediately send current game state to new spectator
    const { _gameState, config } = get();
    if (_gameState) {
      sendFn({ type: 'GAME_STATE', state: filterStateForSpectator(_gameState, config) });
    }
  },

  removeSpectatorConnection: (sendFn) => {
    const current = get()._spectatorSendFns;
    set({ _spectatorSendFns: current.filter((fn) => fn !== sendFn) });
  },

  updateConfig: (configUpdates) => {
    const { _gameState, mode } = get();
    if (_gameState) {
      const newConfig = { ..._gameState.config, ...configUpdates };
      const newGameState = { ..._gameState, config: newConfig };
      set({
        config: newConfig,
        _gameState: newGameState,
      });

      // Broadcast updated state to spectators so config changes take effect immediately
      if (mode === 'host') {
        broadcastToSpectators(get, newGameState);
      }
    }
  },

  setConnection: (send) => {
    set({ _sendFn: send });
  },

  // ─── Network message handler ────────────────────────────────────

  handleNetworkMessage: (raw) => {
    // --- Message validation ---
    if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
      console.warn('[BlitzTiles] Invalid network message: not an object with type', raw);
      return;
    }
    const msg = raw as { type: string; [key: string]: unknown };
    if (typeof msg.type !== 'string') {
      console.warn('[BlitzTiles] Invalid network message: type is not a string', msg);
      return;
    }

    const { mode } = get();

    if (mode === 'host') {
      handleHostMessage(msg, get, set);
    } else if (mode === 'guest') {
      handleGuestMessage(msg, get, set);
    } else if (mode === 'spectator') {
      handleSpectatorMessage(msg, get, set);
    }
  },

  // ─── Tile placement (works in all modes) ────────────────────────

  placeTile: (tileId, row, col, designatedLetter) => {
    const { currentHand, placedTiles, board, gameVariant, mode, _sendFn } = get();
    if (board.length === 0) return;

    const tile = currentHand.find((t) => t.id === tileId);
    if (!tile) return;

    // Don't place on occupied cell
    if (board[row]?.[col]?.tile) return;
    if (placedTiles.some((t) => t.row === row && t.col === col)) return;

    // Remove from previous placement if any
    const filtered = placedTiles.filter((t) => t.id !== tileId);

    const placed = {
      ...tile,
      row,
      col,
      designatedLetter: designatedLetter || tile.letter || 'A',
    };

    const newPlaced = [...filtered, placed];
    set({
      placedTiles: newPlaced,
      selectedTileId: null,
    });

    // Racing + online: send placement update for ghost tiles
    if (gameVariant === 'racing' && mode !== 'local' && _sendFn) {
      _sendFn({ type: mode === 'host' ? 'GHOST_TILES' : 'PLACEMENT_UPDATE', tiles: newPlaced });
    }
  },

  setBlankLetter: (tileId, letter) => {
    set((s) => ({
      placedTiles: s.placedTiles.map((t) =>
        t.id === tileId ? { ...t, designatedLetter: letter } : t,
      ),
    }));
  },

  removePlacedTile: (tileId) => {
    const { gameVariant, mode, _sendFn, placedTiles } = get();
    const newPlaced = placedTiles.filter((t) => t.id !== tileId);
    set({ placedTiles: newPlaced });

    // Racing + online: send placement update for ghost tiles
    if (gameVariant === 'racing' && mode !== 'local' && _sendFn) {
      _sendFn({ type: mode === 'host' ? 'GHOST_TILES' : 'PLACEMENT_UPDATE', tiles: newPlaced });
    }
  },

  selectTile: (tileId) => {
    set({ selectedTileId: tileId });
  },

  // ─── Game actions (mode-aware) ──────────────────────────────────

  submitMove: () => {
    const { _gameState, _dictionary, placedTiles, mode, playerIndex, _sendFn } = get();

    if (placedTiles.length === 0) return;

    if (mode === 'guest') {
      // Guest sends intent to host
      _sendFn?.({ type: 'SUBMIT_MOVE', tiles: placedTiles });
      // Optimistic clear — host will confirm or reject
      set({ placedTiles: [], selectedTileId: null });
      return;
    }

    // Host or local: run engine locally
    if (!_gameState || !_dictionary) return;

    const isRacing = _gameState.config.gameVariant === 'racing';

    if (isRacing) {
      // Racing: host submits own move (player 0)
      const result = submitRacingMove(_gameState, 0, placedTiles, _dictionary);
      if (!result.success) {
        set({ lastMoveError: result.reason });
        return;
      }
      set({
        ...syncFromGameState(result.state, 0),
        placedTiles: [],
        selectedTileId: null,
        lastMoveError: null,
        ghostTiles: [],
      });
      if (_sendFn) {
        _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
        _sendFn({
          type: 'ROUND_RESULT',
          winnerIndex: 0,
          score: result.score,
          words: result.formedWords,
          roundNumber: _gameState.racingRound ?? 0,
        });
      }
      scheduleRacingRoundTimeout(get, set);
      persistGameSession(get);
      return;
    }

    const currentPlayer = _gameState.currentPlayerIndex;
    const result = engineSubmitMove(_gameState, currentPlayer, placedTiles, _dictionary);

    if (!result.success) {
      set({ lastMoveError: result.reason });
      return;
    }

    const viewAs = mode === 'local' ? result.state.currentPlayerIndex : playerIndex;
    set({
      ...syncFromGameState(result.state, viewAs),
      placedTiles: [],
      selectedTileId: null,
      lastMoveError: null,
    });

    // Host: broadcast to guest and spectators
    if (mode === 'host') {
      if (_sendFn) {
        _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
      }
      broadcastToSpectators(get, result.state);
    }
    scheduleTurnTimeout(get, set);
    if (mode === 'host') persistGameSession(get);
  },

  passTurn: () => {
    const { _gameState, mode, playerIndex, _sendFn } = get();

    if (mode === 'guest') {
      _sendFn?.({ type: 'PASS' });
      return;
    }

    if (!_gameState) return;

    const currentPlayer = _gameState.currentPlayerIndex;
    const result = enginePassTurn(_gameState, currentPlayer);

    const viewAs = mode === 'local' ? result.state.currentPlayerIndex : playerIndex;
    set({
      ...syncFromGameState(result.state, viewAs),
      placedTiles: [],
      selectedTileId: null,
      lastMoveError: null,
    });

    if (mode === 'host') {
      if (_sendFn) {
        _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
      }
      broadcastToSpectators(get, result.state);
    }
    scheduleTurnTimeout(get, set);
    if (mode === 'host') persistGameSession(get);
  },

  exchangeTiles: (tileIds) => {
    const { _gameState, mode, playerIndex, _sendFn } = get();

    if (mode === 'guest') {
      _sendFn?.({ type: 'EXCHANGE', tileIds });
      return;
    }

    if (!_gameState) return;

    const currentPlayer = _gameState.currentPlayerIndex;
    const result = exchangePlayerTiles(_gameState, currentPlayer, tileIds);

    if (!result.success) {
      set({ lastMoveError: result.reason });
      return;
    }

    const viewAs = mode === 'local' ? result.state.currentPlayerIndex : playerIndex;
    set({
      ...syncFromGameState(result.state, viewAs),
      placedTiles: [],
      selectedTileId: null,
      lastMoveError: null,
      exchangeMode: false,
      exchangeSelection: new Set(),
    });

    if (mode === 'host') {
      if (_sendFn) {
        _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
      }
      broadcastToSpectators(get, result.state);
    }
    scheduleTurnTimeout(get, set);
    if (mode === 'host') persistGameSession(get);
  },

  resign: () => {
    const { _gameState, mode, playerIndex, _sendFn } = get();

    if (mode === 'guest') {
      _sendFn?.({ type: 'RESIGN' });
      return;
    }

    if (!_gameState) return;

    // In host mode, always resign as player 0 (the host).
    // In local mode, resign the active player.
    const resigningPlayer = mode === 'host' ? 0 : _gameState.currentPlayerIndex;
    const result = resignGame(_gameState, resigningPlayer);
    set({
      ...syncFromGameState(result, playerIndex),
      placedTiles: [],
      selectedTileId: null,
    });

    if (mode === 'host') {
      if (_sendFn) {
        _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result, 1) });
      }
      broadcastToSpectators(get, result);
    }
    if (mode !== 'local') clearSession();
  },

  recallTiles: () => {
    set({ placedTiles: [], selectedTileId: null });
  },

  shuffleHand: () => {
    const { currentHand, placedTiles } = get();
    const placedIds = new Set(placedTiles.map((t) => t.id));
    const inHand = currentHand.filter((t) => !placedIds.has(t.id));
    const onBoard = currentHand.filter((t) => placedIds.has(t.id));

    // Fisher-Yates shuffle
    const shuffled = [...inHand];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    set({ currentHand: [...shuffled, ...onBoard] });
  },

  reorderHand: (activeId, overId) => {
    set((state) => {
      const oldIndex = state.currentHand.findIndex((t) => t.id === activeId);
      const newIndex = state.currentHand.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return {};
      return {
        currentHand: arrayMove(state.currentHand, oldIndex, newIndex),
      };
    });
  },

  clearError: () => {
    set({ lastMoveError: null });
  },

  setExchangeMode: (on: boolean) => {
    if (on) {
      get().recallTiles();
      set({ exchangeMode: true, exchangeSelection: new Set() });
    } else {
      set({ exchangeMode: false, exchangeSelection: new Set() });
    }
  },

  toggleExchangeTile: (tileId: string) => {
    const prev = get().exchangeSelection;
    const next = new Set(prev);
    if (next.has(tileId)) {
      next.delete(tileId);
    } else {
      next.add(tileId);
    }
    set({ exchangeSelection: next });
  },

  setCursor: (row: number, col: number) => {
    if (row < 0 || row > 14 || col < 0 || col > 14) return;
    set({ cursorPosition: { row, col } });
  },

  clearCursor: () => {
    set({ cursorPosition: null });
  },

  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => {
    const { cursorPosition } = get();
    if (!cursorPosition) {
      // Start at center if no cursor
      set({ cursorPosition: { row: 7, col: 7 } });
      return;
    }

    let { row, col } = cursorPosition;
    switch (direction) {
      case 'up':
        row = Math.max(0, row - 1);
        break;
      case 'down':
        row = Math.min(14, row + 1);
        break;
      case 'left':
        col = Math.max(0, col - 1);
        break;
      case 'right':
        col = Math.min(14, col + 1);
        break;
    }
    set({ cursorPosition: { row, col } });
  },

  toggleCursorDirection: () => {
    const { cursorDirection } = get();
    set({ cursorDirection: cursorDirection === 'horizontal' ? 'vertical' : 'horizontal' });
  },
}));
