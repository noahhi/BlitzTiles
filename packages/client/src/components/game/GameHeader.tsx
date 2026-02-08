import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../hooks/useGameStore';
import { useTimer } from '../../hooks/useTimer';
import { useSettingsStore } from '../../hooks/useSettingsStore';
import { SettingsPanel } from '../settings/SettingsPanel';
import './GameHeader.css';

const TimerDisplay = React.memo(function TimerDisplay({
  isSpectator = false,
}: {
  isSpectator?: boolean;
}) {
  const timerUrgency = useSettingsStore((s) => s.timerUrgency);
  const { display, urgency, progress, isRunning } = useTimer();

  if (!isRunning) return null;

  // Spectators see the timer but without urgency effects
  const showUrgency = timerUrgency && !isSpectator;

  return (
    <>
      {showUrgency && urgency === 'critical' && <div className="critical-screen-flash" />}
      <div className={`turn-timer ${showUrgency ? urgency : 'normal'}`}>
        <svg className="timer-ring" viewBox="0 0 40 40">
          <circle className="timer-ring-bg" cx="20" cy="20" r="17" />
          <circle
            className="timer-ring-progress"
            cx="20"
            cy="20"
            r="17"
            strokeDasharray={`${(1 - progress) * 106.8} 106.8`}
          />
        </svg>
        <span className="timer-digits">{display}</span>
      </div>
    </>
  );
});

export function GameHeader({ isSpectator = false }: { isSpectator?: boolean }) {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const tileBagCount = useGameStore((s) => s.tileBagCount);
  const phase = useGameStore((s) => s.phase);
  const mode = useGameStore((s) => s.mode);
  const playerIndex = useGameStore((s) => s.playerIndex);
  const config = useGameStore((s) => s.config);
  const updateConfig = useGameStore((s) => s.updateConfig);
  const gameVariant = useGameStore((s) => s.gameVariant);
  const racingRound = useGameStore((s) => s.racingRound);
  const roomCode = useGameStore((s) => s._roomCode);
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  const spectateUrl = roomCode
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/game?mode=spectator&code=${roomCode}`
    : null;

  const handleCopySpectateLink = useCallback(async () => {
    if (!spectateUrl) return;
    try {
      await navigator.clipboard.writeText(spectateUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = spectateUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [spectateUrl]);

  const toggleSpectatorHands = () => {
    updateConfig({ spectatorHandsVisible: !config.spectatorHandsVisible });
  };

  if (players.length < 2) return null;

  const handleLeave = () => {
    if (phase === 'playing' && !isSpectator) {
      if (!window.confirm('Leave the game? Your progress will be lost.')) return;
    }
    navigate('/');
  };

  const isOnline = mode === 'host' || mode === 'guest' || mode === 'spectator';
  const isRacing = gameVariant === 'racing';
  const isMyTurn =
    isSpectator || isRacing ? true : isOnline ? currentPlayerIndex === playerIndex : true;

  // Label players based on mode
  const getLabel = (idx: number) => {
    if (isSpectator) {
      return players[idx].name; // Show actual names for spectators
    }
    if (!isOnline) return players[idx].name;
    return idx === playerIndex ? 'You' : 'Opponent';
  };

  return (
    <div className="game-header">
      <TimerDisplay isSpectator={isSpectator} />
      <button className="leave-btn" onClick={handleLeave} title="Back to menu">
        &#x2190;
      </button>
      <div
        className={`player-info ${isRacing || currentPlayerIndex === 0 ? 'active' : ''} ${!isSpectator && isOnline && playerIndex === 0 ? 'you' : ''}`}
      >
        <div className="player-name">
          {getLabel(0)}
          {!isSpectator && isOnline && playerIndex === 0 && <span className="you-badge">YOU</span>}
        </div>
        {/* key remounts element on score change, triggering CSS bump animation */}
        <div className="player-score" key={`s0-${players[0].score}`}>
          {players[0].score}
        </div>
      </div>

      <div className="game-info-center">
        <TimerDisplay isSpectator={isSpectator} />
        <div className="bag-count">{tileBagCount} tiles left</div>
        {phase === 'playing' && (
          <div className={`turn-indicator ${!isSpectator && isMyTurn ? 'your-turn' : ''}`}>
            {isSpectator
              ? `${players[currentPlayerIndex].name}'s turn`
              : isRacing
                ? `Round ${racingRound ?? 1}`
                : isOnline
                  ? isMyTurn
                    ? 'Your turn'
                    : "Opponent's turn"
                  : `${players[currentPlayerIndex].name}'s turn`}
          </div>
        )}
      </div>

      <div
        className={`player-info ${isRacing || currentPlayerIndex === 1 ? 'active' : ''} ${!isSpectator && isOnline && playerIndex === 1 ? 'you' : ''}`}
      >
        <div className="player-name">
          {getLabel(1)}
          {!isSpectator && isOnline && playerIndex === 1 && <span className="you-badge">YOU</span>}
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
            {isOnline && spectateUrl && (
              <div className="spectator-settings-ingame">
                <h4>Spectators</h4>
                <button className="btn-copy-spectate" onClick={handleCopySpectateLink}>
                  {copied ? 'Copied!' : 'Copy Spectate Link'}
                </button>
                {mode === 'host' && (
                  <label className="spectator-toggle">
                    <input
                      type="checkbox"
                      checked={config.spectatorHandsVisible ?? false}
                      onChange={() => toggleSpectatorHands()}
                    />
                    <span>Show player hands to spectators</span>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
