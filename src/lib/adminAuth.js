// src/lib/adminAuth.js
//
// Real nonprofit-admin sign-in: the same Supabase email-code (OTP) mechanism
// as src/lib/donorAuth.js, but for the ORG side. Two things donor auth
// doesn't need:
//   1. Free personal-mail domains (gmail, yahoo, icloud, ...) are rejected
//      before a code is ever sent - a nonprofit admin account must live on
//      the organization's own domain. This is enforced again server-side in
//      the org-signup edge function; rejecting here just saves the admin a
//      wasted trip through the OTP flow.
//   2. A "remembered" admin email per device (localStorage), so a returning
//      admin's sign-in field is pre-filled next time, with a "Not you?" link
//      to clear it. Per-device by design - this is a UX convenience, not an
//      identity check (the OTP is still what actually signs them in).
//
// Used by: src/lib/npSignup.js's verify-email step (creating a NEW org), and
// both admin sign-in surfaces (Onboarding.jsx's AdminSignInScreen and
// WebPortalPages.jsx's WebAdminSignIn).
import { useCallback, useState } from 'react';
import { getSupabase } from './supa';

const REMEMBERED_EMAIL_KEY = 'pc_np_admin_email_hint';

// Kept in sync by hand with supabase/functions/_shared/org.ts FREE_MAIL - one
// is browser JS, the other Deno/TS, so they can't literally share a module.
export const FREE_MAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com', 'me.com',
];

export function emailDomain(email) {
  return (email || '').trim().toLowerCase().split('@')[1] || '';
}

export function isFreeMailDomain(domain) {
  return FREE_MAIL_DOMAINS.includes(domain);
}

/** null when the address is fine; a friendly reason string when it is not. */
export function freeMailRejection(email) {
  const domain = emailDomain(email);
  if (!domain || domain.indexOf('.') < 1) return 'Enter a valid email address.';
  if (isFreeMailDomain(domain)) {
    return "Use your organization's work email  -  personal addresses (Gmail, Yahoo, iCloud…) can't administer a nonprofit.";
  }
  return null;
}

// ─── Device email hint ─────────────────────────────────────────────────────

export function getRememberedAdminEmail() {
  try { return localStorage.getItem(REMEMBERED_EMAIL_KEY) || ''; }
  catch { return ''; }
}

export function rememberAdminEmail(email) {
  try { localStorage.setItem(REMEMBERED_EMAIL_KEY, email); } catch { /* ignore */ }
}

export function forgetAdminEmail() {
  try { localStorage.removeItem(REMEMBERED_EMAIL_KEY); } catch { /* ignore */ }
}

// ─── Friendly error copy ────────────────────────────────────────────────────

function friendlySendError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (err?.status === 429 || msg.includes('rate limit') || msg.includes('email_send_rate_limit')) {
    return "We've sent a few codes recently  -  give it a few minutes and try again.";
  }
  return "We couldn't send that code. Check the email address and try again.";
}

function friendlyVerifyError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('expired')) return 'That code expired. Send a new one and try again.';
  return "That code doesn't match  -  check the email and try again.";
}

/**
 * Real admin OTP sign-in, shared by every surface that needs one. Two
 * independent stages: `sendCode` gets a 6-digit email code from Supabase,
 * `verifyCode` checks it and returns the signed-in session's email (or null
 * on a bad code). Callers decide what to DO with a verified email (create an
 * org, or look one up) - this hook only owns the sign-in mechanics.
 */
export function useAdminAuth() {
  const [sendingCode, setSendingCode] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  // Returns { ok, error? } rather than just a boolean - callers read the
  // error message straight off the result instead of the hook's own state,
  // which would still hold the PREVIOUS render's value at the point a caller
  // awaits this (React state updates aren't visible until the next render).
  const sendCode = useCallback(async (email) => {
    const rejection = freeMailRejection(email);
    if (rejection) {
      setSendError(rejection);
      return { ok: false, error: rejection };
    }
    const supabase = getSupabase();
    setSendError(null);
    setSendingCode(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setSendingCode(false);
    if (error) {
      const friendly = friendlySendError(error);
      setSendError(friendly);
      return { ok: false, error: friendly };
    }
    return { ok: true };
  }, []);

  const verifyCode = useCallback(async (email, code) => {
    const supabase = getSupabase();
    setVerifyError(null);
    setVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'email',
    });
    setVerifying(false);
    if (error || !data?.session) {
      const friendly = friendlyVerifyError(error);
      setVerifyError(friendly);
      return { ok: false, error: friendly };
    }
    return { ok: true, email: data.session.user.email };
  }, []);

  return { sendingCode, sendError, setSendError, sendCode, verifying, verifyError, setVerifyError, verifyCode };
}
