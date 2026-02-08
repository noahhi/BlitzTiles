/**
 * Type definitions and initial state for the game store.
 */

import type {
  Board,
  GameConfig,
  GamePhase,
  GameState,
  GameVariant,
  MoveRecord,
  PlacedTile,
  Tile,
} from '@blitztiles/shared';
import { Trie } from '@blitztiles/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GameMode = 'local' | 'host' | 'guest' | 'spectator';

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
    hand?: Tile[]; // Optional - only present for spectators when spectatorHandsVisible is true
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
  _spectatorSendFns: ((msg: unknown) => void)[];
  config: GameConfig;

  // Actions
  initLocalGame: (config?: GameConfig) => Promise<void>;
  initHostGame: (roomCode: string, config?: GameConfig) => Promise<void>;
  initGuestGame: (roomCode: string) => Promise<void>;
  initSpectatorGame: (roomCode: string) => Promise<void>;
  restoreHostGame: (savedState: GameState, roomCode: string) => Promise<void>;
  restoreGuestGame: (
    savedClientState: import('@blitztiles/shared').ClientGameState,
    roomCode: string,
  ) => Promise<void>;
  restoreSpectatorGame: (
    spectatorState: import('@blitztiles/shared').SpectatorGameState,
    roomCode: string,
  ) => Promise<void>;
  addSpectatorConnection: (sendFn: (msg: unknown) => void) => void;
  removeSpectatorConnection: (sendFn: (msg: unknown) => void) => void;
  updateConfig: (configUpdates: Partial<GameConfig>) => void;
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
// Default state (spread in init functions to guarantee clean slate)
// ---------------------------------------------------------------------------

export const INITIAL_STATE = {
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
  _spectatorSendFns: [] as ((msg: unknown) => void)[],
  config: {
    timerMode: 'per_turn',
    timerDurationMs: 0,
    overtimePenaltyPerMinute: 0,
    turnTimeLimitMs: 60000,
    spectatorHandsVisible: true,
  } as GameConfig,
};
