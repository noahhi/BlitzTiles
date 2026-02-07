import { useRef, useCallback, useEffect, useState } from 'react';

interface PinchZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

export function usePinchZoom(minScale = 1, maxScale = 2.5, enabled = true) {
  const [state, setState] = useState<PinchZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  // Pinch (2-finger) refs
  const initialDistance = useRef<number | null>(null);
  const initialScale = useRef(1);
  const initialMidpoint = useRef({ x: 0, y: 0 });
  const initialTranslate = useRef({ x: 0, y: 0 });

  // Pan (1-finger) refs
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const panTranslateStart = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);

  // Set briefly after a pan ends so click handlers can ignore the tap-up
  const wasPanningRef = useRef(false);

  // Live ref so handleTouchMove can read the current value mid-gesture
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const getDistance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (t1: React.Touch, t2: React.Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      wasPanningRef.current = false;

      if (!enabled) return;

      // Don't track pan if touch started on a draggable tile (let DnD kit handle it)
      const target = e.target as HTMLElement;
      if (target.closest('.pending-tile, .rack-tile')) return;

      if (e.touches.length === 2) {
        // Start pinch-zoom
        isPanningRef.current = false;
        panStart.current = null;
        initialDistance.current = getDistance(e.touches[0], e.touches[1]);
        initialScale.current = state.scale;
        initialMidpoint.current = getMidpoint(e.touches[0], e.touches[1]);
        initialTranslate.current = { x: state.translateX, y: state.translateY };
      } else if (e.touches.length === 1 && state.scale > 1.05) {
        // Start 1-finger pan (only when zoomed in)
        panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panTranslateStart.current = { x: state.translateX, y: state.translateY };
        isPanningRef.current = false;
      }
    },
    [state.scale, state.translateX, state.translateY, enabled],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Check live ref — enabled may flip mid-gesture (e.g. DnD drag starts)
      if (!enabledRef.current) {
        panStart.current = null;
        isPanningRef.current = false;
        initialDistance.current = null;
        return;
      }

      if (e.touches.length === 2 && initialDistance.current !== null) {
        // Pinch-zoom + 2-finger pan
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const ratio = currentDistance / initialDistance.current;
        const newScale = Math.min(maxScale, Math.max(minScale, initialScale.current * ratio));

        const currentMid = getMidpoint(e.touches[0], e.touches[1]);
        const dx = currentMid.x - initialMidpoint.current.x;
        const dy = currentMid.y - initialMidpoint.current.y;

        setState({
          scale: newScale,
          translateX: initialTranslate.current.x + dx,
          translateY: initialTranslate.current.y + dy,
        });
      } else if (e.touches.length === 1 && panStart.current) {
        // 1-finger pan when zoomed
        const dx = e.touches[0].clientX - panStart.current.x;
        const dy = e.touches[0].clientY - panStart.current.y;

        // Require a small movement before committing to pan (avoids hijacking taps)
        if (!isPanningRef.current && Math.abs(dx) + Math.abs(dy) < 8) return;
        isPanningRef.current = true;

        setState((prev) => ({
          ...prev,
          translateX: panTranslateStart.current.x + dx,
          translateY: panTranslateStart.current.y + dy,
        }));
      }
    },
    [minScale, maxScale],
  );

  const handleTouchEnd = useCallback(() => {
    if (isPanningRef.current) {
      wasPanningRef.current = true;
      // Clear after a tick so click handlers can check it
      setTimeout(() => {
        wasPanningRef.current = false;
      }, 0);
    }

    initialDistance.current = null;
    panStart.current = null;
    isPanningRef.current = false;

    // Snap back to 1x if close
    setState((prev) => {
      if (prev.scale < 1.1) {
        return { scale: 1, translateX: 0, translateY: 0 };
      }
      return prev;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  return {
    scale: state.scale,
    translateX: state.translateX,
    translateY: state.translateY,
    wasPanningRef,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    resetZoom,
    isZoomed: state.scale > 1.05,
  };
}
