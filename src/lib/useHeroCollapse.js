import { useState, useRef, useCallback } from 'react';

/**
 * Drives the collapsing-hero scroll pattern.
 * Attach scrollProps to the sheet's scrollable div.
 * progress is clamped 0→1 as scrollTop goes 0→range.
 */
export function useHeroCollapse(range = 140) {
  const [progress, setProgress] = useState(0);
  const rafId = useRef(null);
  const scrollRef = useRef(null);

  const onScroll = useCallback(
    (e) => {
      const scrollTop = e.currentTarget.scrollTop;
      if (rafId.current) return; // one rAF per frame
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        setProgress(Math.min(1, Math.max(0, scrollTop / range)));
      });
    },
    [range],
  );

  return {
    scrollRef,
    onScroll,
    progress,
  };
}
