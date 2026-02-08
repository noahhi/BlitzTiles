import { describe, it, expect } from 'vitest';
import { scoreTurn, getEndGameBonus } from './scoring.js';
import type { Board, BoardCell, PlacedTile } from './types.js';
import { BONUS_MAP, BOARD_SIZE } from './constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from(
      { length: BOARD_SIZE },
      (_, col): BoardCell => ({
        row,
        col,
        tile: null,
        bonus: BONUS_MAP[row][col],
      }),
    ),
  );
}

function makeTile(
  letter: string,
  value: number,
  row: number,
  col: number,
  isBlank = false,
): PlacedTile {
  return {
    id: `t-${row}-${col}`,
    letter: isBlank ? '' : letter,
    value,
    isBlank,
    row,
    col,
    designatedLetter: letter,
  };
}

// ---------------------------------------------------------------------------
// scoreTurn
// ---------------------------------------------------------------------------

describe('scoreTurn', () => {
  // -----------------------------------------------------------------------
  // Simple word with no bonuses
  // -----------------------------------------------------------------------

  it('scores a simple word on non-bonus squares', () => {
    // Place "CAT" horizontally at row 0, cols 1-3 — all non-bonus in Blitz layout.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('C', 3, 0, 1), // no bonus
      makeTile('A', 1, 0, 2), // no bonus
      makeTile('T', 1, 0, 3), // no bonus
    ];

    const formedWords = [
      {
        word: 'CAT',
        cells: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
        ],
      },
    ];

    // 3 + 1 + 1 = 5
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(5);
  });

  // -----------------------------------------------------------------------
  // Double Letter bonus
  // -----------------------------------------------------------------------

  it('applies double letter bonus to a newly placed tile', () => {
    // (1,3) is DL. Place a tile worth 4 there.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('H', 4, 1, 3), // DL
      makeTile('A', 1, 1, 4), // no bonus
      makeTile('T', 1, 1, 5), // no bonus
    ];

    const formedWords = [
      {
        word: 'HAT',
        cells: [
          { row: 1, col: 3 },
          { row: 1, col: 4 },
          { row: 1, col: 5 },
        ],
      },
    ];

    // H: 4×2 = 8, A: 1, T: 1 → 10
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Triple Letter bonus
  // -----------------------------------------------------------------------

  it('applies triple letter bonus to a newly placed tile', () => {
    // (3,5) is TL. Place a tile worth 4 there.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('A', 1, 3, 4), // no bonus
      makeTile('F', 4, 3, 5), // TL
      makeTile('T', 1, 3, 6), // no bonus
    ];

    const formedWords = [
      {
        word: 'AFT',
        cells: [
          { row: 3, col: 4 },
          { row: 3, col: 5 },
          { row: 3, col: 6 },
        ],
      },
    ];

    // A: 1, F: 4×3 = 12, T: 1 → 14
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(14);
  });

  // -----------------------------------------------------------------------
  // Double Word bonus
  // -----------------------------------------------------------------------

  it('applies double word bonus when a new tile is on a DW square', () => {
    // (7,7) is DW (center). Place a word through center.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('C', 3, 7, 6), // no bonus
      makeTile('A', 1, 7, 7), // DW (center)
      makeTile('T', 1, 7, 8), // no bonus
    ];

    const formedWords = [
      {
        word: 'CAT',
        cells: [
          { row: 7, col: 6 },
          { row: 7, col: 7 },
          { row: 7, col: 8 },
        ],
      },
    ];

    // (3 + 1 + 1) × 2 = 10
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Triple Word bonus
  // -----------------------------------------------------------------------

  it('applies triple word bonus when a new tile is on a TW square', () => {
    // (0,4) is TW.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('G', 2, 0, 4), // TW
      makeTile('O', 1, 0, 5), // no bonus
    ];

    const formedWords = [
      {
        word: 'GO',
        cells: [
          { row: 0, col: 4 },
          { row: 0, col: 5 },
        ],
      },
    ];

    // (2 + 1) × 3 = 9
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(9);
  });

  // -----------------------------------------------------------------------
  // Multiple word bonuses stack multiplicatively
  // -----------------------------------------------------------------------

  it('stacks multiple word bonuses multiplicatively', () => {
    // We need a word that crosses two TW squares in the same row.
    // Row 0 has TW at (0,4) and (0,10), plus TL at (0,7).
    // Place a 7-tile word from col 4 to col 10.
    const board = createEmptyBoard();

    // 7 tiles across row 0, cols 4–10
    const placedTiles: PlacedTile[] = [
      makeTile('A', 1, 0, 4), // TW
      makeTile('B', 3, 0, 5),
      makeTile('C', 3, 0, 6),
      makeTile('D', 2, 0, 7), // TL → letter bonus (2×3=6), not word bonus
      makeTile('E', 1, 0, 8),
      makeTile('F', 4, 0, 9),
      makeTile('G', 2, 0, 10), // TW
    ];

    const formedWords = [
      {
        word: 'ABCDEFG',
        cells: [
          { row: 0, col: 4 },
          { row: 0, col: 5 },
          { row: 0, col: 6 },
          { row: 0, col: 7 },
          { row: 0, col: 8 },
          { row: 0, col: 9 },
          { row: 0, col: 10 },
        ],
      },
    ];

    // Letter scores: A=1, B=3, C=3, D=2×3(TL)=6, E=1, F=4, G=2
    // Sum = 1+3+3+6+1+4+2 = 20
    // Word multipliers: TW at (0,4) × TW at (0,10) = 3×3 = 9
    // 20 × 9 = 180
    // +50 bingo bonus (7 tiles placed) = 230
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(230);
  });

  // -----------------------------------------------------------------------
  // Blank tile on letter bonus still scores 0
  // -----------------------------------------------------------------------

  it('blank tile on a letter bonus square still scores 0', () => {
    // (1,3) is DL. Place a blank there (value 0).
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('A', 0, 1, 3, true), // blank on DL — value stays 0
      makeTile('T', 1, 1, 4),
    ];

    const formedWords = [
      {
        word: 'AT',
        cells: [
          { row: 1, col: 3 },
          { row: 1, col: 4 },
        ],
      },
    ];

    // A(blank): 0×2 = 0, T: 1 → 1
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Bingo bonus: exactly 7 tiles placed adds 50 points
  // -----------------------------------------------------------------------

  it('adds bingo bonus when exactly 7 tiles are placed', () => {
    const board = createEmptyBoard();

    // Place 7 tiles across row 1, cols 4–10.
    // (1,6) is DL and (1,7) is DW. Account for both.
    const placedTiles: PlacedTile[] = [
      makeTile('T', 1, 1, 4),
      makeTile('E', 1, 1, 5),
      makeTile('S', 1, 1, 6), // DL
      makeTile('T', 1, 1, 7), // DW
      makeTile('I', 1, 1, 8),
      makeTile('N', 1, 1, 9),
      makeTile('G', 2, 1, 10),
    ];

    const formedWords = [
      {
        word: 'TESTING',
        cells: [
          { row: 1, col: 4 },
          { row: 1, col: 5 },
          { row: 1, col: 6 },
          { row: 1, col: 7 },
          { row: 1, col: 8 },
          { row: 1, col: 9 },
          { row: 1, col: 10 },
        ],
      },
    ];

    // Letter sum: 1+1+1×2(DL)+1+1+1+2 = 9, ×2 (DW at 1,7) = 18, +50 bingo = 68
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(68);
  });

  // -----------------------------------------------------------------------
  // No bingo bonus for fewer than 7 tiles
  // -----------------------------------------------------------------------

  it('does not add bingo bonus when fewer than 7 tiles are placed', () => {
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [makeTile('A', 1, 2, 1), makeTile('T', 1, 2, 2)];

    const formedWords = [
      {
        word: 'AT',
        cells: [
          { row: 2, col: 1 },
          { row: 2, col: 2 },
        ],
      },
    ];

    // 1 + 1 = 2, no bingo
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Multiple formed words scored together
  // -----------------------------------------------------------------------

  it('sums scores from multiple formed words (main + cross words)', () => {
    // Existing word "AT" on row 3, cols 1-2 (already on board, all non-bonus).
    const board = createEmptyBoard();

    // Place existing tiles on the board.
    board[3][1].tile = makeTile('A', 1, 3, 1);
    board[3][2].tile = makeTile('T', 1, 3, 2);

    // Newly placed tiles: C at (2,1) and O at (2,2) — both non-bonus.
    const placedTiles: PlacedTile[] = [makeTile('C', 3, 2, 1), makeTile('O', 1, 2, 2)];

    // Three formed words:
    // 1) "CO" horizontally at row 2, cols 1-2 (both newly placed)
    // 2) "CA" vertically at col 1, rows 2-3 (C is new, A is existing)
    // 3) "OT" vertically at col 2, rows 2-3 (O is new, T is existing)
    const formedWords = [
      {
        word: 'CO',
        cells: [
          { row: 2, col: 1 },
          { row: 2, col: 2 },
        ],
      },
      {
        word: 'CA',
        cells: [
          { row: 2, col: 1 },
          { row: 3, col: 1 },
        ],
      },
      {
        word: 'OT',
        cells: [
          { row: 2, col: 2 },
          { row: 3, col: 2 },
        ],
      },
    ];

    // CO: 3 + 1 = 4
    // CA: 3 + 1 = 4
    // OT: 1 + 1 = 2
    // Total: 10
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Bonuses only apply to newly placed tiles, not existing board tiles
  // -----------------------------------------------------------------------

  it('does not apply bonuses to existing tiles on bonus squares', () => {
    // Place an existing tile on (1,3) which is DL. Then form a word through
    // it with a new tile. The existing tile should NOT get the DL bonus again.
    const board = createEmptyBoard();

    // "H" already on board at (1,3) — DL square.
    board[1][3].tile = makeTile('H', 4, 1, 3);

    // New tile "I" at (1,4) — no bonus.
    const placedTiles: PlacedTile[] = [makeTile('I', 1, 1, 4)];

    const formedWords = [
      {
        word: 'HI',
        cells: [
          { row: 1, col: 3 },
          { row: 1, col: 4 },
        ],
      },
    ];

    // H is existing on DL — no bonus reapplied: value = 4
    // I is new, no bonus: value = 1
    // Total: 5
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(5);
  });

  it('does not apply word bonus from an existing tile on a DW square', () => {
    const board = createEmptyBoard();

    // "A" already on board at (7,7) — DW (center).
    board[7][7].tile = makeTile('A', 1, 7, 7);

    // New tile "T" at (7,8) — no bonus.
    const placedTiles: PlacedTile[] = [makeTile('T', 1, 7, 8)];

    const formedWords = [
      {
        word: 'AT',
        cells: [
          { row: 7, col: 7 },
          { row: 7, col: 8 },
        ],
      },
    ];

    // A: 1 (DW not reapplied), T: 1
    // Word multiplier stays 1 because (7,7) is not newly placed.
    // Total: 2
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getEndGameBonus
// ---------------------------------------------------------------------------

describe('getEndGameBonus', () => {
  it('sums opponent hand values', () => {
    // Opponent has tiles worth 3, 1, 1, 10, 4
    expect(getEndGameBonus([3, 1, 1, 10, 4])).toBe(19);
  });

  it('returns 0 for an empty hand', () => {
    expect(getEndGameBonus([])).toBe(0);
  });

  it('handles a single tile', () => {
    expect(getEndGameBonus([8])).toBe(8);
  });
});
