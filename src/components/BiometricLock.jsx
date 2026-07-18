import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import CoinMark from './CoinMark';
import {
  biometricSupported, biometricEnrolled, biometricEnroll, biometricVerify,
  sessionUnlocked, markSessionUnlocked, offerDismissed, dismissOffer,
} from '../lib/biometric';

// ─── Biometric unlock (Face ID / Touch ID via WebAuthn) ─────────────────────
// One gate, two skins: <AppLockScreen> fills the phone frame, <WebLockScreen>
// is a full webpage. Both unlock the same per-tab session. A one-time offer
// (<BiometricOffer*>) appears after sign-in on devices that support it.

// eslint-disable-next-line react-refresh/only-export-components
export function useBiometricGate() {
  const { hasAccount } = useApp();
  const [locked, setLocked] = useState(() => !!hasAccount && biometricEnrolled() && !sessionUnlocked());
  const [error, setError] = useState(false);

  async function unlock() {
    setError(false);
    const ok = await biometricVerify();
    if (ok) { markSessionUnlocked(); setLocked(false); }
    else setError(true);
    return ok;
  }

  // Demo fallback: SSO re-auth is simulated; in production this is a real
  // Apple/Google sign-in round-trip.
  function unlockWithSso() {
    markSessionUnlocked();
    setLocked(false);
  }

  return { locked, unlock, unlockWithSso, error };
}

function LockBody({ gate, name, dark }) {
  const [busy, setBusy] = useState(false);
  const ink = dark ? '#fff' : '#0f172a';
  const sub = dark ? 'rgba(255,255,255,0.7)' : '#475569';
  return (
    <>
      <div style={{ fontSize: 52, marginBottom: 10 }}>🔒</div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 20, color: ink }}>Welcome back{name ? `, ${name}` : ''}</p>
      <p style={{ margin: '6px 0 22px', fontSize: 13.5, color: sub }}>Unlock with Face ID or Touch ID to open your giving.</p>
      <button
        onClick={async () => { setBusy(true); await gate.unlock(); setBusy(false); }}
        disabled={busy}
        style={{
          width: '100%', maxWidth: 300, padding: '14px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: dark ? '#fff' : 'linear-gradient(135deg, #003865, #001a33)', color: dark ? '#003865' : '#fff',
          fontWeight: 800, fontSize: 15,
        }}
      >
        {busy ? 'Checking…' : '🙂 Unlock'}
      </button>
      {gate.error && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: dark ? '#fecaca' : '#dc2626' }}>
          Couldn&apos;t verify  -  try again or sign in below.
        </p>
      )}
      <button
        onClick={gate.unlockWithSso}
        style={{ marginTop: 14, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: sub, textDecoration: 'underline' }}
      >
        Use Apple / Google sign-in instead
      </button>
    </>
  );
}

// Fills the phone frame (mobile app + mockup surface)
export function AppLockScreen({ gate }) {
  const { hasAccount } = useApp();
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-8 text-center"
      style={{ background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)' }}
    >
      <LockBody gate={gate} name={hasAccount?.name} dark />
      <p style={{ position: 'absolute', bottom: 28, margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <CoinMark size={13} /> PocketCache
      </p>
    </div>
  );
}

// Full-page lock for the web portal
export function WebLockScreen({ gate }) {
  const { hasAccount } = useApp();
  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 420, maxWidth: '100%', background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', boxShadow: '0 16px 48px rgba(11,42,74,0.10)', padding: '36px 28px', textAlign: 'center' }}>
        <LockBody gate={gate} name={hasAccount?.name} />
        <p style={{ margin: '22px 0 0', fontSize: 11.5, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
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
      <div style={{ fontSize: 38, marginBottom: 6 }}>🙂</div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#0f172a' }}>Unlock with Face ID?</p>
      <p style={{ margin: '6px 0 16px', fontSize: 13, lineHeight: 1.6, color: '#475569' }}>
        Skip the sign-in next time  -  open your giving with a glance (or a touch).
        You can turn this off anytime in Settings → Privacy &amp; Security.
      </p>
      {failed && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#dc2626' }}>That didn&apos;t go through  -  you can try again from Settings anytime.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        <button
          onClick={async () => { setBusy(true); const ok = await offer.enable(); setBusy(false); if (!ok) { setFailed(true); offer.later(); } }}
          disabled={busy}
          style={{ padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #003865, #001a33)', color: '#fff', fontWeight: 700, fontSize: 14 }}
        >
          {busy ? 'Setting up…' : 'Enable Face ID / Touch ID'}
        </button>
        <button
          onClick={offer.later}
          style={{ padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#0f172a', fontWeight: 600, fontSize: 13 }}
        >
          Not now
        </button>
      </div>
    </>
  );

  if (surface === 'app') {
    // Overlay card inside the phone frame
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(11,42,74,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
          {inner}
        </div>
      </div>
    );
  }
  // Web modal
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(11,42,74,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: 400, maxWidth: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
        {inner}
      </div>
    </div>
  );
}
