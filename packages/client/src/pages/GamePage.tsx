import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GameBoard } from '../components/board/GameBoard';
import { TileRack } from '../components/tiles/TileRack';
import { GameHeader } from '../components/game/GameHeader';
import { GameControls } from '../components/game/GameControls';
import { GameOverModal } from '../components/game/GameOverModal';
import { useGameStore } from '../hooks/useGameStore';
import { useGameConnection } from '../hooks/useGameConnection';
import './GamePage.css';

export function GamePage() {
  const [searchParams] = useSearchParams();
  const gameMode = searchParams.get('mode') as 'host' | 'guest' | null;
  const joinCode = searchParams.get('code') || '';

  if (gameMode === 'host' || gameMode === 'guest') {
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
  const placeTile = useGameStore((s) => s.placeTile);
  const reorderHand = useGameStore((s) => s.reorderHand);

  // Configure sensors for DndContext
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === 'rack-tile' && overType === 'rack-tile') {
      reorderHand(active.id as string, over.id as string);
    } else if (over.id.toString().startsWith('cell-')) {
      const [, row, col] = over.id.toString().split('-');
      placeTile(active.id as string, parseInt(row), parseInt(col));
    }
  };

  if (!dictionaryLoaded || phase === 'waiting') {
    return (
      <div className="game-loading">
        <div className="loading-text">Loading game...</div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="game-page">
        <GameHeader />
        <GameBoard />
        <div className="game-bottom">
          <TileRack />
          <GameControls />
        </div>
        <GameOverModal />
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Online game (host or guest via WebRTC)
// ---------------------------------------------------------------------------

function OnlineGame({ role, joinCode }: { role: 'host' | 'guest'; joinCode: string }) {
  const navigate = useNavigate();
  const connection = useGameConnection(role, role === 'guest' ? joinCode : undefined);

  const phase = useGameStore((s) => s.phase);
  const dictionaryLoaded = useGameStore((s) => s.dictionaryLoaded);
  const initHostGame = useGameStore((s) => s.initHostGame);
  const initGuestGame = useGameStore((s) => s.initGuestGame);
  const setConnection = useGameStore((s) => s.setConnection);
  const handleNetworkMessage = useGameStore((s) => s.handleNetworkMessage);
  const placeTile = useGameStore((s) => s.placeTile);
  const reorderHand = useGameStore((s) => s.reorderHand);

  const [initialized, setInitialized] = useState(false);

  // Configure sensors for DndContext
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor),
  );

  // Wire incoming messages to store
  useEffect(() => {
    connection.setOnMessage((msg: unknown) => {
      handleNetworkMessage(msg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.setOnMessage, handleNetworkMessage]);

  // When connected: set send function and init game
  useEffect(() => {
    if (connection.status === 'connected' && !initialized) {
      setConnection(connection.send);

      if (role === 'host') {
        initHostGame().then(() => setInitialized(true));
      } else {
        initGuestGame().then(() => {
          setInitialized(true);
          // Request current game state from host in case initial message was missed
          connection.send({ type: 'REQUEST_SYNC' });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.status, initialized]);

  // Show lobby/waiting screen until game is ready
  const gameReady =
    connection.status === 'connected' && initialized && dictionaryLoaded && phase === 'playing';

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === 'rack-tile' && overType === 'rack-tile') {
      reorderHand(active.id as string, over.id as string);
    } else if (over.id.toString().startsWith('cell-')) {
      const [, row, col] = over.id.toString().split('-');
      placeTile(active.id as string, parseInt(row), parseInt(col));
    }
  };

  if (!gameReady) {
    return (
      <div className="game-loading">
        <div className="online-lobby">
          {connection.status === 'connecting' && <div className="loading-text">Connecting...</div>}

          {connection.status === 'waiting' && (
            <>
              <div className="lobby-label">Room Code</div>
              <div className="room-code">{connection.roomCode}</div>
              <div className="lobby-hint">Share this code with your opponent</div>
              <div className="loading-text">Waiting for opponent...</div>
            </>
          )}

          {connection.status === 'connected' && !gameReady && (
            <div className="loading-text">Starting game...</div>
          )}

          {connection.status === 'error' && (
            <div className="error-box">
              <div>Connection failed</div>
              <div className="error-detail">{connection.error}</div>
              <button className="btn-primary" onClick={() => navigate('/')}>
                Back
              </button>
            </div>
          )}

          {connection.status === 'disconnected' && (
            <div className="error-box">
              <div>Opponent disconnected</div>
              <button className="btn-primary" onClick={() => navigate('/')}>
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="game-page">
        <GameHeader />
        <GameBoard />
        <div className="game-bottom">
          <TileRack />
          <GameControls />
        </div>
        <GameOverModal />
      </div>
    </DndContext>
  );
}
