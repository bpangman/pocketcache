// src/lib/npApi.js
//
// Calls to the nonprofit self-serve onboarding edge functions (org-signup,
// org-connect-stripe, org-connect-status, org-admin-lookup) plus the anon
// read of orgs_public. Mirrors the auth-header pattern already used by
// src/lib/stripeSetup.js: the caller's real Supabase session token when
// there is one, the anon key otherwise.
import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_BASE } from './supa';

const REST_BASE = `${SUPABASE_URL}/rest/v1`;

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

async function authHeaders() {
  const token = await sessionToken();
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
  };
}

async function callFn(name, body) {
  const headers = await authHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body ?? {}), signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    // fetch THROWS (instead of resolving to a Response) on a real network
    // failure - offline, DNS, connection reset - and on our own 15s abort
    // above; without this catch either one hung the caller forever instead
    // of ever reaching the practice-mode fallback that already handles HTTP
    // errors. Normalize to the EXACT same { ok, status, data } shape the
    // try block returns for an HTTP error (e.g. a 500 with a non-JSON body
    // resolves to { ok: false, status: 500, data: null }) so every caller -
    // ensureServerOrg's practiceMode fallback, connectStripe's stripeError,
    // orgConnectStatus polling - keeps working unmodified: it only ever
    // reads res.ok / res.status / res.data and never needs to tell a network
    // failure apart from an HTTP error. status: 0 is the conventional "no
    // HTTP response was ever received" value, distinct from any real status.
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timeout);
  }
}

/** Requires a signed-in admin session (see adminAuth.verifyCode). Idempotent
 *  upsert - see supabase/functions/org-signup/index.ts for the ordering
 *  decision (called once at end of email verify, again at go-live). */
export function orgSignup(payload) {
  return callFn('org-signup', payload);
}

/** Requires a signed-in admin session matching the org. Returns { url }. */
export function orgConnectStripe(orgId) {
  return callFn('org-connect-stripe', { org_id: orgId });
}

/** Requires a signed-in admin session matching the org. */
export function orgConnectStatus(orgId) {
  return callFn('org-connect-status', { org_id: orgId });
}

/** Resolves which org (if any) an email administers, right after OTP verify
 *  and from the two sign-in screens. Both callers run AFTER verifyCode, so a
 *  session exists and its bearer token goes along: the edge function can then
 *  look up the AUTHENTICATED email instead of trusting the body, which closes
 *  the admin-email enumeration hole. With no session the function answers
 *  401 { known: false }; both callers always have one. */
export async function orgAdminLookup(email) {
  const token = await sessionToken();
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${FUNCTIONS_BASE}/org-admin-lookup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/** Anon REST read of orgs_public by id - used to resume the wizard after the
 *  Stripe hosted-onboarding redirect (?npstripe=return&org=<id>), which does
 *  a full page navigation and loses all in-memory wizard state. Returns null
 *  on any failure so callers can fall back gracefully. */
export async function fetchOrgPublicById(id) {
  if (!id) return null;
  try {
    const res = await fetch(`${REST_BASE}/orgs_public?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** Anon REST read of orgs_public by join code - the real-org counterpart to
 *  orgStore.js's synchronous, localStorage-only findOrgByCode. Kept as a
 *  SEPARATE async function rather than changing findOrgByCode's signature:
 *  findOrgByCode is called synchronously from many places across the app
 *  (donor join gate, desktop routing, ...) well outside this build's scope,
 *  and flipping it to async would ripple through all of them. Call sites
 *  that specifically need to resolve a REAL server org (the admin sign-in
 *  screens, the Stripe-return resume) use this instead. */
export async function fetchOrgPublicByCode(code) {
  if (!code) return null;
  try {
    const res = await fetch(`${REST_BASE}/orgs_public?join_code=eq.${encodeURIComponent(code.toUpperCase())}&select=*&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** Current Supabase session's email, if any - used to resume the wizard after
 *  the Stripe redirect (the session survives the full-page navigation even
 *  though in-memory wizard state does not). */
export async function currentSessionEmail() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.email ?? null;
  } catch {
    return null;
  }
}
