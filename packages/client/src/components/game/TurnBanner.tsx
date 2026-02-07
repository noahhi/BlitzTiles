import { useState, useMemo } from 'react';
import { useGameStore } from '../../hooks/useGameStore';
import './TurnBanner.css';

export function TurnBanner() {
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const mode = useGameStore((s) => s.mode);
  const playerIndex = useGameStore((s) => s.playerIndex);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const moveHistory = useGameStore((s) => s.moveHistory);

  // Track which banner has been dismissed via onAnimationEnd
  const [dismissedAt, setDismissedAt] = useState(0);
  // Capture mount-time move count so we skip pre-existing moves
  const [mountMoveCount] = useState(() => moveHistory.length);

  const text = useMemo(() => {
    if (players.length < 2) return '';
    const isOnline = mode === 'host' || mode === 'guest';
    const isMyTurn = isOnline ? currentPlayerIndex === playerIndex : true;
    if (isOnline) {
      return isMyTurn ? 'Your Turn!' : "Opponent's Turn";
    }
    return `${players[currentPlayerIndex].name}'s Turn`;
  }, [currentPlayerIndex, mode, playerIndex, players]);

  // Derive visibility from moveHistory — no effect needed
  const showBanner =
    phase === 'playing' &&
    players.length >= 2 &&
    moveHistory.length > mountMoveCount &&
    moveHistory.length > dismissedAt;

  if (!showBanner) return null;

  return (
    <div
      className="turn-banner"
      key={moveHistory.length}
      onAnimationEnd={() => setDismissedAt(moveHistory.length)}
    >
      <div className="turn-banner-text">{text}</div>
    </div>
  );
}
