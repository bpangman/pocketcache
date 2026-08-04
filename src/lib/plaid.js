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
import { getSupabase } from './supa';

const SUPABASE_URL = 'https://yeptifozaytoglfwxksz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
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

/** Asks our edge function for a fresh Plaid Link token (sandbox). Throws on any failure. */
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
export async function exchangePlaidPublicToken({ publicToken, institution, accountName, accountMask }) {
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
 * Resolves with the connected card info ({ name, last4, brand, institution })
 * on success, matching the shape pc_tracked_card already expects. Rejects
 * with an Error whose message is 'cancelled' when the donor simply closed
 * the window without an error, so the caller can treat that quietly.
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
