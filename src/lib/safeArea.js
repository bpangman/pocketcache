/**
 * Safe-area helpers - the ONE place bottom/top inset math lives.
 *
 * WHY THIS EXISTS
 * ScaleFit.jsx publishes two CSS custom properties on the scale container:
 *   --pc-safe-top    = env(safe-area-inset-top) / scale
 *   --pc-safe-bottom = env(safe-area-inset-bottom) / scale
 * They are pre-divided by the render scale, so anything inside the scaled app
 * can use them as plain pre-scale pixel values.
 *
 * Today almost nothing does. Sheets, pinned footers and lock screens hardcode
 * their bottom padding instead:
 *   - Settings.jsx TrackCardSheet footer      -> "px-4 pb-10 pt-3"
 *   - Settings.jsx CancelAccountSheet         -> "px-4 pt-5 pb-10"
 *   - Onboarding.jsx pinned consent footer    -> "bg-white px-5 pb-8 pt-3"
 *   - Onboarding.jsx pinned CTA footers       -> "px-4 pb-10 pt-3"
 *   - every src/components/sheets/* body      -> "px-6 py-5 pb-8"
 *   - BiometricLock.jsx footnote              -> "bottom: 28"
 * 40px of static padding is fine on a home-button iPhone and collides with the
 * home indicator on every notched device (the indicator wants ~34px of its own
 * and the hit area sits on top of whatever button is pinned there).
 *
 * The ONLY places that get it right today are the two tab bars
 * (TabBar.jsx:19 and NpTabBar.jsx:17), both of which use exactly the pattern
 * safeBottomAtLeast() encodes:
 *   paddingBottom: 'max(12px, calc(var(--pc-safe-bottom) - 6px))'
 *
 * These helpers return CSS strings, not numbers, because the value has to stay
 * a live calc() - it is resolved by the browser against env(), which JS cannot
 * read reliably (and which changes on rotation and keyboard show/hide).
 *
 * Usage:
 *   import { safeBottom, safeBottomAtLeast, safeTop } from '../lib/safeArea';
 *   <div style={{ paddingBottom: safeBottom(12) }} />
 *   <div style={{ paddingBottom: safeBottomAtLeast(12, -6) }} />   // tab bars
 *   <div style={{ paddingTop: safeTop(8) }} />
 */

/**
 * Bottom inset plus `extra` px of breathing room.
 * safeBottom()    -> "calc(var(--pc-safe-bottom) + 0px)"
 * safeBottom(12)  -> "calc(var(--pc-safe-bottom) + 12px)"
 * safeBottom(-6)  -> "calc(var(--pc-safe-bottom) + -6px)"  (valid CSS calc)
 */
export function safeBottom(extra = 0) {
  return `calc(var(--pc-safe-bottom) + ${extra}px)`;
}

/**
 * Top inset plus `extra` px. Matches the hand-written
 * 'calc(var(--pc-safe-top) + 8px)' already used by the Onboarding hero back
 * buttons and 'calc(var(--pc-safe-top) + 12px)' used by the hero paddingTop.
 */
export function safeTop(extra = 0) {
  return `calc(var(--pc-safe-top) + ${extra}px)`;
}

/**
 * Bottom inset with a floor, for pinned footers and tab bars that still need
 * visible padding on devices with no inset at all (older iPhones, desktop,
 * Android without gesture nav).
 *
 * safeBottomAtLeast(12, -6) -> "max(12px, calc(var(--pc-safe-bottom) + -6px))"
 *   which is the tab-bar value written as "max(12px, calc(var(--pc-safe-bottom) - 6px))".
 *   Identical to the browser: calc() treats "+ -6px" and "- 6px" the same.
 * safeBottomAtLeast(24)     -> "max(24px, calc(var(--pc-safe-bottom) + 0px))"
 */
export function safeBottomAtLeast(min, extra = 0) {
  return `max(${min}px, ${safeBottom(extra)})`;
}

/** Top inset with a floor. Mirror of safeBottomAtLeast for symmetry. */
export function safeTopAtLeast(min, extra = 0) {
  return `max(${min}px, ${safeTop(extra)})`;
}
