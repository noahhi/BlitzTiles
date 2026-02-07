/**
 * Core types for BlitzTiles.
 *
 * Conventions:
 * - Board coordinates: row 0–14 (top→bottom), col 0–14 (left→right). Center is (7,7).
 * - All message types use discriminated unions keyed on `type`.
 * - GameState is the server-authoritative source of truth.
 */

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

/** A tile that lives in the bag or a player's hand. */
export interface Tile {
  /** Unique id so React can key on it and we can track individual tiles. */
  id: string;
  /** A–Z for letter tiles, empty string for blanks. */
  letter: string;
  /** Point value (0 for blanks). */
  value: number;
  /** True only for blank tiles. */
  isBlank: boolean;
}

/** A tile that has been placed on the board. */
export interface PlacedTile extends Tile {
  row: number;
  col: number;
  /**
   * For blank tiles: the letter the player chose to represent.
   * For normal tiles: same as `letter`.
   */
  designatedLetter: string;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/** Bonus type for a board cell. `null` means no bonus. */
export type BonusType = 'DL' | 'TL' | 'DW' | 'TW' | null;

/** A single cell on the 15×15 board. */
export interface BoardCell {
  row: number;
  col: number;
  tile: PlacedTile | null;
  bonus: BonusType;
}

/** 15×15 grid, row-major. board[row][col]. */
export type Board = BoardCell[][];

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerState {
  id: string;
  name: string;
  hand: Tile[];
  score: number;
  /** Remaining time in milliseconds. */
  timeRemainingMs: number;
  /** True while connected via WebSocket. */
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type TimerMode = 'sudden_death' | 'time_penalty' | 'per_turn' | 'untimed';

export interface GameConfig {
  timerMode: TimerMode;
  /** Total time per player in ms. Ignored when timerMode is 'untimed' or 'per_turn'. */
  timerDurationMs: number;
  /** Points deducted per overtime minute in time_penalty mode. */
  overtimePenaltyPerMinute: number;
  /** Time limit per turn in ms. Only used when timerMode is 'per_turn'. */
  turnTimeLimitMs: number;
}

export type GamePhase = 'waiting' | 'playing' | 'finished';

export interface GameState {
  /** Unique room/game identifier. */
  roomId: string;
  phase: GamePhase;
  config: GameConfig;
  board: Board;
  players: [PlayerState, PlayerState];
  /** Index into players array (0 or 1). */
  currentPlayerIndex: number;
  /** Tiles remaining in the bag (server-only; clients see count). */
  tileBag: Tile[];
  /** Number of consecutive passes (2 → game over). */
  consecutivePasses: number;
  /** ISO timestamp of when the current turn started. */
  turnStartTimestamp: string;
  /** Index of the winning player, or null. */
  winnerIndex: number | null;
  /** Human-readable reason the game ended. */
  endReason: string | null;
  /** Ordered list of moves for history. */
  moveHistory: MoveRecord[];
  /** Monotonically increasing, used for state reconciliation. */
  stateVersion: number;
  /** Positions of tiles placed in the last move, for highlight display. */
  lastMoveTiles: { row: number; col: number }[];
}

export interface MoveRecord {
  playerIndex: number;
  action: 'submit' | 'pass' | 'exchange';
  /** Words formed (submit only). */
  words: string[];
  score: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Messages: Client → Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'SUBMIT_MOVE'; tiles: PlacedTile[] }
  | { type: 'PASS' }
  | { type: 'EXCHANGE'; tileIds: string[] }
  | { type: 'RESIGN' }
  | { type: 'REMATCH' }
  | { type: 'SET_NAME'; name: string };

// ---------------------------------------------------------------------------
// Messages: Server → Client
// ---------------------------------------------------------------------------

/** Filtered view of GameState sent to a specific client (opponent hand hidden). */
export interface ClientGameState {
  roomId: string;
  phase: GamePhase;
  config: GameConfig;
  board: Board;
  you: PlayerState;
  opponent: {
    name: string;
    score: number;
    timeRemainingMs: number;
    handSize: number;
    connected: boolean;
  };
  currentPlayerIndex: number;
  yourPlayerIndex: number;
  tileBagCount: number;
  consecutivePasses: number;
  turnStartTimestamp: string;
  winnerIndex: number | null;
  endReason: string | null;
  moveHistory: MoveRecord[];
  stateVersion: number;
  lastMoveTiles: { row: number; col: number }[];
}

export type ServerMessage =
  | { type: 'GAME_STATE'; state: ClientGameState }
  | { type: 'WAITING'; roomId: string; playerIndex: number }
  | { type: 'MOVE_REJECTED'; reason: string }
  | { type: 'TIMER_SYNC'; yourTimeMs: number; opponentTimeMs: number; turnStartTimestamp: string }
  | { type: 'ERROR'; message: string };
