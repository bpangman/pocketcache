// src/lib/donorDraft.js
//
// ─── Shared sessionStorage draft for the DONOR signup form ────────────────────
//
// App.jsx's isMobile check (MOBILE_BP = 600) is a full component swap, not a
// CSS media query: crossing it mid-signup unmounts whichever donor wizard is
// currently rendering (Onboarding.jsx's SignUpScreen on the phone-style
// shell, WebOnboarding.jsx's 'account' step on the web-style one) and mounts
// the other in its place. This module is the ONE draft both sides read and
// write, so a resize either direction restores what was already typed
// instead of resetting the form. See src/lib/npSignup.js for the same idea
// applied to the nonprofit wizard.
//
// SCOPE: only the account-creation step (app step 'signup', web step
// 'account') is covered - by far the step where the most gets typed (name,
// state, terms), and the one place a remount most visibly reads as "I lost
// everything". Progress further along (bank connect, payment method,
// review) is NOT restored across a breakpoint remount today; a resize there
// re-starts that later part of the flow rather than losing the account
// itself, which already exists server-side by that point.
//
// saveDonorDraft MERGES onto whatever is already stored, rather than
// overwriting wholesale - each surface only knows its own fields, so a
// merge is what keeps one surface's save from wiping the other's.

const DONOR_DRAFT_KEY = 'pc_web_donor_draft';

export function loadDonorDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DONOR_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveDonorDraft(partial) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadDonorDraft() ?? {};
    window.sessionStorage.setItem(DONOR_DRAFT_KEY, JSON.stringify({ ...existing, ...partial }));
  } catch { /* storage full/unavailable - the draft just won't survive a remount */ }
}

export function clearDonorDraft() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(DONOR_DRAFT_KEY); } catch { /* ignore */ }
}

// App step id -> web step id. Also used for Settings deep-links into the web
// wizard (see WebOnboarding's initialOnboardingStep effect), which is why it
// covers more than just 'signup' even though the draft itself only restores
// that one pair - the other three are safe to jump straight to since they
// carry no typed-form state of their own worth restoring here.
export const DEEP_LINK_MAP = { 'connect-card': 'card', 'payment-method': 'payment', 'checkout-confirm': 'review', signup: 'account' };

// The one pair a breakpoint remount actually restores into - see SCOPE above.
export const WEB_STEP_TO_APP_STEP = { account: 'signup' };
