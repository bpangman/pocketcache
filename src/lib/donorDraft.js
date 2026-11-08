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
// SCOPE: two things are covered.
//
//  1. The account-creation step (app step 'signup', web step 'account') - by
//     far the step where the most gets typed (name, state, terms), and the
//     one place a remount most visibly reads as "I lost everything". Both
//     surfaces read and write this part through saveDonorDraft / `step`.
//
//  2. Progress PAST the account step on the phone surface: the linked card's
//     display fields and the verified identity (saveDonorProgress). A
//     remount or reload between "card linked" and "payment method chosen"
//     resumes at the payment-method step instead of asking the donor to link
//     the card again. Only display fields are kept - never a Plaid access
//     token, account id or anything else that could be replayed - and the
//     pending payment method is deliberately NOT saved: an authorization is
//     given again, never restored. These live in their own fields (appStep,
//     connectedBank, identity) so WebOnboarding, which reads `step` directly
//     as its initial step, is unaffected.
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

// ─── Progress past the account step (phone surface) ──────────────────────────

// The linked card as the donor sees it. Anything else on the object a bank
// connector returned (Plaid access token, account id, item id, ...) is
// dropped here, so nothing replayable ever reaches sessionStorage.
const BANK_DISPLAY_FIELDS = ['name', 'last4', 'brand', 'institution', 'source', 'accountType'];

function sanitizeBank(bank) {
  if (!bank || typeof bank !== 'object') return null;
  const out = {};
  for (const key of BANK_DISPLAY_FIELDS) {
    if (bank[key] !== undefined && bank[key] !== null) out[key] = bank[key];
  }
  return out.last4 || out.name ? out : null;
}

// The verified identity SignUpScreen produced (name, email, provider,
// joinedAt) - the same shape setHasAccount persists at the end of signup.
const IDENTITY_FIELDS = ['name', 'email', 'provider', 'joinedAt'];

function sanitizeIdentity(identity) {
  if (!identity || typeof identity !== 'object') return null;
  const out = {};
  for (const key of IDENTITY_FIELDS) {
    if (identity[key] !== undefined && identity[key] !== null) out[key] = identity[key];
  }
  return out.email ? out : null;
}

/**
 * Record how far the phone signup got past the account step.
 * @param {object} progress
 * @param {string} [progress.appStep]       The step to resume at ('payment-method').
 * @param {object} [progress.connectedBank] The linked card; reduced to display fields.
 * @param {object} [progress.identity]      The verified identity; reduced to display fields.
 */
export function saveDonorProgress({ appStep, connectedBank, identity } = {}) {
  const partial = {};
  if (appStep !== undefined) partial.appStep = appStep;
  if (connectedBank !== undefined) partial.connectedBank = sanitizeBank(connectedBank);
  if (identity !== undefined) partial.identity = sanitizeIdentity(identity);
  saveDonorDraft(partial);
}

/** @returns {{ appStep?: string, connectedBank?: object|null, identity?: object|null }|null} */
export function loadDonorProgress() {
  const draft = loadDonorDraft();
  if (!draft) return null;
  const { appStep, connectedBank, identity } = draft;
  if (appStep === undefined && connectedBank === undefined && identity === undefined) return null;
  return {
    appStep: appStep ?? null,
    connectedBank: sanitizeBank(connectedBank),
    identity: sanitizeIdentity(identity),
  };
}

// App step id -> web step id. Also used for Settings deep-links into the web
// wizard (see WebOnboarding's initialOnboardingStep effect), which is why it
// covers more than just 'signup' even though the draft itself only restores
// that one pair - the other three are safe to jump straight to since they
// carry no typed-form state of their own worth restoring here.
export const DEEP_LINK_MAP = { 'connect-card': 'card', 'payment-method': 'payment', 'checkout-confirm': 'review', signup: 'account' };

// The one pair a breakpoint remount actually restores into - see SCOPE above.
export const WEB_STEP_TO_APP_STEP = { account: 'signup' };
