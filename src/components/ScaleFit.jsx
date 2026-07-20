import { useEffect, useRef, useState } from 'react';

// Must match .phone-frame { width } in src/index.css — the reference design width.
const REF_W = 390;

// Cap so tablets / large phones don't balloon. At 1.15 the visual width is
// 390 * 1.15 = 448.5 px; anything wider gets navy gradient on the sides.
const SCALE_CAP = 1.15;

function useViewportWidth() {
  const [vw, setVw] = useState(() => window.visualViewport?.width ?? window.innerWidth);
  const timerRef = useRef(null);

  useEffect(() => {
    function update() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVw(window.visualViewport?.width ?? window.innerWidth);
      }, 100);
    }

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return vw;
}

/**
 * ScaleFit — full-bleed mobile renderer.
 *
 * Scales the REF_W-wide app to fill the visual viewport width without any
 * horizontal overflow, capped at SCALE_CAP so large screens don't balloon.
 *
 * Safe-area insets (notch / home-indicator) are applied as padding on the
 * OUTER wrapper — outside the CSS transform — so they are never double-scaled.
 *
 * CSS transform creates a new fixed-position containing block, which means
 * any position:absolute or position:fixed descendants are anchored to the
 * scaled container rather than the window. Sheet.jsx, CancelledOverlay, and
 * Toast all use position:absolute, so they stay correctly inside the app.
 *
 * Scale math with transform-origin "top center":
 *   visual left edge = 50vw − (REF_W × scale / 2)
 *   When scale = vw / REF_W  → visual left = 0  (edge-to-edge, no gap)
 *   When scale = SCALE_CAP   → visual content centred; navy fills the sides
 *
 * When `viewport` prop is provided (desktop phone-frame mode):
 *   - Skips window/ResizeObserver measurement; uses viewport.{width,height} directly.
 *   - Renders a 100%/100% wrapper (no safe-area insets, no full-window sizing).
 *   - All scale math is identical.
 */
export default function ScaleFit({ children, viewport }) {
  const windowVw = useViewportWidth();
  const contentRef = useRef(null);

  // Measured height of the inner area (after safe-area padding is removed by
  // the outer wrapper). Used to calculate appH = contentH / scale so the
  // internal layout fills the screen exactly without overflow.
  const [measuredH, setMeasuredH] = useState(
    () => window.visualViewport?.height ?? window.innerHeight,
  );

  useEffect(() => {
    if (viewport) return; // viewport override: skip ResizeObserver
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setMeasuredH(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewport]);

  // Use provided viewport dims or fall back to window measurements
  const vw = viewport ? viewport.width : windowVw;
  const contentH = viewport ? viewport.height : measuredH;

  const scale = Math.min(vw / REF_W, SCALE_CAP);
  // The app's internal layout sees a logical viewport of REF_W × appH.
  // Existing per-tab scroll areas absorb height differences automatically.
  const appH = contentH / scale;

  if (viewport) {
    // Desktop phone-frame mode: simple wrapper; no safe-area, no full-window sizing.
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `calc(50% - ${REF_W / 2}px)`,
            width: `${REF_W}px`,
            height: `${appH}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Mobile mode: full window, safe-area vars passed into the scale container.
  return (
    <div
      ref={contentRef}
      style={{
        width: '100vw',
        height: '100dvh',
        background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 50%, #0B2A4A 100%)',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        boxSizing: 'border-box',
      }}
    >
      {/*
       * Scale container: centred horizontally, scaled from the top-centre.
       * left: calc(50% - REF_W/2px) places the element's CSS left at vw/2 - REF_W/2.
       * transform-origin "top center" pivots at (left + REF_W/2, 0) = (vw/2, 0).
       * After scale(s): visual left = vw/2 - REF_W*s/2.
       *   s = vw/REF_W => visual left = 0 (edge-to-edge)
       *   s = SCALE_CAP => navy gradient shows on both sides
       * Safe-area CSS vars are divided by scale so inner layouts use pre-scaled values.
       */}
      <div
        style={{
          '--pc-safe-top': `calc(env(safe-area-inset-top) / ${scale})`,
          '--pc-safe-bottom': `calc(env(safe-area-inset-bottom) / ${scale})`,
          position: 'absolute',
          top: 0,
          left: `calc(50% - ${REF_W / 2}px)`,
          width: `${REF_W}px`,
          height: `${appH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
