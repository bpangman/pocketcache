// src/lib/donorAuth.js
//
// Real donor sign-in, shared by both surfaces (Onboarding.jsx's phone signup
// screen and WebOnboarding.jsx's desktop account step). Presentation stays in
// each screen; the Supabase calls, error copy, and identity-building live
// here once so the two screens cannot drift apart on how sign-in works.
//
// SIGN-IN METHODS
//   Email code (primary): supabase.auth.signInWithOtp() sends a 6-digit code,
//   supabase.auth.verifyOtp() checks it. There is no redirect step, so it
//   works the same way inside the iPhone app's embedded browser as it does on
//   the web - this is exactly why email is the default, native-safe path on
//   both screens.
//
//   Apple / Google: supabase.auth.signInWithOAuth(). Both providers are
//   configured in Supabase (confirmed via the Management API - external_
//   google_enabled and external_apple_enabled are both true) and Google
//   sign-in has been observed completing for real on Blake's iPhone. The
//   friendly "provider not enabled" message below still exists as a safety
//   net for the day either credential set is revoked or expires, not because
//   either is expected to be off.
//
//   The redirect never happens inside the Capacitor webview itself - the
//   Browser plugin always hands the OAuth hop to external Safari (the app
//   webview cannot host Google's own sign-in page), and Safari lands back on
//   ${origin}${BASE_URL}?authResume=<resumeKey> once it is done. See
//   App.jsx's appEntry / useIsMobile for how that return trip is routed to
//   the right shell instead of the marketing PhoneFrame demo.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from './supa';

const RESUME_PARAM = 'authResume';
const PROVIDER_LABEL = { apple: 'Apple', google: 'Google' };

// Turn "jane.doe99@gmail.com" into a friendly starting guess for a display
// name: "Jane Doe". The donor can edit it on screen - this just avoids
// handing them a blank field.
export function nameFromEmail(email) {
  const local = (email || '').split('@')[0] || '';
  const words = local.replace(/[._+0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Friend';
  return words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// The exact pc_identity shape identityStore.js expects (see AppContext's
// setHasAccount) - built the same way no matter which sign-in method produced it.
export function buildIdentity({ email, name, provider = 'email', joinedAt }) {
  return {
    name: name || nameFromEmail(email),
    email,
    provider,
    joinedAt: joinedAt || new Date().toISOString(),
  };
}

function identityFromSession(session) {
  const user = session?.user;
  if (!user?.email) return null;
  const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
  const provider = user.app_metadata?.provider || 'email';
  return buildIdentity({
    email: user.email,
    name: metaName,
    provider,
    joinedAt: user.created_at,
  });
}

// Plain-language copy for whatever Supabase throws back - a non-technical
// donor should never see a raw error message.
function friendlySendError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (err?.status === 429 || msg.includes('rate limit') || msg.includes('email_send_rate_limit')) {
    return 'Email sign-in is busy right now - try again in a few minutes.';
  }
  return "We couldn't send that code. Check the email address and try again.";
}

function friendlyVerifyError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('expired')) return 'That code expired. Send a new one and try again.';
  return "That code doesn't match - check the email and try again.";
}

function friendlyOAuthError(provider) {
  const label = PROVIDER_LABEL[provider] || provider;
  return `${label} sign-in is almost ready - use email for now.`;
}

/**
 * Shared donor sign-in state and actions.
 *
 * @param {string} resumeKey - 'app' or 'web'. Distinguishes the two surfaces
 *   so an Apple/Google redirect back knows which signup screen to resume on.
 */
export function useDonorAuth({ resumeKey }) {
  const [checkingSession, setCheckingSession] = useState(true);
  // A real Supabase session found on load - a returning donor, not this
  // device's own local demo state (which is a separate concept in AppContext).
  const [existingSession, setExistingSession] = useState(null);
  const [resumedFromOAuth, setResumedFromOAuth] = useState(false);

  const [stage, setStage] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [codeInput, setCodeInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState(null);
  const [oauthErrors, setOauthErrors] = useState({}); // { apple: 'msg', google: 'msg' }

  // On mount: is there already a signed-in Supabase session (returning donor
  // on this browser), and did we just land back here from an Apple/Google
  // redirect that this surface kicked off?
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    const params = new URLSearchParams(window.location.search);
    const isResume = params.get(RESUME_PARAM) === resumeKey;

    if (isResume) {
      // Clean the marker out of the URL so a later reload doesn't replay it.
      params.delete(RESUME_PARAM);
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const identity = identityFromSession(data?.session);
      if (identity) {
        setExistingSession(identity);
        if (isResume) setResumedFromOAuth(true);
      }
      setCheckingSession(false);
    }).catch(() => {
      if (!cancelled) setCheckingSession(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCode = useCallback(async (addr) => {
    const supabase = getSupabase();
    setSendError(null);
    setSendingCode(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true },
    });
    setSendingCode(false);
    if (error) {
      setSendError(friendlySendError(error));
      return false;
    }
    setEmail(addr);
    setStage('code');
    return true;
  }, []);

  const verifyCode = useCallback(async (code) => {
    const supabase = getSupabase();
    setCodeError(null);
    setVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setVerifying(false);
    if (error || !data?.session) {
      setCodeError(friendlyVerifyError(error));
      return null;
    }
    return buildIdentity({ email, provider: 'email' });
  }, [email]);

  // Apple / Google. See the file header - these are not configured yet, so
  // this resolves into a friendly inline error today rather than a dead
  // button or an unhandled rejection.
  //
  // Supabase's default signInWithOAuth() navigates the WHOLE PAGE away
  // immediately - it does not wait to find out whether the provider is
  // actually enabled first. That would make a disabled provider's error
  // unreachable here: the browser leaves the app and lands on a raw JSON
  // error page before any React code runs again. `skipBrowserRedirect: true`
  // builds the sign-in URL without navigating, and a same-origin-policy-safe
  // check request against that URL tells us whether the provider is enabled
  // (a real provider answers with a redirect; a disabled one answers with a
  // readable error) BEFORE we ever send the browser there for real.
  const startOAuth = useCallback(async (provider) => {
    const supabase = getSupabase();
    setOauthErrors(prev => ({ ...prev, [provider]: null }));
    const base = import.meta.env.BASE_URL ?? '/';
    const redirectTo = `${window.location.origin}${base}?${RESUME_PARAM}=${resumeKey}`;
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) throw error || new Error('no auth url');
      const check = await fetch(data.url, { redirect: 'manual' });
      // A configured provider replies with a redirect to its real sign-in
      // page - fetch() in 'manual' mode surfaces that as an opaque response
      // instead of letting us read it, which is exactly the signal that it
      // is safe to send the real browser there. A disabled provider answers
      // directly with a readable error instead of a redirect.
      const looksLikeRedirect = check.type === 'opaqueredirect' || (check.status >= 300 && check.status < 400);
      if (looksLikeRedirect) {
        window.location.assign(data.url);
        return;
      }
      throw new Error('provider not enabled');
    } catch {
      setOauthErrors(prev => ({ ...prev, [provider]: friendlyOAuthError(provider) }));
    }
  }, [resumeKey]);

  function resetToEmail() {
    setStage('email');
    setCodeInput('');
    setCodeError(null);
  }

  return {
    checkingSession, existingSession, resumedFromOAuth,
    stage,
    email, setEmail,
    sendingCode, sendError, sendCode,
    codeInput, setCodeInput,
    verifying, codeError, verifyCode,
    oauthErrors, startOAuth,
    resetToEmail,
  };
}
