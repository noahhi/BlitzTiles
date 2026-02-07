import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import './HomePage.css';

export function HomePage() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length >= 3) {
      navigate(`/game?mode=guest&code=${code}`);
    }
  };

  return (
    <div className="home-page">
      <div className="home-content">
        <h1 className="home-title">BlitzTiles</h1>
        <p className="home-subtitle">Word game with a clock</p>

        <div className="home-actions">
          <button className="btn-primary home-btn" onClick={() => navigate('/game?mode=host')}>
            Play Online
          </button>

          {!showJoin ? (
            <button className="btn-secondary home-btn" onClick={() => setShowJoin(true)}>
              Join Game
            </button>
          ) : (
            <div className="join-row">
              <input
                type="text"
                className="join-input"
                placeholder="Enter code"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                autoFocus
              />
              <button className="btn-primary" onClick={handleJoin}>
                Join
              </button>
            </div>
          )}

          <button className="btn-secondary home-btn" onClick={() => navigate('/game')}>
            Local (Hot Seat)
          </button>
        </div>

        {import.meta.env.DEV &&
          (() => {
            // Use LAN IP injected by vite.config.ts so phones on the same network can connect
            const loc = window.location;
            const lanHost = typeof __DEV_LAN_IP__ !== 'undefined' ? __DEV_LAN_IP__ : loc.hostname;
            const lanUrl = `${loc.protocol}//${lanHost}:${loc.port}${loc.pathname}`;
            return (
              <div className="dev-qr">
                <QRCodeSVG value={lanUrl} size={120} bgColor="transparent" fgColor="#666" />
                <div className="dev-qr-label">{lanUrl}</div>
              </div>
            );
          })()}

        <div className="home-rules">
          <h3>How to play</h3>
          <ul>
            <li>Tap a tile in your rack, then tap a cell on the board to place it</li>
            <li>Form words reading left-to-right or top-to-bottom</li>
            <li>First word must cover the center star</li>
            <li>All subsequent words must connect to existing tiles</li>
            <li>Hit Submit when you're happy with your word</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
