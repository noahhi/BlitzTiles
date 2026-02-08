import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './useGameStore';

const CRITICAL_URGENCY_THRESHOLD_MS = 5000;
const WARNING_URGENCY_THRESHOLD_MS = 15000;

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
  if (ms <= CRITICAL_URGENCY_THRESHOLD_MS) return 'critical';
  if (ms <= WARNING_URGENCY_THRESHOLD_MS) return 'warning';
  return 'normal';
}

export function useTimer(): TimerState {
  const turnStartTimestamp = useGameStore((s) => s.turnStartTimestamp);
  const turnTimeLimitMs = useGameStore((s) => s.turnTimeLimitMs);
  const phase = useGameStore((s) => s.phase);
  const gameVariant = useGameStore((s) => s.gameVariant);
  const roundStartTimestamp = useGameStore((s) => s.roundStartTimestamp);
  const racingRoundTimeLimitMs = useGameStore((s) => s.racingRoundTimeLimitMs);

  // In racing mode, use round timestamps/limits instead of turn ones
  const isRacing = gameVariant === 'racing';
  const startTs = isRacing ? (roundStartTimestamp ?? '') : turnStartTimestamp;
  const limitMs = isRacing ? racingRoundTimeLimitMs : turnTimeLimitMs;

  const isRunning = phase === 'playing' && limitMs > 0 && startTs !== '';

  const [remainingMs, setRemainingMs] = useState(limitMs);
  const rafRef = useRef<number>(0);
  const vibratedRef = useRef(false);

  useEffect(() => {
    if (!isRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingMs(limitMs);
      return;
    }

    function tick() {
      const elapsed = Date.now() - Date.parse(startTs);
      const remaining = Math.max(0, limitMs - elapsed);
      setRemainingMs(remaining);

      // Vibrate once when entering critical zone
      if (remaining <= CRITICAL_URGENCY_THRESHOLD_MS && !vibratedRef.current) {
        vibratedRef.current = true;
        if (typeof navigator.vibrate === 'function') {
          navigator.vibrate([100, 50, 100]); // short double buzz
        }
      }

      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    // Compute immediately so we don't flash stale values
    tick();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isRunning, startTs, limitMs]);

  // Reset vibrated flag when turn/round changes
  useEffect(() => {
    vibratedRef.current = false;
  }, [startTs]);

  const progress = limitMs > 0 ? Math.min(1, 1 - remainingMs / limitMs) : 0;

  return {
    remainingMs,
    display: formatTime(remainingMs),
    urgency: getUrgency(remainingMs),
    progress,
    isRunning,
  };
}
