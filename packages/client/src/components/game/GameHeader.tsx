import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../hooks/useGameStore';
import { useTimer } from '../../hooks/useTimer';
import { SettingsPanel } from '../settings/SettingsPanel';
import './GameHeader.css';

export function GameHeader() {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const tileBagCount = useGameStore((s) => s.tileBagCount);
  const phase = useGameStore((s) => s.phase);
  const mode = useGameStore((s) => s.mode);
  const playerIndex = useGameStore((s) => s.playerIndex);
  const timer = useTimer();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  if (players.length < 2) return null;

  const handleLeave = () => {
    if (phase === 'playing') {
      if (!window.confirm('Leave the game? Your progress will be lost.')) return;
    }
    navigate('/');
  };

  const isOnline = mode === 'host' || mode === 'guest';
  const isMyTurn = isOnline ? currentPlayerIndex === playerIndex : true; // always "your turn" in local (shared device)

  // In online mode, label as "You" and "Opponent"
  const getLabel = (idx: number) => {
    if (!isOnline) return players[idx].name;
    return idx === playerIndex ? 'You' : 'Opponent';
  };

  return (
    <div className="game-header">
      {timer.urgency === 'critical' && timer.isRunning && <div className="critical-screen-flash" />}
      <button className="leave-btn" onClick={handleLeave} title="Back to menu">
        &#x2190;
      </button>
      <div
        className={`player-info ${currentPlayerIndex === 0 ? 'active' : ''} ${isOnline && playerIndex === 0 ? 'you' : ''}`}
      >
        <div className="player-name">
          {getLabel(0)}
          {isOnline && playerIndex === 0 && <span className="you-badge">YOU</span>}
        </div>
        {/* key remounts element on score change, triggering CSS bump animation */}
        <div className="player-score" key={`s0-${players[0].score}`}>
          {players[0].score}
        </div>
      </div>

      <div className="game-info-center">
        {timer.isRunning && (
          <div className={`turn-timer ${timer.urgency}`}>
            <svg className="timer-ring" viewBox="0 0 40 40">
              <circle className="timer-ring-bg" cx="20" cy="20" r="17" />
              <circle
                className="timer-ring-progress"
                cx="20"
                cy="20"
                r="17"
                strokeDasharray={`${(1 - timer.progress) * 106.8} 106.8`}
              />
            </svg>
            <span className="timer-digits">{timer.display}</span>
          </div>
        )}
        <div className="bag-count">{tileBagCount} tiles left</div>
        {phase === 'playing' && (
          <div className={`turn-indicator ${isMyTurn ? 'your-turn' : ''}`}>
            {isOnline
              ? isMyTurn
                ? 'Your turn'
                : "Opponent's turn"
              : `${players[currentPlayerIndex].name}'s turn`}
          </div>
        )}
      </div>

      <div
        className={`player-info ${currentPlayerIndex === 1 ? 'active' : ''} ${isOnline && playerIndex === 1 ? 'you' : ''}`}
      >
        <div className="player-name">
          {getLabel(1)}
          {isOnline && playerIndex === 1 && <span className="you-badge">YOU</span>}
        </div>
        <div className="player-score" key={`s1-${players[1].score}`}>
          {players[1].score}
        </div>
      </div>
      <button className="settings-btn" onClick={() => setShowSettings(true)} title="Settings">
        &#x2699;
      </button>
      {showSettings && (
        <div className="settings-modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>Settings</h3>
              <button className="settings-modal-close" onClick={() => setShowSettings(false)}>
                &#x2715;
              </button>
            </div>
            <SettingsPanel />
          </div>
        </div>
      )}
    </div>
  );
}
