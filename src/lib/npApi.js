// src/lib/npApi.js
//
// Calls to the nonprofit self-serve onboarding edge functions (org-signup,
// org-connect-stripe, org-connect-status, org-admin-lookup) plus the anon
// read of orgs_public. Mirrors the auth-header pattern already used by
// src/lib/stripeSetup.js: the caller's real Supabase session token when
// there is one, the anon key otherwise.
import { getSupabase } from './supa';

const SUPABASE_URL = 'https://yeptifozaytoglfwxksz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
const REST_BASE = `${SUPABASE_URL}/rest/v1`;

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

async function callFn(name, body) {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
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

/** Public - no auth required. Used to resolve which org (if any) an email
 *  administers, both right after OTP verify and by the two sign-in screens. */
export async function orgAdminLookup(email) {
  const res = await fetch(`${FUNCTIONS_BASE}/org-admin-lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
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
