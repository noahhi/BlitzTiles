import type { PlacedTile } from '@blitztiles/shared';
import { BoardCell } from './BoardCell';
import { useGameStore } from '../../hooks/useGameStore';
import './GameBoard.css';

export function GameBoard() {
  const board = useGameStore((s) => s.board);
  const placedTiles = useGameStore((s) => s.placedTiles);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const placeTile = useGameStore((s) => s.placeTile);
  const removePlacedTile = useGameStore((s) => s.removePlacedTile);
  const phase = useGameStore((s) => s.phase);

  if (!board || board.length === 0) return null;

  const getPendingTile = (row: number, col: number): PlacedTile | undefined => {
    return placedTiles.find((t) => t.row === row && t.col === col);
  };

  const handleCellClick = (row: number, col: number) => {
    if (phase !== 'playing') return;

    const pending = getPendingTile(row, col);
    if (pending) {
      // Clicking a pending tile removes it from the board
      removePlacedTile(pending.id);
      return;
    }

    // If a tile is selected and the cell is empty, place it
    if (selectedTileId && !board[row][col].tile) {
      placeTile(selectedTileId, row, col);
    }
  };

  return (
    <div className="game-board-container">
      <div className="game-board">
        {board.map((row, rowIdx) =>
          row.map((cell, colIdx) => (
            <BoardCell
              key={`${rowIdx}-${colIdx}`}
              cell={cell}
              pendingTile={getPendingTile(rowIdx, colIdx)}
              isSelected={false}
              onClick={() => handleCellClick(rowIdx, colIdx)}
            />
          )),
        )}
      </div>
    </div>
  );
}
