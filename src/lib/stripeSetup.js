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
import { getSupabase } from './supa';

const SUPABASE_URL = 'https://yeptifozaytoglfwxksz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

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
export async function fetchSetupIntent(email) {
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
export async function completeSetup({ customerId, paymentMethodId }) {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/stripe-setup-complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ customer_id: customerId, payment_method_id: paymentMethodId }),
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
  const done = await completeSetup({ customerId, paymentMethodId });
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
