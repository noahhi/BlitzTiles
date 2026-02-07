import { useMemo } from 'react';
import { useGameStore } from './useGameStore';
import { isValidPlacement, getFormedWords, scoreTurn } from '@blitztiles/shared';

export interface ScorePreview {
  score: number | null;
  words: string[];
  isValid: boolean;
}

export function useScorePreview(): ScorePreview {
  const board = useGameStore((s) => s.board);
  const placedTiles = useGameStore((s) => s.placedTiles);

  return useMemo(() => {
    if (placedTiles.length === 0 || board.length === 0) {
      return { score: null, words: [], isValid: false };
    }

    const placement = isValidPlacement(board, placedTiles);
    if (!placement.valid) {
      return { score: null, words: [], isValid: false };
    }

    const { words: formedWords } = getFormedWords(board, placedTiles);
    if (formedWords.length === 0) {
      return { score: null, words: [], isValid: false };
    }

    const score = scoreTurn(board, placedTiles, formedWords);
    return {
      score,
      words: formedWords.map((w) => w.word),
      isValid: true,
    };
  }, [board, placedTiles]);
}
