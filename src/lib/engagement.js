// src/lib/engagement.js
//
// The REAL backends for the "Get More Involved" group, on both surfaces
// (app My Cause sheets + the web portal's modals). Two calls:
//
//   submitGiveExtra({ amountCents, orgCode }) -> give-extra edge function.
//     The pledge is NOT charged on the spot - it joins the donor's next
//     monthly charge (cycle-lock folds it in on the 1st, charge-cycles-run
//     bills it on the 11th), which is why the honest success copy on both
//     surfaces is "Added to your next monthly charge".
//
//   submitOrgContact({ orgCode, kind, fields }) -> org-contact edge function.
//     kind is 'match_sponsor' or 'volunteer'. The server resolves the org's
//     admin email by join code (it never leaves the server) and forwards the
//     form as one clean HTML email.
//
// Both are used ONLY when the surface is on real data (demoActive false in
// AppContext) - demo mode keeps the flashy simulated flows untouched.
//
// ERROR SHAPE: unlike lib/roundupsMe.js (whose callers silently fall back to
// demo numbers), these are explicit donor ACTIONS - a swallowed failure would
// mean a donor believes they pledged money or contacted a nonprofit when
// nothing happened. So both resolve to { ok: true, ... } on success and
// { ok: false, error } on any failure, with a plain-language default message,
// and never throw.
import { getSupabase } from './supa';

const SUPABASE_URL = 'https://yeptifozaytoglfwxksz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
const TIMEOUT_MS = 10000;

const GENERIC_GIVE_ERROR = 'Could not save your gift right now. Please try again.';
const GENERIC_CONTACT_ERROR = 'Could not send your message right now. Please try again.';

async function callFn(name, body, fallbackError) {
  try {
    const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // No session available - the functions accept their own fallbacks
      // (give-extra: body email; org-contact: none needed).
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) return json;
    return { ok: false, error: json?.error || fallbackError };
  } catch {
    return { ok: false, error: fallbackError };
  }
}

/**
 * @param {{ amountCents: number, orgCode?: string, email?: string }} opts
 *   amountCents - the gift in cents (server floor $1, ceiling $10,000).
 *   orgCode - the selected nonprofit's join code (optional; unknown codes are
 *     fine server-side, the pledge just is not attributed to an orgs row).
 *   email - fallback identity for a donor mid-signup without a session yet.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export function submitGiveExtra({ amountCents, orgCode, email }) {
  const body = { amount_cents: amountCents };
  if (orgCode) body.org_code = String(orgCode).toUpperCase();
  if (email) body.email = email;
  return callFn('give-extra', body, GENERIC_GIVE_ERROR);
}

/**
 * @param {{ orgCode: string, kind: 'match_sponsor'|'volunteer',
 *   fields: { name: string, email: string, message?: string, company?: string, budget?: string } }} opts
 * @returns {Promise<{ ok: true, org_name: string } | { ok: false, error: string }>}
 */
export function submitOrgContact({ orgCode, kind, fields }) {
  return callFn(
    'org-contact',
    { org_code: String(orgCode || '').toUpperCase(), kind, fields },
    GENERIC_CONTACT_ERROR,
  );
}
