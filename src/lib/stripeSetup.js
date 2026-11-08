// src/lib/stripeSetup.js
//
// Real card saving via Stripe SetupIntents, shared by every card entry form
// (StripeCardForm on the web portal, CardEntryForm in app Onboarding,
// AddCardForm in app Settings). The calls live here so the surfaces cannot
// drift on how a card actually gets saved.
//
// FLOW (the standard Stripe pattern - the card number never touches our server)
//   1. fetchSetupIntent() asks our stripe-setup-intent edge function for a
//      SetupIntent client_secret + the Stripe customer id. The function
//      creates (or reuses, by email) a Customer on our platform account and
//      records a pending row in the stripe_donors table.
//   2. The browser calls stripe.confirmCardSetup(client_secret, ...) with the
//      CardElement - card details go straight from the donor's browser to
//      Stripe.
//   3. completeSetup() tells our stripe-setup-complete edge function which
//      payment method got attached; it verifies that server-side with the
//      secret key and marks the stripe_donors row saved. It answers with the
//      real brand + last4 so nothing downstream ever fabricates one.
//
// If step 1 fails (offline, function down, Stripe unreachable) the calling
// form falls back to the old simulated save - clearly flagged simulated - so
// signup never dead-ends. Genuine card problems (declines, bad numbers) are
// surfaced to the donor instead.
import { loadStripe } from '@stripe/stripe-js/pure';
import { getSupabase, SUPABASE_ANON_KEY, FUNCTIONS_BASE } from './supa';
import { STRIPE_PUBLISHABLE_KEY } from './stripeKey';

// Stripe.js is loaded lazily, once, and ONLY from here.
//
// Why not `const stripePromise = loadStripe(KEY)` at module scope (the pattern
// the card forms used to carry): the `@stripe/stripe-js` main entry injects
// the js.stripe.com script the moment it is imported, and loadStripe() rejects
// with 'Failed to load Stripe.js' when that script cannot be fetched. Nothing
// caught it, so a flaky network put an unhandled rejection in the console of
// every surface that merely imported a card form - the phone app, the
// dashboards, the nonprofit admin - pages that never needed Stripe. The `pure`
// entry has no import-time side effect, the script is requested when a card
// form actually mounts, and a failed load resolves to null so the form can
// show its practice-mode note instead of the console turning red.
let stripePromise = null;

// How long a card form waits for js.stripe.com before it gives up and runs
// in practice mode. Generous enough for a slow phone connection; short enough
// that a blocked script does not leave the donor staring at an empty box.
const STRIPE_LOAD_TIMEOUT_MS = 12000;

// The script URLs stripe-js itself recognises (its findScript() uses the same
// shapes): the classic /v3 and the versioned release trains (/dahlia/stripe.js).
const STRIPE_SCRIPT_RE = /^https:\/\/js\.stripe\.com\/(v3\/?|[a-z0-9]+\/stripe\.js)(\?.*)?$/;

/**
 * Remove a Stripe.js <script> tag that is on the page without having produced
 * window.Stripe. A screen that still carries the old module-level
 * `loadStripe()` (the main @stripe/stripe-js entry injects at import time)
 * leaves exactly that behind when the script fails: stripe-js's loader then
 * finds the dead tag, listens on it for a load/error event that already fired,
 * and never settles. With the tag gone it injects a fresh one and gets a real
 * answer. A script that already loaded is left alone (window.Stripe exists).
 */
function dropDeadStripeScripts() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.Stripe) return;
  for (const el of document.querySelectorAll('script[src^="https://js.stripe.com/"]')) {
    if (STRIPE_SCRIPT_RE.test(el.src)) el.parentNode?.removeChild(el);
  }
}

/**
 * The shared Stripe.js promise for <Elements stripe={...}>. Resolves to the
 * Stripe instance, or to null when js.stripe.com could not be reached (or did
 * not answer within STRIPE_LOAD_TIMEOUT_MS) - it never rejects. Memoised so
 * every card form on the page shares one instance and <Elements> never sees
 * its `stripe` prop change between renders. A null outcome is forgotten, so
 * the next card form to mount (or getStripePromise(true)) tries the script
 * again instead of replaying the failure.
 *
 * @param {boolean} [retry=false]
 * @returns {Promise<import('@stripe/stripe-js').Stripe|null>}
 */
export function getStripePromise(retry = false) {
  if (retry || !stripePromise) {
    dropDeadStripeScripts();
    const attempt = Promise.race([
      loadStripe(STRIPE_PUBLISHABLE_KEY),
      new Promise(resolve => setTimeout(() => resolve(null), STRIPE_LOAD_TIMEOUT_MS)),
    ]).catch(() => null).then(stripe => {
      if (!stripe && stripePromise === attempt) stripePromise = null;
      return stripe;
    });
    stripePromise = attempt;
  }
  return stripePromise;
}

/** Alias of getStripePromise for callers that prefer the shorter name. */
export const getStripe = getStripePromise;

const BRAND_NAMES = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

/** 'visa' -> 'Visa'. Stripe reports brands lowercase; donors see title case. */
export function prettyBrand(raw) {
  if (!raw) return 'Card';
  return BRAND_NAMES[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    headers['Authorization'] = `Bearer ${token ?? SUPABASE_ANON_KEY}`;
  } catch {
    headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
}

/**
 * Best-effort email for the donor saving the card: the signed-in Supabase
 * session first, then the locally stored identity. Null when unknown - the
 * edge function copes fine without one.
 */
export async function currentDonorEmail() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const email = data?.session?.user?.email;
    if (email) return email;
  } catch { /* fall through to local identity */ }
  try {
    const raw = localStorage.getItem('pc_identity');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.email ?? null;
  } catch {
    return null;
  }
}

/** Ask stripe-setup-intent for a fresh SetupIntent. Throws on any failure. */
async function fetchSetupIntent(email) {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/stripe-setup-intent`, {
    method: 'POST',
    headers,
    body: JSON.stringify(email ? { email } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.client_secret || !data?.customer_id) {
    throw new Error(data?.error || 'setup-intent request failed');
  }
  return data; // { client_secret, customer_id }
}

/** Tell stripe-setup-complete the card is attached; get the verified brand/last4 back. */
async function completeSetup({ customerId, paymentMethodId, setupIntentId }) {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/stripe-setup-complete`, {
    method: 'POST',
    headers,
    // setup_intent_id lets the server cross-check against the intent it minted.
    body: JSON.stringify({ customer_id: customerId, payment_method_id: paymentMethodId, setup_intent_id: setupIntentId ?? null }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'setup-complete request failed');
  return data; // { ok, brand, last4 }
}

/**
 * The whole save-a-card flow for a mounted CardElement.
 *
 * Resolves to:
 *   { card: { id, last4, brand, customerId, simulated: false } }  on success
 *   { error: 'message for the donor' }                            on a genuine
 *     card problem (decline, bad number) - show it, let them retry
 * Throws only when our backend or Stripe is unreachable BEFORE the card was
 * involved - the caller treats that as "fall back to the simulated save".
 *
 * @param {object} stripe   from useStripe()
 * @param {object} cardElement  elements.getElement(CardElement)
 * @param {string|null} email   donor email if known
 */
export async function saveCardWithSetupIntent(stripe, cardElement, email) {
  // 1. SetupIntent from our backend. Failures here throw -> simulated fallback.
  const { client_secret: clientSecret, customer_id: customerId } = await fetchSetupIntent(email);

  // 2. Confirm in the browser - the card goes donor -> Stripe directly.
  const result = await stripe.confirmCardSetup(clientSecret, {
    payment_method: { card: cardElement },
  });

  if (result.error) {
    const err = result.error;
    if (err.type === 'card_error' || err.type === 'validation_error') {
      return { error: err.message ?? 'That card could not be saved. Check the details and try again.' };
    }
    // Not the donor's fault - let the caller fall back to simulated.
    throw new Error(err.message || 'confirmCardSetup failed');
  }

  const paymentMethodId = result.setupIntent?.payment_method;
  if (!paymentMethodId || result.setupIntent?.status !== 'succeeded') {
    throw new Error('SetupIntent did not succeed');
  }

  // 3. Server-side verification + the real brand/last4.
  const done = await completeSetup({ customerId, paymentMethodId, setupIntentId: result.setupIntent?.id });
  const brand = prettyBrand(done.brand);

  return {
    card: {
      id: paymentMethodId,
      last4: done.last4 ?? null,
      brand,
      name: `My ${brand}`,
      customerId,
      simulated: false,
    },
  };
}
