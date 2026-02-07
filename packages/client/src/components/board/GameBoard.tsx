import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { PlacedTile } from '@blitztiles/shared';
import { BoardCell } from './BoardCell';
import { BlankTilePicker } from '../tiles/BlankTilePicker';
import { useGameStore } from '../../hooks/useGameStore';
import { usePinchZoom } from '../../hooks/usePinchZoom';
import { useScorePreview } from '../../hooks/useScorePreview';
import { useSettingsStore } from '../../hooks/useSettingsStore';
import './GameBoard.css';

export function GameBoard({ isDragging = false }: { isDragging?: boolean }) {
  const board = useGameStore((s) => s.board);
  const placedTiles = useGameStore((s) => s.placedTiles);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const currentHand = useGameStore((s) => s.currentHand);
  const placeTile = useGameStore((s) => s.placeTile);
  const removePlacedTile = useGameStore((s) => s.removePlacedTile);
  const setBlankLetter = useGameStore((s) => s.setBlankLetter);
  const phase = useGameStore((s) => s.phase);
  const lastMoveTiles = useGameStore((s) => s.lastMoveTiles);
  const autoZoomEnabled = useSettingsStore((s) => s.autoZoom);
  const scorePreviewEnabled = useSettingsStore((s) => s.scorePreview);
  const lastMoveHighlightEnabled = useSettingsStore((s) => s.lastMoveHighlight);

  const boardRef = useRef<HTMLDivElement>(null);
  const prevPlacedCount = useRef(placedTiles.length);

  const zoomEnabled = !selectedTileId && !isDragging;
  const {
    scale,
    translateX,
    translateY,
    wasPanningRef,
    handlers,
    resetZoom,
    zoomToCell,
    isZoomed,
  } = usePinchZoom(1, 2.5, zoomEnabled);

  // Auto-zoom to placed tile when first tile is placed and board is zoomed out.
  // Toggles the CSS class directly on the DOM to avoid setState-in-effect.
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const wasEmpty = prevPlacedCount.current === 0;
    prevPlacedCount.current = placedTiles.length;

    if (
      autoZoomEnabled &&
      wasEmpty &&
      placedTiles.length === 1 &&
      scaleRef.current <= 1.05 &&
      boardRef.current
    ) {
      const tile = placedTiles[0];
      const el = boardRef.current;
      // Let the placed tile render first, then start the zoom transition
      requestAnimationFrame(() => {
        el.classList.add('auto-zooming');
        const onEnd = () => {
          el.classList.remove('auto-zooming');
          el.removeEventListener('transitionend', onEnd);
        };
        el.addEventListener('transitionend', onEnd);
        // Board scale for 4-tile visible radius: 15 total tiles / 9 visible tiles ≈ 1.67x zoom
        zoomToCell(tile.row, tile.col, 15 / 9, el);
      });
    }
  }, [placedTiles, zoomToCell, autoZoomEnabled]);

  // Memoize Set creation to avoid recreating on every render
  const lastMoveSet = useMemo(
    () => new Set(lastMoveTiles.map((t) => `${t.row},${t.col}`)),
    [lastMoveTiles],
  );
  const pendingSet = useMemo(
    () => new Set(placedTiles.map((t) => `${t.row},${t.col}`)),
    [placedTiles],
  );

  const preview = useScorePreview();

  const [pendingBlank, setPendingBlank] = useState<{
    tileId: string;
    row: number;
    col: number;
  } | null>(null);

  // Compute the full word being formed (including existing board tiles)
  // so the highlight outline encompasses the entire word, not just placed tiles
  // Memoized to avoid expensive recalculation on every render
  const wordSet = useMemo(() => {
    if (placedTiles.length === 0 || board.length === 0) return pendingSet;

    const hasTile = (r: number, c: number) => board[r]?.[c]?.tile || pendingSet.has(`${r},${c}`);

    const rows = placedTiles.map((t) => t.row);
    const cols = placedTiles.map((t) => t.col);
    const cells = new Set<string>();

    // Horizontal word
    if (new Set(rows).size === 1) {
      const row = rows[0];
      let minCol = Math.min(...cols);
      let maxCol = Math.max(...cols);
      while (minCol > 0 && hasTile(row, minCol - 1)) minCol--;
      while (maxCol < 14 && hasTile(row, maxCol + 1)) maxCol++;
      for (let c = minCol; c <= maxCol; c++) cells.add(`${row},${c}`);
    }

    // Vertical word
    if (new Set(cols).size === 1) {
      const col = cols[0];
      let minRow = Math.min(...rows);
      let maxRow = Math.max(...rows);
      while (minRow > 0 && hasTile(minRow - 1, col)) minRow--;
      while (maxRow < 14 && hasTile(maxRow + 1, col)) maxRow++;
      for (let r = minRow; r <= maxRow; r++) cells.add(`${r},${col}`);
    }

    return cells.size > 0 ? cells : pendingSet;
  }, [placedTiles, board, pendingSet]);

  // Create Map-based lookup for O(1) tile lookup instead of O(n) array.find()
  // This is called 225 times per render (15x15 board), so performance matters
  const pendingTileMap = useMemo(() => {
    const map = new Map<string, PlacedTile>();
    for (const tile of placedTiles) {
      map.set(`${tile.row},${tile.col}`, tile);
    }
    return map;
  }, [placedTiles]);

  const getPendingTile = useCallback(
    (row: number, col: number): PlacedTile | undefined => {
      return pendingTileMap.get(`${row},${col}`);
    },
    [pendingTileMap],
  );

  // Score badge goes on the last cell of the word
  const scoreBadgeCell =
    preview.score !== null && placedTiles.length > 0
      ? (() => {
          const rows = placedTiles.map((t) => t.row);
          const cols = placedTiles.map((t) => t.col);
          const isHorizontal = new Set(rows).size === 1;
          // Use wordSet to find the actual end of the full word
          let endRow = isHorizontal ? rows[0] : Math.max(...rows);
          let endCol = isHorizontal ? Math.max(...cols) : cols[0];
          if (isHorizontal) {
            while (wordSet.has(`${endRow},${endCol + 1}`)) endCol++;
          } else {
            while (wordSet.has(`${endRow + 1},${endCol}`)) endRow++;
          }
          return { row: endRow, col: endCol };
        })()
      : null;

  if (!board || board.length === 0) return null;

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
      placeTile(selectedTileId, row, col);
      if (tile?.isBlank) {
        setPendingBlank({ tileId: selectedTileId, row, col });
      }
    }
  };

  return (
    <div className="game-board-container" {...handlers}>
      <div
        ref={boardRef}
        className="game-board"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {board.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            const isInWord = wordSet.has(`${rowIdx},${colIdx}`);
            const isLastMove = lastMoveHighlightEnabled && lastMoveSet.has(`${rowIdx},${colIdx}`);
            return (
              <BoardCell
                key={`${rowIdx}-${colIdx}`}
                cell={cell}
                pendingTile={getPendingTile(rowIdx, colIdx)}
                isSelected={false}
                isLastMove={isLastMove}
                pendingEdges={
                  isInWord
                    ? {
                        top: !wordSet.has(`${rowIdx - 1},${colIdx}`),
                        bottom: !wordSet.has(`${rowIdx + 1},${colIdx}`),
                        left: !wordSet.has(`${rowIdx},${colIdx - 1}`),
                        right: !wordSet.has(`${rowIdx},${colIdx + 1}`),
                      }
                    : undefined
                }
                lastMoveEdges={
                  isLastMove
                    ? {
                        top: !lastMoveSet.has(`${rowIdx - 1},${colIdx}`),
                        bottom: !lastMoveSet.has(`${rowIdx + 1},${colIdx}`),
                        left: !lastMoveSet.has(`${rowIdx},${colIdx - 1}`),
                        right: !lastMoveSet.has(`${rowIdx},${colIdx + 1}`),
                      }
                    : undefined
                }
                scorePreview={
                  scorePreviewEnabled &&
                  scoreBadgeCell?.row === rowIdx &&
                  scoreBadgeCell?.col === colIdx
                    ? preview.score
                    : undefined
                }
                onClick={() => handleCellClick(rowIdx, colIdx)}
              />
            );
          }),
        )}
      </div>
      {isZoomed && (
        <button className="zoom-reset-btn" onClick={resetZoom}>
          Reset Zoom
        </button>
      )}
      {pendingBlank && (
        <BlankTilePicker
          onSelect={(letter) => {
            setBlankLetter(pendingBlank.tileId, letter);
            setPendingBlank(null);
          }}
          onCancel={() => {
            removePlacedTile(pendingBlank.tileId);
            setPendingBlank(null);
          }}
        />
      )}
    </div>
  );
}
