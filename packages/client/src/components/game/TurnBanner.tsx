import { useEffect, useState, useRef, useMemo } from 'react';
import { useGameStore } from '../../hooks/useGameStore';
import './TurnBanner.css';

export function TurnBanner() {
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const mode = useGameStore((s) => s.mode);
  const playerIndex = useGameStore((s) => s.playerIndex);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);

  const [visible, setVisible] = useState(false);
  const prevPlayerRef = useRef(currentPlayerIndex);

  const text = useMemo(() => {
    if (players.length < 2) return '';
    const isOnline = mode === 'host' || mode === 'guest';
    const isMyTurn = isOnline ? currentPlayerIndex === playerIndex : true;
    if (isOnline) {
      return isMyTurn ? 'Your Turn!' : "Opponent's Turn";
    }
    return `${players[currentPlayerIndex].name}'s Turn`;
  }, [currentPlayerIndex, mode, playerIndex, players]);

  useEffect(() => {
    if (phase !== 'playing') return;
    if (players.length < 2) return;

    // Only show when turn actually changes (not on initial render)
    if (prevPlayerRef.current === currentPlayerIndex) return;
    prevPlayerRef.current = currentPlayerIndex;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [currentPlayerIndex, phase, players]);

  if (!visible) return null;

  return (
    <div className="turn-banner">
      <div className="turn-banner-text">{text}</div>
    </div>
  );
}
