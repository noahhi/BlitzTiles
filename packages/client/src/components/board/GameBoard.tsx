import { useState } from 'react';
import type { PlacedTile } from '@blitztiles/shared';
import { BoardCell } from './BoardCell';
import { BlankTilePicker } from '../tiles/BlankTilePicker';
import { useGameStore } from '../../hooks/useGameStore';
import './GameBoard.css';

export function GameBoard() {
  const board = useGameStore((s) => s.board);
  const placedTiles = useGameStore((s) => s.placedTiles);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const currentHand = useGameStore((s) => s.currentHand);
  const placeTile = useGameStore((s) => s.placeTile);
  const removePlacedTile = useGameStore((s) => s.removePlacedTile);
  const phase = useGameStore((s) => s.phase);

  const [pendingBlank, setPendingBlank] = useState<{
    tileId: string;
    row: number;
    col: number;
  } | null>(null);

  if (!board || board.length === 0) return null;

  const getPendingTile = (row: number, col: number): PlacedTile | undefined => {
    return placedTiles.find((t) => t.row === row && t.col === col);
  };

  const handleCellClick = (row: number, col: number) => {
    if (phase !== 'playing') return;

    const pending = getPendingTile(row, col);
    if (pending) {
      removePlacedTile(pending.id);
      return;
    }

    if (selectedTileId && !board[row][col].tile) {
      const tile = currentHand.find((t) => t.id === selectedTileId);
      if (tile?.isBlank) {
        setPendingBlank({ tileId: selectedTileId, row, col });
      } else {
        placeTile(selectedTileId, row, col);
      }
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
      {pendingBlank && (
        <BlankTilePicker
          onSelect={(letter) => {
            placeTile(pendingBlank.tileId, pendingBlank.row, pendingBlank.col, letter);
            setPendingBlank(null);
          }}
          onCancel={() => setPendingBlank(null)}
        />
      )}
    </div>
  );
}
