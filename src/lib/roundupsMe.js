// src/lib/roundupsMe.js
//
// Calls the roundups-me edge function for the signed-in donor - the on-
// demand path that shows a REAL pending round-up total next to the demo
// number on both dashboards (see src/store/AppContext.jsx, which is the one
// place this gets called from). Same fallback-shape convention as
// lib/orgStats.js: any failure, timeout, or missing session resolves to
// `null` so callers can fall back to the simulated demo experience without
// a loading flicker or an error banner.
//
// IDENTITY IS THE SESSION JWT, FULL STOP. The body never carries an email:
// the server's old body-email fallback let anyone who knew a donor's address
// read their purchase history and change their multiplier, so it is gone on
// both ends. With no session this resolves null without calling anything.
//
// The body also carries the donor's billing settings (skip / cap / one-time
// adjustment / processing cover) so they persist on stripe_donors and the
// real charge honors them. Until the server side ships, these fields are
// simply ignored by the function - sending them early is harmless and lets
// the client and server deploy independently.
import { getSupabase, SUPABASE_ANON_KEY, FUNCTIONS_BASE } from './supa';

const TIMEOUT_MS = 5000;

/** The signed-in session's access token, or null (no session / storage error). */
async function sessionToken() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Copy `key` from opts onto body when the caller set it - `null` included,
 *  because null is how a skip or an adjustment is CLEARED server-side. */
function passThrough(body, opts, key) {
  if (opts[key] !== undefined) body[key] = opts[key];
}

/**
 * @param {{
 *   multiplier?: number,
 *   profile?: { display_name?: string, org_join_code?: string },
 *   skip_month_key?: string|null,
 *   monthly_cap_cents?: number|null,
 *   charge_adjustment_cents?: number|null,
 *   adjustment_month_key?: string|null,
 *   cover_processing?: boolean,
 * }} [opts]
 *   - `multiplier` also persists a multiplier change server-side in the same
 *     round trip.
 *   - `profile` upserts the donor's server-side profile (display name and/or
 *     bound cause join code - see supabase/donor_profiles.sql) in the same
 *     round trip; the response's `profile` reflects the update.
 *   - `skip_month_key` (the cycle to skip, from billing.skipTargetMonth(), or
 *     null to un-skip), `monthly_cap_cents` (null for no cap),
 *     `charge_adjustment_cents` + `adjustment_month_key` (the one-time
 *     adjustment and the cycle it applies to, null to clear) and
 *     `cover_processing` persist the donor's billing settings server-side so
 *     cycle-lock applies them. Passed through verbatim; `null` is sent.
 * @returns {Promise<null | {
 *   ok: true, linked: boolean, month_key?: string, pending_total_cents?: number,
 *   txn_count?: number, last_synced_at?: string|null, recent?: Array, multiplier: number,
 *   profile?: null | { display_name: string|null, org_join_code: string|null, org_bound_at: string|null },
 * }>} null on no-session/network-error/timeout/non-2xx - callers fall back to demo data.
 */
export async function fetchRoundupsMe(opts = {}) {
  try {
    const token = await sessionToken();
    if (!token) return null; // no real session - demo-only donor, do not call

    const body = {};
    if (opts.multiplier) body.multiplier = opts.multiplier;
    if (opts.profile) body.profile = opts.profile;
    passThrough(body, opts, 'skip_month_key');
    passThrough(body, opts, 'monthly_cap_cents');
    passThrough(body, opts, 'charge_adjustment_cents');
    passThrough(body, opts, 'adjustment_month_key');
    passThrough(body, opts, 'cover_processing');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${FUNCTIONS_BASE}/roundups-me`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.ok ? json : null;
  } catch {
    return null;
  }
}

/**
 * Persist part of the donor's server-side profile (display name / bound
 * cause), best-effort and fire-and-forget friendly: resolves null quickly
 * when there is no session (the common demo-only case), same convention as
 * fetchRoundupsMe itself. Callers that also want the fresh totals can use
 * the resolved response, which is a full roundups-me payload.
 *
 * @param {{ display_name?: string, org_join_code?: string }} fields
 */
export function pushDonorProfile(fields) {
  return fetchRoundupsMe({ profile: fields });
}

/**
 * Close the donor's account for real: POST donor-close with the session
 * bearer. `action` is 'cancel' (stop giving, keep the login) or 'delete'
 * (erase the account); `final` says what happens to the accrued round-ups -
 * 'donate' sends them as a final gift (the server allows this from $0.50,
 * below the usual $5 floor), 'waive' lets them go. The server never charges
 * the $1 fee on its own when a donor leaves.
 *
 * Unlike fetchRoundupsMe this is an explicit donor ACTION, so it never
 * resolves null: the caller must be able to tell "done" from "not done".
 *
 * @param {{ action: 'cancel'|'delete', final: 'donate'|'waive' }} o
 * @returns {Promise<{ ok: true }
 *   | { ok: false, reason: 'no-session' }
 *   | { ok: false, reason: 'unavailable' }      the function is not deployed
 *                                                yet (404) or the network failed
 *   | { ok: false, reason: 'error', error: string }>}
 */
export async function closeDonorAccount({ action, final }) {
  const token = await sessionToken();
  if (!token) return { ok: false, reason: 'no-session' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
    const res = await fetch(`${FUNCTIONS_BASE}/donor-close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, final }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 404) return { ok: false, reason: 'unavailable' };
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) return { ok: true };
    // 502 means the close itself landed but clean-up (card detach / Plaid
    // unlink) partially failed: the account IS closed, so report it as such.
    if (res.status === 502) return { ok: true, partial: true, error: json?.error || 'clean-up incomplete' };
    return { ok: false, reason: 'error', error: json?.error || `donor-close failed (${res.status})` };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
