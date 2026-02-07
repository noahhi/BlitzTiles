import { useRef, useCallback, useState } from 'react';

interface PinchZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

export function usePinchZoom(minScale = 1, maxScale = 2.5) {
  const [state, setState] = useState<PinchZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const initialDistance = useRef<number | null>(null);
  const initialScale = useRef(1);
  const initialMidpoint = useRef({ x: 0, y: 0 });
  const initialTranslate = useRef({ x: 0, y: 0 });

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
      if (e.touches.length === 2) {
        initialDistance.current = getDistance(e.touches[0], e.touches[1]);
        initialScale.current = state.scale;
        initialMidpoint.current = getMidpoint(e.touches[0], e.touches[1]);
        initialTranslate.current = { x: state.translateX, y: state.translateY };
      }
    },
    [state.scale, state.translateX, state.translateY],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && initialDistance.current !== null) {
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
      }
    },
    [minScale, maxScale],
  );

  const handleTouchEnd = useCallback(() => {
    initialDistance.current = null;
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
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    resetZoom,
    isZoomed: state.scale > 1.05,
  };
}
