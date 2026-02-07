import { useState } from 'react';
import { useGameStore } from '../../hooks/useGameStore';
import { useSettingsStore } from '../../hooks/useSettingsStore';
import './GameControls.css';

export function GameControls() {
  const placedTiles = useGameStore((s) => s.placedTiles);
  const submitMoveAction = useGameStore((s) => s.submitMove);
  const passTurnAction = useGameStore((s) => s.passTurn);
  const recallTiles = useGameStore((s) => s.recallTiles);
  const shuffleHand = useGameStore((s) => s.shuffleHand);
  const lastMoveError = useGameStore((s) => s.lastMoveError);
  const clearError = useGameStore((s) => s.clearError);
  const phase = useGameStore((s) => s.phase);
  const exchangeTilesAction = useGameStore((s) => s.exchangeTiles);
  const tileBagCount = useGameStore((s) => s.tileBagCount);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const exchangeMode = useGameStore((s) => s.exchangeMode);
  const exchangeSelection = useGameStore((s) => s.exchangeSelection);
  const setExchangeMode = useGameStore((s) => s.setExchangeMode);
  const leftHanded = useSettingsStore((s) => s.leftHanded);
  const scorePopupEnabled = useSettingsStore((s) => s.scorePopup);

  // Track which popup has been dismissed via onAnimationEnd
  const [dismissedAt, setDismissedAt] = useState(0);
  // Capture mount-time move count so we skip pre-existing moves
  const [mountMoveCount] = useState(() => moveHistory.length);

  // Derive popup from moveHistory data — no effect needed
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
  const showPopup =
    lastMove?.action === 'submit' &&
    lastMove.score > 0 &&
    moveHistory.length > mountMoveCount &&
    moveHistory.length > dismissedAt;

  if (phase !== 'playing') return null;

  const hasPlacedTiles = placedTiles.length > 0;

  const handleExchangeToggle = () => {
    setExchangeMode(!exchangeMode);
  };

  const handleExchangeConfirm = () => {
    if (exchangeSelection.size > 0) {
      exchangeTilesAction(Array.from(exchangeSelection));
    }
  };

  return (
    <div className="game-controls">
      {scorePopupEnabled && showPopup && lastMove && (
        <div
          key={moveHistory.length}
          className="score-popup"
          onAnimationEnd={() => setDismissedAt(moveHistory.length)}
        >
          +{lastMove.score}
        </div>
      )}
      {lastMoveError && (
        <div className="move-error" onClick={clearError}>
          {lastMoveError}
        </div>
      )}

      {exchangeMode ? (
        <div className="exchange-mode">
          <div className="exchange-prompt">Tap tiles to exchange</div>
          <div className="exchange-actions">
            <button className="btn-secondary" onClick={handleExchangeToggle}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleExchangeConfirm}
              disabled={exchangeSelection.size === 0}
            >
              Exchange {exchangeSelection.size} tile{exchangeSelection.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      ) : (
        <div className={`control-buttons${leftHanded ? ' left-handed' : ''}`}>
          <button
            className="btn-secondary"
            onClick={handleExchangeToggle}
            disabled={tileBagCount < 1}
          >
            Exchange
          </button>
          <button className="btn-secondary" onClick={passTurnAction}>
            Pass
          </button>
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
      )}
    </div>
  );
}
