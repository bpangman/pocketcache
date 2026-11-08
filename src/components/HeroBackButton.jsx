import { ChevronLeft } from 'lucide-react';
import { safeTop } from '../lib/safeArea';

/**
 * HeroBackButton - the circular back chevron pinned to the top-left of a
 * gradient hero.
 *
 * One component for every hero back control in src/pages/Onboarding.jsx (it
 * replaced five byte-identical inline copies). Render it inside the hero
 * <div> (the one with `position: 'relative'`): positioning is absolute and
 * anchored to that hero, not to the screen. It renders null when onClick is
 * missing, so callers need no `{onBack && ...}` guard.
 *
 * Hit area vs. visual: the <button> itself is 44x44 (the minimum tap target,
 * DESIGN.md) and transparent; the visible 36px circle is a child span, so the
 * chevron still reads as a small, quiet control while the whole 44px square
 * responds. The circle's centre sits where the old 36px button's did (16px in,
 * safe-top + 8px down), so nothing shifts visually.
 *
 * Styling: rgba(255,255,255,0.15) fill, 1px rgba(255,255,255,0.2) border,
 * ChevronLeft size 18 in white, zIndex 2 (local to the hero, deliberately NOT
 * from lib/overlay's Z scale - it only has to clear the hero's own children).
 * Focus ring comes from the global button:focus-visible rule in index.css.
 *
 * @param {object}   props
 * @param {Function} [props.onClick]           Back handler. No handler, no button.
 * @param {string}   [props.ariaLabel='Go back']
 * @param {string}   [props.className]         Extra classes, if a caller needs them.
 * @param {object}   [props.style]             Style overrides, merged last so a
 *                                             caller can move it (e.g. a hero
 *                                             with a different top offset).
 */
export default function HeroBackButton({ onClick, ariaLabel = 'Go back', className, style }) {
  if (!onClick) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      style={{
        position: 'absolute',
        top: safeTop(4),
        left: 12,
        width: 44,
        height: 44,
        padding: 0,
        borderRadius: '50%',
        background: 'transparent',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 2,
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronLeft size={18} color="white" />
      </span>
    </button>
  );
}
