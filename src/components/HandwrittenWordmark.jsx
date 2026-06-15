/**
 * HandwrittenWordmark — "PocketCache" rendered as genuine single-stroke
 * handwriting animation using EMS Allure centerline paths (SIL OFL).
 *
 * Each letter's centerline path is revealed stroke-by-stroke via SVG
 * strokeDashoffset animation, giving a true pen-writing effect.
 *
 * The font paths were extracted at build time by scripts/genWordmarkPaths.mjs.
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { LETTERS, VIEWBOX } from './wordmarkPaths.js';

const STROKE_WIDTH = 28; // em units — tuned for pen-like weight
const TOTAL_DURATION_MS = 2200; // total animation time across all letters
const DONE_FADE_MS = 400; // dot fade-out after finishing

export default function HandwrittenWordmark({ fontSize = 38, color = '#ffffff' }) {
  // Responsive sizing: let the SVG fill its container up to a capped width.
  // The viewBox preserves aspect ratio automatically (default xMidYMid meet).
  // fontSize prop scales the maxWidth cap so larger font → slightly wider cap,
  // but we hard-cap at 300px to always fit within a 390px mobile viewport
  // that has px-8 (32px) padding on each side (~326px usable).
  const maxWidth = Math.min(Math.round(fontSize * 7.5), 300);

  // Refs for path elements — array of SVGPathElement | null
  const pathRefs = useRef(LETTERS.map(() => null));
  // Ref for the pen-dot circle element
  const dotRef = useRef(null);

  // Animation state
  // dashOffsets[i] = current strokeDashoffset for letter i (start = full length = hidden)
  const [dashOffsets, setDashOffsets] = useState(() => LETTERS.map(() => 1));
  // totalLengths[i] measured from getTotalLength()
  const totalLengths = useRef(LETTERS.map(() => 0));
  // Dot position
  const [dotPos, setDotPos] = useState({ x: 0, y: 0, visible: false, opacity: 1 });
  // Whether animation is running
  const animRunning = useRef(false);
  const rafId = useRef(null);

  const animate = useCallback(() => {
    if (animRunning.current) return;
    animRunning.current = true;

    // Measure all paths
    const lengths = LETTERS.map((_, i) => {
      const el = pathRefs.current[i];
      if (!el) return 100;
      try { return el.getTotalLength() || 100; } catch { return 100; }
    });
    totalLengths.current = lengths;
    const totalLen = lengths.reduce((a, b) => a + b, 0);

    // Initialize all to full offset (hidden)
    setDashOffsets(lengths.map(l => l));

    // Figure out per-letter duration proportional to its path length
    const letterDurations = lengths.map(l => (l / totalLen) * TOTAL_DURATION_MS);
    const startTimes = [];
    let acc = 0;
    for (let i = 0; i < lengths.length; i++) {
      startTimes.push(acc);
      acc += letterDurations[i];
    }

    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;

      // Update each letter's dashOffset
      const newOffsets = lengths.map((len, i) => {
        const t0 = startTimes[i];
        const dur = letterDurations[i];
        if (elapsed <= t0) return len; // not started
        if (elapsed >= t0 + dur) return 0; // fully drawn
        const progress = (elapsed - t0) / dur;
        // ease-in-out cubic
        const e = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        return len * (1 - e);
      });
      setDashOffsets(newOffsets);

      // Update dot position: find the active letter
      let activeLetter = LETTERS.length - 1;
      let activeFraction = 1;
      for (let i = 0; i < LETTERS.length; i++) {
        const t0 = startTimes[i];
        const dur = letterDurations[i];
        if (elapsed >= t0 && elapsed < t0 + dur) {
          activeLetter = i;
          activeFraction = (elapsed - t0) / dur;
          // ease same as above
          activeFraction = activeFraction < 0.5
            ? 4 * activeFraction ** 3
            : 1 - Math.pow(-2 * activeFraction + 2, 3) / 2;
          break;
        }
      }

      const el = pathRefs.current[activeLetter];
      if (el) {
        try {
          const len = lengths[activeLetter];
          const drawn = len * activeFraction;
          const pt = el.getPointAtLength(Math.min(drawn, len - 0.001));
          setDotPos({ x: pt.x, y: pt.y, visible: true, opacity: 1 });
        } catch { /* ignore */ }
      }

      // Check if all done
      if (elapsed < TOTAL_DURATION_MS) {
        rafId.current = requestAnimationFrame(tick);
      } else {
        // Final state: all drawn
        setDashOffsets(lengths.map(() => 0));
        // Move dot to end of last letter
        const lastEl = pathRefs.current[LETTERS.length - 1];
        if (lastEl) {
          try {
            const lastLen = lengths[LETTERS.length - 1];
            const pt = lastEl.getPointAtLength(lastLen);
            setDotPos({ x: pt.x, y: pt.y, visible: true, opacity: 1 });
          } catch { /* ignore */ }
        }
        // Fade out dot
        const fadeStart = performance.now();
        const fadeTick = (fn) => {
          const prog = Math.min((fn - fadeStart) / DONE_FADE_MS, 1);
          const opacity = 1 - prog;
          setDotPos(prev => ({ ...prev, opacity }));
          if (prog < 1) requestAnimationFrame(fadeTick);
          else setDotPos(prev => ({ ...prev, visible: false }));
        };
        requestAnimationFrame(fadeTick);
      }
    }

    rafId.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    // Small delay to let the SVG mount and paths be measurable
    const timeout = setTimeout(animate, 60);
    return () => {
      clearTimeout(timeout);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [animate]);

  return (
    <span style={{ display: 'block', lineHeight: 1, width: '100%', maxWidth: `${maxWidth}px`, margin: '0 auto' }}>
      <svg
        viewBox={VIEWBOX}
        style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
        aria-label="PocketCache"
      >
        {LETTERS.map((letter, i) => {
          const len = totalLengths.current[i] || 9999;
          return (
            <path
              key={`${letter.char}-${i}`}
              ref={el => { pathRefs.current[i] = el; }}
              d={letter.d}
              stroke={color}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={len}
              strokeDashoffset={dashOffsets[i]}
              style={{ willChange: 'stroke-dashoffset' }}
            />
          );
        })}

        {/* Pen-tip dot */}
        {dotPos.visible && (
          <circle
            ref={dotRef}
            cx={dotPos.x}
            cy={dotPos.y}
            r={22}
            fill={color}
            opacity={dotPos.opacity}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
    </span>
  );
}
