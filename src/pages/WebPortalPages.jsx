import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { loadKey, saveKey } from '../store/identityStore';
import { findOrgByCode, getCustomOrg, resolveAdminOrgByEmail } from '../store/orgStore';
import { DEMO_USER, monthsGiving } from '../data/derived';
import { MONTHLY_DATA } from '../data/transactions';
import { getOrgStats } from '../lib/orgStats';
import { fmtMoney, fmtMoneyCompact } from '../lib/format';
import {
  CHARGE_DAY, LARGE_DONATION_THRESHOLD, REVIEW_WINDOW_LAST_DAY,
  chargeTotal, currentMonthName, effectiveCharge, nextChargeLabel,
  processingCoverFor,
} from '../lib/billing';
// Shared donor-facing derivations. `impactTier` used to be a verbatim duplicate of
// MyCause.jsx's copy in this file; `billingExplainer` is now the product's only
// billing explanation and Settings is its only home; `adjustBounds` is the one set
// of bounds for the adjust-charge control.
import {
  adjustBounds, billingExplainer, impactTier, matchProgress,
  skipConfirmParagraphs, skipRowOfferSub, skipRowSub,
} from '../lib/donorContent';
import { Z, scrim } from '../lib/overlay';
import { generateOneTimeCode } from '../lib/npSignup';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import MatchBadge from '../components/MatchBadge';
import ManualCardForm from '../components/ManualCardForm';
import StripeCardForm from '../components/StripeCardForm';
import { biometricEnrolled, biometricEnroll, biometricDisable, markSessionUnlocked } from '../lib/biometric';

// ─── Web-native My Cause / Share / Settings + shared modals ──────────────────
// True webpage versions of the app's tabs  -  same store, same account, web
// presentation. Anything the app can do, these can do (see PRELAUNCH parity
// rule).
//
// PARITY NOTE - what is genuinely app-only is a SHORT list: the app icon and
// the text-size control, both of which are iOS device settings with no web
// equivalent. Face ID / Touch ID is NOT on that list: PrivacyModal below
// enrols real WebAuthn through lib/biometric, the same call the app makes, so
// the web portal has working biometric unlock too. (This comment used to claim
// Face ID was "intentionally absent" while the code right here implemented it.)
//
// DO NOT ADD AN APP-ICON CONTROL HERE. iOS cannot switch a home-screen icon from
// remote-loaded web content, so the app's picker never changed anything; the app
// keeps a row only as an explicitly labelled "Preview" of an anchor-partner perk
// that arrives with the App Store build (Settings.jsx ~1488). A browser has no
// home-screen icon to change at all, so the honest portal version of that
// feature is its continued absence, and that absence is deliberate parity, not
// an oversight to be "fixed".

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';
// Same teal ink the app's My Cause uses for the sponsor tile (MyCause.jsx:25).
// Fixed, never the per-nonprofit brand accent: the accent resolves to red under
// BGCA, which turned the involvement group into a row of things that look like
// errors. Navy and teal stay calm for every org.
const TEAL_INK = '#0f766e';
const CARD = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 2px rgba(11,42,74,0.04)',
};

const TRACKED_CARD_BANKS = [
  { id: 'chase',   name: 'Chase',            sub: 'Sapphire, Freedom, Ink',   emoji: '🏦' },
  { id: 'capital', name: 'Capital One',       sub: 'Venture, Quicksilver',      emoji: '💳' },
  { id: 'amex',    name: 'American Express',  sub: 'Gold, Platinum, Blue Cash', emoji: '💳' },
  { id: 'bofa',    name: 'Bank of America',   sub: 'Customized Cash, Travel',   emoji: '🏦' },
];
// Mirrors Settings.jsx MULTIPLIER_OPTIONS (~143-147) - the app explains each
// multiplier, so web has to as well. Keep the descriptions identical.
const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1×', desc: 'Standard round-up' },
  { value: 2, label: '2×', desc: 'Double your impact' },
  { value: 3, label: '3×', desc: 'Triple your impact' },
];

const PAYMENT_METHOD_OPTIONS = [
  { id: 'ach',       icon: '🏦', label: 'Bank Account',        sub: 'Direct bank transfer · Includes flat $1/month app fee' },
  { id: 'apple_pay', icon: '🍎', label: 'Apple Pay',            sub: 'Set up once, fully automatic · Includes flat $1/month app fee' },
  { id: 'card',      icon: '💳', label: 'Credit or Debit Card', sub: 'Visa, Mastercard, Amex, or Discover · Includes flat $1/month app fee' },
];

function loadPrefs() {
  return {
    notifications: true, chargeReminder: true,
    biometric: true, dataSharing: false, marketingEmails: true,
    ...loadKey('pc_prefs', {}),
  };
}

// ─── Shared web UI pieces ────────────────────────────────────────────────────

export function Modal({ show, onClose, title, children, width = 460 }) {
  if (!show) return null;
  return (
    <div
      onClick={onClose}
      style={{ ...scrim('dim', { fixed: true }), zIndex: Z.modalScrim, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', zIndex: Z.modal, width, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK.primary }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#f1f5f9', borderRadius: 999, width: 28, height: 28, cursor: 'pointer', color: INK.secondary, fontWeight: 700 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function WebToggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch" aria-checked={value}
      style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', background: value ? '#0D9488' : '#e2e8f0', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function SectionCard({ label, children, style, testId }) {
  return (
    <div data-testid={testId} style={{ ...CARD, padding: 20, ...style }}>
      {label && <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>{label}</p>}
      {children}
    </div>
  );
}

function Row({ label, sub, right, onPress }) {
  const inner = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: INK.primary }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: INK.muted, marginTop: 1 }}>{sub}</span>}
      </span>
      {right}
    </>
  );
  const base = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', textAlign: 'left' };
  if (onPress) return <button onClick={onPress} style={{ ...base, border: 'none', background: 'transparent', cursor: 'pointer' }}>{inner}</button>;
  return <div style={base}>{inner}</div>;
}

function ActionButton({ children, onClick, disabled, tone = 'primary' }) {
  const tones = {
    primary: { background: `linear-gradient(135deg, ${NAVY}, #001a33)`, color: '#fff' },
    quiet: { background: '#f1f5f9', color: INK.primary },
    danger: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' },
  };
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer',
        fontWeight: 700, fontSize: 14, opacity: disabled ? 0.5 : 1, ...tones[tone],
      }}
    >
      {children}
    </button>
  );
}

/**
 * InvolveTile - one of the two equal-weight secondary actions in My Cause's
 * "Get more involved" group. The web twin of the app's tiles (MyCause.jsx
 * ~196-232): icon chip, what it is, one line saying what it actually does.
 *
 * The colour comes in as props on purpose. It must never be `brand.textAccent`:
 * that is per-nonprofit and resolves to #E8192C under BGCA, which is what turned
 * this group into three red-outlined buttons that read as error states. Navy and
 * teal only.
 */
function InvolveTile({ onClick, emoji, title, sub, ink, tint, edge, chip, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', textAlign: 'left',
        padding: 14, borderRadius: 14, cursor: 'pointer', minHeight: 118,
        background: tint, border: `1.5px solid ${edge}`,
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 10, background: chip, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        {emoji}
      </span>
      <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, color: ink }}>{title}</span>
      <span style={{ display: 'block', fontSize: 12, lineHeight: 1.4, color: ink, opacity: 0.78 }}>{sub}</span>
    </button>
  );
}

// ─── data-testid convention (web portal surface) ─────────────────────────────
// These hooks exist so the app/web parity checks are re-runnable instead of
// eyeballed. One convention, applied to every hook in WebPortalPages.jsx and
// WebDashboard.jsx:
//
//     web-<feature>-<element>
//
//   web-      marks a hook on the WEB PORTAL surface. The app surface has its own
//             unprefixed hooks (Onboarding.jsx `confirm-roundups`,
//             `confirm-cap-note`) and shared components have theirs
//             (StripeCardForm `stripe-card-form`), so the prefix is what stops a
//             parity selector from silently matching the wrong surface.
//   <feature> the donor-facing thing under test, matching the component it lives
//             in: estimate, adjust-charge, give-extra, skip, cancel, track-card,
//             change-payment, kpi, toast.
//   <element> what the node IS, from a fixed vocabulary: -total, -roundups,
//             -rollover, -value, -button, -modal, -confirm, -note, -capped,
//             -adjusted, -skipped.
//
// All lower-kebab, no camelCase, no ids. Hooks go on the node holding the NUMBER
// or the node a test would click - never on a decorative wrapper - so a test can
// read textContent directly. `web-toast` is the one bare feature-only name: the
// toast is a singleton with no sub-elements.
//
// Mutually exclusive states may share one hook (web-cancel-note carries either
// the cap note or the adjustment note) because only one is ever mounted; states
// that can coexist get their own (web-estimate-capped vs web-estimate-adjusted).
//
// ─── Web toast ───────────────────────────────────────────────────────────────
// The app confirms card / payment / biometric changes with a toast (App.jsx
// renders AppContext's `toast` inside the phone frame). WebDashboard is NOT a
// child of AppContent, so that toast can never appear on the web surface - which
// is why WebSettings used to change a payment method with zero feedback. This is
// the same idea in the web portal's own language: one dark pill, bottom centre.
function useWebToast(ms = 3600) {
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(id);
  }, [message, ms]);
  return { message, showToast: setMessage, clearToast: () => setMessage(null) };
}

function WebToast({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      role="status" data-testid="web-toast"
      onClick={onClose}
      style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: Z.globalToast,
        maxWidth: 520, background: '#0f172a', color: '#fff', borderRadius: 14, padding: '12px 18px',
        fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, boxShadow: '0 18px 40px rgba(11,42,74,0.28)', cursor: 'pointer',
      }}
    >
      {message}
    </div>
  );
}

// ─── Admin sign-in (web page)  -  passwordless work-email code ────────────────
// The webpage version of the new admin login protocol: username = the
// org-domain email verified at signup; a one-time code per sign-in, never a
// password. Demo: any email works and the code auto-fills (labeled).
export function WebAdminSignIn() {
  const { adminRole, setAdminRole, setLastMode, setPage } = useApp();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(null);

  function send(e) {
    e?.preventDefault?.();
    const domain = email.trim().toLowerCase().split('@')[1];
    if (!domain || domain.indexOf('.') < 1) { setError('Enter a valid email address.'); return; }
    setError(null);
    const c = generateOneTimeCode();
    setCode(c);
    setCodeInput(c); // DEMO: auto-filled; live version emails it
    setCodeError(null);
    setSent(true);
  }

  function verify(e) {
    e?.preventDefault?.();
    if (codeInput.trim() !== code) { setCodeError("That code doesn't match  -  check the email and try again."); return; }
    const custom = resolveAdminOrgByEmail(email);
    if (custom) setAdminRole({ orgId: custom.id, joinCode: custom.shortName });
    else if (!adminRole) setAdminRole({ orgId: 'bgca', joinCode: 'BGCA' });
    setLastMode('admin');
    setPage('np-dashboard');
  }

  const input = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 14 };

  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CoinMark size={30} />
          <div style={{ lineHeight: 1.15 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary }}>PocketCache</p>
            <p style={{ margin: 0, fontSize: 10.5, color: INK.muted }}>Nonprofit admin</p>
          </div>
        </div>
      </header>
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: 440, maxWidth: '100%', ...CARD, borderRadius: 20, boxShadow: '0 16px 48px rgba(11,42,74,0.10)', padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>Admin sign-in</h1>
          <p style={{ margin: '6px 0 18px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
            Sign in with your organization&apos;s work email. No password  -  we email you a fresh 6-digit code each time.
          </p>
          {!sent ? (
            <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>Work email</label>
              <input type="email" required value={email} placeholder="you@yourorg.org"
                onChange={e => { setEmail(e.target.value); setError(null); }}
                style={{ ...input, borderColor: error ? '#ef4444' : '#d1d5db' }} />
              {error && <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{error}</p>}
              <ActionButton disabled={!email} onClick={send}>Email me a sign-in code →</ActionButton>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: INK.muted }}>
                Your admin sign-in is the work email verified when your page was created. Nothing to remember, nothing to steal.
              </p>
            </form>
          ) : (
            <form onSubmit={verify} style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: INK.secondary }}>
                We sent a 6-digit code to <strong style={{ color: INK.primary }}>{email}</strong>.
              </p>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                  Demo: we filled the code in for you  -  the live version emails it.
                </p>
              </div>
              <input type="text" inputMode="numeric" maxLength={6} value={codeInput}
                onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setCodeError(null); }}
                style={{ ...input, fontFamily: 'monospace', textAlign: 'center', fontSize: 20, letterSpacing: '0.5em', borderColor: codeError ? '#ef4444' : '#d1d5db' }} />
              {codeError && <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{codeError}</p>}
              <ActionButton disabled={codeInput.length !== 6} onClick={verify}>Sign in →</ActionButton>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                <button type="button" onClick={send} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: INK.muted, fontWeight: 600 }}>Resend code</button>
                <button type="button" onClick={() => { setSent(false); setCodeInput(''); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: INK.muted, fontWeight: 600 }}>Change email</button>
              </div>
            </form>
          )}
        </div>
      </main>
      <footer style={{ padding: '0 24px 20px', textAlign: 'center' }}>
        <p style={{ color: INK.muted, fontSize: 12, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}

// ─── Give Extra  -  multi-step: amount → review → (confirm) → done ────────────
const BOOST_PRESETS = [1, 5, 10, 25];

export function GiveExtraModal({ show, onClose }) {
  const { selectedNonprofit, boostDonation } = useApp();
  const [step, setStep] = useState('amount'); // amount | review | confirm | done
  const [selected, setSelected] = useState(5);
  const [custom, setCustom] = useState('');
  // DELIBERATELY LOCAL, and not the persisted `coverProcessing` preference.
  // That preference is a standing instruction about the MONTHLY round-up charge;
  // this is a separate, one-off gift the donor is deciding on right now, and the
  // cover here is a percentage of THIS gift, not of the month's round-ups. Wiring
  // this checkbox to the stored preference would mean an impulse decision about a
  // $25 gift silently rewrote how every future monthly charge is billed. The app's
  // GiveExtraSheet keeps its copy local for the same reason - keep both local.
  const [coverProcessing, setCoverProcessing] = useState(true);

  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';
  const amount = custom ? parseFloat(custom) : selected;
  const valid = amount > 0 && !isNaN(amount);
  const isLarge = valid && amount >= LARGE_DONATION_THRESHOLD;
  const processingFee = valid ? processingCoverFor(amount) : 0;
  const total = valid ? parseFloat((amount + 1.00 + (coverProcessing ? processingFee : 0)).toFixed(2)) : 0;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setStep('amount'); setSelected(5); setCustom(''); setCoverProcessing(true); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  // The app's GiveExtraSheet interposes a "Just to confirm…" step for large
  // gifts before onConfirm fires; web now does the same.
  function confirm() {
    if (isLarge) { setStep('confirm'); return; }
    boostDonation(amount);
    setStep('done');
  }

  function confirmLarge() {
    boostDonation(amount);
    setStep('done');
  }

  return (
    <Modal show={show} onClose={onClose} title="Give Extra Now">
      {step === 'amount' && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: INK.secondary }}>
            Make a one-time gift to <strong style={{ color: INK.primary }}>{npShort}</strong> on top of your round-ups.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {BOOST_PRESETS.map(p => (
              <button key={p} onClick={() => { setSelected(p); setCustom(''); }}
                style={{
                  padding: '10px 0', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  border: selected === p && !custom ? `2px solid ${NAVY}` : '1.5px solid #e5e7eb',
                  background: selected === p && !custom ? '#eef4fa' : '#fff', color: selected === p && !custom ? NAVY : INK.secondary,
                }}>
                ${p}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1.5px solid ${custom ? NAVY : '#e5e7eb'}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
            <span style={{ color: INK.muted, fontWeight: 700 }}>$</span>
            <input
              type="number" inputMode="decimal" min="0" step="0.01" placeholder="Or type a custom amount"
              value={custom} onChange={e => { setCustom(e.target.value); setSelected(null); }}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: INK.primary, background: 'transparent' }}
            />
          </div>
          {valid && (
            <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: INK.secondary }}>Gift to {npShort}</span>
                <span style={{ fontWeight: 700, color: INK.primary }}>${fmtMoney(amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.muted }}>
                <span>App fee (required)</span><span>$1.00</span>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0 2px', cursor: 'pointer', color: INK.muted, fontSize: 12.5 }}
                onClick={() => setCoverProcessing(v => !v)}>
                <input type="checkbox" readOnly checked={coverProcessing} style={{ marginTop: 2, accentColor: '#059669' }} />
                <span>Cover {npShort}&apos;s card processing (~${fmtMoney(processingFee)})  -  goes to them, counts as part of your gift</span>
              </label>
              <div style={{ height: 1, background: '#e5e7eb', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: INK.primary }}>Total today</span>
                <span style={{ fontWeight: 800, color: NAVY }}>${fmtMoney(total)}</span>
              </div>
            </div>
          )}
          <ActionButton disabled={!valid} onClick={() => setStep('review')}>Review my gift →</ActionButton>
        </>
      )}

      {step === 'review' && (
        <>
          <div style={{ textAlign: 'center', padding: '8px 0 14px' }}>
            <p style={{ margin: 0, fontSize: 13.5, color: INK.secondary }}>You&apos;re about to give</p>
            <p style={{ margin: '6px 0', fontSize: 34, fontWeight: 800, color: NAVY }}>${fmtMoney(amount)}</p>
            <p style={{ margin: 0, fontSize: 13.5, color: INK.secondary }}>
              to <strong style={{ color: INK.primary }}>{selectedNonprofit?.name ?? npShort}</strong>
            </p>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 12.5, color: INK.secondary, lineHeight: 1.6 }}>
            Total charge today: <strong style={{ color: INK.primary }}>${fmtMoney(total)}</strong>  -  your ${fmtMoney(amount)} gift, the $1 app fee{coverProcessing ? `, and ~$${fmtMoney(processingFee)} processing cover (goes to ${npShort})` : ''}.
            Charged to your saved payment method. {npShort} sends your receipt. <em>Demo  -  no real charge is made.</em>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={confirm}>Confirm  -  give ${fmtMoney(amount)}</ActionButton>
            <ActionButton tone="quiet" onClick={() => setStep('amount')}>← Go back</ActionButton>
          </div>
        </>
      )}

      {step === 'confirm' && (
        <div data-testid="web-give-extra-large-confirm" style={{ background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 16, padding: 18 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16, color: '#78350f' }}>Just to confirm…</p>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.6, color: '#92400e' }}>
            You&apos;re about to donate <strong>${fmtMoney(amount)}</strong> to {npShort}. Was that intentional?
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={confirmLarge}>Yes, give ${fmtMoney(amount)}</ActionButton>
            <ActionButton tone="quiet" onClick={() => setStep('amount')}>Go back</ActionButton>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>💚</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: INK.primary }}>Thank you!</p>
          <p style={{ margin: '6px 0 18px', fontSize: 13.5, color: INK.secondary }}>
            Your extra ${fmtMoney(amount)} is on its way to {npShort}.
          </p>
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      )}
    </Modal>
  );
}

// ─── Transfer the nonprofit page to a colleague ──────────────────────────────
/**
 * TransferNonprofitModal - the portal twin of the app's TransferNonprofitSheet
 * (src/components/sheets/TransferNonprofitSheet.jsx). Same three stages, same
 * validation, same sentences; web chrome instead of a bottom sheet.
 *
 * WHY THIS EXISTS
 * The product model is ONE admin email per nonprofit: the org record carries a
 * single `adminEmail` and admin sign-in resolves the org by that address (see
 * store/orgStore.js, resolveAdminOrgByEmail). That is a deliberate, simple model
 * - but with no way to change the address, the day the person who signed the org
 * up leaves, the nonprofit is locked out of its own page for good. This is that
 * way. It lives in the account menu rather than in Settings because Settings is
 * the DONOR's account, and this is an action on the nonprofit's page.
 *
 * DEMO HONESTY
 * The handover is simulated and labelled as such at every stage. Nothing is
 * written to the org record, no email is sent, and the current admin keeps their
 * access - a demo that really moved control would strand whoever is showing it,
 * and one that merely LOOKED like it moved control would be the same lie the
 * app-icon picker was.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Free-mail domains are rejected for the same reason admin signup rejects them:
// a nonprofit page must belong to an address on the organisation's own domain.
// Production checks this server-side against the org's verified domain; this
// list is only enough to make the demo behave honestly. Mirrors the app sheet.
const FREE_MAIL = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com'];

export function TransferNonprofitModal({ show, onClose, adminRole }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('form'); // 'form' | 'confirm' | 'done'

  const joinCode = adminRole?.joinCode ?? 'your nonprofit';
  const currentAdminEmail = getCustomOrg(adminRole?.orgId)?.adminEmail || null;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setEmail(''); setError(null); setStage('form'); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function handleContinue(e) {
    e?.preventDefault?.();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address.');
      return;
    }
    const domain = value.split('@')[1].toLowerCase();
    if (FREE_MAIL.includes(domain)) {
      setError("Use a work email on your organization's own domain, not a personal address.");
      return;
    }
    if (currentAdminEmail && value.toLowerCase() === currentAdminEmail.toLowerCase()) {
      setError('That is the address already administering this page.');
      return;
    }
    setError(null);
    setStage('confirm');
  }

  const input = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #d1d5db', fontSize: 14 };

  return (
    <Modal show={show} onClose={onClose} title="Transfer nonprofit page" width={520}>
      <div data-testid="web-transfer-modal">
        {stage === 'done' ? (
          <div style={{ textAlign: 'center', padding: '10px 0 4px' }} data-testid="web-transfer-done">
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary }}>Demo: transfer simulated</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.65, color: INK.secondary }}>
              Nothing actually changed. You still administer {joinCode} and no email was sent to {email.trim()}.
            </p>
            <div style={{ textAlign: 'left', background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 14, padding: '12px 14px', margin: '14px 0 16px' }}>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: '#92400e' }}>
                In the live version we check the new address is on your organization&apos;s domain, email them a link to accept, email you a copy, and give you a window to reverse it before your access ends.
              </p>
            </div>
            <ActionButton onClick={onClose}>Done</ActionButton>
          </div>
        ) : (
          <form onSubmit={handleContinue}>
            <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.65, color: INK.secondary }}>
              PocketCache gives each nonprofit one admin address, and right now that is
              {currentAdminEmail ? <> <strong style={{ color: INK.primary }}>{currentAdminEmail}</strong></> : ' yours'}.
              {' '}Moving on? Hand {joinCode} to a colleague so your organization keeps its page.
            </p>

            <label htmlFor="web-transfer-email" style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted, marginBottom: 6 }}>
              Colleague&apos;s work email
            </label>
            <input
              id="web-transfer-email"
              data-testid="web-transfer-email"
              type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
              placeholder="name@yourorg.org"
              value={email}
              disabled={stage === 'confirm'}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              style={{ ...input, borderColor: error ? '#ef4444' : email ? NAVY : '#e5e7eb' }}
            />
            {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }} data-testid="web-transfer-error">{error}</p>}

            {/* Names what is LOST, not just what is gained. A handover screen that
                only describes the colleague's new powers is not a warning. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 14, padding: '12px 14px', marginTop: 14 }} data-testid="web-transfer-warning">
              <span style={{ fontSize: 15, lineHeight: 1.2 }}>⚠️</span>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: '#b91c1c' }}>
                This hands over control of {joinCode}. They get the donor list, the payout settings, and the page itself. You lose your admin access, and you will not be able to take it back yourself - only the new admin can transfer it again.
              </p>
            </div>

            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.65, color: INK.muted }}>
              Demo: this transfer is simulated. Nothing is handed over, no email is sent, and you keep your admin access.
            </p>

            {stage === 'confirm' && (
              <div style={{ background: '#fff7ed', border: '2px solid #fed7aa', borderRadius: 14, padding: 16, marginTop: 14 }} data-testid="web-transfer-confirm">
                <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13.5, color: '#9a3412' }}>
                  Give {joinCode} to {email.trim()}?
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.65, color: '#9a3412' }}>
                  They become the only admin for {joinCode}. Your own admin access ends. Confirm only if this person works at your organization and is expecting it.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setStage('form')}
                    style={{ flex: 1, padding: '11px 14px', borderRadius: 12, background: '#fff', border: '1px solid #fed7aa', fontWeight: 700, fontSize: 13, color: '#9a3412', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => setStage('done')}
                    style={{ flex: 1, padding: '11px 14px', borderRadius: 12, background: '#c2410c', border: 'none', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>
                    Yes, transfer control
                  </button>
                </div>
              </div>
            )}

            {stage === 'form' && (
              <div style={{ marginTop: 16 }}>
                <ActionButton disabled={!email.trim()} onClick={handleContinue}>Continue</ActionButton>
              </div>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
}

// ─── Monthly cap control (shared: settings + wizard) ────────────────────────
/**
 * CapControl - THE SHARED monthly-cap control. Both web surfaces use this one
 * component (WebSettings and WebOnboarding's payment step), which is why the
 * cap only exists once on web.
 *
 * THE APP HAND-ROLLS ITS OWN COPY AND ITS COPY MUST STAY IN SYNC WITH THIS FILE:
 *   src/pages/Settings.jsx   ~1138-1186  (the "Monthly Giving Cap" card)
 *   src/pages/Onboarding.jsx ~1265-1295  (the quiet wizard opt-in, `subtle`)
 * Neither app copy can import this (they are Tailwind/motion, this is inline
 * styles), so the strings below are the reconciliation point. If you change a
 * string here, change it in both app files too - and vice versa.
 *
 * The wording here was aligned TO the app on 2026-07-24; the divergence found
 * was: web said "Capped at $20/month  -  round-ups above this are simply never
 * charged" as the row subtitle and had no explainer paragraph at all, while the
 * app says "Capped at $20/month" and carries the explainer underneath. The app's
 * split reads better (short status, one explanation) so web adopted it.
 * Range, step and $5/$200 end labels were already identical on all three.
 *
 * RE-VERIFIED 2026-07-24 after the app files were edited again. The default
 * variant is still word for word:
 *   label     "Monthly Cap"
 *   status    "No cap set" / `Capped at $${cap}/month`
 *   explainer "Cap what you give each month. If your round-ups go over, we only
 *              charge up to your cap  -  the rest is simply never charged."
 * The `subtle` variant has one REMAINING, PRESENTATIONAL delta: Onboarding.jsx
 * renders a single checkbox sentence, "Set a monthly maximum (optional)  -
 * round-ups above it are simply never charged.", whereas this control's
 * label/sub structure splits it into "Set a monthly maximum (optional)" plus
 * "Round-ups above it are simply never charged." Same words in the same order;
 * only the joining " - " and the leading capital differ, because a sub-line that
 * begins lowercase with no lead-in reads as broken on web. Left as is
 * deliberately; Onboarding.jsx is not this file's to edit.
 */
export function CapControl({ value, onChange, subtle = false }) {
  const enabled = value !== null && value !== undefined;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: subtle ? 13 : 13.5, color: subtle ? INK.secondary : INK.primary }}>
            {/* subtle = Onboarding.jsx's wizard opt-in copy; default = Settings.jsx's row */}
            {subtle ? 'Set a monthly maximum (optional)' : 'Monthly Cap'}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: INK.muted, marginTop: 1 }}>
            {subtle
              ? 'Round-ups above it are simply never charged.'
              : enabled ? `Capped at $${value}/month` : 'No cap set'}
          </span>
        </span>
        <WebToggle value={enabled} onChange={v => onChange(v ? 20 : null)} />
      </div>
      {enabled && (
        <div style={{ marginTop: 10 }}>
          <p style={{ textAlign: 'center', margin: '0 0 4px' }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: INK.primary }}>${value}</span>
            <span style={{ fontSize: 13, color: INK.muted }}>/month</span>
          </p>
          <input type="range" min={5} max={200} step={5} value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#0D9488' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: INK.muted }}>
            <span>$5</span><span>$200</span>
          </div>
        </div>
      )}
      {!subtle && (
        <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.6, color: INK.muted }}>
          Cap what you give each month. If your round-ups go over, we only charge up to your cap  -  the rest is simply never charged.
        </p>
      )}
    </div>
  );
}

// ─── Adjust this month's charge (web) ────────────────────────────────────────
/**
 * AdjustChargeModal - the web twin of the app's AdjustChargeSheet
 * (src/pages/Dashboard.jsx:119-172), reachable any time from the web
 * dashboard's estimate card.
 *
 * Rules copied from the app sheet:
 *   - bounds come from `adjustBounds(accrued)` in lib/donorContent: $0 to this
 *     month's accrued round-ups, step $0.01. There were TWO sliders driving the
 *     same `chargeAdjustment` with different rules - this one started at $1.00 in
 *     $0.01 steps while the review alert started at $0 in $0.25 steps, so a donor
 *     could set $0.00 from the alert but not from here, and $4.63 from here but
 *     only $4.50 from the alert. One helper now answers for both.
 *   - it opens at the existing adjustment, else the full accrued amount
 *   - the max is the ACCRUED total, not the monthly cap: an explicit
 *     adjustment outranks the cap (see lib/billing.js effectiveCharge), so a
 *     capped donor can deliberately give more this one month
 *   - "Reset to full amount" clears it back to null, and only appears when an
 *     adjustment is actually set
 *   - one month only; the $1 app fee is untouched
 */
export function AdjustChargeModal({ show, onClose, pendingRoundUps, chargeAdjustment, setChargeAdjustment, monthlyCap }) {
  const accrued = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  const [value, setValue] = useState(chargeAdjustment ?? accrued);

  // Re-seed each time the modal opens (the app remounts its sheet via key).
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setValue(chargeAdjustment ?? accrued), 0);
    return () => clearTimeout(id);
  }, [show, chargeAdjustment, accrued]);

  const capped = monthlyCap !== null && monthlyCap !== undefined && accrued > monthlyCap;
  const bounds = adjustBounds(accrued);

  return (
    <Modal show={show} onClose={onClose} title="Adjust This Month's Charge">
      <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
        One-time adjustment for this month&apos;s charge only. In the real app you&apos;ll also get an email/push 3 days before each charge with this same control.
      </p>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 32, fontWeight: 800, color: INK.primary }} data-testid="web-adjust-charge-value">${fmtMoney(value)}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: INK.muted }}>of ${fmtMoney(accrued)} accrued this month</p>
      </div>
      <input
        type="range" min={bounds.min} max={bounds.max} step={bounds.step} value={value}
        onChange={e => setValue(parseFloat(e.target.value))}
        aria-label="This month's charge"
        style={{ width: '100%', accentColor: '#0D9488' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: INK.muted, marginBottom: 14 }}>
        <span>${fmtMoney(bounds.min)}</span><span>${fmtMoney(bounds.max)}</span>
      </div>
      {capped && (
        <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.55, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' }}>
          Your ${monthlyCap}/month cap is on. An amount you set here wins for this month, even above the cap  -  the cap comes back next month.
        </p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        <ActionButton onClick={() => { setChargeAdjustment(value); onClose(); }}>Set Charge to ${fmtMoney(value)}</ActionButton>
        {chargeAdjustment !== null && chargeAdjustment !== undefined && (
          <ActionButton tone="quiet" onClick={() => { setChargeAdjustment(null); onClose(); }}>Reset to full amount</ActionButton>
        )}
      </div>
    </Modal>
  );
}

// ─── My Cause (web) ──────────────────────────────────────────────────────────
// `impactTier` lived here as a near-duplicate of MyCause.jsx's copy - same four
// tiers, subtly different sentences, so the same donor read a different
// equivalency on the phone and in the browser. It is now imported from
// lib/donorContent and there is exactly one wording.

function InvolvementModal({ kind, show, onClose, npShort }) {
  const [fields, setFields] = useState({});
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setFields({}); setSubmitted(false); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function submit() {
    setSubmitted(true);
  }

  // 'suggest' (Suggest a Match Sponsor) is GONE, on both surfaces, and this is
  // the whole reason it was dropped rather than tidied: a donor naming a company
  // they think should sponsor a match is a lead the nonprofit cannot act on and
  // the donor never hears about again. "Become a Match Sponsor" is the real
  // version of the same intent - it collects a company, a named contact and an
  // email, which the partnerships team can actually work. Two buttons three
  // pixels apart that differ only in whether the donor works there was the whole
  // problem. Do not re-add a 'suggest' entry here.
  const COPY = {
    volunteer: {
      title: 'Volunteer Opportunities',
      intro: `Express your interest in volunteering with ${npShort}.`,
      done: { emoji: '🙌', head: 'Interest Noted!', body: `${npShort} will reach out about volunteer opportunities near you.` },
      inputs: [{ key: 'interest', placeholder: "Tell us how you'd like to help…", textarea: true, required: true }],
      cta: 'Express Interest',
    },
    sponsor: {
      title: 'Become a Match Sponsor',
      intro: `Partner with ${npShort} this month. Your company sponsors the monthly round-up match  -  donors see your logo, you get a community impact report. Flat campaign fee; 100% of your match goes to ${npShort}.`,
      done: { emoji: '🤝', head: 'Application Sent!', body: `${npShort}'s corporate partnerships team will be in touch within 2 business days.` },
      inputs: [
        { key: 'company', placeholder: 'Company name', required: true },
        { key: 'contact', placeholder: 'Contact name', required: true },
        { key: 'email', placeholder: 'Email', required: true, type: 'email' },
        { key: 'budget', placeholder: 'Budget (e.g. $10,000-$50,000)' },
      ],
      cta: `Submit to ${npShort} Partnerships`,
    },
  }[kind];

  if (!COPY) return null;
  const requiredOk = COPY.inputs.every(i => !i.required || (fields[i.key] ?? '').trim());

  return (
    <Modal show={show} onClose={onClose} title={COPY.title}>
      {submitted ? (
        <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>{COPY.done.emoji}</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: INK.primary }}>{COPY.done.head}</p>
          <p style={{ margin: '6px 0 18px', fontSize: 13.5, color: INK.secondary }}>{COPY.done.body}</p>
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: INK.secondary, lineHeight: 1.6 }}>{COPY.intro}</p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {COPY.inputs.map(inp => inp.textarea ? (
              <textarea key={inp.key} rows={3} placeholder={inp.placeholder} value={fields[inp.key] ?? ''}
                onChange={e => setFields(f => ({ ...f, [inp.key]: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 13.5, resize: 'none', fontFamily: 'inherit' }} />
            ) : (
              <input key={inp.key} type={inp.type ?? 'text'} placeholder={inp.placeholder} value={fields[inp.key] ?? ''}
                onChange={e => setFields(f => ({ ...f, [inp.key]: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: 13.5 }} />
            ))}
          </div>
          <ActionButton disabled={!requiredOk} onClick={submit}>{COPY.cta}</ActionButton>
        </>
      )}
    </Modal>
  );
}

/**
 * WebMatchDetailsModal - the web twin of the app's MatchDetailsSheet
 * (src/components/sheets/MatchDetailsSheet.jsx). The portal had NO drill-in at
 * all: a web donor could see that a match existed and never read the impact
 * report or the pool figures the app donor gets one tap away.
 *
 * Every number and every sentence about the match comes from `matchProgress()`,
 * so this modal cannot drift from the app sheet or from Overview's match line.
 */
function WebMatchDetailsModal({ show, onClose, match }) {
  if (!match?.active) return null;
  const mp = matchProgress(match);
  const company = match.companyShort ?? match.company;
  return (
    <Modal show={show} onClose={onClose} title={`${company} Match`} width={520}>
      <div data-testid="web-match-details">
        {match.sample && (
          <p style={{ margin: '0 0 12px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>
              Example partnership  -  demo only
            </span>
          </p>
        )}
        {match.logoUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={match.logoUrl} alt={company} style={{ height: 30, objectFit: 'contain' }} />
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 800, fontSize: 15, color: INK.primary }}>{match.company}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: INK.muted }}>Corporate Match Partner</span>
            </span>
          </div>
        )}
        <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, lineHeight: 1.6, color: INK.primary }}>{mp.headline}</p>
        {match.impactReport && (
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.7, color: INK.secondary }}>{match.impactReport}</p>
        )}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Match Pool Progress</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#b45309' }}>{mp.matchedLabel} / {mp.poolLabel}</span>
          </div>
          <div style={{ background: '#fef3c7', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${mp.pct}%`, height: '100%', background: '#D97706', borderRadius: 999 }} />
          </div>
          <p style={{ margin: '7px 0 0', fontSize: 12, color: '#b45309' }} data-testid="web-match-progress">{mp.progressLabel}</p>
        </div>
        {match.impactUrl && (
          <a href={match.impactUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, fontWeight: 600, color: '#b45309', textDecoration: 'none' }}>
            {mp.impactLinkLabel} ↗
          </a>
        )}
      </div>
    </Modal>
  );
}

export function WebMyCause() {
  const { selectedNonprofit, totalDonated } = useApp();
  const [orgStats, setOrgStats] = useState(null);
  const [giveExtra, setGiveExtra] = useState(false);
  const [matchDetails, setMatchDetails] = useState(false);
  const [involve, setInvolve] = useState(null); // 'volunteer' | 'sponsor'
  const np = selectedNonprofit;

  useEffect(() => {
    if (np) getOrgStats(np).then(setOrgStats);
  }, [np]);

  if (!np) return null;
  const npShort = np.shortName ?? np.name;
  const match = np.corporateMatch;
  const stats = [
    (orgStats?.raised ?? np.raised) != null && { label: 'Total Raised', value: fmtMoneyCompact(orgStats?.raised ?? np.raised) },
    (orgStats?.donors ?? np.donors) != null && { label: 'Donors', value: (orgStats?.donors ?? np.donors).toLocaleString() },
    np.ein && { label: 'EIN', value: np.ein },
  ].filter(Boolean);

  return (
    <>
      <GiveExtraModal show={giveExtra} onClose={() => setGiveExtra(false)} />
      <InvolvementModal kind={involve} show={!!involve} onClose={() => setInvolve(null)} npShort={npShort} />
      <WebMatchDetailsModal show={matchDetails} onClose={() => setMatchDetails(false)} match={match} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <OrgLogo nonprofit={np} size={14} rounded="2xl" />
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>Your cause</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 21, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>{np.name}</h1>
          {np.category && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: INK.secondary }}>{np.category}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Mission">
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: INK.secondary }}>{np.description}</p>
          </SectionCard>
          {np.impact && (
            <div style={{ ...CARD, border: 'none', padding: 20, background: `linear-gradient(135deg, ${NAVY} 0%, #0B2A4A 100%)` }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Impact</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.55, color: '#fff' }}>&ldquo;{np.impact}&rdquo;</p>
            </div>
          )}
          <SectionCard label="Your impact">
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: INK.secondary }} data-testid="web-impact-tier">
              {impactTier(totalDonated, npShort)}
            </p>
          </SectionCard>
          {stats.length > 0 && (
            <div>
              {(orgStats != null ? orgStats.isDemo : !!np.sampleStats) && (
                <p style={{ textAlign: 'right', margin: '0 0 6px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>Demo data</span>
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, stats.length)}, 1fr)`, gap: 12 }}>
                {stats.map(s => (
                  <div key={s.label} style={{ ...CARD, padding: '14px 16px' }}>
                    <p style={{ margin: 0, fontSize: 11.5, color: INK.muted }}>{s.label}</p>
                    <p style={{ margin: '3px 0 0', fontWeight: 800, fontSize: 16, color: INK.primary }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {/* ── Get more involved  -  FIRST in the rail ──
              It used to sit under the match badge, i.e. below the fold on a
              laptop, which put the only three things a donor can DO on this page
              beneath everything they can only read. The rail's top edge is level
              with the org header, so as the first card these actions land at the
              very top of the page. Same move the app made by lifting the group up
              its scroll.

              STYLING: navy and teal, never the brand accent. The accent is
              per-nonprofit and under BGCA it resolves to red, so an accent-tinted
              action group read as a row of warnings - three red-bordered buttons
              saying "Volunteer" is a colour telling the donor to stop. Navy for
              the primary, teal for the secondaries: calm, brand-independent, and
              it cannot turn into an alarm for the next nonprofit either. */}
          <SectionCard label="Get more involved" testId="web-involvement">
            {/* Same sentence the app's group leads with. */}
            <p style={{ margin: '-4px 0 14px', fontSize: 12.5, lineHeight: 1.6, color: INK.muted }}>
              Your round-ups are already running. Here are three ways to do more for {npShort}.
            </p>
            {/* One lead action, then two equal-weight tiles that say what they
                actually do - the same shape and the same two sub-labels as the
                app's group, in the portal's card language. */}
            <ActionButton onClick={() => setGiveExtra(true)}>＋ Give Extra Now</ActionButton>
            {/* "Suggest a Match Sponsor" was the fourth button here and is gone on
                both surfaces - see the note on InvolvementModal's COPY map. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <InvolveTile
                testId="web-involve-become-sponsor"
                onClick={() => setInvolve('sponsor')}
                emoji="🏢"
                title="Become a Match Sponsor"
                sub="Your company funds the monthly match"
                ink={TEAL_INK} tint="#f0fdfa" edge="#99f6e4" chip="#ccfbf1"
              />
              <InvolveTile
                testId="web-involve-volunteer"
                onClick={() => setInvolve('volunteer')}
                emoji="🙌"
                title="Volunteer Opportunities"
                sub="Give time near you, not just money"
                ink={NAVY} tint="#eef4fa" edge="#cbd9e8" chip="#dce7f2"
              />
            </div>
          </SectionCard>
          {match?.active && (
            <div>
              {match.sample && (
                <p style={{ margin: '0 0 6px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>Example partnership  -  demo</span>
                </p>
              )}
              {/* The match display is the SHARED MatchBadge component, the same one
                  the app's My Cause renders, so every sentence and figure is
                  literally the same code on both surfaces - including its
                  `onDetails` drill-in row, which opens the web twin of the app's
                  MatchDetailsSheet below. Overview's compact line reads the same
                  `matchProgress()` headline. */}
              <MatchBadge match={match} onDetails={() => setMatchDetails(true)} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Share (web) ─────────────────────────────────────────────────────────────
export function WebShare() {
  const { selectedNonprofit, totalDonated } = useApp();
  const brand = useTheme();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const np = selectedNonprofit;
  if (!np) return null;

  const orgCode = np.id?.toUpperCase() ?? 'BGCA';
  const referralCode = DEMO_USER.referralCode;
  const shareUrl = `https://pocketcache.app/demo/?org=${orgCode}&ref=${referralCode}`;
  const displayUrl = `pocketcache.app/demo/?org=${orgCode.toLowerCase()}&ref=${referralCode.toLowerCase()}`;
  const shareText = `I give to ${np.name} with every purchase I make  -  spare change that actually adds up. You should try it too. 💙`;

  function copy(text, setter) {
    navigator.clipboard?.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>Share</h1>
        <p style={{ margin: '3px 0 0', fontSize: 13.5, color: INK.secondary }}>Spread the word  -  every share grows {np.shortName ?? np.name}&apos;s quiet-giving crowd.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr]" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ ...CARD, border: 'none', overflow: 'hidden' }}>
          <div style={{ padding: 24, color: '#fff', background: brand.gradient ?? `linear-gradient(135deg, ${NAVY}, #0B2A4A)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <CoinMark size={26} />
              <span style={{ fontWeight: 800 }}>{brand.appName}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>I&apos;ve donated</p>
            <p style={{ margin: '4px 0', fontSize: 40, fontWeight: 800 }} data-testid="web-share-total">${fmtMoney(totalDonated)}</p>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>to {np.name}</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
              🔥 {monthsGiving}-month giving streak
            </span>
            {np.impact && (
              <p style={{ margin: '14px 0 0', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: 12, opacity: 0.75 }}>{np.impact}</p>
            )}
          </div>
          <div style={{ padding: '12px 20px', background: '#fff', fontSize: 12.5, color: INK.secondary }}>
            Spare change from every purchase  -  it adds up. 💙
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Message preview">
            <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>{shareText}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: NAVY, wordBreak: 'break-all' }}>{displayUrl}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <ActionButton tone="quiet" onClick={() => copy(`${shareText}\n${shareUrl}`, setCopied)}>{copied ? '✓ Copied' : 'Copy link'}</ActionButton>
              <ActionButton tone="quiet" onClick={() => navigator.share?.({ title: brand.appName, text: shareText, url: shareUrl })}>Share via…</ActionButton>
              {/* location.href, not window.open - see the note on Settings'
                  support row: a mailto: through window.open does nothing at all
                  inside the iOS WebView. */}
              <ActionButton tone="quiet" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(`Join me on ${brand.appName}`)}&body=${encodeURIComponent(shareText + '\n' + shareUrl)}`; }}>Email</ActionButton>
            </div>
          </SectionCard>
          <div style={{ ...CARD, border: 'none', padding: 20, background: `linear-gradient(135deg, ${NAVY}, #0B2A4A)`, color: '#fff' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 15 }}>Invite a Friend</p>
            <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
              When someone joins with your link, we waive their first month&apos;s $1 app fee  - 
              so their very first charge is pure giving to {np.name}.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: '10px 14px' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>{referralCode}</span>
              <button onClick={() => copy(referralCode, setCodeCopied)}
                style={{ border: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {codeCopied ? 'Copied!' : 'Copy code'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Settings (web) ──────────────────────────────────────────────────────────
export function WebSettings() {
  const {
    selectedNonprofit, setSelectedNonprofit, roundUpMultiplier, setRoundUpMultiplier,
    totalDonated, pendingRoundUps, boostDonation, cancelAccount, adminRole, deleteAccount,
    trackedCard, setTrackedCard, paymentMethod, setPaymentMethod, linkedCards,
    pendingSettingsAction, clearPendingSettingsAction,
    monthlyCap, setMonthlyCap, skipNextCharge, setSkipNextCharge, hasAccount, feeMonths,
    chargeAdjustment, coverProcessing, setCoverProcessing,
  } = useApp();
  const { message: toast, showToast, clearToast } = useWebToast();

  const [prefs, setPrefsState] = useState(loadPrefs);
  function updatePref(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefsState(next);
    saveKey('pc_prefs', next);
  }
  const [commsOptin, setCommsOptinState] = useState(() => loadKey('pc_comms_optin', true));
  function updateCommsOptin(v) { setCommsOptinState(v); saveKey('pc_comms_optin', v); }

  const [modal, setModal] = useState(null); // 'card' | 'payment' | 'switch' | 'privacy' | 'cancel' | 'skip' | 'billing'

  // Dates come from lib/billing - the old local `new Date(y, m + 1, 11)` was
  // wrong for days 1 to 10, when the upcoming charge is THIS month's 11th.
  const skipMonthName = currentMonthName();
  const chargeLabel = nextChargeLabel();
  // A skipped cycle collects NOTHING on `chargeLabel`; the $1 fee is not waived,
  // it rolls forward and lands on the charge after that. Every sentence that
  // says so - here and in the app - comes from lib/donorContent's skip copy,
  // which also derives the "$1 × n" multiplier from the real pending feeMonths
  // (skip twice and the third charge honestly reads $1 × 3) and enforces the
  // rule that the "only charged in the months you give" framing never renders
  // without the fee sentence beside it.

  // ── CANONICAL EXPORT SHAPE (mirror of Settings.jsx handleDownloadData) ──────
  // Settings.jsx marks that object as canonical for BOTH surfaces; this is the
  // web half, field for field. Donor-meaningful facts only.
  //
  // The web portal previously walked every pc_* key in localStorage and dumped
  // it verbatim, so "Download my data" handed the donor pc_page, pc_admin_role,
  // pc_tracked_card, pc_review_ack and the rest of our storage schema. Two
  // different features under one name; this is the correct one.
  //
  // Only intentional difference from the app: name/email prefer the signed-in
  // `hasAccount` (the web portal displays those too) and fall back to DEMO_USER,
  // which is the same value in the demo.
  function buildExportData() {
    return {
      exportedAt: new Date().toISOString(),
      user: {
        name: hasAccount?.name ?? DEMO_USER.name,
        email: hasAccount?.email ?? DEMO_USER.email,
        memberSince: DEMO_USER.joinedAt.toISOString().slice(0, 10),
      },
      cause: selectedNonprofit
        ? { id: selectedNonprofit.id, name: selectedNonprofit.name, ein: selectedNonprofit.ein }
        : null,
      giving: {
        totalDonated,
        pendingThisMonth: pendingRoundUps,
        roundUpMultiplier,
        monthlyCap,
        skippingCurrentMonth: skipNextCharge,
        skippedMonth: skipNextCharge ? skipMonthName : null,
        appFeeMonthsPending: feeMonths,
        nextChargeDate: chargeLabel,
      },
      monthlyHistory: MONTHLY_DATA.map(m => ({ month: m.month, year: m.year, donated: m.donated })),
      trackedCard: trackedCard
        ? { name: trackedCard.name, brand: trackedCard.brand, last4: trackedCard.last4, institution: trackedCard.institution }
        : null,
      paymentMethod: paymentMethod
        ? { type: paymentMethod.type, label: paymentMethod.label, last4: paymentMethod.last4 ?? null }
        : null,
      linkedCards: (linkedCards ?? []).map(c => ({ brand: c.brand, last4: c.last4 })),
      preferences: { ...prefs, accountEmailsAndNonprofitUpdates: commsOptin },
    };
  }

  useEffect(() => {
    if (pendingSettingsAction === 'change-payment') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal('payment');
      clearPendingSettingsAction();
    }
  }, [pendingSettingsAction, clearPendingSettingsAction]);

  const np = selectedNonprofit;
  const npShort = np?.shortName ?? 'your nonprofit';
  const memberSince = DEMO_USER.joinedAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  // THE billing explanation, from lib/donorContent. Settings is its only home in
  // the product now (the app's Settings renders the same paragraphs). The portal
  // previously had none at all, so a web donor's only account of how billing works
  // was a schedule sentence buried in Overview's estimate card. The minimum uses
  // the same `?? 5` fallback every other caller uses, and the dates come from
  // lib/billing rather than literals.
  const billingParagraphs = billingExplainer({
    orgShort: npShort,
    minimum: np?.monthlyMinimum ?? 5,
    chargeDay: CHARGE_DAY,
    reviewDays: REVIEW_WINDOW_LAST_DAY,
  });

  // What the processing cover actually costs at today's numbers, quoted against
  // the amount that will really be charged (cap and one-time adjustment
  // applied), not the raw accrual - the processor takes its cut of the charge,
  // so quoting the accrual would overstate it whenever a cap is on. Same two
  // lines as the app's Settings (Settings.jsx ~1140).
  const chargeableThisMonth = effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment });
  const coverEstimate = processingCoverFor(chargeableThisMonth);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>Settings</h1>
        {/* Identity only. The lifetime "$61.05 donated" used to ride along here;
            Overview's hero owns that figure and a settings header is not where a
            donor looks for it. */}
        <p style={{ margin: '3px 0 0', fontSize: 13.5, color: INK.secondary }} data-testid="web-settings-identity">
          {hasAccount?.name ?? DEMO_USER.name} · {hasAccount?.email ?? DEMO_USER.email} · Member since {memberSince}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Round-up settings">
            <Row
              label="Multiplier"
              sub={`${roundUpMultiplier}×  -  ${MULTIPLIER_OPTIONS.find(o => o.value === roundUpMultiplier)?.desc ?? ''}`}
            />
            {/* The app explains each multiplier in its own sheet; web shows all
                three descriptions inline (it used to be a bare 1/2/3 row). */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '2px 0 4px' }}>
              {MULTIPLIER_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setRoundUpMultiplier(opt.value)}
                  aria-pressed={roundUpMultiplier === opt.value}
                  style={{
                    padding: '10px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: roundUpMultiplier === opt.value ? `2px solid ${NAVY}` : '1.5px solid #e5e7eb',
                    background: roundUpMultiplier === opt.value ? '#eef4fa' : '#fff',
                  }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 14, color: roundUpMultiplier === opt.value ? NAVY : INK.primary }}>
                    {opt.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: INK.muted, marginTop: 2, lineHeight: 1.35 }}>
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Skip a month"
              sub={skipNextCharge
                ? skipRowSub({ monthName: skipMonthName, feeMonths })
                : skipRowOfferSub(skipMonthName)}
              right={skipNextCharge ? (
                <button onClick={() => setSkipNextCharge(false)}
                  style={{
                    padding: '6px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                    border: '1.5px solid #e5e7eb', background: '#fff', color: INK.secondary,
                  }}>
                  Undo
                </button>
              ) : (
                <button onClick={() => { setSkipNextCharge(true); setModal('skip'); }}
                  style={{
                    padding: '6px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                    border: 'none', background: NAVY, color: '#fff',
                  }}>
                  Skip {skipMonthName}
                </button>
              )} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <div style={{ paddingTop: 10 }}>
              <CapControl value={monthlyCap} onChange={setMonthlyCap} />
            </div>
          </SectionCard>

          <SectionCard label="Card we track">
            <Row label={trackedCard?.name ?? 'Chase Sapphire'} sub={`•••• ${trackedCard?.last4 ?? '4242'} · Read-only via Plaid`}
              right={<span style={{ fontSize: 11.5, fontWeight: 700, color: '#0D9488', background: '#f0fdfa', borderRadius: 999, padding: '4px 10px' }}>Watching</span>} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Track a different card" sub="Switch which card we watch for round-ups" onPress={() => setModal('card')}
              right={<span style={{ color: INK.muted }}>›</span>} />
          </SectionCard>

          <SectionCard label="How you pay">
            <Row label={paymentMethod?.label ?? 'Credit or Debit Card'}
              sub={paymentMethod?.last4 ? `•••• ${paymentMethod.last4} · One monthly charge from ${npShort}` : `One monthly charge from ${npShort}`}
              right={<span style={{ fontSize: 18 }}>{{ ach: '🏦', apple_pay: '🍎', card: '💳' }[paymentMethod?.type] ?? '💳'}</span>} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Change payment method" sub="Bank account, Apple Pay, or card" onPress={() => setModal('payment')}
              right={<span style={{ color: INK.muted }}>›</span>} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            {/* THE STANDING processing-cover preference, in the same card as the
                payment method on both surfaces (Settings.jsx ~1395), because it
                is part of "what leaves your account each month".

                It was previously a pre-checked checkbox on the signup screen held
                in local state and thrown away when onboarding finished, plus two
                more local copies inside the Give Extra and Cancel sheets - so a
                donor who agreed to cover the cost had nowhere to see it, no way
                to change it, and it never reached a single monthly charge. It
                lives in AppContext now (pc_cover_processing) and this row is
                where a donor changes their mind. The figure is quoted from
                lib/billing, never typed. */}
            <div data-testid="web-cover-processing">
              <Row
                label="Cover processing costs"
                sub={coverEstimate > 0
                  ? `Adds about $${fmtMoney(coverEstimate)} to your ${chargeLabel} charge so ${npShort} keeps your full round-ups. Every cent of it goes to ${npShort}, never to PocketCache.`
                  : `Adds the card cost to your monthly charge so ${npShort} keeps your full round-ups. Every cent of it goes to ${npShort}, never to PocketCache.`}
                right={<WebToggle value={coverProcessing} onChange={setCoverProcessing} />}
              />
            </div>
            <div style={{ height: 1, background: '#f1f5f9' }} />
            {/* THE billing explainer, and the only one in the product - now one
                row that opens a popup instead of five paragraphs of permanent
                wall text sitting between two controls. Settings is a list of
                things a donor can change; reference prose parked in the middle of
                it pushed the real controls down the page and got skimmed past
                anyway. One row, one popup, read once.

                It sits in this card, directly under the payment method and the
                cover, on BOTH surfaces (Settings.jsx ~1410) - "when you are
                charged" belongs with "how you pay", and a card of its own needed
                a section label that just repeated the row's own name.

                The prose still comes from lib/donorContent (billingExplainer);
                the popup only lays it out. The old copy elsewhere told donors to
                use "your toggle" for a processing-cover control they could not
                find. There IS a real standing control for it now - the row right
                above - but this copy still does not mention a toggle, and that
                sentence should not come back. */}
            <Row
              label="How billing works"
              sub="When you're charged, who charges you, and what the $1 app fee is"
              onPress={() => setModal('billing')}
              right={<span style={{ color: INK.muted }}>›</span>}
            />
          </SectionCard>

          <SectionCard label="Your cause">
            <Row label={np?.name ?? ' - '} sub="Where your round-ups go" />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Switch nonprofit" sub="Enter a different org's code" onPress={() => setModal('switch')}
              right={<span style={{ color: INK.muted }}>›</span>} />
          </SectionCard>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Preferences">
            <Row label="Push notifications" sub="Weekly impact summaries"
              right={<WebToggle value={prefs.notifications} onChange={v => updatePref('notifications', v)} />} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Charge reminder" sub="Your exact amount on the 1st  -  charge runs the 11th"
              right={<WebToggle value={prefs.chargeReminder} onChange={v => updatePref('chargeReminder', v)} />} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label={`Account emails & ${npShort} updates`} sub="Giving updates from PocketCache and your cause"
              right={<WebToggle value={commsOptin} onChange={updateCommsOptin} />} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Privacy & security" sub="Data, analytics, delete account" onPress={() => setModal('privacy')}
              right={<span style={{ color: INK.muted }}>›</span>} />
          </SectionCard>

          {/* Terms and Privacy are in the global portal footer on every view, so the
              duplicate rows that used to sit here are gone: one home per surface. */}
          {/* `window.location.href`, NOT `window.open`. A mailto: through
              window.open is silently swallowed inside the iOS WebView the app
              ships as (no window to open, no handler, no error) - the support
              link simply did nothing. Assigning location.href hands the URL to
              the OS and works on desktop browsers and in the WebView alike. */}
          <SectionCard label="Help & support">
            <Row label="Contact support" sub="support@pocketcache.app · we reply within 2 business days"
              onPress={() => { window.location.href = 'mailto:support@pocketcache.app'; }} right={<span style={{ color: INK.muted }}>↗</span>} />
          </SectionCard>

          <SectionCard label="Subscription">
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: INK.muted, lineHeight: 1.6 }}>
              Cancelling never costs anything  -  you choose whether this month&apos;s round-ups become a final donation or are simply never charged.
            </p>
            <ActionButton tone="danger" onClick={() => setModal('cancel')}>Cancel my giving subscription</ActionButton>
          </SectionCard>
        </div>
      </div>

      {/* Version line. The app prints "PocketCache · v1.0.0" at the bottom of its
          Settings tab and in the Your Account sheet; the portal printed no version
          anywhere, so a web donor reporting a bug had nothing to quote. */}
      <p
        data-testid="web-settings-version"
        style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 12, color: INK.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <CoinMark size={14} />PocketCache · v1.0.0
      </p>

      {/* ── Modals ── */}
      <TrackCardModal
        show={modal === 'card'} onClose={() => setModal(null)} current={trackedCard}
        onConnected={card => {
          setTrackedCard(card);
          showToast(`Now tracking ${card.name}. Round-ups from your old card stop today; new purchases on this card count from now on.`);
        }}
      />
      <ChangePaymentModal
        show={modal === 'payment'} onClose={() => setModal(null)}
        onChanged={method => { setPaymentMethod(method); showToast('Payment method updated.'); }}
      />
      <SwitchOrgModal show={modal === 'switch'} onClose={() => setModal(null)}
        onBind={org => { setSelectedNonprofit(org); showToast(`Your round-ups now go to ${org.shortName ?? org.name}.`); }} />
      <PrivacyModal show={modal === 'privacy'} onClose={() => setModal(null)}
        prefs={prefs} updatePref={updatePref} adminOrgName={adminRole ? npShort : null} onDeleteAccount={deleteAccount}
        buildExportData={buildExportData} onToast={showToast} />
      <CancelModal show={modal === 'cancel'} onClose={() => setModal(null)}
        pendingRoundUps={pendingRoundUps} feeMonths={feeMonths} nonprofit={np}
        monthlyCap={monthlyCap} chargeAdjustment={chargeAdjustment}
        onDonate={boostDonation} onCancelled={cancelAccount} />
      {/* Mirror of the app's SkipConfirmModal (Settings.jsx ~121-176), sentence
          for sentence - literally, because both render the same
          skipConfirmParagraphs() array from lib/donorContent rather than two
          hand-typed copies. That module names the charge the fee actually lands
          on, derives the multiplier from the real pending feeMonths (clamped at
          MAX_FEE_MONTHS) so skipping two cycles honestly reads $1 × 3, and keeps
          the "$1 app fee is not waived" sentence attached to the good news. */}
      <Modal show={modal === 'skip'} onClose={() => setModal(null)} title={`${skipMonthName} skipped`}>
        <div data-testid="web-skip-modal">
          {skipConfirmParagraphs({ monthName: skipMonthName, feeMonths }).map((para, i, all) => (
            <p key={i} style={{ margin: i === all.length - 1 ? '0 0 16px' : '0 0 10px', fontSize: 13, color: INK.secondary, lineHeight: 1.6 }}>
              {para}
            </p>
          ))}
        </div>
        <ActionButton tone="primary" onClick={() => setModal(null)}>Got it</ActionButton>
      </Modal>

      {/* The billing explainer popup. Content is `billingExplainer()` from
          lib/donorContent - one array, five short paragraphs, hairline between
          each - so this popup and the app's say the same thing in the same order.
          The portal's shared Modal already provides the ✕ and the click-out. */}
      <Modal show={modal === 'billing'} onClose={() => setModal(null)} title="How billing works" width={520}>
        <div data-testid="web-billing-explainer">
          {billingParagraphs.map((para, i) => (
            <div key={i}>
              {i > 0 && <div style={{ height: 1, background: '#f1f5f9' }} />}
              <p style={{ margin: 0, padding: '9px 0', fontSize: 12.5, lineHeight: 1.65, color: INK.secondary }}>{para}</p>
            </div>
          ))}
        </div>
      </Modal>

      <WebToast message={toast} onClose={clearToast} />
    </>
  );
}

// ─── Settings modals ─────────────────────────────────────────────────────────
/**
 * TrackCardModal - "track a different card" on web.
 *
 * NOTHING IS COMMITTED UNTIL THE DONOR CONFIRMS. This modal used to call
 * onConnected() from inside the fake-connect setTimeout, so the tracked card in
 * the store changed before the donor saw any Done button and closing the modal
 * could not undo it. The app never worked that way: Settings.jsx
 * TrackCardSheet.handleDone (~687-695) commits only on an explicit tap after the
 * connect animation. Web now matches: `connected` is LOCAL state, and
 * onConnected fires from confirm() alone.
 */
function TrackCardModal({ show, onClose, current, onConnected }) {
  const [connecting, setConnecting] = useState(null);
  const [connected, setConnected] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      setConnecting(null); setConnected(null); setShowManualForm(false);
    }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function pick(bank) {
    setConnecting(bank.id);
    setTimeout(() => {
      setConnecting(null);
      // Staged locally only - see the header note.
      setConnected({ name: bank.name, last4: String(Math.floor(1000 + Math.random() * 9000)), brand: bank.name, institution: bank.name });
    }, 1100);
  }

  function confirm() {
    if (!connected) return;
    onConnected(connected);
    onClose();
  }

  return (
    <Modal show={show} onClose={onClose} title="Track a Different Card">
      {connected ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }} data-testid="web-track-card-confirm">
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary }}>{connected.name} ····{connected.last4} connected</p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: INK.secondary }}>
            We&apos;ll watch purchases and calculate round-ups as they happen  -  nothing changes until you confirm.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={confirm}>Use {connected.name} ····{connected.last4} →</ActionButton>
            <ActionButton tone="quiet" onClick={onClose}>Cancel  -  keep {current?.name ?? 'my current card'}</ActionButton>
          </div>
        </div>
      ) : showManualForm ? (
        <ManualCardForm
          variant="web"
          onCancel={() => setShowManualForm(false)}
          onConnect={card => setConnected(card)}
        />
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: INK.secondary }}>
            Currently watching <strong>{current?.name ?? 'Chase Sapphire'} ····{current?.last4 ?? '4242'}</strong>. Pick a new card issuer  -  read-only via Plaid.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {TRACKED_CARD_BANKS.map(b => (
              <button key={b.id} onClick={() => pick(b)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', textAlign: 'left', opacity: connecting && connecting !== b.id ? 0.4 : 1 }}>
                <span style={{ fontSize: 20 }}>{b.emoji}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: INK.primary }}>{b.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>{b.sub}</span>
                </span>
                {connecting === b.id && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0D9488' }}>Connecting…</span>}
              </button>
            ))}
            <button
              onClick={() => setShowManualForm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, border: '1.5px dashed #99f6e4', background: '#f0fdfb', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: 20 }}>🔒</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: INK.primary }}>Enter your card manually</span>
                <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>Type your card number  -  encrypted via Plaid</span>
              </span>
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * ChangePaymentModal - "how you pay" on web.
 *
 * TWO fixes live here.
 *
 * 1. NOTHING IS COMMITTED UNTIL THE DONOR CONFIRMS, matching Settings.jsx
 *    ChangePaymentSheet: pick a method → "Setting up…" → an explicit Confirm.
 *    The old code called onChanged() inside the setTimeout, so the stored
 *    payment method changed before any confirmation was visible and closing the
 *    modal could not take it back.
 *
 * 2. "Credit or Debit Card" COLLECTS A REAL CARD. It used to fabricate a last4
 *    with Math.random() for every option, card included - the web portal claimed
 *    a card was on file that had never been typed anywhere. Now the card option
 *    opens the shared StripeCardForm (the same Stripe Elements setup the app
 *    uses) and the last4 comes from Stripe's own response, exactly like
 *    Settings.jsx AddCardSheet → handleCardAdded. ACH and Apple Pay legitimately
 *    have no last4 - they store null, as the app does.
 */
function ChangePaymentModal({ show, onClose, onChanged }) {
  const [saving, setSaving] = useState(null);
  const [staged, setStaged] = useState(null);   // ready to confirm, NOT committed
  const [cardEntry, setCardEntry] = useState(false);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setSaving(null); setStaged(null); setCardEntry(false); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function pick(opt) {
    if (opt.id === 'card') { setCardEntry(true); return; }
    setSaving(opt.id);
    setTimeout(() => {
      setSaving(null);
      setStaged({ type: opt.id, label: opt.label, last4: null });
    }, 900);
  }

  function confirm() {
    if (!staged) return;
    onChanged(staged);
    onClose();
  }

  const title = cardEntry ? 'Add Your Card' : 'Change Payment Method';

  return (
    <Modal show={show} onClose={onClose} title={title}>
      {staged ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }} data-testid="web-change-payment-confirm">
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary }}>
            {staged.label} ready{staged.last4 ? ` ····${staged.last4}` : ''}
          </p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: INK.secondary }}>
            Confirm and your next monthly charge uses this method. Secured by Stripe.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={confirm}>Confirm →</ActionButton>
            <ActionButton tone="quiet" onClick={onClose}>Cancel</ActionButton>
          </div>
        </div>
      ) : cardEntry ? (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: INK.secondary }}>
            Enter the card your monthly round-up charge should come from. Stripe holds the details  -  PocketCache never sees the number.
          </p>
          <StripeCardForm
            variant="web"
            submitLabel="Save card →"
            onCancel={() => setCardEntry(false)}
            onSuccess={card => {
              // last4 comes from Stripe, never from Math.random().
              setStaged({ type: 'card', label: 'Credit or Debit Card', last4: card.last4, brand: card.brand });
              setCardEntry(false);
            }}
          />
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: INK.secondary }}>Payments are processed by Stripe  -  PocketCache never sees your details.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {PAYMENT_METHOD_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => pick(opt)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', textAlign: 'left', opacity: saving && saving !== opt.id ? 0.4 : 1 }}>
                <span style={{ fontSize: 20 }}>{opt.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: INK.primary }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>{opt.sub}</span>
                </span>
                {saving === opt.id && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0D9488' }}>Saving…</span>}
              </button>
            ))}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: INK.muted, textAlign: 'center' }}>
            Nothing changes until you confirm on the next screen.
          </p>
        </>
      )}
    </Modal>
  );
}


function SwitchOrgModal({ show, onClose, onBind }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setCode(''); setError(null); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function submit(e) {
    e.preventDefault();
    const np = findOrgByCode(code);
    if (!np) { setError('Code not found. Ask the nonprofit for their PocketCache code.'); return; }
    onBind(np);
    onClose();
  }

  return (
    <Modal show={show} onClose={onClose} title="Switch Nonprofit">
      <p style={{ margin: '0 0 12px', fontSize: 13, color: INK.secondary }}>
        Your history stays with you  -  future round-ups go to the new cause.
      </p>
      <form onSubmit={submit}>
        <input
          type="text" placeholder="Enter code (e.g. BGCA)" value={code}
          onChange={e => { setCode(e.target.value); setError(null); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${error ? '#ef4444' : '#d1d5db'}`, fontSize: 14, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 8 }}
        />
        {error && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#dc2626' }}>{error}</p>}
        <ActionButton disabled={!code.trim()} onClick={submit}>Switch</ActionButton>
      </form>
    </Modal>
  );
}

function PrivacyModal({ show, onClose, prefs, updatePref, adminOrgName, onDeleteAccount, buildExportData, onToast }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Face ID / Touch ID unlock  -  real WebAuthn enrollment, shared with the app
  const [bioEnrolled, setBioEnrolled] = useState(biometricEnrolled);
  async function toggleBio(v) {
    if (v) {
      const ok = await biometricEnroll({ name: DEMO_USER.name, email: DEMO_USER.email });
      // Same confirmations the app shows (Settings.jsx ~973-978).
      if (ok) { markSessionUnlocked(); setBioEnrolled(true); onToast?.('Face ID unlock is on 🙂'); }
      else onToast?.("Couldn't set up Face ID on this device.");
    } else {
      biometricDisable();
      setBioEnrolled(false);
      onToast?.('Face ID unlock turned off.');
    }
  }
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setConfirmDelete(false), 0);
    return () => clearTimeout(id);
  }, [show]);

  // Curated export, same as the app. This used to walk every pc_* key in
  // localStorage and dump it verbatim, which handed the donor internal
  // implementation state (pc_page, pc_admin_role, pc_tracked_card,
  // pc_review_ack…) under the heading "my data" - wrong content for a privacy
  // export, and it enumerated localStorage without the try/catch every other
  // storage touch point in this codebase uses (identityStore.loadKey), so a
  // browser with storage blocked threw an uncaught exception on click. The
  // shape now comes from WebSettings.buildExportData; nothing here touches
  // localStorage at all.
  function downloadData() {
    try {
      const data = buildExportData ? buildExportData() : {};
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pocketcache-data.json';
      a.click();
      URL.revokeObjectURL(a.href);
      onToast?.('Your data export is downloading.');
    } catch {
      onToast?.("We couldn't build your export in this browser. Try again, or email support@pocketcache.app.");
    }
  }

  return (
    <Modal show={show} onClose={onClose} title="Privacy & Security">
      <Row label="Face ID / Touch ID unlock" sub="Require biometrics to open your giving on this device"
        right={<WebToggle value={bioEnrolled} onChange={toggleBio} />} />
      <div style={{ height: 1, background: '#f1f5f9' }} />
      <Row label="Two-factor authentication" sub="Managed by your sign-in provider (Apple / Google)" />
      <div style={{ height: 1, background: '#f1f5f9' }} />
      <Row label="Anonymous analytics" sub="Help us improve (no personal data)"
        right={<WebToggle value={prefs.dataSharing} onChange={v => updatePref('dataSharing', v)} />} />
      <div style={{ height: 1, background: '#f1f5f9' }} />
      <Row label="Marketing emails" sub="Impact stories and updates"
        right={<WebToggle value={prefs.marketingEmails} onChange={v => updatePref('marketingEmails', v)} />} />
      <div style={{ height: 1, background: '#f1f5f9' }} />
      <Row label="Download My Data" sub="Get a copy of everything we have" onPress={downloadData}
        right={<span style={{ color: INK.muted }}>⬇</span>} />
      <div style={{ height: 1, background: '#f1f5f9', marginBottom: 12 }} />
      {confirmDelete ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 14 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#991b1b', lineHeight: 1.55 }}>
            This permanently removes your giving account and data{adminOrgName ? `  -  your admin account for ${adminOrgName} is untouched` : ''}. This can&apos;t be undone.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton tone="danger" onClick={onDeleteAccount}>Yes, delete my account</ActionButton>
            <ActionButton tone="quiet" onClick={() => setConfirmDelete(false)}>Keep my account</ActionButton>
          </div>
        </div>
      ) : (
        <ActionButton tone="danger" onClick={() => setConfirmDelete(true)}>Delete account…</ActionButton>
      )}
    </Modal>
  );
}

function CancelModal({ show, onClose, pendingRoundUps, feeMonths, nonprofit, monthlyCap, chargeAdjustment, onDonate, onCancelled }) {
  const { coverProcessing: coverPref } = useApp();
  // Seeded from the donor's STANDING preference, not a hardcoded true: someone
  // who turned the cover off in Settings should not find it silently re-ticked
  // on the way out. It stays local from there - this is a one-off settle-up, so
  // changing it here must not rewrite the standing preference of an account the
  // donor is about to close. Same two lines as the app's CancelSheet
  // (Settings.jsx ~659).
  const [coverProcessing, setCoverProcessing] = useState(coverPref);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setResult(null); setCoverProcessing(coverPref); }, 0);
    return () => clearTimeout(id);
  }, [show, coverPref]);

  const raw = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  // The final settle-up is a CHARGE, so it obeys the same precedence every other
  // charge does - via lib/billing, not local math. Both surfaces used to bill the
  // RAW round-ups here, so a donor with a $10 cap and $22 accrued was promised
  // "we only charge up to your cap" in Settings and then shown a $23 final figure
  // on the way out the door, the one screen where the number is least
  // recoverable. Line-for-line mirror of the app's CancelSheet (Settings.jsx
  // ~553-577): same precedence, same trimmed-row treatment, same amber note, same
  // below-minimum test, and onDonate receives the CHARGEABLE amount, not the
  // accrual.
  const chargeable = effectiveCharge({ pendingRoundUps: raw, monthlyCap, chargeAdjustment });
  const chargeableStr = fmtMoney(chargeable);
  const trimmed = chargeable < raw;
  // Processing cover is a percentage OF THE CHARGE, so it follows the chargeable
  // amount, not the raw accrual.
  const processingCover = processingCoverFor(chargeable);
  const total = chargeTotal({
    pendingRoundUps: raw,
    monthlyCap,
    chargeAdjustment,
    feeMonths,
    processingCover: coverProcessing ? processingCover : 0,
  });
  // Measured against what is actually charged, not what accrued: a $4 cap on
  // $13.89 of round-ups really is under a $5 minimum.
  const belowMin = chargeable < (nonprofit?.monthlyMinimum ?? 5);
  const npShort = nonprofit?.shortName ?? 'your cause';

  function donateAndCancel() {
    onDonate(chargeable);
    setResult('donated');
  }

  return (
    <Modal show={show} onClose={onClose} title="Before you go…">
      {result === 'donated' || result === 'cancelled' ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>{result === 'donated' ? '💚' : '👋'}</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary }}>
            {result === 'donated' ? 'Donated! Your subscription has been cancelled.' : 'Subscription Cancelled'}
          </p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: INK.secondary }}>
            {result === 'donated'
              ? `Thank you for your final donation to ${npShort}.`
              : "This month's round-ups won't be charged  -  as if the month never happened."}
          </p>
          <ActionButton tone="quiet" onClick={() => { onClose(); onCancelled(); }}>Done</ActionButton>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: INK.secondary, lineHeight: 1.6 }}>
            You&apos;ve rounded up <strong style={{ color: INK.primary }}>${fmtMoney(raw)}</strong> for {npShort} this month.
            Would you like to make this month&apos;s donation before cancelling?
          </p>
          <div style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5', borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ color: INK.secondary }}>Round-ups</span>
              <span style={{ fontWeight: 700, color: INK.primary }} data-testid="web-cancel-roundups">
                {trimmed
                  ? <><s style={{ color: INK.muted, fontWeight: 400 }}>${fmtMoney(raw)}</s> ${chargeableStr}</>
                  : `$${fmtMoney(raw)}`}
              </span>
            </div>
            {trimmed && (
              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#b45309' }} data-testid="web-cancel-note">
                {chargeAdjustment !== null && chargeAdjustment !== undefined
                  ? `Adjusted to $${chargeableStr} for this month  -  the rest is never charged.`
                  : `Capped at $${fmtMoney(monthlyCap)}/month  -  the rest is never charged.`}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.muted }}>
              {/* "(not tax-deductible)" is on the app's settle-up row and on the
                  web wizard's review row; it was missing here alone. */}
              <span>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span><span>+${fmtMoney(feeMonths)}</span>
            </div>
            {coverProcessing && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.muted }}>
                <span>Processing cover</span><span>+${fmtMoney(processingCover)}</span>
              </div>
            )}
            <div style={{ height: 1, background: '#cbd5e1', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: INK.primary }}>Total</span><span style={{ fontWeight: 800, color: NAVY }} data-testid="web-cancel-total">${fmtMoney(total)}</span>
            </div>
          </div>
          {belowMin && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#92400e', background: '#fffbeb', borderRadius: 10, padding: '8px 12px', lineHeight: 1.55 }}>
              Note: ${chargeableStr} is below the ${nonprofit?.monthlyMinimum ?? 5} minimum  -  in a live account this would roll over rather than charge. Cancelling now forfeits this amount.
            </p>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: INK.secondary, marginBottom: 14, cursor: 'pointer' }}
            onClick={() => setCoverProcessing(v => !v)}>
            <input type="checkbox" readOnly checked={coverProcessing} style={{ marginTop: 2, accentColor: '#059669' }} />
            <span>Cover {npShort}&apos;s card-processing costs (~${fmtMoney(processingCover)}) so 100% of my round-ups reach them</span>
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            {/* "Send", matching the app's CancelSheet CTA - the two settle-up
                buttons carried different verbs for the same action. */}
            <ActionButton onClick={donateAndCancel}>Send ${fmtMoney(total)} &amp; cancel</ActionButton>
            <ActionButton tone="danger" onClick={() => setResult('cancelled')}>Cancel without donating</ActionButton>
            <ActionButton tone="quiet" onClick={onClose}>Never mind  -  keep giving</ActionButton>
          </div>
        </>
      )}
    </Modal>
  );
}
