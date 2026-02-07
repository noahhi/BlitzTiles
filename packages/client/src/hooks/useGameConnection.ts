/**
 * PeerJS WebRTC connection hook for BlitzTiles.
 *
 * Manages peer-to-peer data channel between host and guest.
 * Uses PeerJS cloud signaling for the handshake, then all game
 * data flows directly between browsers.
 *
 * Supports reconnection: on disconnect, guest auto-retries every 2s (up to 15 times).
 * Host keeps Peer alive and accepts new connections for up to 60s.
 * A `recoveryCode` param allows restoring the same deterministic PeerJS ID after a page refresh.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';
import type { Trie } from '@blitztiles/shared';
import { getDictionary } from './useGameStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roomCodeToPeerId(code: string): string {
  return `blitztiles-${code.toUpperCase()}`;
}

export function generateRoomCode(dictionary?: Trie): string {
  if (dictionary) {
    const words = dictionary.wordsOfLength(4, 6);
    if (words.length > 0) {
      return words[Math.floor(Math.random() * words.length)];
    }
  }
  // Fallback: random letters
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
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
  | 'reconnecting'
  | 'disconnected'
  | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  roomCode: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GUEST_RETRY_INTERVAL_MS = 2000;
const GUEST_MAX_RETRIES = 15;
const HOST_RECONNECT_TIMEOUT_MS = 60000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGameConnection(
  role: 'host' | 'guest' | null,
  joinCode?: string,
  recoveryCode?: string,
) {
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
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);
  const hadConnectionRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const clearHostTimeout = useCallback(() => {
    if (hostTimeoutRef.current !== null) {
      clearTimeout(hostTimeoutRef.current);
      hostTimeoutRef.current = null;
    }
  }, []);

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
    destroyedRef.current = false;

    function setupDataChannel(connection: DataConnection) {
      connection.on('open', () => {
        if (destroyedRef.current) return;
        clearRetryTimer();
        clearHostTimeout();
        hadConnectionRef.current = true;
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
        if (destroyedRef.current) return;
        handleDisconnect();
      });

      connection.on('error', (err) => {
        if (destroyedRef.current) return;
        console.warn('[BlitzTiles] DataConnection error:', err.message);
        // Don't immediately error — let the close handler trigger reconnect
      });
    }

    function handleDisconnect() {
      if (destroyedRef.current) return;

      // Only attempt reconnection if we had a prior connection
      if (!hadConnectionRef.current) {
        setState((prev) => ({ ...prev, status: 'disconnected' }));
        return;
      }

      if (role === 'guest') {
        startGuestReconnect();
      } else if (role === 'host') {
        startHostWaitForReconnect();
      }
    }

    // --- Guest reconnection ---
    function startGuestReconnect() {
      setState((prev) => ({ ...prev, status: 'reconnecting' }));
      let retries = 0;
      const codeToUse = joinCode || recoveryCode || '';
      const hostPeerId = roomCodeToPeerId(codeToUse);

      clearRetryTimer();
      retryTimerRef.current = setInterval(() => {
        if (destroyedRef.current) {
          clearRetryTimer();
          return;
        }

        retries++;
        if (retries > GUEST_MAX_RETRIES) {
          clearRetryTimer();
          setState((prev) => ({ ...prev, status: 'disconnected' }));
          return;
        }

        const peer = peerRef.current;
        if (!peer || peer.destroyed) {
          clearRetryTimer();
          setState((prev) => ({ ...prev, status: 'disconnected' }));
          return;
        }

        const newConn = peer.connect(hostPeerId, { reliable: true });
        connRef.current = newConn;
        setupDataChannel(newConn);
      }, GUEST_RETRY_INTERVAL_MS);
    }

    // --- Host: wait for guest to reconnect ---
    function startHostWaitForReconnect() {
      setState((prev) => ({ ...prev, status: 'reconnecting' }));

      clearHostTimeout();
      hostTimeoutRef.current = setTimeout(() => {
        if (destroyedRef.current) return;
        setState((prev) => ({ ...prev, status: 'disconnected' }));
      }, HOST_RECONNECT_TIMEOUT_MS);

      // Peer stays alive — new connections arrive via peer.on('connection')
    }

    // --- Setup ---
    if (role === 'host') {
      function setupHost(code: string) {
        if (destroyedRef.current) return;
        const peerId = roomCodeToPeerId(code);

        setState({ status: 'connecting', roomCode: code, error: null });

        const peer = new Peer(peerId);
        peerRef.current = peer;

        peer.on('open', () => {
          if (destroyedRef.current) return;
          setState({ status: 'waiting', roomCode: code, error: null });
        });

        peer.on('connection', (connection) => {
          if (destroyedRef.current) return;
          // Close old connection if any
          if (connRef.current && connRef.current !== connection) {
            try {
              connRef.current.close();
            } catch {
              // ignore
            }
          }
          clearHostTimeout();
          connRef.current = connection;
          setupDataChannel(connection);
        });

        peer.on('error', (err) => {
          if (destroyedRef.current) return;
          // If the peer ID is taken (host recovery race condition), it may mean
          // our old peer hasn't been cleaned up yet. Surface as error.
          setState({ status: 'error', roomCode: code, error: err.message });
        });
      }

      if (recoveryCode) {
        setupHost(recoveryCode);
      } else {
        // Load dictionary and pick a word as the room code
        getDictionary()
          .then((trie) => {
            setupHost(generateRoomCode(trie));
          })
          .catch(() => {
            setupHost(generateRoomCode());
          });
      }
    } else if (role === 'guest') {
      const codeToUse = joinCode || recoveryCode || '';
      const hostPeerId = roomCodeToPeerId(codeToUse);

      setState({ status: 'connecting', roomCode: codeToUse, error: null });

      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', () => {
        if (destroyedRef.current) return;
        const connection = peer.connect(hostPeerId, { reliable: true });
        connRef.current = connection;
        setupDataChannel(connection);
      });

      peer.on('error', (err) => {
        if (destroyedRef.current) return;
        // During reconnect retries, peer-level errors are expected (host not found yet)
        // Only surface as fatal if we're not already reconnecting
        if (retryTimerRef.current === null) {
          setState({ status: 'error', roomCode: codeToUse, error: err.message });
        }
      });
    }

    return () => {
      destroyedRef.current = true;
      clearRetryTimer();
      clearHostTimeout();
      connRef.current?.close();
      peerRef.current?.destroy();
      connRef.current = null;
      peerRef.current = null;
      hadConnectionRef.current = false;
    };
  }, [role, joinCode, recoveryCode, clearRetryTimer, clearHostTimeout]);

  return { ...state, send, setOnMessage, setOnConnected };
}
