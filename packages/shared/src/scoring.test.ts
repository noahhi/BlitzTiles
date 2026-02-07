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
    // Place "CAT" horizontally at row 6, cols 6-8.
    // Row 6, col 6 = DL, col 8 = DL — let's avoid those.
    // Row 4, cols 5-7: (4,5) = null, (4,6) = null, (4,7) = null — all plain.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('C', 3, 4, 5), // (4,5) = no bonus
      makeTile('A', 1, 4, 6), // (4,6) = no bonus
      makeTile('T', 1, 4, 7), // (4,7) = no bonus
    ];

    const formedWords = [
      {
        word: 'CAT',
        cells: [
          { row: 4, col: 5 },
          { row: 4, col: 6 },
          { row: 4, col: 7 },
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
    // (0,3) is DL. Place a tile worth 4 there.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('H', 4, 0, 3), // DL
      makeTile('A', 1, 0, 4), // no bonus
      makeTile('T', 1, 0, 5), // no bonus
    ];

    const formedWords = [
      {
        word: 'HAT',
        cells: [
          { row: 0, col: 3 },
          { row: 0, col: 4 },
          { row: 0, col: 5 },
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
    // (1,5) is TL. Place a tile worth 4 there.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('A', 1, 1, 4), // no bonus
      makeTile('F', 4, 1, 5), // TL
      makeTile('T', 1, 1, 6), // no bonus
    ];

    const formedWords = [
      {
        word: 'AFT',
        cells: [
          { row: 1, col: 4 },
          { row: 1, col: 5 },
          { row: 1, col: 6 },
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
    // (0,0) is TW.
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('G', 2, 0, 0), // TW
      makeTile('O', 1, 0, 1), // no bonus
    ];

    const formedWords = [
      {
        word: 'GO',
        cells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
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
    // (1,1) is DW and (4,4) is DW. Place a diagonal? No, Scrabble is rows/cols.
    // We need a word that crosses two DW squares in the same row or column.
    // DW squares on the diagonal: (1,1), (2,2), (3,3), (4,4).
    // A column isn't going to hit two of those. Let's think...
    //
    // Actually, for a horizontal word: row 7 has DW at (7,7). Row 0 has TW at
    // (0,0) and (0,7). A word from (0,0) to (0,7) would cross two TW squares:
    // that's 8 letters long.
    //
    // Simpler: place a word at row 0 crossing (0,0) TW and (0,7) TW.
    // That requires an 8-letter word. Let's just do it with tiles.
    const board = createEmptyBoard();

    // 8 tiles across row 0, cols 0–7
    const placedTiles: PlacedTile[] = [
      makeTile('A', 1, 0, 0), // TW
      makeTile('B', 3, 0, 1),
      makeTile('C', 3, 0, 2),
      makeTile('D', 2, 0, 3), // DL → letter bonus, not word bonus
      makeTile('E', 1, 0, 4),
      makeTile('F', 4, 0, 5),
      makeTile('G', 2, 0, 6),
      makeTile('H', 4, 0, 7), // TW
    ];

    const formedWords = [
      {
        word: 'ABCDEFGH',
        cells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 0, col: 4 },
          { row: 0, col: 5 },
          { row: 0, col: 6 },
          { row: 0, col: 7 },
        ],
      },
    ];

    // Letter scores: A=1, B=3, C=3, D=2×2(DL)=4, E=1, F=4, G=2, H=4
    // Sum = 1+3+3+4+1+4+2+4 = 22
    // Word multipliers: TW at (0,0) × TW at (0,7) = 3×3 = 9
    // 22 × 9 = 198
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(198);
  });

  // -----------------------------------------------------------------------
  // Blank tile on letter bonus still scores 0
  // -----------------------------------------------------------------------

  it('blank tile on a letter bonus square still scores 0', () => {
    // (0,3) is DL. Place a blank there (value 0).
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [
      makeTile('A', 0, 0, 3, true), // blank on DL — value stays 0
      makeTile('T', 1, 0, 4),
    ];

    const formedWords = [
      {
        word: 'AT',
        cells: [
          { row: 0, col: 3 },
          { row: 0, col: 4 },
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

    // Place 7 tiles across row 4, cols 1–7 (all non-bonus squares).
    // (4,4) is DW though, so the word will get doubled. Let's account for that.
    const placedTiles: PlacedTile[] = [
      makeTile('T', 1, 4, 1),
      makeTile('E', 1, 4, 2),
      makeTile('S', 1, 4, 3),
      makeTile('T', 1, 4, 4), // DW
      makeTile('I', 1, 4, 5),
      makeTile('N', 1, 4, 6),
      makeTile('G', 2, 4, 7),
    ];

    const formedWords = [
      {
        word: 'TESTING',
        cells: [
          { row: 4, col: 1 },
          { row: 4, col: 2 },
          { row: 4, col: 3 },
          { row: 4, col: 4 },
          { row: 4, col: 5 },
          { row: 4, col: 6 },
          { row: 4, col: 7 },
        ],
      },
    ];

    // Letter sum: 1+1+1+1+1+1+2 = 8, ×2 (DW at 4,4) = 16, +50 bingo = 66
    expect(scoreTurn(board, placedTiles, formedWords)).toBe(66);
  });

  // -----------------------------------------------------------------------
  // No bingo bonus for fewer than 7 tiles
  // -----------------------------------------------------------------------

  it('does not add bingo bonus when fewer than 7 tiles are placed', () => {
    const board = createEmptyBoard();
    const placedTiles: PlacedTile[] = [makeTile('A', 1, 4, 5), makeTile('T', 1, 4, 6)];

    const formedWords = [
      {
        word: 'AT',
        cells: [
          { row: 4, col: 5 },
          { row: 4, col: 6 },
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
    // Existing word "AT" on row 4, cols 5-6 (already on board).
    // New tile "C" placed at (3, 5) — forms "CAT" vertically down col 5
    //   and maybe "CA" isn't a word but let's just test scoring logic.
    // We also form the cross word by itself.
    const board = createEmptyBoard();

    // Place existing tiles on the board.
    board[4][5].tile = makeTile('A', 1, 4, 5);
    board[4][6].tile = makeTile('T', 1, 4, 6);

    // Newly placed tiles this turn: just the C at (3,5) — no bonus at (3,5).
    // Actually (3,5) is null in BONUS_MAP? Let me check: row 3 DL positions
    // are (3,0), (3,7), (3,14). (3,5) has no bonus. Good.
    const placedTiles: PlacedTile[] = [makeTile('C', 3, 3, 5), makeTile('O', 1, 3, 6)];

    // Two formed words:
    // 1) "CO" horizontally at row 3, cols 5-6 (both newly placed)
    // 2) "CA" vertically at col 5, rows 3-4 (C is new, A is existing)
    // 3) "OT" vertically at col 6, rows 3-4 (O is new, T is existing)
    const formedWords = [
      {
        word: 'CO',
        cells: [
          { row: 3, col: 5 },
          { row: 3, col: 6 },
        ],
      },
      {
        word: 'CA',
        cells: [
          { row: 3, col: 5 },
          { row: 4, col: 5 },
        ],
      },
      {
        word: 'OT',
        cells: [
          { row: 3, col: 6 },
          { row: 4, col: 6 },
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
    // Place an existing tile on (0,3) which is DL. Then form a word through
    // it with a new tile. The existing tile should NOT get the DL bonus again.
    const board = createEmptyBoard();

    // "H" already on board at (0,3) — DL square.
    board[0][3].tile = makeTile('H', 4, 0, 3);

    // New tile "I" at (0,4) — no bonus.
    const placedTiles: PlacedTile[] = [makeTile('I', 1, 0, 4)];

    const formedWords = [
      {
        word: 'HI',
        cells: [
          { row: 0, col: 3 },
          { row: 0, col: 4 },
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
