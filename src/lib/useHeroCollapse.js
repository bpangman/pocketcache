import { useState, useRef, useCallback, useLayoutEffect } from 'react';

/**
 * Drives the collapsing-hero scroll pattern — native-feel edition.
 *
 * The hero lives INSIDE the scrollable div, so it slides away 1:1 with the
 * user's finger like a normal piece of content. No JS-driven heights, no CSS
 * transitions chasing the scroll position — nothing to lag or snap. A sticky
 * compact bar (rendered just before the hero) fades in as the hero leaves and
 * stays docked at the top; scrolling back restores the hero the same way.
 *
 * Layout contract per screen:
 *   <div ref={frameRef} className="flex flex-col h-full">          ← the screen
 *     <div ref={scrollRef} onScroll={onScroll}
 *          className="flex-1 overflow-y-auto relative">
 *       <div sticky top-0, height {barHeight}, marginBottom -{barHeight},
 *            opacity {heroCompactOpacity}>compact title</div>
 *       <div ref={heroRef} style={{ minHeight: heroMinHeight ?? '38%' }}>
 *         hero — original static styling, opacity {heroExpandedOpacity} on copy
 *       </div>
 *       <div className="sheet ... -mt-4" style={{ minHeight: sheetMinHeight }}>
 *         content
 *       </div>
 *     </div>
 *     (pinned footer, optional)
 *   </div>
 */

const BAR_HEIGHT = 64;      // docked compact bar
const HERO_FRACTION = 0.38; // hero rests at 38% of the screen — same as the static design

export function useHeroCollapse() {
  const [progress, setProgress] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);
  const rafId = useRef(null);
  const frameRef = useRef(null);  // the screen's outer column
  const scrollRef = useRef(null); // the scrollable div
  const heroRef = useRef(null);   // the hero block

  // The hero's rest height is 38% of the SCREEN — not of the scroll area,
  // which is shorter when a footer is pinned below it — so it matches the
  // original static layout exactly. Re-measures when the device preset or
  // text size changes.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setFrameHeight(frame.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e) => {
    const el = e.currentTarget;
    if (rafId.current) return; // one rAF per frame
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const heroH = heroRef.current?.offsetHeight ?? 0;
      const range = heroH - BAR_HEIGHT; // hero is gone once it has scrolled this far
      if (range <= 0) return;
      setProgress(Math.min(1, Math.max(0, el.scrollTop / range)));
    });
  }, []);

  return {
    frameRef,
    scrollRef,
    heroRef,
    onScroll,
    progress,
    barHeight: BAR_HEIGHT,
    // Rest height of the hero in px (undefined only for the pre-measure paint).
    heroMinHeight: frameHeight ? Math.round(frameHeight * HERO_FRACTION) : undefined,
    // Hero copy fades out over the first 60% of the collapse…
    heroExpandedOpacity: Math.max(0, 1 - progress / 0.6),
    // …and the compact title fades in late, fully opaque before the sheet's
    // rounded corners slide under the docked bar.
    heroCompactOpacity: Math.min(1, Math.max(0, (progress - 0.5) / 0.35)),
    // Minimum sheet height so every screen can fully collapse with NO dead
    // scroll space: hero(38%) + sheet(100% − 48px) − 16px overlap covers the
    // viewport plus exactly the (hero − bar) of scroll range the collapse needs.
    sheetMinHeight: 'calc(100% - 48px)',
  };
}
