import { useState, useEffect } from 'react';
import { Lock, ScanFace } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { greetingNameFor } from '../lib/donorAuth';
import CoinMark from './CoinMark';
import Button from './ui/Button';
import { safeBottomAtLeast } from '../lib/safeArea';
import { Z, scrim, centered } from '../lib/overlay';
import {
  biometricSupported, biometricEnrolled, biometricEnroll, biometricVerify,
  sessionUnlocked, markSessionUnlocked, offerDismissed, dismissOffer,
} from '../lib/biometric';

// ─── Biometric unlock (Face ID / Touch ID via WebAuthn) ─────────────────────
// One gate, two skins: <AppLockScreen> fills the phone frame, <WebLockScreen>
// is a full webpage. Both unlock the same per-tab session. A one-time offer
// (<BiometricOffer*>) appears after sign-in on devices that support it.
//
// The gate has exactly two exits: a successful biometric check, or signing
// out. There used to be a third - "Use Apple / Google sign-in instead" - that
// simply marked the session unlocked without any authentication at all, which
// made the lock decorative. Signing out drops the session and returns the
// donor to the real sign-in flow, where they re-authenticate for real.

// eslint-disable-next-line react-refresh/only-export-components
export function useBiometricGate() {
  const { hasAccount, signOut } = useApp();
  const [locked, setLocked] = useState(() => !!hasAccount && biometricEnrolled() && !sessionUnlocked());
  const [error, setError] = useState(false);

  async function unlock() {
    setError(false);
    const ok = await biometricVerify();
    if (ok) { markSessionUnlocked(); setLocked(false); }
    else setError(true);
    return ok;
  }

  // Signing out ends the session (AppContext clears hasAccount, so the gate's
  // own precondition goes away) and lands the donor on sign-in.
  function signOutFromLock() {
    setLocked(false);
    signOut?.();
  }

  return { locked, unlock, signOut: signOutFromLock, error };
}

function LockBody({ gate, name, dark }) {
  const [busy, setBusy] = useState(false);
  const ink = dark ? '#fff' : 'var(--ink)';
  const sub = dark ? 'rgba(255,255,255,0.7)' : 'var(--ink-2)';
  return (
    <>
      <div style={{ width: 64, height: 64, borderRadius: 'var(--r-md)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? 'rgba(255,255,255,0.12)' : 'var(--surface)', color: dark ? '#fff' : 'var(--navy-deep)' }}>
        <Lock size={30} />
      </div>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 22, color: ink }}>Welcome back{name ? `, ${name}` : ''}</p>
      <p style={{ margin: '6px 0 22px', fontSize: 13, lineHeight: 1.5, color: sub }}>Unlock with Face ID or Touch ID to open your giving.</p>
      <div style={{ width: '100%', maxWidth: 300, margin: '0 auto' }}>
        <Button
          onDark={dark}
          loading={busy}
          onClick={async () => { setBusy(true); await gate.unlock(); setBusy(false); }}
        >
          <ScanFace size={18} /> {busy ? 'Checking…' : 'Unlock'}
        </Button>
      </div>
      {gate.error && (
        <p role="alert" style={{ margin: '12px 0 0', fontSize: 12, color: dark ? 'rgba(255,255,255,0.85)' : 'var(--danger)' }}>
          Couldn&apos;t verify - try again, or sign out below.
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        <Button variant="tertiary" size="md" onDark={dark} fullWidth={false} onClick={gate.signOut}>
          Sign out
        </Button>
      </div>
    </>
  );
}

// Fills the phone frame (mobile app + mockup surface)
export function AppLockScreen({ gate }) {
  const { hasAccount } = useApp();
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-8 text-center pc-on-dark"
      style={{ background: 'linear-gradient(135deg, var(--navy-deep) 0%, #001a33 100%)' }}
    >
      <LockBody gate={gate} name={greetingNameFor(hasAccount)} dark />
      {/* bottom: 28 was a pixel guess that put this tagline under the home
          indicator on every notched iPhone - and this screen shows on every
          locked launch. Same floor pattern as App.jsx's toast. */}
      <p style={{ position: 'absolute', bottom: safeBottomAtLeast(28, 8), margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <CoinMark size={13} /> PocketCache
      </p>
    </div>
  );
}

// Full-page lock for the web portal
export function WebLockScreen({ gate }) {
  const { hasAccount } = useApp();
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 420, maxWidth: '100%', background: '#fff', borderRadius: 'var(--r-lg)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-3)', padding: '36px 28px', textAlign: 'center' }}>
        <LockBody gate={gate} name={greetingNameFor(hasAccount)} />
        <p style={{ margin: '22px 0 0', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <CoinMark size={13} /> Powered by PocketCache
        </p>
      </div>
    </div>
  );
}

// ─── One-time enrollment offer ───────────────────────────────────────────────
// Shows once per device after sign-in, only where the OS supports biometrics.
// eslint-disable-next-line react-refresh/only-export-components
export function useBiometricOffer() {
  const { hasAccount } = useApp();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!hasAccount || biometricEnrolled() || offerDismissed()) return;
      if (await biometricSupported() && alive) setShow(true);
    })();
    return () => { alive = false; };
  }, [hasAccount]);

  async function enable() {
    const ok = await biometricEnroll({ name: hasAccount?.name, email: hasAccount?.email });
    if (ok) { dismissOffer(); markSessionUnlocked(); setShow(false); }
    return ok;
  }
  function later() { dismissOffer(); setShow(false); }

  return { show, enable, later };
}

export function BiometricOfferCard({ offer, surface = 'web' }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!offer.show) return null;

  const inner = (
    <>
      <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--navy-deep)' }}>
        <ScanFace size={26} />
      </div>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>Unlock with Face ID?</p>
      <p style={{ margin: '6px 0 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        Skip the sign-in next time - open your giving with a glance (or a touch).
        You can turn this off anytime in Settings → Privacy &amp; Security.
      </p>
      {failed && <p role="alert" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--danger)' }}>That didn&apos;t go through - you can try again from Settings anytime.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        <Button
          size="md"
          loading={busy}
          onClick={async () => { setBusy(true); const ok = await offer.enable(); setBusy(false); if (!ok) { setFailed(true); offer.later(); } }}
        >
          {busy ? 'Setting up…' : 'Enable Face ID / Touch ID'}
        </Button>
        <Button size="md" variant="secondary" onClick={offer.later}>Not now</Button>
      </div>
    </>
  );

  // Both surfaces are the same gate, so both use scrim('blocking') + the same
  // z step. `fixed` and the card chrome are the only differences.
  if (surface === 'app') {
    // Overlay card inside the phone frame
    return (
      <div style={{ ...scrim('blocking'), ...centered(20), zIndex: Z.blockingScrim }}>
        <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: 'var(--shadow-3)' }}>
          {inner}
        </div>
      </div>
    );
  }
  // Web modal
  return (
    <div style={{ ...scrim('blocking', { fixed: true }), ...centered(16), zIndex: Z.blockingScrim }}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, width: 400, maxWidth: '100%', textAlign: 'center', boxShadow: 'var(--shadow-3)' }}>
        {inner}
      </div>
    </div>
  );
}
