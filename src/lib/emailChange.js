// src/lib/emailChange.js
//
// The honest donor/admin "change my email address" flow, shared by both donor
// surfaces (Settings.jsx sheet, WebPortalPages.jsx modal) and the nonprofit
// admin settings (NpSettings.jsx) so the three cannot drift on how a real
// email change actually works.
//
// WHAT SUPABASE ACTUALLY DOES (verified live against this project, 2026-08):
//   supabase.auth.updateUser({ email }) does NOT change the email immediately
//   and does NOT send a 6-digit code. It sets user.new_email to the pending
//   address and emails a CONFIRMATION LINK. This project has "Secure email
//   change" (double confirm) turned on, so a link is sent to BOTH the new and
//   the current address, and the change only completes once the link is
//   opened. There is no OTP-code path for email_change here - the templates
//   use the confirmation URL - so we present the truth: "we sent you a link,
//   open it, then come back", and we poll getUser() until the address flips.
//
// Once confirmed, user.email is the new address and user.new_email is cleared.
// getUser() reflects that on the SAME session (the user id never changes, so
// the access token stays valid), which is exactly what pollConfirmed() reads.

import { getSupabase } from './supa';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(addr) {
  return EMAIL_RE.test((addr || '').trim());
}

export function emailDomain(addr) {
  return (addr || '').trim().toLowerCase().split('@')[1] ?? '';
}

// Is there a REAL signed-in Supabase session (not just this device's local
// demo identity)? Changing an auth email is only possible for a real account.
export async function hasRealSession() {
  try {
    const { data } = await getSupabase().auth.getSession();
    return !!data?.session;
  } catch {
    return false;
  }
}

function friendlyChangeError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('session') || msg.includes('not authenticated') || err?.status === 401) {
    return 'You need to sign in again before changing your email.';
  }
  if (msg.includes('already') || msg.includes('registered') || msg.includes('in use') || err?.status === 422) {
    return 'That email is already in use on another account.';
  }
  if (err?.status === 429 || msg.includes('rate limit')) {
    return 'Too many attempts right now - try again in a few minutes.';
  }
  return "We couldn't start that change. Check the address and try again.";
}

/**
 * Kick off the email change. Sends the confirmation link(s) via Supabase.
 * @param {string} newEmail
 * @returns {Promise<{ok:true, pending:string} | {ok:false, error:string}>}
 */
export async function requestEmailChange(newEmail) {
  const addr = (newEmail || '').trim();
  if (!isValidEmail(addr)) return { ok: false, error: 'Enter a valid email address.' };
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase.auth.updateUser({ email: addr });
    if (error) return { ok: false, error: friendlyChangeError(error) };
    return { ok: true, pending: data?.user?.new_email ?? addr };
  } catch (err) {
    return { ok: false, error: friendlyChangeError(err) };
  }
}

/**
 * Poll point: what email does the server say this session has now, and is a
 * change still pending? The UI calls this on an interval while the "check your
 * inbox" state is showing; when email === the pending target, it is confirmed.
 * @returns {Promise<{email:string|null, pending:string|null}>}
 */
export async function pollConfirmed() {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return { email: null, pending: null };
    return { email: data?.user?.email ?? null, pending: data?.user?.new_email ?? null };
  } catch {
    return { email: null, pending: null };
  }
}

/**
 * After confirmation, push the new email to the server rows that are keyed by
 * email. Best-effort and silent - the auth change and the local pc_identity
 * update have already succeeded; this only keeps stripe_donors (donor) or
 * orgs.admin_email (admin) in step. Refreshes the session first so the access
 * token itself carries the new email before the edge function verifies it.
 *
 * The domain rule for admins is ENFORCED server-side in the edge function
 * against orgs.admin_domain; the client check in NpSettings is a fast-fail
 * courtesy, not the security boundary.
 *
 * @param {object} o
 * @param {'donor'|'admin'} o.role
 * @param {string} [o.oldEmail] - the address being replaced (for rows with a
 *   null user_id that can only be matched by email).
 * @param {string} [o.orgId] - admin only: the org whose admin_email to update.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function syncServerEmail({ role = 'donor', oldEmail, orgId } = {}) {
  const supabase = getSupabase();
  try {
    await supabase.auth.refreshSession().catch(() => { /* stale token still works via getUser */ });
    const { data, error } = await supabase.functions.invoke('update-donor-email', {
      body: { role, oldEmail, orgId },
    });
    if (error) return { ok: false, error: error.message };
    if (data && data.ok === false) return { ok: false, error: data.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'sync failed' };
  }
}
