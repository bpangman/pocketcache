/**
 * Overlay design tokens - z-index scale and scrim styles.
 *
 * WHY THIS EXISTS
 * The codebase grew three unrelated scrim colour families, five opacities and
 * nine z-index values. Full inventory taken before writing this file:
 *
 *   BLACK scrims (ordinary sheets and modals)
 *     Sheet.jsx:10-11                animate opacity 0.4, bg-black,  z-10 / z-20
 *     nonprofit/tabs/Donors.jsx:40   animate opacity 0.4, bg-black,  z-10 / z-20
 *     Settings.jsx:98,109            animate opacity 0.4, bg-black,  z-40 / z-50
 *     AppDownloadQRModal.jsx:18-19   rgba(0,0,0,0.5),  no blur,      z-50 / z-51
 *     WebPortalLinkModal.jsx:37,50   rgba(0,0,0,0.5),  no blur,      z-50 / z-51
 *
 *   NAVY scrims (blocking gates - content must be obscured, not just dimmed)
 *     App.jsx:36  CancelledOverlay      rgba(11,42,74,0.55) blur(8px)  z-50
 *     App.jsx:84  ReactivateCheckin     rgba(11,42,74,0.55) blur(8px)  z-50
 *     BiometricLock.jsx:165  (app)      rgba(11,42,74,0.55) blur(6px)  z-50
 *     BiometricLock.jsx:174  (web)      rgba(11,42,74,0.45) NO BLUR    z-60
 *     ChargeReviewAlert.jsx:139 (app)   rgba(11,42,74,0.55) blur(6px)  z-55
 *     ChargeReviewAlert.jsx:145 (web)   rgba(11,42,74,0.45) NO BLUR    z-70
 *     nonprofit/AdminVerify.jsx:36     rgba(11,42,74,0.55) blur(6px)  z-50
 *     WebPortalPages.jsx:58 Modal      rgba(11,42,74,0.45) NO BLUR    z-60
 *
 *   NEAR-OPAQUE NAVY takeovers (a different thing again - see scrim('opaque'))
 *     Onboarding.jsx:519  CA block     rgba(0,56,101,0.96) no blur    z-20
 *     Onboarding.jsx:597  welcome back rgba(0,56,101,0.97) no blur    z-30
 *
 * APP AND WEB SHOULD MATCH.
 * BiometricLock.jsx and ChargeReviewAlert.jsx each render the SAME gate twice,
 * once per surface, and dim harder + blur on the app surface (0.55 + blur) than
 * on the web surface (0.45, no blur). There is no functional reason for the
 * split - it is copy-paste drift. Both surfaces should use scrim('blocking').
 * The only real difference between the two branches is `position`, which is why
 * scrim() takes a `fixed` option instead of a surface name.
 *
 * Usage:
 *   import { Z, scrim } from '../lib/overlay';
 *   <div style={{ ...scrim('dim'), zIndex: Z.modalScrim }} onClick={onClose} />
 *   <div style={{ ...scrim('blocking', { fixed: true }), zIndex: Z.blockingScrim }} />
 */

/**
 * Z-INDEX SCALE
 *
 * Intended stacking order, lowest to highest:
 *
 *   pageToast   (5)   in-page celebration toast that BELONGS to the page under
 *                     an open sheet - see "TWO KINDS OF TOAST" below
 *   sheetScrim (10)   dim behind a bottom sheet
 *   sheet      (20)   the bottom sheet itself
 *   toast      (30)   transient toast raised BY an open sheet, so it has to
 *                     clear that sheet's own card - above a sheet, under a modal
 *   modalScrim (40)   dim behind a centred modal card
 *   modal      (50)   the centred modal card
 *   globalToast(50)   app-level toast that must not be buried by a modal card
 *   blockingScrim(60) full-screen gate: Face ID lock, cancelled account,
 *                     charge review, admin re-verify, CA block
 *   blocking   (61)   content that must sit ABOVE a blocking scrim as a sibling
 *                     (the gates today nest their card inside the scrim div and
 *                     therefore do not need this - it exists for new gates)
 *   splash    (100)   SplashAnimation - covers literally everything
 *   splashMark(101)   the coin mark inside the splash
 *
 * PRESERVING TODAY'S ORDER
 * Every value above keeps the existing relative order, with ONE deliberate
 * exception, called out so it is not mistaken for an accident:
 *
 *   BiometricLock's app-surface gate is z-50 today, which puts it UNDER the
 *   AppDownloadQRModal / WebPortalLinkModal card at z-51. Mapping it to
 *   blockingScrim (60) raises it above those modal cards. This is intentional:
 *   a Face ID gate that a modal can paint over is a bug, and the two cannot
 *   co-render in practice (the lock gates the app before any screen mounts).
 *   ChargeReviewAlert's app gate is already above them at z-55, so it is
 *   unaffected.
 *
 * globalToast deliberately EQUALS modal (both 50) rather than beating it. That
 * is exactly what App.jsx:167 does today (toast z-50 vs Settings modal card
 * z-50), so DOM order keeps deciding and nothing changes. Do not raise it to 51
 * without checking AppDownloadQRModal, which currently paints above the toast.
 *
 * TWO KINDS OF TOAST
 * The single `toast` step used to serve both, and at 30 it sat above the sheet
 * (20), so a milestone-unlocked or boost-confirmation toast on the Dashboard
 * visibly painted over the card of whatever bottom sheet the donor had open.
 * They are not the same thing:
 *
 *   pageToast (5)  An in-page CELEBRATION toast: "Milestone Unlocked!",
 *                  "Extra $25 sent!". It is a decoration on the page the donor
 *                  was looking at, not a response to the sheet in front of
 *                  them. Below sheetScrim (10) on purpose: open a sheet and the
 *                  toast dims out behind it with the rest of the page, exactly
 *                  as if it were one of the page's own cards. Nothing is lost -
 *                  these toasts are self-dismissing and purely informational.
 *
 *   toast (30)     A transient message RAISED BY an open sheet, which therefore
 *                  has to clear that sheet's card to be seen at all. Kept at 30
 *                  (above sheet, below modalScrim) for that case.
 *
 *   globalToast(50) An app-level confirmation fired from App.jsx's showToast()
 *                  ("Payment method updated.") that must survive a modal. See
 *                  the tie with `modal` above.
 *
 * So the rule when adding a toast is: does it belong to the page, to a sheet,
 * or to the app? Pick the matching step rather than reaching for the highest.
 */
export const Z = {
  // Floating page chrome that hovers over a tab's own content: the global
  // avatar button. It must sit ABOVE the page but BELOW pageToast, because a
  // toast pinned near the top of the screen overlaps the avatar and its
  // dismiss button has to stay tappable. The avatar was z-20 (above both
  // pageToast AND sheetScrim), which swallowed the milestone toast's X.
  chrome: 4,
  pageToast: 5,
  sheetScrim: 10,
  sheet: 20,
  toast: 30,
  modalScrim: 40,
  modal: 50,
  globalToast: 50,
  blockingScrim: 60,
  blocking: 61,
  splash: 100,
  splashMark: 101,
};

// ONE opacity per family, chosen from the inventory above.
//
// DIM = 0.5. Three of the five black scrims already use exactly
// rgba(0,0,0,0.5) statically; the other two animate to 0.4 via framer-motion.
// 0.5 wins on head count and is the more legible of the two behind white cards.
// Wiring Sheet.jsx / Donors.jsx / Settings.jsx to this is a deliberate
// 0.4 -> 0.5 change, not a regression.
//
// BLOCKING = rgba(11,42,74,0.55) + blur(6px). 0.55 is used by five of the eight
// navy scrims (all the app-surface ones) and 0.45 only by the three web copies,
// which are the drift described above. blur(6px) is used by four sites, blur(8px)
// by two, none by the web copies - 6px wins.
const DIM_BG = 'rgba(0,0,0,0.5)';
const BLOCKING_BG = 'rgba(11,42,74,0.55)';
const BLOCKING_BLUR = 'blur(6px)';

// Near-opaque navy for full-screen takeovers. NOT a scrim in the same sense:
// the point is that the screen underneath must NOT be legible (a compliance
// block, a redirect interstitial). 0.96 from Onboarding's CA block; the
// welcome-back overlay's 0.97 is within rounding of it.
const OPAQUE_BG = 'rgba(0,56,101,0.96)';

/**
 * Scrim style object. Spread it, then add your own zIndex from Z.
 *
 * @param {'dim'|'blocking'|'opaque'} kind
 *   'dim'      ordinary sheets and modals. Black 50%, no blur. The content
 *              behind stays readable - it is a "tap here to dismiss" surface.
 *   'blocking' gates that must obscure what is behind them: the Face ID lock,
 *              the cancelled-account overlay, the charge-review alert, the
 *              admin re-verify prompt. Navy 55% + blur(6px).
 *   'opaque'   full-screen takeovers where the screen behind must not be
 *              legible at all: Onboarding's California block and welcome-back
 *              interstitial. Navy 96%, no blur.
 *
 *              NOTE for whoever wires Onboarding.jsx:519 and :597 - do NOT
 *              swap those to 'blocking'. Dropping 0.96 to 0.55 makes the signup
 *              form visible through the California block, which is a visible
 *              (and arguably compliance-relevant) change, not a refactor.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.fixed=false]
 *   false -> position:absolute + inset:0. Correct inside the scaled phone
 *            frame: ScaleFit's CSS transform creates a containing block, so
 *            position:fixed would anchor to the scaled container anyway and
 *            absolute is the honest way to say it.
 *   true  -> position:fixed + inset:0, for the full-window web surface.
 * @returns {object} React style object
 */
export function scrim(kind, { fixed = false } = {}) {
  const base = {
    position: fixed ? 'fixed' : 'absolute',
    inset: 0,
  };

  if (kind === 'blocking') {
    return { ...base, background: BLOCKING_BG, backdropFilter: BLOCKING_BLUR };
  }
  if (kind === 'opaque') {
    return { ...base, background: OPAQUE_BG };
  }
  // 'dim' and anything unrecognised - the safe default.
  return { ...base, background: DIM_BG };
}

/**
 * Centring helper for the flex-centred gates (they all repeat the same three
 * properties). Spread alongside scrim():
 *   <div style={{ ...scrim('blocking'), ...centered(20), zIndex: Z.blockingScrim }}>
 */
export function centered(padding = 20) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding,
  };
}
