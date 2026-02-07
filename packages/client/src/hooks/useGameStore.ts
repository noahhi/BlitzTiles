/**
 * Zustand store for BlitzTiles game state.
 *
 * Supports three modes:
 * - Local hot-seat: Two players on the same device, using the shared game engine directly.
 * - Host: Runs the game engine locally, sends filtered state to guest via WebRTC.
 * - Guest: Sends intents to host, receives filtered state updates.
 */

import { arrayMove } from '@dnd-kit/sortable';
import { create } from 'zustand';
import type {
  Board,
  GamePhase,
  GameVariant,
  PlacedTile,
  Tile,
  MoveRecord,
  GameConfig,
  GameState,
  ClientGameState,
} from '@blitztiles/shared';
import {
  createGame,
  submitMove,
  passTurn,
  exchangePlayerTiles,
  resignGame,
  handleTurnTimeout,
  createRacingGame,
  submitRacingMove,
  handleRacingRoundTimeout,
  Trie,
  loadCompressedDictionary,
} from '@blitztiles/shared';
import { saveSession, clearSession } from './sessionPersistence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GameMode = 'local' | 'host' | 'guest';

export interface GameStore {
  // Game state
  phase: GamePhase;
  board: Board;
  currentPlayerIndex: number;
  players: {
    name: string;
    score: number;
    handSize: number;
    timeRemainingMs: number;
  }[];
  currentHand: Tile[];
  tileBagCount: number;
  consecutivePasses: number;
  winnerIndex: number | null;
  endReason: string | null;
  moveHistory: MoveRecord[];

  // Timer state
  turnTimeLimitMs: number;
  turnStartTimestamp: string;

  // Racing mode state
  gameVariant: GameVariant;
  ghostTiles: PlacedTile[];
  racingRound: number | null;
  roundStartTimestamp: string | null;
  racingRoundTimeLimitMs: number;

  // UI state
  placedTiles: PlacedTile[];
  selectedTileId: string | null;
  lastMoveError: string | null;
  dictionaryLoaded: boolean;
  lastMoveTiles: { row: number; col: number }[];
  exchangeMode: boolean;
  exchangeSelection: Set<string>;
  cursorPosition: { row: number; col: number } | null;
  cursorDirection: 'horizontal' | 'vertical';

  // Network state
  mode: GameMode;
  playerIndex: number;

  // Internal (not exposed to components directly)
  _roomCode: string | null;
  _gameState: GameState | null;
  _dictionary: Trie | null;
  _sendFn: ((msg: unknown) => void) | null;

  // Actions
  initLocalGame: (config?: GameConfig) => Promise<void>;
  initHostGame: (roomCode: string, config?: GameConfig) => Promise<void>;
  initGuestGame: (roomCode: string) => Promise<void>;
  restoreHostGame: (savedState: GameState, roomCode: string) => Promise<void>;
  restoreGuestGame: (savedClientState: ClientGameState, roomCode: string) => Promise<void>;
  setConnection: (send: (msg: unknown) => void) => void;
  handleNetworkMessage: (msg: unknown) => void;
  placeTile: (tileId: string, row: number, col: number, designatedLetter?: string) => void;
  setBlankLetter: (tileId: string, letter: string) => void;
  removePlacedTile: (tileId: string) => void;
  selectTile: (tileId: string | null) => void;
  submitMove: () => void;
  passTurn: () => void;
  exchangeTiles: (tileIds: string[]) => void;
  resign: () => void;
  recallTiles: () => void;
  shuffleHand: () => void;
  reorderHand: (activeId: string, overId: string) => void;
  clearError: () => void;
  setExchangeMode: (on: boolean) => void;
  toggleExchangeTile: (tileId: string) => void;
  setCursor: (row: number, col: number) => void;
  clearCursor: () => void;
  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void;
  toggleCursorDirection: () => void;
}

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
// Helpers: sync store from game state
// ---------------------------------------------------------------------------

/** Sync store from full GameState (local + host modes). */
function syncFromGameState(state: GameState, viewAsPlayer: number): Partial<GameStore> {
  const isRacing = state.config.gameVariant === 'racing';
  return {
    phase: state.phase,
    board: state.board,
    currentPlayerIndex: state.currentPlayerIndex,
    players: state.players.map((p) => ({
      name: p.name,
      score: p.score,
      handSize: isRacing ? (state.sharedRack?.length ?? 0) : p.hand.length,
      timeRemainingMs: p.timeRemainingMs,
    })),
    currentHand: isRacing ? (state.sharedRack ?? []) : state.players[viewAsPlayer].hand,
    tileBagCount: state.tileBag.length,
    consecutivePasses: state.consecutivePasses,
    winnerIndex: state.winnerIndex,
    endReason: state.endReason,
    moveHistory: state.moveHistory,
    turnTimeLimitMs: state.config.turnTimeLimitMs ?? 0,
    turnStartTimestamp: state.turnStartTimestamp,
    lastMoveTiles: state.lastMoveTiles,
    gameVariant: state.config.gameVariant,
    racingRound: state.racingRound,
    roundStartTimestamp: state.roundStartTimestamp,
    racingRoundTimeLimitMs: state.config.racingRoundTimeLimitMs ?? 0,
    _gameState: state,
  };
}

/** Sync store from filtered ClientGameState (guest mode). */
function syncFromClientGameState(clientState: ClientGameState): Partial<GameStore> {
  const myIndex = clientState.yourPlayerIndex;
  const opIndex = myIndex === 0 ? 1 : 0;
  const isRacing = clientState.config.gameVariant === 'racing';

  const players: GameStore['players'] = [];
  players[myIndex] = {
    name: clientState.you.name,
    score: clientState.you.score,
    handSize: isRacing ? (clientState.sharedRack?.length ?? 0) : clientState.you.hand.length,
    timeRemainingMs: clientState.you.timeRemainingMs,
  };
  players[opIndex] = {
    name: clientState.opponent.name,
    score: clientState.opponent.score,
    handSize: isRacing ? (clientState.sharedRack?.length ?? 0) : clientState.opponent.handSize,
    timeRemainingMs: clientState.opponent.timeRemainingMs,
  };

  return {
    phase: clientState.phase,
    board: clientState.board,
    currentPlayerIndex: clientState.currentPlayerIndex,
    players,
    currentHand: isRacing ? (clientState.sharedRack ?? []) : clientState.you.hand,
    tileBagCount: clientState.tileBagCount,
    consecutivePasses: clientState.consecutivePasses,
    winnerIndex: clientState.winnerIndex,
    endReason: clientState.endReason,
    moveHistory: clientState.moveHistory,
    turnTimeLimitMs: clientState.config.turnTimeLimitMs ?? 0,
    turnStartTimestamp: clientState.turnStartTimestamp,
    lastMoveTiles: clientState.lastMoveTiles,
    gameVariant: clientState.config.gameVariant,
    racingRound: clientState.racingRound,
    roundStartTimestamp: clientState.roundStartTimestamp,
    racingRoundTimeLimitMs: clientState.config.racingRoundTimeLimitMs ?? 0,
    playerIndex: myIndex,
  };
}

/** Filter full GameState into a ClientGameState for a specific player. */
export function filterStateForPlayer(state: GameState, forPlayer: number): ClientGameState {
  const opponentIndex = forPlayer === 0 ? 1 : 0;
  const opponent = state.players[opponentIndex];

  return {
    roomId: state.roomId,
    phase: state.phase,
    config: state.config,
    board: state.board,
    you: state.players[forPlayer],
    opponent: {
      name: opponent.name,
      score: opponent.score,
      timeRemainingMs: opponent.timeRemainingMs,
      handSize: opponent.hand.length,
      connected: opponent.connected,
    },
    currentPlayerIndex: state.currentPlayerIndex,
    yourPlayerIndex: forPlayer,
    tileBagCount: state.tileBag.length,
    consecutivePasses: state.consecutivePasses,
    turnStartTimestamp: state.turnStartTimestamp,
    winnerIndex: state.winnerIndex,
    endReason: state.endReason,
    moveHistory: state.moveHistory,
    stateVersion: state.stateVersion,
    lastMoveTiles: state.lastMoveTiles,
    sharedRack: state.sharedRack,
    racingRound: state.racingRound,
    consecutiveSkippedRounds: state.consecutiveSkippedRounds,
    roundStartTimestamp: state.roundStartTimestamp,
  };
}

// ---------------------------------------------------------------------------
// Default state (spread in init functions to guarantee clean slate)
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  phase: 'waiting' as GamePhase,
  board: [] as Board,
  currentPlayerIndex: 0,
  players: [] as GameStore['players'],
  currentHand: [] as Tile[],
  tileBagCount: 0,
  consecutivePasses: 0,
  winnerIndex: null as number | null,
  endReason: null as string | null,
  moveHistory: [] as MoveRecord[],

  turnTimeLimitMs: 0,
  turnStartTimestamp: '',

  gameVariant: 'classic' as GameVariant,
  ghostTiles: [] as PlacedTile[],
  racingRound: null as number | null,
  roundStartTimestamp: null as string | null,
  racingRoundTimeLimitMs: 0,

  placedTiles: [] as PlacedTile[],
  selectedTileId: null as string | null,
  lastMoveError: null as string | null,
  dictionaryLoaded: false,
  lastMoveTiles: [] as { row: number; col: number }[],
  exchangeMode: false,
  exchangeSelection: new Set<string>(),
  cursorPosition: null as { row: number; col: number } | null,
  cursorDirection: 'horizontal' as 'horizontal' | 'vertical',

  mode: 'local' as GameMode,
  playerIndex: 0,

  _roomCode: null as string | null,
  _gameState: null as GameState | null,
  _dictionary: null as Trie | null,
  _sendFn: null as ((msg: unknown) => void) | null,
};

// ---------------------------------------------------------------------------
// Turn timeout scheduling (module-level, outside the store)
// ---------------------------------------------------------------------------

let turnTimeoutId: ReturnType<typeof setTimeout> | null = null;

function clearTurnTimeout() {
  if (turnTimeoutId !== null) {
    clearTimeout(turnTimeoutId);
    turnTimeoutId = null;
  }
}

/**
 * Schedule an auto-pass when the current turn's time runs out.
 * Only runs in 'local' or 'host' mode (guest relies on host).
 */
function scheduleTurnTimeout(get: () => GameStore, set: (partial: Partial<GameStore>) => void) {
  clearTurnTimeout();

  const { _gameState, mode } = get();
  if (!_gameState) return;
  if (_gameState.config.timerMode !== 'per_turn') return;
  if (_gameState.phase !== 'playing') return;
  if (mode === 'guest') return;

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

    // Host: broadcast to guest
    if (currentMode === 'host' && _sendFn) {
      _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
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
function scheduleRacingRoundTimeout(
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

// ---------------------------------------------------------------------------
// Session persistence helper
// ---------------------------------------------------------------------------

function persistGameSession(get: () => GameStore) {
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
        stateVersion: _gameState.stateVersion,
      });
    }
  }
  // Guest persistence is handled in handleNetworkMessage when receiving GAME_STATE
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

    const { _gameState, _dictionary, mode, _sendFn } = get();

    if (mode === 'host') {
      // Host processes guest's intents through the game engine
      if (!_gameState || !_dictionary) return;

      // REQUEST_SYNC is allowed regardless of phase
      if (msg.type === 'REQUEST_SYNC') {
        _sendFn?.({ type: 'GAME_STATE', state: filterStateForPlayer(_gameState, 1) });
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
              scheduleTurnTimeout(get, set);
              persistGameSession(get);
            } else {
              _sendFn?.({ type: 'MOVE_REJECTED', reason: result.reason });
            }
          }
          break;
        }
        case 'PLACEMENT_UPDATE': {
          // Racing: relay ghost tiles to host's display
          if (isRacing && Array.isArray(msg.tiles)) {
            set({ ghostTiles: msg.tiles as PlacedTile[] });
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
          clearSession();
          break;
        }
      }
    } else if (mode === 'guest') {
      // Guest receives state updates from host
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

    const placed: PlacedTile = {
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
    const result = submitMove(_gameState, currentPlayer, placedTiles, _dictionary);

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

    // Host: broadcast to guest
    if (mode === 'host' && _sendFn) {
      _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
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
    const result = passTurn(_gameState, currentPlayer);

    const viewAs = mode === 'local' ? result.state.currentPlayerIndex : playerIndex;
    set({
      ...syncFromGameState(result.state, viewAs),
      placedTiles: [],
      selectedTileId: null,
      lastMoveError: null,
    });

    if (mode === 'host' && _sendFn) {
      _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
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

    if (mode === 'host' && _sendFn) {
      _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result.state, 1) });
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

    if (mode === 'host' && _sendFn) {
      _sendFn({ type: 'GAME_STATE', state: filterStateForPlayer(result, 1) });
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
