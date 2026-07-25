import { ChevronLeft } from 'lucide-react';
import { safeTop } from '../lib/safeArea';

/**
 * HeroBackButton - the circular back chevron pinned to the top-left of a
 * gradient hero.
 *
 * Replaces five byte-identical copies in src/pages/Onboarding.jsx (lines 435,
 * 908, 1153, 1400, 1474 before the refactor), each of which was:
 *
 *   {onBack && (
 *     <button onClick={onBack} style={{ position: 'absolute', top: 'calc(var(--pc-safe-top) + 8px)', left: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>
 *       <ChevronLeft size={18} color="white" />
 *     </button>
 *   )}
 *
 * USAGE - delete the whole `{onBack && (...)}` block above and write:
 *
 *   import HeroBackButton from '../components/HeroBackButton';
 *   ...
 *   <HeroBackButton onClick={onBack} />
 *
 * Drop the `{onBack && ...}` guard: this component renders null when onClick is
 * missing, which is exactly what the guard did. Keep it inside the same hero
 * <div> (the one with `position: 'relative'`) - positioning is absolute and
 * anchored to that hero, not to the screen.
 *
 * Onboarding.jsx imports ChevronLeft on line 4 only for these five buttons; once
 * all five are converted, drop ChevronLeft from that import list.
 *
 * The visual is unchanged: 36x36 circle, rgba(255,255,255,0.15) fill,
 * 1px rgba(255,255,255,0.2) border, ChevronLeft size 18 in white, left: 16,
 * top: safe-top + 8px, zIndex 2 (local to the hero, deliberately NOT from
 * lib/overlay's Z scale - it only has to clear the hero's own children).
 *
 * The one addition is aria-label, which the copies lacked: a bare chevron with
 * no text is unlabelled to a screen reader.
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
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      style={{
        position: 'absolute',
        top: safeTop(8),
        left: 16,
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)',
        border: '1px solid rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 2,
        ...style,
      }}
    >
      <ChevronLeft size={18} color="white" />
    </button>
  );
}
