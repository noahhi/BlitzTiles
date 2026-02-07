/**
 * localStorage persistence for game sessions.
 *
 * Saves enough state to survive page refreshes and allow reconnection.
 * Host saves the full authoritative GameState; guest saves the filtered ClientGameState.
 */

import type { GameState, ClientGameState } from '@blitztiles/shared';

const STORAGE_KEY = 'blitztiles-session';
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface PersistedSession {
  savedAt: string;
  role: 'host' | 'guest';
  roomCode: string;
  gameState: GameState | null;
  clientGameState: ClientGameState | null;
  stateVersion: number;
}

export function saveSession(session: PersistedSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage can throw in private browsing or when full
  }
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Validate shape
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.savedAt !== 'string' ||
      typeof parsed.roomCode !== 'string' ||
      (parsed.role !== 'host' && parsed.role !== 'guest')
    ) {
      clearSession();
      return null;
    }

    // Discard stale sessions
    const age = Date.now() - Date.parse(parsed.savedAt);
    if (age > MAX_AGE_MS || isNaN(age)) {
      clearSession();
      return null;
    }

    return parsed as PersistedSession;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasActiveSession(): boolean {
  return loadSession() !== null;
}
