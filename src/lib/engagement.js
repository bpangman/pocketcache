// src/lib/engagement.js
//
// The REAL backends for the "Get More Involved" group, on both surfaces
// (app My Cause sheets + the web portal's modals). Two calls:
//
//   submitGiveExtra({ amountCents, orgCode }) -> give-extra edge function.
//     The pledge is NOT charged on the spot - it joins the donor's next
//     monthly charge (cycle-lock folds it in on the 1st, charge-cycles-run
//     bills it on the 11th), which is why the honest success copy on both
//     surfaces is "Added to your next monthly charge". It REQUIRES a real
//     Supabase session: identity comes from the JWT only. The old email
//     fallback let anyone who knew a donor's address pledge money on that
//     donor's card, so it is gone on both ends - with no session this
//     resolves { ok: false, reason: 'no-session' } without calling anything.
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
import { getSupabase, SUPABASE_ANON_KEY, FUNCTIONS_BASE } from './supa';

const TIMEOUT_MS = 10000;

const GENERIC_GIVE_ERROR = 'Could not save your gift right now. Please try again.';
const NO_SESSION_GIVE_ERROR = 'Sign in to add a real gift.';
const GENERIC_CONTACT_ERROR = 'Could not send your message right now. Please try again.';

/** The signed-in session's access token, or null. */
async function sessionToken() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function callFn(name, body, fallbackError) {
  try {
    const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
    const token = await sessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    // No session: org-contact needs none. give-extra never gets here without
    // one (submitGiveExtra checks first).

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
 * @param {{ amountCents: number, orgCode?: string }} opts
 *   amountCents - the gift in cents (server floor $1, ceiling $10,000).
 *   orgCode - the selected nonprofit's join code (optional; unknown codes are
 *     fine server-side, the pledge just is not attributed to an orgs row).
 *   (An `email` field is ignored: identity is the session JWT only.)
 * @returns {Promise<{ ok: true } | { ok: false, reason?: 'no-session', error: string }>}
 */
export async function submitGiveExtra({ amountCents, orgCode }) {
  const token = await sessionToken();
  if (!token) return { ok: false, reason: 'no-session', error: NO_SESSION_GIVE_ERROR };
  const body = { amount_cents: amountCents };
  if (orgCode) body.org_code = String(orgCode).toUpperCase();
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
