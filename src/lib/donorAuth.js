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
//   On the WEB the redirect is a full-page navigation: Safari lands back on
//   ${origin}${BASE_URL}?authResume=<resumeKey> once it is done. See
//   App.jsx's appEntry / useIsMobile for how that return trip is routed to
//   the right shell instead of the marketing PhoneFrame demo.
//
//   On NATIVE (Capacitor shells that carry the Browser + App plugins) the
//   whole OAuth hop happens in an in-app browser sheet instead, and Supabase
//   redirects back to the app's own custom URL scheme
//   (app.pocketcache://auth-callback) when it is done - the donor never
//   leaves the app. See the "Native in-app SSO" section below. Old shells
//   WITHOUT those plugins keep the email-only behavior: the plugin
//   availability check doubles as the shell-version gate, so no shell
//   version constants exist anywhere.

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
  // shouldCreateUser: false against an email with no account: Supabase answers
  // 422 error_code "otp_disabled", msg "Signups not allowed for otp" (verified
  // live against the project's /auth/v1/otp endpoint). A sign-in affordance
  // wants this to read as "no account", not a generic send failure.
  if (err?.code === 'otp_disabled' || msg.includes('signups not allowed')) {
    return 'We could not find an account with that email.';
  }
  if (err?.status === 429 || msg.includes('rate limit') || msg.includes('email_send_rate_limit')) {
    return 'Email sign-in is busy right now - try again in a few minutes.';
  }
  return "We couldn't send that code. Check the email address and try again.";
}

function friendlyVerifyError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('expired')) return 'That code expired. Send a new one and try again.';
  return 'That code does not match - check the digits and try again.';
}

function friendlyOAuthError(provider) {
  const label = PROVIDER_LABEL[provider] || provider;
  return `${label} sign-in is almost ready - use email for now.`;
}

// Native-only variant: the provider IS configured, the in-app attempt just
// didn't complete (network drop mid-hop, token exchange failure). "Almost
// ready" would be a lie here - "try again" is the truth.
function friendlyOAuthNativeError(provider) {
  const label = PROVIDER_LABEL[provider] || provider;
  return `${label} sign-in didn't finish - try again or use email.`;
}

// ─── Native in-app SSO (Capacitor shells with the Browser + App plugins) ────
//
// Flow: signInWithOAuth({ skipBrowserRedirect: true }) builds the provider
// URL without navigating -> Browser.open() shows it in an in-app
// SFSafariViewController sheet -> the donor signs in with Google/Apple ->
// Supabase's callback redirects to app.pocketcache://auth-callback#… ->
// iOS routes that URL to the app and the App plugin fires appUrlOpen ->
// the tokens in the fragment become a real Supabase session via
// setSession() -> the sheet closes -> the donor is signed in, in-app.
//
// The custom scheme is registered in the shell's Info.plist
// (CFBundleURLTypes) and app.pocketcache://auth-callback is on the Supabase
// uri_allow_list.

const NATIVE_CALLBACK_URL = 'app.pocketcache://auth-callback';

// Native SSO needs BOTH plugins: Browser for the in-app sheet, App for the
// appUrlOpen return trip. isPluginAvailable() is the capability flag AND the
// shell-version gate - old TestFlight shells ship without the Browser
// plugin, so they fall through to the email-only affordance automatically.
export function nativeSSOAvailable() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return !!(
    cap?.isNativePlatform?.() &&
    cap.isPluginAvailable?.('Browser') &&
    cap.isPluginAvailable?.('App')
  );
}

// The one native OAuth attempt in flight, if any. startOAuth() parks a
// resolver here; the appUrlOpen listener (round trip finished) or the
// browserFinished listener (donor tapped Done without signing in) settles
// it. Module-level on purpose: the listener lives at app bootstrap, outside
// any React component.
let nativeOAuthPending = null;

function settleNativeOAuth(result) {
  const pending = nativeOAuthPending;
  nativeOAuthPending = null;
  pending?.resolve(result);
}

async function handleNativeAuthCallback(url) {
  // Mark synchronously, before any await: browserFinished (fired by the
  // Browser.close() below, or by a Done tap racing this handler) must know
  // the callback arrived and leave settling to this function.
  if (nativeOAuthPending) nativeOAuthPending.callbackReceived = true;
  let identity = null;
  try {
    const supabase = getSupabase();
    // Tokens arrive in the URL fragment (implicit flow - supabase-js's
    // default for this client): #access_token=…&refresh_token=…  A
    // PKCE-style ?code= is handled too so a future flowType change cannot
    // silently break the native return trip.
    const hashIdx = url.indexOf('#');
    const queryIdx = url.indexOf('?');
    const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
    const query = queryIdx >= 0 ? url.slice(queryIdx + 1, hashIdx >= 0 ? hashIdx : undefined) : '';
    const params = new URLSearchParams(fragment || query);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');
    let session = null;
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error) session = data?.session;
    } else if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) session = data?.session;
    }
    if (session) identity = identityFromSession(session);
  } catch {
    // Fall through - settles as a failure below and the screen shows the
    // friendly retry message.
  }
  try { await window.Capacitor.Plugins.Browser.close(); } catch { /* sheet already gone */ }
  settleNativeOAuth({ identity, dismissed: false });
}

// Registered ONCE at app bootstrap (src/main.jsx), not per screen - iOS
// delivers appUrlOpen to the app as a whole, and the listener must exist
// before any sign-in screen mounts. No-op on the web and on old shells.
let nativeListenerRegistered = false;

export function initNativeAuthListener() {
  if (nativeListenerRegistered || !nativeSSOAvailable()) return;
  nativeListenerRegistered = true;
  const { App: CapApp, Browser } = window.Capacitor.Plugins;
  CapApp.addListener('appUrlOpen', ({ url }) => {
    if (typeof url === 'string' && url.startsWith(NATIVE_CALLBACK_URL)) {
      handleNativeAuthCallback(url);
    }
  });
  // Sheet closed without the callback ever arriving: the donor tapped Done.
  // Not an error - the screen just re-enables the buttons. If the callback
  // DID arrive, handleNativeAuthCallback owns settling (its own
  // Browser.close() fires this same event) - do nothing here.
  Browser.addListener('browserFinished', () => {
    if (nativeOAuthPending && !nativeOAuthPending.callbackReceived) {
      settleNativeOAuth({ identity: null, dismissed: true });
    }
  });
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

  // shouldCreateUser: true is right for a SIGNUP surface (new donor, no
  // account yet - the whole point is to create one). A SIGN-IN affordance
  // ("Already have an account?") should pass shouldCreateUser: false instead,
  // so a typo'd or unknown email surfaces as "we couldn't find an account"
  // (see friendlySendError) instead of silently creating a duplicate donor.
  const sendCode = useCallback(async (addr, { shouldCreateUser = true } = {}) => {
    const supabase = getSupabase();
    setSendError(null);
    setSendingCode(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser },
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

  // Apple / Google.
  //
  // NATIVE (new shells): resolves with the signed-in identity once the
  // in-app browser round trip completes (see the Native in-app SSO section
  // above), or null if the donor closed the sheet / the attempt failed -
  // the caller adopts the identity exactly like verifyCode()'s.
  //
  // WEB: navigates the page away on success and never resolves with an
  // identity. Supabase's default signInWithOAuth() navigates the WHOLE PAGE away
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

    if (nativeSSOAvailable()) {
      try {
        // A previous attempt still parked (double-tap race the screens'
        // `chosen` guard didn't catch) - settle it as dismissed so its
        // resolver can't leak.
        if (nativeOAuthPending) settleNativeOAuth({ identity: null, dismissed: true });
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: NATIVE_CALLBACK_URL, skipBrowserRedirect: true },
        });
        if (error || !data?.url) throw error || new Error('no auth url');
        // Same provider-enabled preflight as the web path below - a disabled
        // provider should surface as a friendly inline message, not a raw
        // JSON error page inside the sheet.
        const check = await fetch(data.url, { redirect: 'manual' });
        const redirects = check.type === 'opaqueredirect' || (check.status >= 300 && check.status < 400);
        if (!redirects) throw new Error('provider not enabled');
        const result = await new Promise((resolve) => {
          nativeOAuthPending = { resolve, callbackReceived: false };
          window.Capacitor.Plugins.Browser.open({ url: data.url }).catch(() => {
            settleNativeOAuth({ identity: null, dismissed: false });
          });
        });
        if (result.identity) {
          // Same adoption the mount-time getSession() does for a returning
          // donor - the "Continue as …" affordance stays truthful even if
          // the caller ignores the resolved identity.
          setExistingSession(result.identity);
          return result.identity;
        }
        if (result.dismissed) return null; // donor closed the sheet - no error
        throw new Error('native oauth incomplete');
      } catch {
        setOauthErrors(prev => ({ ...prev, [provider]: friendlyOAuthNativeError(provider) }));
        return null;
      }
    }

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
    setSendError(null);
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
