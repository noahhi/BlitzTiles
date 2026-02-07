/**
 * Board placement validation and word extraction for BlitzTiles.
 *
 * All functions are pure. The board is a 15x15 grid accessed as board[row][col].
 * Center square is (7,7).
 */

import type { Board, BoardCell, PlacedTile } from './types.js';
import { BOARD_SIZE, BONUS_MAP, CENTER } from './constants.js';

// ---------------------------------------------------------------------------
// Helper: create an empty board
// ---------------------------------------------------------------------------

/** Creates a fresh 15x15 board with no tiles and bonuses from BONUS_MAP. */
export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    const rowCells: BoardCell[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      rowCells.push({
        row,
        col,
        tile: null,
        bonus: BONUS_MAP[row][col],
      });
    }
    board.push(rowCells);
  }
  return board;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check if a position is within the 15x15 board. */
function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/** Check if a board cell already has a tile. */
function isOccupied(board: Board, row: number, col: number): boolean {
  return isInBounds(row, col) && board[row][col].tile !== null;
}

/**
 * Get the letter at a position, checking the new tiles first, then the board.
 * Returns null if the position is empty (no tile on board and not in newTiles).
 */
function getLetterAt(
  board: Board,
  row: number,
  col: number,
  newTiles: PlacedTile[],
): string | null {
  // Check new tiles first
  for (const t of newTiles) {
    if (t.row === row && t.col === col) {
      return t.designatedLetter;
    }
  }
  // Check existing board
  if (isInBounds(row, col) && board[row][col].tile !== null) {
    return board[row][col].tile!.designatedLetter;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates that newly placed tiles form a legal move on the board.
 *
 * Rules:
 * - At least one tile must be placed.
 * - All tiles must be within board bounds (0-14).
 * - All tiles must be on empty squares.
 * - All tiles must be in the same row OR same column.
 * - Tiles must form a contiguous line (gaps filled by existing board tiles).
 * - First move must cover center square (7,7).
 * - Subsequent moves must connect to at least one existing tile.
 */
export function isValidPlacement(
  board: Board,
  tiles: PlacedTile[],
): { valid: boolean; reason?: string } {
  // At least one tile must be placed
  if (tiles.length === 0) {
    return { valid: false, reason: 'No tiles placed' };
  }

  // All tiles must be in bounds
  for (const t of tiles) {
    if (!isInBounds(t.row, t.col)) {
      return { valid: false, reason: 'Tile out of bounds' };
    }
  }

  // All tiles must be on empty squares
  for (const t of tiles) {
    if (isOccupied(board, t.row, t.col)) {
      return { valid: false, reason: 'Tile placed on occupied square' };
    }
  }

  // All tiles must be in the same row or same column
  const allSameRow = tiles.every((t) => t.row === tiles[0].row);
  const allSameCol = tiles.every((t) => t.col === tiles[0].col);

  if (!allSameRow && !allSameCol) {
    return { valid: false, reason: 'Tiles must be in the same row or column' };
  }

  // Sort tiles by position along their axis
  const sorted = [...tiles].sort((a, b) => (allSameRow ? a.col - b.col : a.row - b.row));

  // Check contiguity: every cell between first and last must be occupied
  // (either by a new tile or an existing board tile)
  if (allSameRow) {
    const row = sorted[0].row;
    const minCol = sorted[0].col;
    const maxCol = sorted[sorted.length - 1].col;
    for (let col = minCol; col <= maxCol; col++) {
      const hasNewTile = tiles.some((t) => t.row === row && t.col === col);
      const hasExistingTile = isOccupied(board, row, col);
      if (!hasNewTile && !hasExistingTile) {
        return { valid: false, reason: 'Tiles must form a contiguous line' };
      }
    }
  } else {
    const col = sorted[0].col;
    const minRow = sorted[0].row;
    const maxRow = sorted[sorted.length - 1].row;
    for (let row = minRow; row <= maxRow; row++) {
      const hasNewTile = tiles.some((t) => t.row === row && t.col === col);
      const hasExistingTile = isOccupied(board, row, col);
      if (!hasNewTile && !hasExistingTile) {
        return { valid: false, reason: 'Tiles must form a contiguous line' };
      }
    }
  }

  // Determine if this is the first move (board is completely empty)
  const boardIsEmpty = board.every((row) => row.every((cell) => cell.tile === null));

  if (boardIsEmpty) {
    // First move must cover center square
    const coversCenter = tiles.some((t) => t.row === CENTER && t.col === CENTER);
    if (!coversCenter) {
      return { valid: false, reason: 'First move must cover center square' };
    }
  } else {
    // Subsequent moves: the contiguous line must touch at least one existing tile.
    // Check if any placed tile is adjacent to an existing tile, OR if the
    // contiguous line passes through an existing tile (already handled by
    // checking adjacency of the full span plus direct overlap).
    let connects = false;

    // Check if any existing tile is within the span (between first and last placed tile)
    if (allSameRow) {
      const row = sorted[0].row;
      const minCol = sorted[0].col;
      const maxCol = sorted[sorted.length - 1].col;
      for (let col = minCol; col <= maxCol; col++) {
        if (isOccupied(board, row, col)) {
          connects = true;
          break;
        }
      }
    } else {
      const col = sorted[0].col;
      const minRow = sorted[0].row;
      const maxRow = sorted[sorted.length - 1].row;
      for (let row = minRow; row <= maxRow; row++) {
        if (isOccupied(board, row, col)) {
          connects = true;
          break;
        }
      }
    }

    // Check if any placed tile is adjacent (up/down/left/right) to an existing tile
    if (!connects) {
      const directions = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const t of tiles) {
        for (const [dr, dc] of directions) {
          if (isOccupied(board, t.row + dr, t.col + dc)) {
            connects = true;
            break;
          }
        }
        if (connects) break;
      }
    }

    // Also check if the line extends into existing tiles beyond the placed span
    if (!connects) {
      if (allSameRow) {
        const row = sorted[0].row;
        const minCol = sorted[0].col;
        const maxCol = sorted[sorted.length - 1].col;
        if (isOccupied(board, row, minCol - 1) || isOccupied(board, row, maxCol + 1)) {
          connects = true;
        }
      } else {
        const col = sorted[0].col;
        const minRow = sorted[0].row;
        const maxRow = sorted[sorted.length - 1].row;
        if (isOccupied(board, minRow - 1, col) || isOccupied(board, maxRow + 1, col)) {
          connects = true;
        }
      }
    }

    if (!connects) {
      return {
        valid: false,
        reason: 'Tiles must connect to existing tiles on the board',
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Word extraction
// ---------------------------------------------------------------------------

/**
 * After placing tiles on the board, extract all newly formed words.
 *
 * - Temporarily places the new tiles on a board copy.
 * - Finds the main word along the direction of placement.
 * - Finds cross words perpendicular to each newly placed tile.
 * - Returns only words of length >= 2.
 */
export function getFormedWords(
  board: Board,
  tiles: PlacedTile[],
): { words: { word: string; cells: { row: number; col: number }[] }[] } {
  if (tiles.length === 0) {
    return { words: [] };
  }

  const words: { word: string; cells: { row: number; col: number }[] }[] = [];

  /**
   * Read a word along a direction starting from a position.
   * dr/dc define the direction to scan (e.g., 0,1 = horizontal right).
   * Scans backward first to find the start, then forward to collect the full word.
   */
  function readWord(
    startRow: number,
    startCol: number,
    dr: number,
    dc: number,
  ): { word: string; cells: { row: number; col: number }[] } | null {
    // Walk backward to find the beginning of the word
    let r = startRow;
    let c = startCol;
    while (isInBounds(r - dr, c - dc) && getLetterAt(board, r - dr, c - dc, tiles) !== null) {
      r -= dr;
      c -= dc;
    }

    // Walk forward to collect the word
    const word: string[] = [];
    const cells: { row: number; col: number }[] = [];
    while (isInBounds(r, c) && getLetterAt(board, r, c, tiles) !== null) {
      word.push(getLetterAt(board, r, c, tiles)!);
      cells.push({ row: r, col: c });
      r += dr;
      c += dc;
    }

    if (word.length >= 2) {
      return { word: word.join(''), cells };
    }
    return null;
  }

  // Determine direction of placement
  const allSameRow = tiles.every((t) => t.row === tiles[0].row);

  if (tiles.length === 1) {
    // Single tile: check both directions
    const horizontal = readWord(tiles[0].row, tiles[0].col, 0, 1);
    if (horizontal) words.push(horizontal);

    const vertical = readWord(tiles[0].row, tiles[0].col, 1, 0);
    if (vertical) words.push(vertical);
  } else {
    // Multiple tiles in a line
    if (allSameRow) {
      // Main word is horizontal
      const main = readWord(tiles[0].row, tiles[0].col, 0, 1);
      if (main) words.push(main);

      // Cross words (vertical) for each newly placed tile
      for (const t of tiles) {
        const cross = readWord(t.row, t.col, 1, 0);
        if (cross) words.push(cross);
      }
    } else {
      // Main word is vertical
      const main = readWord(tiles[0].row, tiles[0].col, 1, 0);
      if (main) words.push(main);

      // Cross words (horizontal) for each newly placed tile
      for (const t of tiles) {
        const cross = readWord(t.row, t.col, 0, 1);
        if (cross) words.push(cross);
      }
    }
  }

  return { words };
}
