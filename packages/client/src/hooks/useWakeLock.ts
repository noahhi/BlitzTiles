import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
      return;
    }

    let cancelled = false;

    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          const sentinel = await navigator.wakeLock.request('screen');
          if (cancelled) {
            sentinel.release();
            return;
          }
          wakeLockRef.current = sentinel;
          sentinel.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
        }
      } catch {
        // Browser doesn't support or permission denied -- silently ignore
      }
    }

    acquire();

    // Re-acquire when tab becomes visible (wake lock auto-releases on visibility change)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && enabled && !cancelled) {
        acquire();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);
}
