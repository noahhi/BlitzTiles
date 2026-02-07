import { useGameStore } from '../../hooks/useGameStore';
import './GameOverModal.css';

export function GameOverModal() {
  const phase = useGameStore((s) => s.phase);
  const winnerIndex = useGameStore((s) => s.winnerIndex);
  const endReason = useGameStore((s) => s.endReason);
  const players = useGameStore((s) => s.players);
  const initLocalGame = useGameStore((s) => s.initLocalGame);

  if (phase !== 'finished') return null;

  const winnerName = winnerIndex !== null ? players[winnerIndex]?.name : null;
  const isDraw = winnerIndex === null;

  return (
    <div className="game-over-overlay">
      <div className="game-over-modal">
        <h2 className="game-over-title">Game Over</h2>

        {isDraw ? (
          <div className="game-over-result">It's a draw!</div>
        ) : (
          <div className="game-over-result">{winnerName} wins!</div>
        )}

        {endReason && <div className="game-over-reason">{endReason}</div>}

        <div className="final-scores">
          {players.map((p, i) => (
            <div key={i} className={`final-score ${i === winnerIndex ? 'winner' : ''}`}>
              <span className="final-name">{p.name}</span>
              <span className="final-pts">{p.score}</span>
            </div>
          ))}
        </div>

        <button className="btn-primary rematch-btn" onClick={() => initLocalGame()}>
          Play Again
        </button>
      </div>
    </div>
  );
}
