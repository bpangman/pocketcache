// Biometric unlock via WebAuthn platform authenticators — the same primitive
// as passkeys. On iPhone this triggers Face ID, on Macs Touch ID, on Android
// the fingerprint sensor. Works on the web TODAY (secure context required).
//
// DEMO SCOPE: the credential is created and checked entirely client-side —
// the OS really does verify the user's face/finger, but nothing is proven to
// a server. Production must switch to server-verified passkeys (challenge
// issued + assertion verified by the backend). Tracked in PRELAUNCH.md.

const STORE_KEY = 'pc_bio';

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

export async function biometricSupported() {
  try {
    return !!(window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export function biometricEnrolled() {
  try { return !!JSON.parse(localStorage.getItem(STORE_KEY))?.credId; } catch { return false; }
}

// Register a platform credential for this device. Must be called from a user
// gesture (button tap). Returns true on success, false if unsupported/declined.
export async function biometricEnroll({ name, email }) {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'PocketCache', id: window.location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: email || 'donor@pocketcache.app',
          displayName: name || 'PocketCache donor',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    });
    if (!cred) return false;
    localStorage.setItem(STORE_KEY, JSON.stringify({ credId: b64(cred.rawId), enrolledAt: new Date().toISOString() }));
    return true;
  } catch {
    return false; // user cancelled or authenticator unavailable
  }
}

// Ask the OS to verify the user (Face ID / Touch ID prompt). True on success.
export async function biometricVerify() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!stored?.credId) return false;
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(stored.credId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function biometricDisable() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ }
}

// Per-tab-session unlock flag — re-locks on the next fresh visit.
const SESSION_KEY = 'pc_bio_unlocked';
export function sessionUnlocked() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
export function markSessionUnlocked() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* noop */ }
}

// One-time "enable Face ID?" offer bookkeeping
const PROMPT_KEY = 'pc_bio_prompt_dismissed';
export function offerDismissed() {
  try { return localStorage.getItem(PROMPT_KEY) === '1'; } catch { return false; }
}
export function dismissOffer() {
  try { localStorage.setItem(PROMPT_KEY, '1'); } catch { /* noop */ }
}
