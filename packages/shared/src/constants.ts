/**
 * Game constants: tile distribution, bonus square map, and defaults.
 *
 * Tile distribution and bonus layout are original to BlitzTiles.
 * Board coordinates: row 0–14, col 0–14. Center is (7,7).
 */

import type { BonusType, GameConfig } from './types.js';

// ---------------------------------------------------------------------------
// Tile distribution — 100 tiles total
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
// Bonus square map — BlitzTiles 15×15 layout
// ---------------------------------------------------------------------------

/**
 * Builds the 15×15 bonus map. Uses symmetry: define one quadrant + diagonals,
 * then mirror. Returns bonus[row][col].
 */
function buildBonusMap(): BonusType[][] {
  const b: BonusType[][] = Array.from({ length: 15 }, () => Array(15).fill(null) as BonusType[]);

  // Triple Word squares (8)
  const tw: [number, number][] = [
    [0, 4],
    [0, 10],
    [4, 0],
    [4, 14],
    [10, 0],
    [10, 14],
    [14, 4],
    [14, 10],
  ];

  // Double Word squares (17, including center)
  const dw: [number, number][] = [
    [7, 7], // center
    [1, 7],
    [7, 13],
    [13, 7],
    [7, 1], // outer cross
    [4, 7],
    [7, 10],
    [10, 7],
    [7, 4], // inner cross
    [3, 3],
    [3, 11],
    [11, 11],
    [11, 3], // middle diamond
    [5, 5],
    [5, 9],
    [9, 9],
    [9, 5], // inner diamond
  ];

  // Triple Letter squares (12)
  const tl: [number, number][] = [
    [0, 7],
    [7, 14],
    [14, 7],
    [7, 0], // edge midpoints
    [3, 5],
    [5, 11],
    [11, 9],
    [9, 3], // mid-board ring A
    [3, 9],
    [9, 11],
    [11, 5],
    [5, 3], // mid-board ring B
  ];

  // Double Letter squares (24)
  const dl: [number, number][] = [
    [1, 3],
    [3, 13],
    [13, 11],
    [11, 1], // orbit 1
    [1, 6],
    [6, 13],
    [13, 8],
    [8, 1], // orbit 2
    [2, 4],
    [4, 12],
    [12, 10],
    [10, 2], // orbit 3
    [4, 6],
    [6, 10],
    [10, 8],
    [8, 4], // orbit 4
    [6, 4],
    [4, 8],
    [8, 10],
    [10, 6], // orbit 5
    [5, 7],
    [7, 9],
    [9, 7],
    [7, 5], // orbit 6
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
  spectatorHandsVisible: true,
  gameVariant: 'classic',
  racingRoundTimeLimitMs: DEFAULT_RACING_ROUND_TIME_LIMIT_MS,
};
