// src/lib/plaid.js
//
// Real Plaid Link (sandbox mode) for the donor "which card should we track"
// step. Shared by both signup surfaces (Onboarding.jsx and WebOnboarding.jsx)
// through the PlaidBankConnect component - the calls themselves live here so
// the two screens cannot drift on how a bank connection actually happens.
//
// FLOW
//   1. fetchPlaidLinkToken() asks our plaid-link-token edge function for a
//      fresh link_token (Plaid's sandbox environment).
//   2. loadPlaidLinkScript() lazily injects Plaid's own Link script - only
//      once, only when the connect-card step actually mounts.
//   3. window.Plaid.create({ token, onSuccess, onExit }).open() runs Plaid's
//      real hosted bank-search UI in an iframe/webview.
//   4. onSuccess hands us a public_token + metadata; exchangePublicToken()
//      sends that to our plaid-exchange edge function, which swaps it for a
//      real access_token server-side (never sent to the browser) and stores
//      it in the RLS-protected plaid_items table.
//
// WHO MAY CALL
//   Both wizards put the verified account step BEFORE connect-card, so every
//   real Plaid call here has a Supabase session behind it. There is no anon-key
//   fallback any more: with no session fetchPlaidLinkToken rejects with
//   reason 'no-session', and PlaidBankConnect shows its labeled practice-mode
//   fallback instead - which is exactly what the marketing PhoneFrame demo
//   (never signed in) should get. The edge function is expected to 401
//   anything without a valid JWT; that path lands in the same fallback.
import { getSupabase, SUPABASE_ANON_KEY, FUNCTIONS_BASE } from './supa';
const PLAID_LINK_SCRIPT_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

let plaidScriptPromise = null;

/** Lazily injects Plaid's Link script. Safe to call more than once - only loads it once. */
export function loadPlaidLinkScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.Plaid) return Promise.resolve(window.Plaid);
  if (plaidScriptPromise) return plaidScriptPromise;

  plaidScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PLAID_LINK_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Plaid));
      existing.addEventListener('error', () => reject(new Error('Plaid script failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = PLAID_LINK_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(window.Plaid);
    script.onerror = () => reject(new Error('Plaid script failed to load'));
    document.head.appendChild(script);
  });

  return plaidScriptPromise;
}

/** Session-only auth headers. Rejects with an Error whose `reason` (and
 *  message) is 'no-session' when there is no signed-in donor - never falls
 *  back to the anon key. */
async function authHeaders() {
  let token = null;
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token ?? null;
  } catch {
    token = null;
  }
  if (!token) {
    const err = new Error('no-session');
    err.reason = 'no-session';
    throw err;
  }
  return { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
}

/** Asks our edge function for a fresh Plaid Link token (sandbox). Throws on
 *  any failure, including 'no-session' when nobody is signed in and a 401 from
 *  the function - PlaidBankConnect turns either into its practice fallback. */
export async function fetchPlaidLinkToken() {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/plaid-link-token`, { method: 'POST', headers });
  if (!res.ok) throw new Error('link-token request failed');
  const data = await res.json();
  if (!data?.link_token) throw new Error('no link_token in response');
  return data.link_token;
}

/**
 * Sends the public_token Plaid Link handed us, plus account metadata, to our
 * plaid-exchange edge function. Resolves to { institution, account_name,
 * account_mask } - the access token itself never comes back to the browser.
 */
async function exchangePlaidPublicToken({ publicToken, institution, accountName, accountMask }) {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/plaid-exchange`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      public_token: publicToken,
      institution,
      account_name: accountName,
      account_mask: accountMask,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'exchange request failed');
  return data;
}

/**
 * Opens real Plaid Link (sandbox) for an ALREADY-FETCHED link token. Kept
 * separate from fetching the token so a caller (PlaidBankConnect) can tell a
 * "could not even start" failure (offline, function down - falls back to the
 * practice-mode list) apart from a "donor closed the window" or "Plaid itself
 * errored" outcome (stays on the real flow, lets them retry).
 *
 * Resolves with the connected card info ({ name, last4, brand, institution,
 * source: 'plaid', accountType, accountSubtype }) on success - a superset of
 * the shape pc_tracked_card already expects. `source` and the Plaid account
 * type/subtype are what lets a payment screen tell a real depository account
 * (debitable) apart from a tracked credit card or a typed-in card; see
 * isDebitableBank. Rejects with an Error whose message is 'cancelled' when the
 * donor simply closed the window without an error, so the caller can treat
 * that quietly.
 */
export async function openPlaidLinkWithToken(linkToken) {
  const Plaid = await loadPlaidLinkScript();

  return new Promise((resolve, reject) => {
    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          const account = metadata?.account ?? metadata?.accounts?.[0] ?? {};
          const institutionName = metadata?.institution?.name ?? 'Your bank';
          const accountName = account?.name || account?.official_name || institutionName;
          const accountMask = account?.mask || '0000';

          await exchangePlaidPublicToken({
            publicToken,
            institution: institutionName,
            accountName,
            accountMask,
          });

          resolve({
            name: accountName,
            last4: accountMask,
            brand: institutionName,
            institution: institutionName,
            source: 'plaid',
            accountType: account?.type ?? null,       // 'depository' | 'credit' | ...
            accountSubtype: account?.subtype ?? null, // 'checking' | 'savings' | 'credit card' | ...
          });
        } catch (err) {
          reject(err);
        }
      },
      onExit: (err) => {
        if (err) reject(new Error(err.error_message || 'Plaid Link closed with an error'));
        else reject(new Error('cancelled'));
      },
    });
    handler.open();
  });
}

/**
 * Can this linked account be DEBITED for the monthly charge? Only a real Plaid
 * connection to a depository account (checking / savings) qualifies. A typed-in
 * card (source 'manual'), the offline practice fallback (source 'practice') and
 * a Plaid-tracked credit card are all tracking sources, never a bank to debit.
 * Payment screens pass BankPaymentAuth `linkedBank` only when this is true.
 * @param {object|null|undefined} linked - what ConnectCardScreen produced.
 * @returns {boolean}
 */
export function isDebitableBank(linked) {
  return linked?.source === 'plaid' && linked?.accountType === 'depository';
}
