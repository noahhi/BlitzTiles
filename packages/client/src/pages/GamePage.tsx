import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GameBoard } from '../components/board/GameBoard';
import { TileRack } from '../components/tiles/TileRack';
import { GameHeader } from '../components/game/GameHeader';
import { GameControls } from '../components/game/GameControls';
import { GameOverModal } from '../components/game/GameOverModal';
import { BlankTilePicker } from '../components/tiles/BlankTilePicker';
import { LandscapeWarning } from '../components/game/LandscapeWarning';
import { TurnBanner } from '../components/game/TurnBanner';
import { QRCodeSVG } from 'qrcode.react';
import { useGameStore, filterStateForPlayer } from '../hooks/useGameStore';
import { useGameConnection } from '../hooks/useGameConnection';
import { useWakeLock } from '../hooks/useWakeLock';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { loadSession, clearSession } from '../hooks/sessionPersistence';
import type { PersistedSession } from '../hooks/sessionPersistence';
import type { Tile } from '@blitztiles/shared';
import './GamePage.css';

/**
 * Resolves tile ID from drag-and-drop events.
 * Board tiles are prefixed with 'board-' to make them unique in the DnD context.
 */
function resolveTileId(rawId: string | number): string {
  const str = String(rawId);
  return str.startsWith('board-') ? str.slice(6) : str;
}

export function GamePage() {
  const [searchParams] = useSearchParams();
  const gameMode = searchParams.get('mode') as 'host' | 'guest' | 'spectator' | null;
  const joinCode = searchParams.get('code') || '';

  if (gameMode === 'host' || gameMode === 'guest' || gameMode === 'spectator') {
    return <OnlineGame role={gameMode} joinCode={joinCode} />;
  }

  return <LocalGame />;
}

// ---------------------------------------------------------------------------
// Local hot-seat game (existing behavior)
// ---------------------------------------------------------------------------

function LocalGame() {
  const phase = useGameStore((s) => s.phase);
  const initLocalGame = useGameStore((s) => s.initLocalGame);
  const dictionaryLoaded = useGameStore((s) => s.dictionaryLoaded);
  const currentHand = useGameStore((s) => s.currentHand);
  const placeTile = useGameStore((s) => s.placeTile);
  const setBlankLetter = useGameStore((s) => s.setBlankLetter);
  const reorderHand = useGameStore((s) => s.reorderHand);
  const removePlacedTile = useGameStore((s) => s.removePlacedTile);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);

  useWakeLock(phase === 'playing');
  useKeyboardControls(true);

  const [pendingBlank, setPendingBlank] = useState<{
    tileId: string;
    row: number;
    col: number;
  } | null>(null);

  // Configure sensors for DndContext
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    if (phase === 'waiting') {
      initLocalGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over) return;

      if (active.id === over.id) return;

      const activeType = active.data.current?.type;
      const overType = over.data.current?.type;

      // Return board tile to rack
      if (activeType === 'board-tile' && over.id === 'rack-drop-zone') {
        const tileId = resolveTileId(active.id);
        removePlacedTile(tileId);
        return;
      }

      if (activeType === 'rack-tile' && overType === 'rack-tile') {
        reorderHand(active.id as string, over.id as string);
      } else if (
        (activeType === 'rack-tile' || activeType === 'board-tile') &&
        over.id.toString().startsWith('cell-')
      ) {
        const [, row, col] = over.id.toString().split('-');
        const tileId = resolveTileId(active.id);
        const tile = currentHand.find((t) => t.id === tileId);
        placeTile(tileId, parseInt(row, 10), parseInt(col, 10));
        if (tile?.isBlank) {
          setPendingBlank({ tileId, row: parseInt(row, 10), col: parseInt(col, 10) });
        }
      }
    },
    [currentHand, placeTile, reorderHand, removePlacedTile],
  );

  const resolvedTileId = activeTileId ? resolveTileId(activeTileId) : null;
  const activeTile = currentHand.find((t) => t.id === resolvedTileId) || null;

  if (!dictionaryLoaded || phase === 'waiting') {
    return (
      <div className="game-loading">
        <div className="loading-text">Loading game...</div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveTileId(event.active.id as string)}
      onDragCancel={() => setActiveTileId(null)}
      onDragEnd={(event) => {
        handleDragEnd(event);
        setActiveTileId(null);
      }}
    >
      <LandscapeWarning />
      <div className="game-page">
        <TurnBanner />
        <GameHeader />
        <GameBoard isDragging={activeTileId !== null} />
        <div className="game-bottom">
          <TileRack />
          <GameControls />
        </div>
        <GameOverModal />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTile ? (
          <div className="drag-overlay-tile">
            <span className="rack-tile-letter">{activeTile.isBlank ? '' : activeTile.letter}</span>
            {activeTile.value > 0 && <span className="rack-tile-value">{activeTile.value}</span>}
          </div>
        ) : null}
      </DragOverlay>
      {pendingBlank && (
        <BlankTilePicker
          onSelect={(letter) => {
            setBlankLetter(pendingBlank.tileId, letter);
            setPendingBlank(null);
          }}
          onCancel={() => {
            removePlacedTile(pendingBlank.tileId);
            setPendingBlank(null);
          }}
        />
      )}
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Online game (host or guest via WebRTC)
// ---------------------------------------------------------------------------

function OnlineGame({
  role,
  joinCode,
}: {
  role: 'host' | 'guest' | 'spectator';
  joinCode: string;
}) {
  const navigate = useNavigate();
  const isSpectator = role === 'spectator';

  // Check for saved session to determine if this is a recovery
  const [recovery] = useState<PersistedSession | null>(() => {
    const session = loadSession();
    if (session && session.role === role) return session;
    return null;
  });

  const recoveryCode = recovery?.roomCode || undefined;

  const connection = useGameConnection(
    role,
    role === 'guest' || role === 'spectator' ? joinCode || recoveryCode : undefined,
    recoveryCode,
  );

  const phase = useGameStore((s) => s.phase);
  const dictionaryLoaded = useGameStore((s) => s.dictionaryLoaded);
  const initHostGame = useGameStore((s) => s.initHostGame);
  const initGuestGame = useGameStore((s) => s.initGuestGame);
  const initSpectatorGame = useGameStore((s) => s.initSpectatorGame);
  const restoreHostGame = useGameStore((s) => s.restoreHostGame);
  const restoreGuestGame = useGameStore((s) => s.restoreGuestGame);
  const restoreSpectatorGame = useGameStore((s) => s.restoreSpectatorGame);
  const setConnection = useGameStore((s) => s.setConnection);
  const addSpectatorConnection = useGameStore((s) => s.addSpectatorConnection);
  const removeSpectatorConnection = useGameStore((s) => s.removeSpectatorConnection);
  const handleNetworkMessage = useGameStore((s) => s.handleNetworkMessage);
  const currentHand = useGameStore((s) => s.currentHand);
  const placeTile = useGameStore((s) => s.placeTile);
  const setBlankLetter = useGameStore((s) => s.setBlankLetter);
  const reorderHand = useGameStore((s) => s.reorderHand);
  const removePlacedTile = useGameStore((s) => s.removePlacedTile);
  const spectatorPlayers = useGameStore((s) => s.players);
  const spectatorConfig = useGameStore((s) => s.config);

  useWakeLock(phase === 'playing');
  useKeyboardControls(!isSpectator); // Disable keyboard controls for spectators

  const [initialized, setInitialized] = useState(false);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [pendingBlank, setPendingBlank] = useState<{
    tileId: string;
    row: number;
    col: number;
  } | null>(null);

  // Configure sensors for DndContext
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(KeyboardSensor),
  );

  // Restore game state from localStorage on mount (before connection is ready)
  useEffect(() => {
    if (!recovery || initialized) return;

    if (role === 'host' && recovery.gameState) {
      restoreHostGame(recovery.gameState, recovery.roomCode).then(() => setInitialized(true));
    } else if (role === 'guest' && recovery.clientGameState) {
      restoreGuestGame(recovery.clientGameState, recovery.roomCode).then(() =>
        setInitialized(true),
      );
    } else if (role === 'spectator' && recovery.spectatorGameState) {
      restoreSpectatorGame(recovery.spectatorGameState, recovery.roomCode).then(() =>
        setInitialized(true),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire incoming messages to store
  useEffect(() => {
    connection.setOnMessage((msg: unknown) => {
      handleNetworkMessage(msg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.setOnMessage, handleNetworkMessage]);

  // Wire spectator connection handlers (host only)
  useEffect(() => {
    if (
      role === 'host' &&
      connection.setOnSpectatorConnected &&
      connection.setOnSpectatorDisconnected
    ) {
      connection.setOnSpectatorConnected((conn) => {
        const sendFn = (msg: unknown) => {
          if (conn.open) {
            conn.send(msg);
          }
        };
        addSpectatorConnection(sendFn);
      });

      connection.setOnSpectatorDisconnected((conn) => {
        const sendFn = (msg: unknown) => {
          if (conn.open) {
            conn.send(msg);
          }
        };
        removeSpectatorConnection(sendFn);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, connection.setOnSpectatorConnected, connection.setOnSpectatorDisconnected]);

  // When connected: set send function and init game (or sync after recovery)
  useEffect(() => {
    if (connection.status !== 'connected') return;

    // Always update the send function when (re)connected
    if (role !== 'spectator') {
      setConnection(connection.send);
    }

    if (initialized) {
      // Recovery or reconnect: request sync from host
      if (role === 'guest' || role === 'spectator') {
        connection.send({ type: 'REQUEST_SYNC' });
      }
      // Host: send current state to reconnecting guest
      if (role === 'host') {
        const state = useGameStore.getState()._gameState;
        if (state) {
          connection.send({ type: 'GAME_STATE', state: filterStateForPlayer(state, 1) });
        }
      }
      return;
    }

    // Fresh game init (no recovery)
    const roomCode = connection.roomCode || '';
    if (role === 'host') {
      initHostGame(roomCode).then(() => setInitialized(true));
    } else if (role === 'guest') {
      initGuestGame(roomCode).then(() => {
        setInitialized(true);
        connection.send({ type: 'REQUEST_SYNC' });
      });
    } else if (role === 'spectator') {
      initSpectatorGame(roomCode).then(() => {
        setInitialized(true);
        // Spectator will receive GAME_STATE after SPECTATE_JOIN handshake
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.status]);

  // Clear session on unmount (navigating away)
  useEffect(() => {
    return () => {
      // Don't clear if we're in a recoverable state
      const { phase: currentPhase } = useGameStore.getState();
      if (currentPhase === 'finished') {
        clearSession();
      }
    };
  }, []);

  // Show lobby/waiting screen until game is ready
  const gameReady =
    (connection.status === 'connected' || connection.status === 'reconnecting') &&
    initialized &&
    dictionaryLoaded &&
    (phase === 'playing' || phase === 'finished');

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over) return;

      if (active.id === over.id) return;

      const activeType = active.data.current?.type;
      const overType = over.data.current?.type;

      // Return board tile to rack
      if (activeType === 'board-tile' && over.id === 'rack-drop-zone') {
        const tileId = resolveTileId(active.id);
        removePlacedTile(tileId);
        return;
      }

      if (activeType === 'rack-tile' && overType === 'rack-tile') {
        reorderHand(active.id as string, over.id as string);
      } else if (
        (activeType === 'rack-tile' || activeType === 'board-tile') &&
        over.id.toString().startsWith('cell-')
      ) {
        const [, row, col] = over.id.toString().split('-');
        const tileId = resolveTileId(active.id);
        const tile = currentHand.find((t) => t.id === tileId);
        placeTile(tileId, parseInt(row, 10), parseInt(col, 10));
        if (tile?.isBlank) {
          setPendingBlank({ tileId, row: parseInt(row, 10), col: parseInt(col, 10) });
        }
      }
    },
    [currentHand, placeTile, reorderHand, removePlacedTile],
  );

  const resolvedTileId = activeTileId ? resolveTileId(activeTileId) : null;
  const activeTile = currentHand.find((t) => t.id === resolvedTileId) || null;

  const handleAbandon = () => {
    clearSession();
    navigate('/');
  };

  // Special case: Spectator waiting for game to start
  if (isSpectator && connection.status === 'connected' && phase === 'waiting') {
    return (
      <div className="game-loading">
        <div className="online-lobby">
          <div className="spectator-waiting">
            <div className="loading-text">Waiting for game to start...</div>
            <button className="btn-secondary" onClick={handleAbandon}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameReady) {
    return (
      <div className="game-loading">
        <div className="online-lobby">
          {connection.status === 'connecting' && <div className="loading-text">Connecting...</div>}

          {connection.status === 'waiting' && <LobbyShare roomCode={connection.roomCode ?? ''} />}

          {connection.status === 'reconnecting' && (
            <div className="reconnect-box">
              <div className="loading-text">Reconnecting...</div>
              <button className="btn-secondary" onClick={handleAbandon}>
                Abandon Game
              </button>
            </div>
          )}

          {connection.status === 'connected' && !gameReady && (
            <div className="loading-text">
              {isSpectator ? 'Connecting to game...' : 'Starting game...'}
            </div>
          )}

          {connection.status === 'error' && (
            <div className="error-box">
              <div>Connection failed</div>
              <div className="error-detail">{connection.error}</div>
              <button className="btn-primary" onClick={handleAbandon}>
                Back
              </button>
            </div>
          )}

          {connection.status === 'disconnected' && (
            <div className="error-box">
              <div>Connection lost</div>
              {connection.roomCode && !isSpectator && <LobbyShare roomCode={connection.roomCode} />}
              <button className="btn-primary" onClick={handleAbandon}>
                Abandon Game
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isSpectator) {
    // Check if spectator can see hands
    const canSeeHands = spectatorConfig.spectatorHandsVisible ?? false;

    // Get hands from players if available (only present if spectatorHandsVisible is true)
    type PlayerWithOptionalHand = (typeof spectatorPlayers)[0] & { hand?: Tile[] };
    const player0Hand = (spectatorPlayers[0] as PlayerWithOptionalHand).hand || null;
    const player1Hand = (spectatorPlayers[1] as PlayerWithOptionalHand).hand || null;

    return (
      <>
        <LandscapeWarning />
        <div className="game-page">
          <TurnBanner />
          <GameHeader isSpectator={true} />
          <GameBoard isDragging={false} />

          {canSeeHands && (player0Hand || player1Hand) && (
            <div className="spectator-hands">
              <div className="spectator-hand-row">
                <div className="spectator-hand-label">{spectatorPlayers[0].name}'s tiles:</div>
                <div className="spectator-hand-tiles">
                  {player0Hand &&
                    player0Hand.map((tile) => (
                      <div key={tile.id} className="spectator-tile">
                        <span className="spectator-tile-letter">
                          {tile.isBlank ? '?' : tile.letter}
                        </span>
                        {tile.value > 0 && (
                          <span className="spectator-tile-value">{tile.value}</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
              <div className="spectator-hand-row">
                <div className="spectator-hand-label">{spectatorPlayers[1].name}'s tiles:</div>
                <div className="spectator-hand-tiles">
                  {player1Hand &&
                    player1Hand.map((tile) => (
                      <div key={tile.id} className="spectator-tile">
                        <span className="spectator-tile-letter">
                          {tile.isBlank ? '?' : tile.letter}
                        </span>
                        {tile.value > 0 && (
                          <span className="spectator-tile-value">{tile.value}</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {phase === 'finished' && <GameOverModal />}

          {connection.status === 'reconnecting' && (
            <div className="reconnect-overlay">
              <div className="reconnect-content">
                <div className="loading-text">Reconnecting...</div>
                <button className="btn-secondary" onClick={handleAbandon}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveTileId(event.active.id as string)}
      onDragCancel={() => setActiveTileId(null)}
      onDragEnd={(event) => {
        handleDragEnd(event);
        setActiveTileId(null);
      }}
    >
      <LandscapeWarning />
      <div className="game-page">
        <TurnBanner />
        <GameHeader isSpectator={false} />
        <GameBoard isDragging={activeTileId !== null} />
        <div className="game-bottom">
          <TileRack />
          <GameControls />
        </div>
        {phase === 'finished' && <GameOverModal />}

        {connection.status === 'reconnecting' && (
          <div className="reconnect-overlay">
            <div className="reconnect-content">
              <div className="loading-text">Reconnecting...</div>
              <button className="btn-secondary" onClick={handleAbandon}>
                Abandon Game
              </button>
            </div>
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTile ? (
          <div className="drag-overlay-tile">
            <span className="rack-tile-letter">{activeTile.isBlank ? '' : activeTile.letter}</span>
            {activeTile.value > 0 && <span className="rack-tile-value">{activeTile.value}</span>}
          </div>
        ) : null}
      </DragOverlay>
      {pendingBlank && (
        <BlankTilePicker
          onSelect={(letter) => {
            setBlankLetter(pendingBlank.tileId, letter);
            setPendingBlank(null);
          }}
          onCancel={() => {
            removePlacedTile(pendingBlank.tileId);
            setPendingBlank(null);
          }}
        />
      )}
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Lobby share widget (QR code + copy link)
// ---------------------------------------------------------------------------

function LobbyShare({ roomCode }: { roomCode: string }) {
  const [copied, setCopied] = useState(false);
  const config = useGameStore((s) => s.config);
  const updateConfig = useGameStore((s) => s.updateConfig);
  const [spectatorHandsVisible, setSpectatorHandsVisible] = useState(
    config.spectatorHandsVisible ?? false,
  );

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const shareUrl = `${window.location.origin}${base}/game?mode=guest&code=${roomCode}`;

  const handleToggleSpectatorHands = (checked: boolean) => {
    setSpectatorHandsVisible(checked);
    updateConfig({ spectatorHandsVisible: checked });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS) — use textarea fallback
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
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
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my BlitzTiles game', url: shareUrl });
      } catch {
        // User cancelled or share failed
      }
    }
  };

  return (
    <>
      <div className="lobby-label">Room Code</div>
      <div className="room-code">{roomCode}</div>
      <div className="lobby-qr">
        <QRCodeSVG value={shareUrl} size={160} bgColor="transparent" fgColor="#ffffff" />
      </div>
      <div className="lobby-share-buttons">
        <button className="btn-copy-link" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        {typeof navigator.share === 'function' && (
          <button className="btn-copy-link" onClick={handleShare}>
            Share
          </button>
        )}
      </div>
      <div className="lobby-hint">Share this link or scan the QR code</div>

      <div className="spectator-settings">
        <label className="spectator-toggle">
          <input
            type="checkbox"
            checked={spectatorHandsVisible}
            onChange={(e) => handleToggleSpectatorHands(e.target.checked)}
          />
          <span>Allow spectators to see player hands</span>
        </label>
      </div>

      <div className="loading-text">Waiting for opponent...</div>
    </>
  );
}
