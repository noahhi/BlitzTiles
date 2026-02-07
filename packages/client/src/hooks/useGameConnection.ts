/**
 * PeerJS WebRTC connection hook for BlitzTiles.
 *
 * Manages peer-to-peer data channel between host and guest.
 * Uses PeerJS cloud signaling for the handshake, then all game
 * data flows directly between browsers.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roomCodeToPeerId(code: string): string {
  return `blitztiles-${code.toUpperCase()}`;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // letters only, no I/O
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  roomCode: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGameConnection(role: 'host' | 'guest' | null, joinCode?: string) {
  const [state, setState] = useState<ConnectionState>({
    status: 'idle',
    roomCode: null,
    error: null,
  });

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const onMessageRef = useRef<((msg: unknown) => void) | null>(null);
  const onConnectedRef = useRef<(() => void) | null>(null);
  const messageQueueRef = useRef<unknown[]>([]);

  const send = useCallback((msg: unknown) => {
    if (connRef.current?.open) {
      connRef.current.send(msg);
    }
  }, []);

  const setOnMessage = useCallback((fn: (msg: unknown) => void) => {
    onMessageRef.current = fn;
    // Flush any messages that arrived before the handler was set
    const queued = messageQueueRef.current;
    messageQueueRef.current = [];
    for (const msg of queued) {
      fn(msg);
    }
  }, []);

  const setOnConnected = useCallback((fn: () => void) => {
    onConnectedRef.current = fn;
  }, []);

  useEffect(() => {
    if (!role) return;

    function setupDataChannel(connection: DataConnection) {
      connection.on('open', () => {
        setState((prev) => ({ ...prev, status: 'connected' }));
        onConnectedRef.current?.();
      });

      connection.on('data', (data) => {
        if (onMessageRef.current) {
          onMessageRef.current(data);
        } else {
          messageQueueRef.current.push(data);
        }
      });

      connection.on('close', () => {
        setState((prev) => ({ ...prev, status: 'disconnected' }));
      });

      connection.on('error', (err) => {
        setState((prev) => ({ ...prev, status: 'error', error: err.message }));
      });
    }

    if (role === 'host') {
      const code = generateRoomCode();
      const peerId = roomCodeToPeerId(code);

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'connecting', roomCode: code, error: null });

      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on('open', () => {
        setState({ status: 'waiting', roomCode: code, error: null });
      });

      peer.on('connection', (connection) => {
        connRef.current = connection;
        setupDataChannel(connection);
      });

      peer.on('error', (err) => {
        setState({ status: 'error', roomCode: code, error: err.message });
      });
    } else if (role === 'guest' && joinCode) {
      const hostPeerId = roomCodeToPeerId(joinCode);

      setState({ status: 'connecting', roomCode: joinCode, error: null });

      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', () => {
        const connection = peer.connect(hostPeerId, { reliable: true });
        connRef.current = connection;
        setupDataChannel(connection);
      });

      peer.on('error', (err) => {
        setState({ status: 'error', roomCode: joinCode, error: err.message });
      });
    }

    return () => {
      connRef.current?.close();
      peerRef.current?.destroy();
      connRef.current = null;
      peerRef.current = null;
    };
  }, [role, joinCode]);

  return { ...state, send, setOnMessage, setOnConnected };
}
