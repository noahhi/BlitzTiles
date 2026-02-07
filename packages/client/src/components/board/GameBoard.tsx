import { useState } from 'react';
import type { PlacedTile } from '@blitztiles/shared';
import { BoardCell } from './BoardCell';
import { BlankTilePicker } from '../tiles/BlankTilePicker';
import { useGameStore } from '../../hooks/useGameStore';
import { usePinchZoom } from '../../hooks/usePinchZoom';
import { useScorePreview } from '../../hooks/useScorePreview';
import './GameBoard.css';

export function GameBoard({ isDragging = false }: { isDragging?: boolean }) {
  const board = useGameStore((s) => s.board);
  const placedTiles = useGameStore((s) => s.placedTiles);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const currentHand = useGameStore((s) => s.currentHand);
  const placeTile = useGameStore((s) => s.placeTile);
  const removePlacedTile = useGameStore((s) => s.removePlacedTile);
  const phase = useGameStore((s) => s.phase);
  const lastMoveTiles = useGameStore((s) => s.lastMoveTiles);

  const zoomEnabled = !selectedTileId && !isDragging;
  const { scale, translateX, translateY, wasPanningRef, handlers, resetZoom, isZoomed } =
    usePinchZoom(1, 2.5, zoomEnabled);
  const lastMoveSet = new Set(lastMoveTiles.map((t) => `${t.row},${t.col}`));
  const pendingSet = new Set(placedTiles.map((t) => `${t.row},${t.col}`));
  const preview = useScorePreview();

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
    if (wasPanningRef.current) return;

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
    <div className="game-board-container" {...handlers}>
      <div
        className="game-board"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {board.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            const isPending = pendingSet.has(`${rowIdx},${colIdx}`);
            return (
              <BoardCell
                key={`${rowIdx}-${colIdx}`}
                cell={cell}
                pendingTile={getPendingTile(rowIdx, colIdx)}
                isSelected={false}
                isLastMove={lastMoveSet.has(`${rowIdx},${colIdx}`)}
                pendingEdges={
                  isPending
                    ? {
                        top: !pendingSet.has(`${rowIdx - 1},${colIdx}`),
                        bottom: !pendingSet.has(`${rowIdx + 1},${colIdx}`),
                        left: !pendingSet.has(`${rowIdx},${colIdx - 1}`),
                        right: !pendingSet.has(`${rowIdx},${colIdx + 1}`),
                      }
                    : undefined
                }
                onClick={() => handleCellClick(rowIdx, colIdx)}
              />
            );
          }),
        )}
        {preview.score !== null &&
          placedTiles.length > 0 &&
          (() => {
            // Position badge at end of word: rightmost for horizontal, bottommost for vertical
            const rows = placedTiles.map((t) => t.row);
            const cols = placedTiles.map((t) => t.col);
            const isHorizontal = new Set(rows).size === 1;
            const endRow = isHorizontal ? rows[0] : Math.max(...rows);
            const endCol = isHorizontal ? Math.max(...cols) : cols[0];
            // Place badge in the next cell after the word end
            const badgeRow = isHorizontal ? endRow : endRow + 1;
            const badgeCol = isHorizontal ? endCol + 1 : endCol;
            return (
              <div
                className="score-badge"
                style={{
                  gridRow: badgeRow + 1,
                  gridColumn: badgeCol + 1,
                }}
              >
                +{preview.score}
              </div>
            );
          })()}
      </div>
      {isZoomed && (
        <button className="zoom-reset-btn" onClick={resetZoom}>
          Reset Zoom
        </button>
      )}
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
