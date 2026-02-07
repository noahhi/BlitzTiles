import { describe, it, expect } from 'vitest';
import { createEmptyBoard, isValidPlacement, getFormedWords } from './board.js';
import type { Board, PlacedTile } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTile(letter: string, row: number, col: number): PlacedTile {
  return {
    id: `t-${letter}-${row}-${col}`,
    letter,
    value: 1,
    isBlank: false,
    row,
    col,
    designatedLetter: letter,
  };
}

/** Place tiles directly onto the board (mutates). Used to set up "existing" board state. */
function placeOnBoard(board: Board, tiles: PlacedTile[]): void {
  for (const t of tiles) {
    board[t.row][t.col].tile = t;
  }
}

// ---------------------------------------------------------------------------
// createEmptyBoard
// ---------------------------------------------------------------------------

describe('createEmptyBoard', () => {
  it('creates a 15x15 grid', () => {
    const board = createEmptyBoard();
    expect(board.length).toBe(15);
    for (const row of board) {
      expect(row.length).toBe(15);
    }
  });

  it('all cells have null tiles', () => {
    const board = createEmptyBoard();
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        expect(board[r][c].tile).toBeNull();
      }
    }
  });

  it('cells have correct row and col', () => {
    const board = createEmptyBoard();
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        expect(board[r][c].row).toBe(r);
        expect(board[r][c].col).toBe(c);
      }
    }
  });

  it('center square (7,7) has DW bonus', () => {
    const board = createEmptyBoard();
    expect(board[7][7].bonus).toBe('DW');
  });

  it('corner squares have TW bonus', () => {
    const board = createEmptyBoard();
    expect(board[0][0].bonus).toBe('TW');
    expect(board[0][14].bonus).toBe('TW');
    expect(board[14][0].bonus).toBe('TW');
    expect(board[14][14].bonus).toBe('TW');
  });
});

// ---------------------------------------------------------------------------
// isValidPlacement
// ---------------------------------------------------------------------------

describe('isValidPlacement', () => {
  it('valid first move covering center square', () => {
    const board = createEmptyBoard();
    const tiles = [
      makeTile('H', 7, 6),
      makeTile('E', 7, 7),
      makeTile('L', 7, 8),
      makeTile('P', 7, 9),
    ];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('invalid first move not covering center', () => {
    const board = createEmptyBoard();
    const tiles = [makeTile('H', 0, 0), makeTile('I', 0, 1)];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/center/i);
  });

  it('valid horizontal placement', () => {
    const board = createEmptyBoard();
    // Place an existing word on the board first
    placeOnBoard(board, [makeTile('C', 7, 7), makeTile('A', 7, 8), makeTile('T', 7, 9)]);
    // Place "MAT" vertically overlapping at T, but let's do horizontal extending
    const tiles = [makeTile('S', 7, 10)];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(true);
  });

  it('valid vertical placement', () => {
    const board = createEmptyBoard();
    placeOnBoard(board, [makeTile('C', 7, 7), makeTile('A', 7, 8), makeTile('T', 7, 9)]);
    // Place tiles vertically from row 6 to row 8 at col 7, connecting to C at (7,7)
    const tiles = [makeTile('A', 6, 7), makeTile('R', 8, 7)];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(true);
  });

  it('invalid: tiles not in same row or column (diagonal)', () => {
    const board = createEmptyBoard();
    const tiles = [makeTile('A', 7, 7), makeTile('B', 8, 8)];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/same row or column/i);
  });

  it('invalid: gap in placed tiles with no existing tile to fill it', () => {
    const board = createEmptyBoard();
    const tiles = [
      makeTile('A', 7, 6),
      makeTile('B', 7, 7),
      // gap at (7, 8) — no existing tile there
      makeTile('C', 7, 9),
    ];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/contiguous/i);
  });

  it('valid: gap in placed tiles filled by existing board tile', () => {
    const board = createEmptyBoard();
    placeOnBoard(board, [makeTile('X', 7, 8)]);
    const tiles = [
      makeTile('A', 7, 7),
      // existing tile at (7, 8)
      makeTile('C', 7, 9),
    ];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(true);
  });

  it('invalid: tile out of bounds', () => {
    const board = createEmptyBoard();
    const tile: PlacedTile = {
      id: 't-A-15-0',
      letter: 'A',
      value: 1,
      isBlank: false,
      row: 15,
      col: 0,
      designatedLetter: 'A',
    };
    const result = isValidPlacement(board, [tile]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/bounds/i);
  });

  it('invalid: tile on occupied square', () => {
    const board = createEmptyBoard();
    placeOnBoard(board, [makeTile('X', 7, 7)]);
    const tiles = [makeTile('A', 7, 7)];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/occupied/i);
  });

  it('invalid: no tiles placed (empty array)', () => {
    const board = createEmptyBoard();
    const result = isValidPlacement(board, []);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no tiles/i);
  });

  it('valid: subsequent move connecting to existing tiles', () => {
    const board = createEmptyBoard();
    placeOnBoard(board, [
      makeTile('H', 7, 5),
      makeTile('E', 7, 6),
      makeTile('L', 7, 7),
      makeTile('L', 7, 8),
      makeTile('O', 7, 9),
    ]);
    // Place "BE" vertically at col 5, rows 6-7, connecting to H at (7,5)
    const tiles = [makeTile('B', 6, 5)];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(true);
  });

  it('invalid: subsequent move not connecting to any existing tile (isolated)', () => {
    const board = createEmptyBoard();
    placeOnBoard(board, [makeTile('H', 7, 7), makeTile('I', 7, 8)]);
    // Place tiles far away with no connection
    const tiles = [makeTile('A', 0, 0), makeTile('B', 0, 1)];
    const result = isValidPlacement(board, tiles);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/connect/i);
  });
});

// ---------------------------------------------------------------------------
// getFormedWords
// ---------------------------------------------------------------------------

describe('getFormedWords', () => {
  it('single horizontal word', () => {
    const board = createEmptyBoard();
    const tiles = [makeTile('C', 7, 7), makeTile('A', 7, 8), makeTile('T', 7, 9)];
    const result = getFormedWords(board, tiles);
    expect(result.words).toHaveLength(1);
    expect(result.words[0].word).toBe('CAT');
    expect(result.words[0].cells).toEqual([
      { row: 7, col: 7 },
      { row: 7, col: 8 },
      { row: 7, col: 9 },
    ]);
  });

  it('single vertical word', () => {
    const board = createEmptyBoard();
    const tiles = [makeTile('D', 5, 7), makeTile('O', 6, 7), makeTile('G', 7, 7)];
    const result = getFormedWords(board, tiles);
    expect(result.words).toHaveLength(1);
    expect(result.words[0].word).toBe('DOG');
    expect(result.words[0].cells).toEqual([
      { row: 5, col: 7 },
      { row: 6, col: 7 },
      { row: 7, col: 7 },
    ]);
  });

  it('cross word formed', () => {
    const board = createEmptyBoard();
    // Place "CAT" horizontally first
    placeOnBoard(board, [makeTile('C', 7, 7), makeTile('A', 7, 8), makeTile('T', 7, 9)]);
    // Place "O" above "A" and "R" below "A" to form "OAR" vertically
    const tiles = [makeTile('O', 6, 8), makeTile('R', 8, 8)];
    const result = getFormedWords(board, tiles);
    // Should find the main vertical word "OAR" and no other words since
    // the individual cross words for O and R don't form 2+ letter words
    expect(result.words).toHaveLength(1);
    expect(result.words[0].word).toBe('OAR');
    expect(result.words[0].cells).toEqual([
      { row: 6, col: 8 },
      { row: 7, col: 8 },
      { row: 8, col: 8 },
    ]);
  });

  it('multiple cross words from one play', () => {
    const board = createEmptyBoard();
    // Place "CAT" horizontally at row 7
    placeOnBoard(board, [makeTile('C', 7, 7), makeTile('A', 7, 8), makeTile('T', 7, 9)]);
    // Place "DOG" horizontally at row 8, cols 7-9
    // This creates cross words: CD, AO, TG plus the main word DOG
    const tiles = [makeTile('D', 8, 7), makeTile('O', 8, 8), makeTile('G', 8, 9)];
    const result = getFormedWords(board, tiles);
    const wordStrings = result.words.map((w) => w.word).sort();
    // Main word: DOG, cross words: CD, AO, TG
    expect(wordStrings).toEqual(['AO', 'CD', 'DOG', 'TG']);
  });

  it('single tile forming words in both directions', () => {
    const board = createEmptyBoard();
    // Place "CA_" horizontally and "_A_" vertically so placing one tile forms both
    placeOnBoard(board, [
      makeTile('C', 7, 7),
      makeTile('A', 7, 8),
      // vertical: tiles above and below (7, 9)
      makeTile('O', 6, 9),
      makeTile('E', 8, 9),
    ]);
    // Place "T" at (7, 9) to form "CAT" horizontally and "OTE" vertically
    const tiles = [makeTile('T', 7, 9)];
    const result = getFormedWords(board, tiles);
    const wordStrings = result.words.map((w) => w.word).sort();
    expect(wordStrings).toEqual(['CAT', 'OTE']);
  });

  it('word extending existing tiles', () => {
    const board = createEmptyBoard();
    // Place "HE" on the board
    placeOnBoard(board, [makeTile('H', 7, 7), makeTile('E', 7, 8)]);
    // Place "LP" to extend to "HELP"
    const tiles = [makeTile('L', 7, 9), makeTile('P', 7, 10)];
    const result = getFormedWords(board, tiles);
    expect(result.words).toHaveLength(1);
    expect(result.words[0].word).toBe('HELP');
    expect(result.words[0].cells).toEqual([
      { row: 7, col: 7 },
      { row: 7, col: 8 },
      { row: 7, col: 9 },
      { row: 7, col: 10 },
    ]);
  });

  it('returns empty array when no tiles are placed', () => {
    const board = createEmptyBoard();
    const result = getFormedWords(board, []);
    expect(result.words).toEqual([]);
  });

  it('does not return single-letter words', () => {
    const board = createEmptyBoard();
    // Place a single tile with no neighbors
    const tiles = [makeTile('A', 7, 7)];
    const result = getFormedWords(board, tiles);
    expect(result.words).toHaveLength(0);
  });
});
