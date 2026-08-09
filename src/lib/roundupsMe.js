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
// This ONLY uses the real Supabase session (Bearer JWT) - the server also
// accepts an email fallback (see supabase/functions/roundups-me), but that
// exists for a narrower mid-signup case this client does not need: both
// dashboards only call this once a donor has a real session, per the task.
import { getSupabase } from './supa';

const SUPABASE_URL = 'https://yeptifozaytoglfwxksz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
const TIMEOUT_MS = 5000;

/**
 * @param {{ multiplier?: number, profile?: { display_name?: string, org_join_code?: string } }} [opts]
 *   - `multiplier` also persists a multiplier change server-side in the same
 *     round trip.
 *   - `profile` upserts the donor's server-side profile (display name and/or
 *     bound cause join code - see supabase/donor_profiles.sql) in the same
 *     round trip; the response's `profile` reflects the update.
 * @returns {Promise<null | {
 *   ok: true, linked: boolean, month_key?: string, pending_total_cents?: number,
 *   txn_count?: number, last_synced_at?: string|null, recent?: Array, multiplier: number,
 *   profile?: null | { display_name: string|null, org_join_code: string|null, org_bound_at: string|null },
 * }>} null on no-session/network-error/timeout/non-2xx - callers fall back to demo data.
 */
export async function fetchRoundupsMe(opts = {}) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null; // no real session - demo-only donor, do not call

    const body = {};
    if (opts.multiplier) body.multiplier = opts.multiplier;
    if (opts.profile) body.profile = opts.profile;

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
