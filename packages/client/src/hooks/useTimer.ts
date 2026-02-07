import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './useGameStore';

export type Urgency = 'normal' | 'warning' | 'critical';

export interface TimerState {
  remainingMs: number;
  display: string;
  urgency: Urgency;
  /** 0 → 1 fraction of time elapsed (for ring depletion). */
  progress: number;
  isRunning: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getUrgency(ms: number): Urgency {
  if (ms <= 5000) return 'critical';
  if (ms <= 15000) return 'warning';
  return 'normal';
}

export function useTimer(): TimerState {
  const turnStartTimestamp = useGameStore((s) => s.turnStartTimestamp);
  const turnTimeLimitMs = useGameStore((s) => s.turnTimeLimitMs);
  const phase = useGameStore((s) => s.phase);

  const isRunning = phase === 'playing' && turnTimeLimitMs > 0 && turnStartTimestamp !== '';

  const [remainingMs, setRemainingMs] = useState(turnTimeLimitMs);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingMs(turnTimeLimitMs);
      return;
    }

    function tick() {
      const elapsed = Date.now() - Date.parse(turnStartTimestamp);
      const remaining = Math.max(0, turnTimeLimitMs - elapsed);
      setRemainingMs(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    // Compute immediately so we don't flash stale values
    tick();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isRunning, turnStartTimestamp, turnTimeLimitMs]);

  const progress = turnTimeLimitMs > 0 ? Math.min(1, 1 - remainingMs / turnTimeLimitMs) : 0;

  return {
    remainingMs,
    display: formatTime(remainingMs),
    urgency: getUrgency(remainingMs),
    progress,
    isRunning,
  };
}
