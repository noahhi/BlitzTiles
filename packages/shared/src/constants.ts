/**
 * Game constants: tile distribution, bonus square map, and defaults.
 *
 * Tile distribution and bonus layout follow standard Scrabble rules.
 * Board coordinates: row 0–14, col 0–14. Center is (7,7).
 */

import type { BonusType, GameConfig } from './types.js';

// ---------------------------------------------------------------------------
// Tile distribution — 100 tiles total (standard Scrabble)
// ---------------------------------------------------------------------------

/** [letter, count, pointValue]. Empty string = blank tile. */
export const TILE_DISTRIBUTION: [string, number, number][] = [
  ['', 2, 0], // blanks
  ['A', 9, 1],
  ['B', 2, 3],
  ['C', 2, 3],
  ['D', 4, 2],
  ['E', 12, 1],
  ['F', 2, 4],
  ['G', 3, 2],
  ['H', 2, 4],
  ['I', 9, 1],
  ['J', 1, 8],
  ['K', 1, 5],
  ['L', 4, 1],
  ['M', 2, 3],
  ['N', 6, 1],
  ['O', 8, 1],
  ['P', 2, 3],
  ['Q', 1, 10],
  ['R', 6, 1],
  ['S', 4, 1],
  ['T', 6, 1],
  ['U', 4, 1],
  ['V', 2, 4],
  ['W', 2, 4],
  ['X', 1, 8],
  ['Y', 2, 4],
  ['Z', 1, 10],
];

export const TOTAL_TILE_COUNT = 100;
export const HAND_SIZE = 7;
export const BOARD_SIZE = 15;
export const CENTER = 7; // (7,7) is center square
export const BINGO_BONUS = 50; // bonus for using all 7 tiles

// ---------------------------------------------------------------------------
// Bonus square map — standard 15×15 Scrabble layout
// ---------------------------------------------------------------------------

/**
 * Builds the 15×15 bonus map. Uses symmetry: define one quadrant + diagonals,
 * then mirror. Returns bonus[row][col].
 */
function buildBonusMap(): BonusType[][] {
  const b: BonusType[][] = Array.from({ length: 15 }, () => Array(15).fill(null) as BonusType[]);

  // Triple Word squares
  const tw: [number, number][] = [
    [0, 0],
    [0, 7],
    [0, 14],
    [7, 0],
    [7, 14],
    [14, 0],
    [14, 7],
    [14, 14],
  ];

  // Double Word squares (including center)
  const dw: [number, number][] = [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [1, 13],
    [2, 12],
    [3, 11],
    [4, 10],
    [10, 4],
    [11, 3],
    [12, 2],
    [13, 1],
    [10, 10],
    [11, 11],
    [12, 12],
    [13, 13],
    [7, 7], // center
  ];

  // Triple Letter squares
  const tl: [number, number][] = [
    [1, 5],
    [1, 9],
    [5, 1],
    [5, 5],
    [5, 9],
    [5, 13],
    [9, 1],
    [9, 5],
    [9, 9],
    [9, 13],
    [13, 5],
    [13, 9],
  ];

  // Double Letter squares
  const dl: [number, number][] = [
    [0, 3],
    [0, 11],
    [2, 6],
    [2, 8],
    [3, 0],
    [3, 7],
    [3, 14],
    [6, 2],
    [6, 6],
    [6, 8],
    [6, 12],
    [7, 3],
    [7, 11],
    [8, 2],
    [8, 6],
    [8, 8],
    [8, 12],
    [11, 0],
    [11, 7],
    [11, 14],
    [12, 6],
    [12, 8],
    [14, 3],
    [14, 11],
  ];

  for (const [r, c] of tw) b[r][c] = 'TW';
  for (const [r, c] of dw) b[r][c] = 'DW';
  for (const [r, c] of tl) b[r][c] = 'TL';
  for (const [r, c] of dl) b[r][c] = 'DL';

  return b;
}

/** Precomputed 15×15 bonus map. Access as BONUS_MAP[row][col]. */
export const BONUS_MAP: readonly (readonly BonusType[])[] = buildBonusMap();

// ---------------------------------------------------------------------------
// Default game config
// ---------------------------------------------------------------------------

export const DEFAULT_TURN_TIME_LIMIT_MS = 60_000; // 60 seconds per turn
export const DEFAULT_RACING_ROUND_TIME_LIMIT_MS = 30_000; // 30 seconds per racing round

export const DEFAULT_GAME_CONFIG: GameConfig = {
  timerMode: 'per_turn',
  timerDurationMs: 15 * 60 * 1000, // 15 minutes (unused in per_turn mode)
  overtimePenaltyPerMinute: 10,
  turnTimeLimitMs: DEFAULT_TURN_TIME_LIMIT_MS,
  gameVariant: 'classic',
  racingRoundTimeLimitMs: DEFAULT_RACING_ROUND_TIME_LIMIT_MS,
};
