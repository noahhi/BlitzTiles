import { useEffect, useCallback } from 'react';
import { useGameStore } from './useGameStore';

/**
 * Hook that enables keyboard controls for tile placement.
 *
 * Controls:
 * - Letter keys (A-Z): Place tile from rack at cursor position
 * - Arrow keys: Move cursor in that direction
 * - Delete/Backspace: Remove tile at cursor position and move cursor backward
 * - Tab: Toggle horizontal/vertical direction
 * - Escape: Clear cursor
 * - Enter: Submit move
 */
export function useKeyboardControls(enabled: boolean = true) {
  const phase = useGameStore((s) => s.phase);
  const cursorPosition = useGameStore((s) => s.cursorPosition);
  const cursorDirection = useGameStore((s) => s.cursorDirection);
  const currentHand = useGameStore((s) => s.currentHand);
  const placedTiles = useGameStore((s) => s.placedTiles);
  const board = useGameStore((s) => s.board);
  const exchangeMode = useGameStore((s) => s.exchangeMode);

  const placeTile = useGameStore((s) => s.placeTile);
  const removePlacedTile = useGameStore((s) => s.removePlacedTile);
  const setCursor = useGameStore((s) => s.setCursor);
  const clearCursor = useGameStore((s) => s.clearCursor);
  const moveCursor = useGameStore((s) => s.moveCursor);
  const toggleCursorDirection = useGameStore((s) => s.toggleCursorDirection);
  const submitMove = useGameStore((s) => s.submitMove);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if not enabled or not playing
      if (!enabled || phase !== 'playing' || exchangeMode) return;

      // Ignore if typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Ignore if modal is open (BlankTilePicker uses buttons, not inputs)
      if (document.querySelector('.blank-tile-picker')) return;

      const key = event.key;

      // Arrow keys: move cursor
      if (key === 'ArrowUp') {
        event.preventDefault();
        moveCursor('up');
        return;
      }
      if (key === 'ArrowDown') {
        event.preventDefault();
        moveCursor('down');
        return;
      }
      if (key === 'ArrowLeft') {
        event.preventDefault();
        moveCursor('left');
        return;
      }
      if (key === 'ArrowRight') {
        event.preventDefault();
        moveCursor('right');
        return;
      }

      // Escape: clear cursor
      if (key === 'Escape') {
        event.preventDefault();
        clearCursor();
        return;
      }

      // Tab: toggle direction
      if (key === 'Tab') {
        event.preventDefault();
        toggleCursorDirection();
        return;
      }

      // Enter: submit move
      if (key === 'Enter') {
        event.preventDefault();
        if (placedTiles.length > 0) {
          submitMove();
        }
        return;
      }

      // Delete/Backspace: remove tile at cursor, then move cursor back
      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        if (!cursorPosition) return;

        const { row, col } = cursorPosition;
        const pending = placedTiles.find((t) => t.row === row && t.col === col);
        if (pending) {
          removePlacedTile(pending.id);
        }

        // Move cursor back in the current direction (like crossword navigation)
        if (cursorDirection === 'horizontal') {
          moveCursor('left');
        } else {
          moveCursor('up');
        }
        return;
      }

      // Letter keys (A-Z): place tile at cursor
      const letter = key.toUpperCase();
      if (letter.length === 1 && letter >= 'A' && letter <= 'Z') {
        event.preventDefault();

        // Initialize cursor at center if not set
        if (!cursorPosition) {
          setCursor(7, 7);
          return;
        }

        const { row, col } = cursorPosition;

        // Check if cell is already occupied
        if (board[row]?.[col]?.tile) return;
        const pending = placedTiles.find((t) => t.row === row && t.col === col);
        if (pending) return;

        // Find matching tile in hand (prefer exact match over blank)
        let tileToPlace = currentHand.find(
          (t) => t.letter === letter && !placedTiles.some((p) => p.id === t.id),
        );

        // If no exact match, try blank tile
        if (!tileToPlace) {
          tileToPlace = currentHand.find(
            (t) => t.isBlank && !placedTiles.some((p) => p.id === t.id),
          );
        }

        if (!tileToPlace) return;

        // Place the tile (if blank, designatedLetter will be set)
        if (tileToPlace.isBlank) {
          placeTile(tileToPlace.id, row, col, letter);
        } else {
          placeTile(tileToPlace.id, row, col);
        }

        // Auto-advance cursor in current direction
        if (cursorDirection === 'horizontal') {
          if (col < 14) {
            setCursor(row, col + 1);
          }
        } else {
          if (row < 14) {
            setCursor(row + 1, col);
          }
        }
      }
    },
    [
      enabled,
      phase,
      exchangeMode,
      cursorPosition,
      cursorDirection,
      currentHand,
      placedTiles,
      board,
      placeTile,
      removePlacedTile,
      setCursor,
      clearCursor,
      moveCursor,
      toggleCursorDirection,
      submitMove,
    ],
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}
