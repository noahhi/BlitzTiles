import { useGameStore } from '../../hooks/useGameStore';
import { useSettingsStore } from '../../hooks/useSettingsStore';
import './GameControls.css';

export function RacingControls() {
  const placedTiles = useGameStore((s) => s.placedTiles);
  const submitMoveAction = useGameStore((s) => s.submitMove);
  const recallTiles = useGameStore((s) => s.recallTiles);
  const shuffleHand = useGameStore((s) => s.shuffleHand);
  const lastMoveError = useGameStore((s) => s.lastMoveError);
  const clearError = useGameStore((s) => s.clearError);
  const phase = useGameStore((s) => s.phase);
  const leftHanded = useSettingsStore((s) => s.leftHanded);

  if (phase !== 'playing') return null;

  const hasPlacedTiles = placedTiles.length > 0;

  return (
    <div className="game-controls">
      {lastMoveError && (
        <div className="move-error" onClick={clearError}>
          {lastMoveError}
        </div>
      )}
      <div className={`control-buttons${leftHanded ? ' left-handed' : ''}`}>
        {hasPlacedTiles ? (
          <button className="btn-secondary" onClick={recallTiles}>
            Recall
          </button>
        ) : (
          <button className="btn-secondary" onClick={shuffleHand}>
            Shuffle
          </button>
        )}
        <button className="btn-primary" onClick={submitMoveAction} disabled={!hasPlacedTiles}>
          Submit
        </button>
      </div>
    </div>
  );
}
