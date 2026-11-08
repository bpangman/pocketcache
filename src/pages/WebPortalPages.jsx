import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { useTheme } from '../store/ThemeContext';
import { loadKey, saveKey } from '../store/identityStore';
import { resolveOrgByCode, getCustomOrg, isOrgPending, ORG_PENDING_MESSAGE } from '../store/orgStore';
import { DEMO_USER, monthsGiving, FIRST_MONTH_LABEL } from '../data/derived';
import { MONTHLY_DATA } from '../data/transactions';
import { getOrgStats } from '../lib/orgStats';
import { fmtMoney, fmtMoneyCompact, memberSinceLabel, joinedDateISO } from '../lib/format';
import {
  APP_FEE_LIVE, CHARGE_DAY, LARGE_DONATION_THRESHOLD, LOCK_DAY, MONTHLY_FLOOR, REVIEW_WINDOW_LAST_DAY,
  chargeTotal, effectiveCharge, nextChargeLabel,
  processingCoverFor, skipTargetMonth,
} from '../lib/billing';
// Shared donor-facing derivations. `impactTier` used to be a verbatim duplicate of
// MyCause.jsx's copy in this file; `billingExplainer` is now the product's only
// billing explanation and Settings is its only home; `adjustBounds` is the one set
// of bounds for the adjust-charge control. The notes (ADJUST_NOTE, MULTIPLIER_NOTE,
// PREVIEW_NOTE, ROLL_FORWARD_NOTE, appFeePendingLine) are built from the billing
// constants so the portal can never quote a day or a dollar the server disagrees with.
import {
  ADJUST_NOTE, MULTIPLIER_NOTE, PREVIEW_NOTE, PREVIEWS_NOTE, ROLL_FORWARD_NOTE,
  adjustBounds, appFeePendingLine, billingExplainer, impactTier, isMatchVisible, matchProgress,
  skipConfirmParagraphs, skipRowOfferSub, skipRowSub,
} from '../lib/donorContent';
import { Z, scrim } from '../lib/overlay';
import { useAdminAuth, getRememberedAdminEmail, rememberAdminEmail, forgetAdminEmail } from '../lib/adminAuth';
import { orgAdminLookup } from '../lib/npApi';
// Demo affordances (the typed-in card form, the bank-debit payment option) render
// only where lib/demo says so: a demo build, the PhoneFrame shell, or demo mode.
import { useShowDemoAffordances } from '../lib/demo';
import { isDebitableBank } from '../lib/plaid';
import {
  AlertTriangle, Building2, CheckCircle2, ChevronRight, CreditCard, Download, ExternalLink,
  HandHeart, KeyRound, Landmark, Plus, X,
} from 'lucide-react';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import PocketCacheWordmark from '../components/PocketCacheWordmark';
import MatchBadge from '../components/MatchBadge';
import ManualCardForm from '../components/ManualCardForm';
import StripeCardForm from '../components/StripeCardForm';
import PlaidBankConnect from '../components/PlaidBankConnect';
import AppVersion from '../components/AppVersion';
import Button from '../components/ui/Button';
import Toggle from '../components/ui/Toggle';
// Web Apple Pay treatment (round-3 item 1): the phone's side-button sheet
// never renders on this surface - a web-styled confirm where ApplePaySession
// could exist, an honest greyed-out option elsewhere.
import WebApplePayConfirm, { webApplePayAvailable, APPLE_PAY_UNAVAILABLE_NOTE } from '../components/WebApplePayConfirm';
import BankPaymentAuth from '../components/BankPaymentAuth';
import AppleLogo from '../components/AppleLogo';
import { biometricEnrolled, biometricEnroll, biometricDisable, markSessionUnlocked } from '../lib/biometric';
import { requestEmailChange, pollConfirmed, syncServerEmail, hasRealSession, isValidEmail } from '../lib/emailChange';
import { submitGiveExtra, submitOrgContact } from '../lib/engagement';
import { INK, NAVY, TEAL_INK, CARD, SHADOW, RADIUS, NUMS } from '../lib/webTheme';

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

// Ink, card and depth tokens come from the shared web design vocabulary
// (lib/webTheme). TEAL_INK note preserved there: same teal ink the app's My
// Cause uses for the sponsor tile (MyCause.jsx:25) - fixed, never the
// per-nonprofit brand accent: the accent resolves to red under BGCA, which
// turned the involvement group into a row of things that look like errors.
// Navy and teal stay calm for every org.

// The one navy gradient (DESIGN.md: the only gradients are this and the existing
// hero/header ones). Built from the tokens so a palette change is one edit.
const NAVY_GRADIENT = 'linear-gradient(135deg, var(--navy-deep), var(--navy))';
// Hairline between rows inside a card (DESIGN.md: no card inside a card - inner
// groups become rows split by 1px --line).
const HAIRLINE = { height: 1, background: 'var(--line)' };
// Web input: 44px minimum, 16px text, radius 12, 1px --line border (DESIGN.md INPUTS).
const INPUT = { width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 14px', borderRadius: RADIUS.sm, border: '1px solid var(--line)', background: '#fff', fontSize: 16, color: INK.primary, fontFamily: 'inherit' };
const INPUT_ERROR = { borderColor: 'var(--danger)' };
const ERROR_TEXT = { margin: '6px 0 0', fontSize: 13, color: 'var(--danger)' };
const CAPS_LABEL = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK.subtle };
// 1st / 2nd / 11th, for the charge-schedule sentences built from the billing constants.
const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

// Mirrors Settings.jsx MULTIPLIER_OPTIONS (~143-147) - the app explains each
// multiplier, so web has to as well. Keep the descriptions identical.
const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1×', desc: 'Standard round-up' },
  { value: 2, label: '2×', desc: 'Double your impact' },
  { value: 3, label: '3×', desc: 'Triple your impact' },
];

// Bank Account stays DEMO-ONLY (business model, 2026-11-07): real donors pay with
// a card saved through Stripe until the bank-debit authorization is built, so
// ChangePaymentModal filters 'ach' out unless demo affordances are on.
const PAYMENT_METHOD_OPTIONS = [
  // No "$1/month app fee" clause on the tiles: the fee is not charged yet
  // (lib/billing APP_FEE_LIVE) and the cancel/billing screens already explain it.
  { id: 'ach',       icon: <Landmark size={20} aria-hidden="true" />,   label: 'Bank Account',        sub: 'Direct bank transfer' },
  { id: 'apple_pay', icon: <AppleLogo size={20} />,                      label: 'Apple Pay',            sub: 'Set up once, fully automatic' },
  { id: 'card',      icon: <CreditCard size={20} aria-hidden="true" />, label: 'Credit or Debit Card', sub: 'Visa, Mastercard, Amex, or Discover' },
];

// `marketingEmails` is the "PocketCache product updates" row and defaults OFF:
// PocketCache never solicits donors, so nobody is opted into our mail by default.
// There is no `notifications` default any more - web has no push, so the row is
// gone and a browser-only account must not export a push opt-in.
function loadPrefs() {
  return {
    chargeReminder: true,
    biometric: true, dataSharing: false, marketingEmails: false,
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
        style={{ position: 'relative', zIndex: Z.modal, width, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: RADIUS.lg, boxShadow: SHADOW.lg, padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: INK.primary }}>{title}</h3>
          {/* 44px hit area around a 32px visual circle. */}
          <button type="button" onClick={onClose} aria-label="Close" className="pc-btn"
            style={{ border: 'none', background: 'transparent', width: 44, height: 44, margin: '-6px -6px -6px 0', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: RADIUS.pill, background: 'var(--surface)', color: INK.secondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} />
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// The portal's switch is THE shared Toggle (src/components/ui/Toggle.jsx):
// 51x31, role=switch, aria-checked, and - the part the old 46x26 local button
// never had - an accessible name. `label` is required at every call site and is
// the Row's own label, so a screen reader hears "Cover processing costs, switch,
// on" instead of an empty button.
function WebToggle({ value, onChange, label, color }) {
  return <Toggle checked={!!value} onChange={onChange} label={label} color={color} />;
}

function SectionCard({ label, children, style, testId }) {
  return (
    <div data-testid={testId} style={{ ...CARD, padding: 24, ...style }}>
      {label && <p style={{ margin: '0 0 12px', ...CAPS_LABEL }}>{label}</p>}
      {children}
    </div>
  );
}

// Helper text sits on INK.subtle (4.5:1), never INK.muted - muted is decorative only.
function Row({ label, sub, right, onPress }) {
  const inner = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 15, color: INK.primary }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 14, lineHeight: 1.45, color: INK.subtle, marginTop: 2 }}>{sub}</span>}
      </span>
      {right}
    </>
  );
  const base = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 44, padding: '10px 0', textAlign: 'left' };
  if (onPress) return <button type="button" onClick={onPress} style={{ ...base, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', borderRadius: RADIUS.xs }}>{inner}</button>;
  return <div style={base}>{inner}</div>;
}

// Decorative row chevron (the old "›" glyph), 44px tall so the row's hit area
// is never shorter than the touch minimum.
function Chevron() {
  return <ChevronRight size={18} aria-hidden="true" style={{ color: INK.muted, flexShrink: 0 }} />;
}

// Every portal CTA is the shared Button (src/components/ui/Button.jsx) on the
// web surface: pill, 44px, one disabled token, pressed scale and focus ring from
// index.css. The three tones this file always used map onto its variants:
//   primary -> navy gradient     quiet -> secondary (white, --line)
//   danger  -> outlined red; `filled` makes it the solid red FINAL confirm.
function ActionButton({ children, onClick, disabled, tone = 'primary', filled = false, type = 'button', testId, fullWidth }) {
  const variant = tone === 'quiet' ? 'secondary' : tone === 'danger' ? (filled ? 'primary' : 'danger') : 'primary';
  return (
    <Button
      type={type}
      variant={variant}
      tone={tone === 'danger' && filled ? 'danger' : undefined}
      size="md"
      surface="web"
      fullWidth={fullWidth}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      style={{ fontWeight: 700 }}
    >
      {children}
    </Button>
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
function InvolveTile({ onClick, icon, title, sub, ink, tint, edge, chip, testId }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="pc-btn"
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', textAlign: 'left',
        padding: 16, borderRadius: RADIUS.md, cursor: 'pointer', minHeight: 118, fontFamily: 'inherit',
        background: tint, border: `1px solid ${edge}`,
      }}
    >
      {/* 36px icon chip, radius 12, lucide only (DESIGN.md ICONS). */}
      <span style={{ width: 36, height: 36, borderRadius: RADIUS.sm, background: chip, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span style={{ display: 'block', fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: ink }}>{title}</span>
      <span style={{ display: 'block', fontSize: 14, lineHeight: 1.4, color: ink, opacity: 0.85 }}>{sub}</span>
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
function useWebToast(ms = 5000) {
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(id);
  }, [message, ms]);
  return { message, showToast: setMessage, clearToast: () => setMessage(null) };
}

// Auto-dismisses at about 5s (useWebToast); the X is a 44x44 button named Dismiss.
function WebToast({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      role="status" data-testid="web-toast"
      className="pc-on-dark"
      style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: Z.globalToast,
        maxWidth: 520, background: INK.primary, color: '#fff', borderRadius: RADIUS.md, padding: '8px 8px 8px 18px',
        fontSize: 15, fontWeight: 600, lineHeight: 1.5, boxShadow: SHADOW.lg,
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <span style={{ flex: 1, padding: '4px 0' }}>{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss"
        style={{ width: 44, height: 44, flexShrink: 0, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm }}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Admin sign-in (web page)  -  passwordless work-email code ────────────────
// The webpage version of the admin login protocol: username = the org-domain
// email verified at signup; a real Supabase one-time code per sign-in, never
// a password. Resolves which org the email administers server-side
// (org-admin-lookup) - see src/lib/adminAuth.js and src/lib/npApi.js.
export function WebAdminSignIn() {
  const { setAdminRole, setLastMode, setPage } = useApp();
  const { adoptServerOrg } = useNp();
  const auth = useAdminAuth();
  const [email, setEmail] = useState(getRememberedAdminEmail);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [resolving, setResolving] = useState(false);
  const remembered = !!getRememberedAdminEmail();

  async function send(e) {
    e?.preventDefault?.();
    const result = await auth.sendCode(email);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setCodeInput('');
    setCodeError(null);
    setSent(true);
  }

  function notYou() {
    forgetAdminEmail();
    setEmail('');
    setError(null);
  }

  async function verify(e) {
    e?.preventDefault?.();
    const verified = await auth.verifyCode(email, codeInput.trim());
    if (!verified.ok) { setCodeError(verified.error); return; }
    setCodeError(null);
    setResolving(true);
    const lookup = await orgAdminLookup(verified.email);
    setResolving(false);
    if (!lookup.ok || !lookup.data?.known || !lookup.data?.org) {
      setCodeError("We don't recognize that email. Use the work email you verified during setup.");
      return;
    }
    rememberAdminEmail(verified.email);
    const adopted = adoptServerOrg(lookup.data.org, verified.email);
    setAdminRole({ orgId: adopted._orgId, joinCode: adopted.shortName });
    setLastMode('admin');
    setPage('np-dashboard');
  }

  // Text links with a 44px hit area (tertiary buttons), navy-deep ink.
  const textLink = { border: 'none', background: 'transparent', cursor: 'pointer', minHeight: 44, padding: '0 8px', fontSize: 14, color: NAVY, fontWeight: 600, fontFamily: 'inherit', borderRadius: RADIUS.xs };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Brand-kit top bar (item 3a): the wordmark IS the brand here -
              no logo + plain-text name pair, no redundant caption. */}
          <PocketCacheWordmark size={20} />
          <p style={{ margin: 0, fontSize: 13, color: INK.subtle, alignSelf: 'flex-end', paddingBottom: 2 }}>Nonprofit admin</p>
        </div>
      </header>
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: 440, maxWidth: '100%', ...CARD, borderRadius: RADIUS.lg, boxShadow: SHADOW.md, padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.3px', color: INK.primary }}>Admin sign-in</h1>
          <p style={{ margin: '6px 0 18px', fontSize: 15, lineHeight: 1.6, color: INK.secondary }}>
            Sign in with your organization&apos;s work email. No password  -  we email you a fresh 6-digit code each time.
          </p>
          {!sent ? (
            <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
              <label htmlFor="web-admin-email" style={CAPS_LABEL}>Work email</label>
              <input id="web-admin-email" type="email" required value={email} placeholder="you@yourorg.org" autoComplete="email"
                onChange={e => { setEmail(e.target.value); setError(null); }}
                style={{ ...INPUT, ...(error ? INPUT_ERROR : null) }} />
              {remembered && (
                <button type="button" onClick={notYou} style={{ ...textLink, textDecoration: 'underline', justifySelf: 'start', marginLeft: -8 }}>Not you?</button>
              )}
              {error && <p style={{ ...ERROR_TEXT, margin: 0 }}>{error}</p>}
              <ActionButton disabled={!email || auth.sendingCode} onClick={send}>{auth.sendingCode ? 'Sending…' : 'Email me a sign-in code →'}</ActionButton>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: INK.subtle }}>
                Your admin sign-in is the work email verified when your page was created. Nothing to remember, nothing to steal.
              </p>
            </form>
          ) : (
            <form onSubmit={verify} style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 15, color: INK.secondary }}>
                We sent a 6-digit code to <strong style={{ color: INK.primary }}>{email}</strong>. Enter it to continue.
              </p>
              <input type="text" inputMode="numeric" maxLength={6} value={codeInput} aria-label="6-digit sign-in code" autoComplete="one-time-code"
                onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setCodeError(null); }}
                style={{ ...INPUT, fontFamily: 'monospace', textAlign: 'center', fontSize: 22, letterSpacing: '0.5em', ...(codeError ? INPUT_ERROR : null) }} />
              {codeError && <p style={{ ...ERROR_TEXT, margin: 0 }}>{codeError}</p>}
              <ActionButton disabled={codeInput.length !== 6 || auth.verifying || resolving} onClick={verify}>{auth.verifying || resolving ? 'Signing in…' : 'Sign in →'}</ActionButton>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                <button type="button" onClick={send} style={textLink}>Resend code</button>
                <button type="button" onClick={() => { setSent(false); setCodeInput(''); setCodeError(null); }} style={textLink}>Change email</button>
              </div>
            </form>
          )}
        </div>
      </main>
      <footer style={{ padding: '0 24px 20px', textAlign: 'center' }}>
        <p style={{ color: INK.subtle, fontSize: 14, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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

// REAL vs DEMO (web twin of the app's GiveExtraSheet split): demoActive keeps
// the simulated multi-step flow. A real account posts the pledge to the
// give-extra edge function - it is NOT charged today, it joins the donor's next
// monthly round-up charge (locked on the 1st, billed on the 11th) - so both
// paths now say so: the demo's itemized table totals "Added to your next
// monthly charge" and the done step reads the same. The $1 app fee is charged
// per ACTIVE MONTH inside the monthly charge, never per gift, so there is no fee
// line on a one-off gift on either path. Identity for a real pledge is the
// session JWT only (lib/engagement): with no session the modal shows "Sign in to
// add a real gift" and records nothing.
export function GiveExtraModal({ show, onClose }) {
  const { selectedNonprofit, boostDonation, demoActive, refreshRealRoundups } = useApp();
  const [step, setStep] = useState('amount'); // amount | review | confirm | done
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
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
  const total = valid ? parseFloat((amount + (coverProcessing ? processingFee : 0)).toFixed(2)) : 0;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setStep('amount'); setSelected(5); setCustom(''); setCoverProcessing(true); setSending(false); setError(null); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  // Real pledge path - same rules as the app sheets' handleRealGiveExtra: on
  // success refresh the roundups-me snapshot (so the portal's month and
  // lifetime figures include the pledge) and never call boostDonation, which
  // would double-count against the server-side lifetime figure.
  async function submitReal() {
    if (sending) return;
    setError(null);
    setSending(true);
    const res = await submitGiveExtra({
      amountCents: Math.round(amount * 100),
      orgCode: selectedNonprofit?.shortName,
    });
    setSending(false);
    if (res?.ok) {
      refreshRealRoundups();
      setStep('done');
    } else if (res?.reason === 'no-session') {
      // No real pledge is recorded without a signed-in session.
      setError('Sign in to add a real gift.');
    } else {
      setError(res?.error || 'Could not save your gift right now. Please try again.');
    }
  }

  // The app's GiveExtraSheet interposes a "Just to confirm…" step for large
  // gifts before onConfirm fires; web now does the same.
  function confirm() {
    if (isLarge) { setStep('confirm'); return; }
    if (demoActive) {
      boostDonation(amount);
      setStep('done');
      return;
    }
    submitReal();
  }

  function confirmLarge() {
    if (demoActive) {
      boostDonation(amount);
      setStep('done');
      return;
    }
    submitReal();
  }

  return (
    <Modal show={show} onClose={onClose} title="Give Extra Now">
      {step === 'amount' && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 15, color: INK.secondary }}>
            Make a one-time gift to <strong style={{ color: INK.primary }}>{npShort}</strong> on top of your round-ups.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }} role="group" aria-label="Gift amount">
            {BOOST_PRESETS.map(p => {
              const on = selected === p && !custom;
              return (
                <button key={p} type="button" onClick={() => { setSelected(p); setCustom(''); }} aria-pressed={on} className="pc-btn"
                  style={{
                    minHeight: 44, padding: '10px 0', borderRadius: RADIUS.sm, fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
                    border: on ? `2px solid ${NAVY}` : '1px solid var(--line)',
                    background: on ? '#eef4fa' : '#fff', color: on ? NAVY : INK.secondary,
                  }}>
                  ${p}
                </button>
              );
            })}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, border: `1px solid ${custom ? NAVY : 'var(--line)'}`, borderRadius: RADIUS.sm, padding: '0 14px', marginBottom: 14, cursor: 'text' }}>
            <span style={{ color: INK.subtle, fontWeight: 700 }} aria-hidden="true">$</span>
            <input
              type="number" inputMode="decimal" min="0" step="0.01" placeholder="Or type a custom amount" aria-label="Custom gift amount in dollars"
              value={custom} onChange={e => { setCustom(e.target.value); setSelected(null); }}
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', boxShadow: 'none', fontSize: 16, color: INK.primary, background: 'transparent', fontFamily: 'inherit' }}
            />
          </label>
          {/* A real pledge stores just the gift amount and joins the next monthly
              charge, so one honest sentence. The demo keeps its itemized table,
              with the same "next monthly charge" total - never "Total today". */}
          {valid && !demoActive && (
            <p style={{ margin: '0 0 14px', fontSize: 13, color: INK.subtle, lineHeight: 1.6 }}>
              Your ${fmtMoney(amount)} gift joins your next monthly round-up charge - nothing is charged today.
            </p>
          )}
          {valid && demoActive && (
            <div style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '10px 0', marginBottom: 14, fontSize: 15 }} data-testid="web-give-extra-table">
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: INK.secondary }}>Gift to {npShort}</span>
                <span style={{ fontWeight: 700, color: INK.primary, ...NUMS }}>${fmtMoney(amount)}</span>
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0 4px', cursor: 'pointer', color: INK.secondary, fontSize: 14, lineHeight: 1.5 }}>
                <input type="checkbox" checked={coverProcessing} onChange={e => setCoverProcessing(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--teal-ui)', flexShrink: 0 }} />
                <span>Cover {npShort}&apos;s card processing (~${fmtMoney(processingFee)})  -  goes to them, counts as part of your gift</span>
              </label>
              <div style={{ ...HAIRLINE, margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontWeight: 700, color: INK.primary }}>Added to your next monthly charge</span>
                <span style={{ fontWeight: 700, color: INK.primary, ...NUMS }} data-testid="web-give-extra-total">${fmtMoney(total)}</span>
              </div>
            </div>
          )}
          <ActionButton disabled={!valid} onClick={() => setStep('review')}>Review my gift →</ActionButton>
        </>
      )}

      {step === 'review' && (
        <>
          <div style={{ textAlign: 'center', padding: '8px 0 14px' }}>
            <p style={{ margin: 0, fontSize: 15, color: INK.secondary }}>You&apos;re about to give</p>
            <p style={{ margin: '6px 0', fontSize: 34, fontWeight: 800, lineHeight: 1.2, color: INK.primary, ...NUMS }}>${fmtMoney(amount)}</p>
            <p style={{ margin: 0, fontSize: 15, color: INK.secondary }}>
              to <strong style={{ color: INK.primary }}>{selectedNonprofit?.name ?? npShort}</strong>
            </p>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: INK.subtle, lineHeight: 1.6 }} data-testid="web-give-extra-review-note">
            {demoActive
              ? `Adds $${fmtMoney(total)} to your next monthly charge on the ${ord(CHARGE_DAY)}: your $${fmtMoney(amount)} gift${coverProcessing ? ` plus about $${fmtMoney(processingFee)} processing cover (goes to ${npShort})` : ''}. Demo - no real charge is made.`
              : `Your $${fmtMoney(amount)} gift joins your next monthly round-up charge - it will be billed with your round-ups on the ${ord(CHARGE_DAY)}, not today.`}
          </p>
          {error && (
            <div data-testid="web-give-extra-error" role="alert" style={{ background: 'var(--danger-50)', border: '1px solid #FECACA', borderRadius: RADIUS.sm, padding: '10px 14px', marginBottom: 14, fontSize: 14, color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton disabled={sending} onClick={confirm}>{sending ? 'Adding your gift…' : `Confirm  -  give $${fmtMoney(amount)}`}</ActionButton>
            <ActionButton tone="quiet" onClick={() => setStep('amount')}>← Go back</ActionButton>
          </div>
        </>
      )}

      {step === 'confirm' && (
        <div data-testid="web-give-extra-large-confirm" style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A', borderRadius: RADIUS.md, padding: 18 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 18, color: INK.primary }}>Just to confirm…</p>
          <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6, color: 'var(--warning)' }}>
            You&apos;re about to donate <strong>${fmtMoney(amount)}</strong> to {npShort}. Was that intentional?
          </p>
          {error && (
            <div role="alert" style={{ background: 'var(--danger-50)', border: '1px solid #FECACA', borderRadius: RADIUS.sm, padding: '10px 14px', margin: '0 0 12px', fontSize: 14, color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton disabled={sending} onClick={confirmLarge}>{sending ? 'Adding your gift…' : `Yes, give $${fmtMoney(amount)}`}</ActionButton>
            <ActionButton tone="quiet" onClick={() => setStep('amount')}>Go back</ActionButton>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '18px 0 8px' }} data-testid="web-give-extra-done">
          <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }} aria-hidden="true">💚</div>
          {demoActive ? (
            <>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>Thank you!</p>
              <p style={{ margin: '6px 0 18px', fontSize: 15, color: INK.secondary }}>
                Your extra ${fmtMoney(amount)} is on its way to {npShort}.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>Added to your next monthly charge</p>
              <p style={{ margin: '6px 0 18px', fontSize: 15, color: INK.secondary }}>
                Your ${fmtMoney(amount)} gift to {npShort} will be included when your round-ups are charged on the {ord(CHARGE_DAY)}.
              </p>
            </>
          )}
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

  return (
    <Modal show={show} onClose={onClose} title="Transfer nonprofit page" width={520}>
      <div data-testid="web-transfer-modal">
        {stage === 'done' ? (
          <div style={{ textAlign: 'center', padding: '10px 0 4px' }} data-testid="web-transfer-done">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><CheckCircle2 size={44} color="var(--green)" aria-hidden="true" /></div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>Demo: transfer simulated</p>
            <p style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.65, color: INK.secondary }}>
              Nothing actually changed. You still administer {joinCode} and no email was sent to {email.trim()}.
            </p>
            <div style={{ textAlign: 'left', background: 'var(--warning-50)', border: '1px solid #FDE68A', borderRadius: RADIUS.md, padding: '12px 14px', margin: '14px 0 16px' }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--warning)' }}>
                In the live version we check the new address is on your organization&apos;s domain, email them a link to accept, email you a copy, and give you a window to reverse it before your access ends.
              </p>
            </div>
            <ActionButton onClick={onClose}>Done</ActionButton>
          </div>
        ) : (
          <form onSubmit={handleContinue}>
            <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.65, color: INK.secondary }}>
              PocketCache gives each nonprofit one admin address, and right now that is
              {currentAdminEmail ? <> <strong style={{ color: INK.primary }}>{currentAdminEmail}</strong></> : ' yours'}.
              {' '}Moving on? Hand {joinCode} to a colleague so your organization keeps its page.
            </p>

            <label htmlFor="web-transfer-email" style={{ display: 'block', ...CAPS_LABEL, marginBottom: 6 }}>
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
              style={{ ...INPUT, ...(error ? INPUT_ERROR : email ? { borderColor: NAVY } : null) }}
            />
            {error && <p style={ERROR_TEXT} data-testid="web-transfer-error">{error}</p>}

            {/* Names what is LOST, not just what is gained. A handover screen that
                only describes the colleague's new powers is not a warning. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--danger-50)', border: '1px solid #FECACA', borderRadius: RADIUS.md, padding: '12px 14px', marginTop: 14 }} data-testid="web-transfer-warning">
              <AlertTriangle size={18} color="var(--danger)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: '#B91C1C' }}>
                This hands over control of {joinCode}. They get the donor list, the payout settings, and the page itself. You lose your admin access, and you will not be able to take it back yourself - only the new admin can transfer it again.
              </p>
            </div>

            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.65, color: INK.subtle }}>
              Demo: this transfer is simulated. Nothing is handed over, no email is sent, and you keep your admin access.
            </p>

            {stage === 'confirm' && (
              <div style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A', borderRadius: RADIUS.md, padding: 16, marginTop: 14 }} data-testid="web-transfer-confirm">
                <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15, color: INK.primary }}>
                  Give {joinCode} to {email.trim()}?
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.65, color: 'var(--warning)' }}>
                  They become the only admin for {joinCode}. Your own admin access ends. Confirm only if this person works at your organization and is expecting it.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <ActionButton tone="quiet" onClick={() => setStage('form')}>Cancel</ActionButton>
                  {/* The one final destructive confirm: filled red. */}
                  <ActionButton tone="danger" filled onClick={() => setStage('done')}>Yes, transfer control</ActionButton>
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
  const label = subtle ? 'Set a monthly maximum (optional)' : 'Monthly Cap';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 15, color: subtle ? INK.secondary : INK.primary }}>
            {/* subtle = Onboarding.jsx's wizard opt-in copy; default = Settings.jsx's row */}
            {label}
          </span>
          <span style={{ display: 'block', fontSize: 14, color: INK.subtle, marginTop: 2 }}>
            {subtle
              ? 'Round-ups above it are simply never charged.'
              : enabled ? `Capped at $${value}/month` : 'No cap set'}
          </span>
          {/* Until the cap reaches the server for this account it is a preview, and says so. */}
        </span>
        <WebToggle value={enabled} onChange={v => onChange(v ? 20 : null)} label={label} />
      </div>
      {enabled && (
        <div style={{ marginTop: 10 }}>
          <p style={{ textAlign: 'center', margin: '0 0 4px' }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: INK.primary, ...NUMS }}>${value}</span>
            <span style={{ fontSize: 15, color: INK.subtle }}>/month</span>
          </p>
          <input type="range" min={5} max={200} step={5} value={value} aria-label="Monthly cap in dollars"
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--teal-ui)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: INK.subtle }}>
            <span>$5</span><span>$200</span>
          </div>
        </div>
      )}
      {!subtle && (
        <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.6, color: INK.subtle }}>
          Cap what you give each month. If your round-ups go over, we only charge up to your cap  -  the rest is simply never charged.
        </p>
      )}
    </div>
  );
}

// "Preview - not yet applied to real charges": the amber tag beside a Skip /
// Cap / Adjust / Cover control whose value has not reached the server for this
// account (realAcct && !serverCaps?.donorSettings). The one tinted status
// allowed per screen (DESIGN.md), because a real donor must not read a setting
// as honored when the charge pipeline cannot see it yet.
function PreviewTag({ testId, style }) {
  return (
    <span data-testid={testId} style={{ display: 'block', width: 'fit-content', marginTop: 6, fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid #FDE68A', borderRadius: RADIUS.pill, padding: '3px 10px', ...style }}>
      {PREVIEW_NOTE}
    </span>
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
export function AdjustChargeModal({ show, onClose, pendingRoundUps, chargeAdjustment, setChargeAdjustment, monthlyCap, periodLabel = 'this month' }) {
  // Preview rule, computed here so WebDashboard's call signature is unchanged:
  // a real account whose adjustment the server cannot see yet is told so.
  const { hasAccount, demoMode, serverCaps } = useApp();
  const realAcct = !!hasAccount && !demoMode;
  const preview = realAcct && !serverCaps?.donorSettings;

  const accrued = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  const bounds = adjustBounds(accrued);
  // Never seed below the floor: the slider's minimum IS the $5 floor now.
  const seed = () => Math.min(bounds.max, Math.max(bounds.min, chargeAdjustment ?? accrued));
  const [value, setValue] = useState(seed);

  // Re-seed each time the modal opens (the app remounts its sheet via key).
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setValue(seed()), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, chargeAdjustment, accrued]);

  const capped = monthlyCap !== null && monthlyCap !== undefined && accrued > monthlyCap;
  const hasAdjustment = chargeAdjustment !== null && chargeAdjustment !== undefined;

  return (
    <Modal show={show} onClose={onClose} title="Adjust This Month's Charge">
      {/* ADJUST_NOTE is built from LOCK_DAY / REVIEW_WINDOW_LAST_DAY / CHARGE_DAY
          in lib/donorContent - the old sentence promised a "3 days before"
          email/push that nothing sends. */}
      <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.6, color: INK.secondary }}>{ADJUST_NOTE}</p>
      {preview && <p style={{ margin: '-6px 0 14px' }}><PreviewTag testId="web-adjust-preview" style={{ marginTop: 0 }} /></p>}
      {bounds.belowFloor ? (
        <>
          {/* Under the floor there is nothing to adjust: a charge under $5 never
              runs, so the slider would promise one the server refuses to make.
              Skip is the control that means "charge me nothing". */}
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 34, fontWeight: 800, lineHeight: 1.2, color: INK.primary, ...NUMS }} data-testid="web-adjust-charge-value">${fmtMoney(accrued)}</p>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: INK.subtle }}>accrued {periodLabel}</p>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: INK.subtle }} data-testid="web-adjust-below-floor">{ROLL_FORWARD_NOTE}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {hasAdjustment && (
              <ActionButton tone="quiet" onClick={() => { setChargeAdjustment(null); onClose(); }}>Reset to full amount</ActionButton>
            )}
            <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 34, fontWeight: 800, lineHeight: 1.2, color: INK.primary, ...NUMS }} data-testid="web-adjust-charge-value">${fmtMoney(value)}</p>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: INK.subtle }}>of ${fmtMoney(accrued)} accrued {periodLabel}</p>
          </div>
          <input
            type="range" min={bounds.min} max={bounds.max} step={bounds.step} value={value}
            onChange={e => setValue(parseFloat(e.target.value))}
            aria-label="This month's charge"
            style={{ width: '100%', accentColor: 'var(--teal-ui)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: INK.subtle, marginBottom: 14 }}>
            <span>${fmtMoney(bounds.min)}</span><span>${fmtMoney(bounds.max)}</span>
          </div>
          {capped && (
            <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6, color: INK.subtle }}>
              Your ${monthlyCap}/month cap is on. An amount you set here wins for this month, even above the cap  -  the cap comes back next month.
            </p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={() => { setChargeAdjustment(value); onClose(); }}>Set Charge to ${fmtMoney(value)}</ActionButton>
            {hasAdjustment && (
              <ActionButton tone="quiet" onClick={() => { setChargeAdjustment(null); onClose(); }}>Reset to full amount</ActionButton>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── My Cause (web) ──────────────────────────────────────────────────────────
// `impactTier` lived here as a near-duplicate of MyCause.jsx's copy - same four
// tiers, subtly different sentences, so the same donor read a different
// equivalency on the phone and in the browser. It is now imported from
// lib/donorContent and there is exactly one wording.

// REAL vs DEMO (web twin of the app's VolunteerSheet / BecomeMatchSponsorSheet
// split): demoActive keeps the simulated submit and its done copy. A real
// account POSTs the org-contact edge function, which resolves the org's admin
// email server-side by join code and forwards the form as one email - so the
// real volunteer form also collects the donor's name and email (prefilled from
// their account; the sponsor form already collects a contact + email), and the
// done copy is the honest "Sent to {org name}. They will reach out to you
// directly."
function InvolvementModal({ kind, show, onClose, npShort }) {
  const { demoActive, hasAccount, selectedNonprofit } = useApp();
  const [fields, setFields] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sentOrgName, setSentOrgName] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      // Prefill the real path's contact fields from the signed-in identity -
      // the donor can still edit them before sending.
      setFields(demoActive ? {} : { name: hasAccount?.name ?? '', email: hasAccount?.email ?? '' });
      setSubmitted(false);
      setSentOrgName(null);
      setSending(false);
      setError(null);
    }, 0);
    return () => clearTimeout(id);
  }, [show, demoActive, hasAccount]);

  async function submit() {
    if (demoActive) {
      setSubmitted(true);
      return;
    }
    if (sending) return;
    setError(null);
    setSending(true);
    const res = await submitOrgContact({
      orgCode: selectedNonprofit?.shortName,
      kind: kind === 'sponsor' ? 'match_sponsor' : 'volunteer',
      fields: kind === 'sponsor'
        ? { name: fields.contact, email: fields.email, company: fields.company, budget: fields.budget }
        : { name: fields.name, email: fields.email, message: fields.interest },
    });
    setSending(false);
    if (res?.ok) {
      setSentOrgName(res.org_name || selectedNonprofit?.name || npShort);
      setSubmitted(true);
    } else {
      setError(res?.error || 'Could not send your message right now. Please try again.');
    }
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
      inputs: [
        // Real mode forwards the form to the nonprofit by email, so it needs
        // the donor's own contact details; the demo flow never did.
        ...(demoActive ? [] : [
          { key: 'name', placeholder: 'Your name', required: true },
          { key: 'email', placeholder: 'Your email', required: true, type: 'email' },
        ]),
        { key: 'interest', placeholder: "Tell us how you'd like to help…", textarea: true, required: true },
      ],
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
        <div style={{ textAlign: 'center', padding: '18px 0 8px' }} data-testid="web-involve-done">
          <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }} aria-hidden="true">{COPY.done.emoji}</div>
          {demoActive ? (
            <>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>{COPY.done.head}</p>
              <p style={{ margin: '6px 0 18px', fontSize: 15, color: INK.secondary }}>{COPY.done.body}</p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>Sent to {sentOrgName}.</p>
              <p style={{ margin: '6px 0 18px', fontSize: 15, color: INK.secondary }}>They will reach out to you directly.</p>
            </>
          )}
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 15, color: INK.secondary, lineHeight: 1.6 }}>{COPY.intro}</p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {/* Placeholders double as the accessible name - every field has one. */}
            {COPY.inputs.map(inp => inp.textarea ? (
              <textarea key={inp.key} rows={3} placeholder={inp.placeholder} aria-label={inp.placeholder} value={fields[inp.key] ?? ''}
                onChange={e => setFields(f => ({ ...f, [inp.key]: e.target.value }))}
                style={{ ...INPUT, resize: 'none', lineHeight: 1.5 }} />
            ) : (
              <input key={inp.key} type={inp.type ?? 'text'} placeholder={inp.placeholder} aria-label={inp.placeholder} value={fields[inp.key] ?? ''}
                onChange={e => setFields(f => ({ ...f, [inp.key]: e.target.value }))}
                style={INPUT} />
            ))}
          </div>
          {error && (
            <div data-testid="web-involve-error" role="alert" style={{ background: 'var(--danger-50)', border: '1px solid #FECACA', borderRadius: RADIUS.sm, padding: '10px 14px', marginBottom: 14, fontSize: 14, color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          <ActionButton disabled={!requiredOk || sending} onClick={submit}>{sending ? 'Sending…' : COPY.cta}</ActionButton>
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-50)', borderRadius: RADIUS.pill, padding: '3px 10px' }}>
              Example partnership  -  demo only
            </span>
          </p>
        )}
        {match.logoUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={match.logoUrl} alt={company} style={{ height: 30, objectFit: 'contain' }} />
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 18, color: INK.primary }}>{match.company}</span>
              <span style={{ display: 'block', fontSize: 14, color: INK.subtle }}>Corporate Match Partner</span>
            </span>
          </div>
        )}
        <p style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, lineHeight: 1.6, color: INK.primary }}>{mp.headline}</p>
        {match.impactReport && (
          <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.7, color: INK.secondary }}>{match.impactReport}</p>
        )}
        <div style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '12px 0', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: INK.primary }}>Match Pool Progress</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--gold-700)', ...NUMS }}>{mp.matchedLabel} / {mp.poolLabel}</span>
          </div>
          <div style={{ background: 'var(--gold-50)', borderRadius: RADIUS.pill, height: 8, overflow: 'hidden' }} role="progressbar" aria-valuenow={mp.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Match pool used">
            <div style={{ width: `${mp.pct}%`, height: '100%', background: 'var(--gold-700)', borderRadius: RADIUS.pill }} />
          </div>
          <p style={{ margin: '7px 0 0', fontSize: 13, color: INK.subtle }} data-testid="web-match-progress">{mp.progressLabel}</p>
        </div>
        {match.impactUrl && (
          <a href={match.impactUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 15, fontWeight: 600, color: NAVY, textDecoration: 'none' }}>
            {mp.impactLinkLabel} <ExternalLink size={15} aria-hidden="true" />
          </a>
        )}
      </div>
    </Modal>
  );
}

export function WebMyCause() {
  const { selectedNonprofit, totalDonated, demoActive, hasRealBankLinked } = useApp();
  const roundupsRunning = demoActive || hasRealBankLinked;
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
  // BGCA's seed carries a SAMPLE match (GM, $50K) for the demo. A real account
  // must never read a sponsor claim about a partnership that does not exist, so
  // every render gates on isMatchVisible, not on match.active alone.
  const match = np.corporateMatch;
  const matchVisible = isMatchVisible(match, demoActive);
  const stats = [
    (orgStats?.raised ?? np.raised) != null && { label: 'Total Raised', value: fmtMoneyCompact(orgStats?.raised ?? np.raised) },
    (orgStats?.donors ?? np.donors) != null && { label: 'Donors', value: (orgStats?.donors ?? np.donors).toLocaleString() },
    np.ein && { label: 'EIN', value: np.ein },
  ].filter(Boolean);

  return (
    <>
      <GiveExtraModal show={giveExtra} onClose={() => setGiveExtra(false)} />
      <InvolvementModal kind={involve} show={!!involve} onClose={() => setInvolve(null)} npShort={npShort} />
      <WebMatchDetailsModal show={matchDetails && matchVisible} onClose={() => setMatchDetails(false)} match={match} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <OrgLogo nonprofit={np} size={14} rounded="2xl" />
        <div>
          <p style={{ margin: 0, ...CAPS_LABEL }}>Your cause</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.3px', color: INK.primary }}>{np.name}</h1>
          {np.category && <p style={{ margin: '2px 0 0', fontSize: 15, color: INK.secondary }}>{np.category}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Mission">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: INK.secondary }}>{np.description}</p>
          </SectionCard>
          {np.impact && (
            <div className="pc-on-dark" style={{ ...CARD, border: 'none', padding: 24, background: NAVY_GRADIENT }}>
              <p style={{ margin: '0 0 6px', ...CAPS_LABEL, color: 'rgba(255,255,255,0.72)' }}>Impact</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.5, color: '#fff' }}>&ldquo;{np.impact}&rdquo;</p>
            </div>
          )}
          <SectionCard label="Your impact">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: INK.secondary }} data-testid="web-impact-tier">
              {impactTier(totalDonated, npShort)}
            </p>
          </SectionCard>
          {stats.length > 0 && (
            <div>
              {(orgStats != null ? orgStats.isDemo : !!np.sampleStats) && (
                <p style={{ textAlign: 'right', margin: '0 0 6px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-50)', borderRadius: RADIUS.pill, padding: '3px 10px' }}>Demo data</span>
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, stats.length)}, 1fr)`, gap: 12 }}>
                {stats.map(s => (
                  <div key={s.label} style={{ ...CARD, padding: '14px 16px' }}>
                    <p style={{ margin: 0, fontSize: 12, color: INK.subtle }}>{s.label}</p>
                    <p style={{ margin: '3px 0 0', fontWeight: 700, fontSize: 18, color: INK.primary, ...NUMS }}>{s.value}</p>
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
            <p style={{ margin: '-4px 0 14px', fontSize: 14, lineHeight: 1.6, color: INK.subtle }}>
              {roundupsRunning
                ? `Your round-ups are already running. Here are three ways to do more for ${npShort}.`
                : `Link a card to start rounding up. In the meantime, here are three ways to help ${npShort}.`}
            </p>
            {/* One lead action, then two equal-weight tiles that say what they
                actually do - the same shape and the same two sub-labels as the
                app's group, in the portal's card language. */}
            <ActionButton onClick={() => setGiveExtra(true)}><Plus size={18} aria-hidden="true" /> Give Extra Now</ActionButton>
            {/* "Suggest a Match Sponsor" was the fourth button here and is gone on
                both surfaces - see the note on InvolvementModal's COPY map. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <InvolveTile
                testId="web-involve-become-sponsor"
                onClick={() => setInvolve('sponsor')}
                icon={Building2}
                title="Become a Match Sponsor"
                sub="Your company funds the monthly match"
                ink={TEAL_INK} tint="var(--teal-50)" edge="#99f6e4" chip="var(--teal-100)"
              />
              <InvolveTile
                testId="web-involve-volunteer"
                onClick={() => setInvolve('volunteer')}
                icon={HandHeart}
                title="Volunteer Opportunities"
                sub="Give time near you, not just money"
                ink={NAVY} tint="#eef4fa" edge="#cbd9e8" chip="#dce7f2"
              />
            </div>
          </SectionCard>
          {matchVisible && (
            <div>
              {match.sample && (
                <p style={{ margin: '0 0 6px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-50)', borderRadius: RADIUS.pill, padding: '3px 10px' }}>Example partnership  -  demo</span>
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
// Sharing sends the nonprofit's join link and nothing else. The old page
// appended a hardcoded demo referral code (nothing read it) and promised a
// first-month $1 fee waiver that does not exist in billing or on the server;
// both are gone (business model, 2026-11-07).
export function WebShare() {
  const { selectedNonprofit, totalDonated, hasAccount } = useApp();
  const brand = useTheme();
  const [copied, setCopied] = useState(false);
  const np = selectedNonprofit;
  if (!np) return null;

  const orgCode = np.id?.toUpperCase() ?? 'BGCA';
  const shareUrl = `https://pocketcache.app/demo/?org=${orgCode}`;
  const displayUrl = `pocketcache.app/demo/?org=${orgCode.toLowerCase()}`;
  const shareText = `I give to ${np.name} with every purchase I make  -  spare change that actually adds up. You should try it too. 💙`;

  function copy(text, setter) {
    navigator.clipboard?.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.3px', color: INK.primary }}>Share</h1>
        <p style={{ margin: '3px 0 0', fontSize: 15, color: INK.secondary }}>Spread the word  -  every share grows {np.shortName ?? np.name}&apos;s quiet-giving crowd.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr]" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ ...CARD, border: 'none', overflow: 'hidden' }}>
          <div className="pc-on-dark" style={{ padding: 24, color: '#fff', background: brand.gradient ?? NAVY_GRADIENT }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <CoinMark size={26} />
              <span style={{ fontWeight: 700 }}>{brand.appName}</span>
            </div>
            <p style={{ margin: 0, fontSize: 15, opacity: 0.85 }}>I&apos;ve donated</p>
            <p style={{ margin: '4px 0', fontSize: 34, fontWeight: 800, lineHeight: 1.2, ...NUMS }} data-testid="web-share-total">${fmtMoney(totalDonated)}</p>
            <p style={{ margin: 0, fontSize: 15, opacity: 0.85 }}>to {np.name}</p>
            {/* PUBLIC card - a donor sends this link to friends, so it must
                never show a demo number for a real account. A real account
                with no charge history yet reads the same honest "first
                month" framing the dashboards use, with no streak badge; demo
                mode keeps the streak, clearly labeled. */}
            {hasAccount ? (
              <p style={{ margin: '12px 0 0', fontSize: 14, opacity: 0.75 }}>{FIRST_MONTH_LABEL}</p>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '4px 12px', fontSize: 14, fontWeight: 600 }}>
                🔥 {monthsGiving}-month giving streak · Demo data
              </span>
            )}
            {np.impact && (
              <p style={{ margin: '14px 0 0', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: 14, opacity: 0.75 }}>{np.impact}</p>
            )}
          </div>
          <div style={{ padding: '12px 24px', background: '#fff', fontSize: 15, color: INK.secondary }}>
            Spare change from every purchase  -  it adds up. 💙
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Message preview">
            <p style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.6, color: INK.secondary }}>{shareText}</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: NAVY, wordBreak: 'break-all' }} data-testid="web-share-url">{displayUrl}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <ActionButton tone="quiet" onClick={() => copy(`${shareText}\n${shareUrl}`, setCopied)}>{copied ? '✓ Copied' : 'Copy link'}</ActionButton>
              <ActionButton tone="quiet" onClick={() => navigator.share?.({ title: brand.appName, text: shareText, url: shareUrl })}>Share via…</ActionButton>
              {/* location.href, not window.open - see the note on Settings'
                  support row: a mailto: through window.open does nothing at all
                  inside the iOS WebView. */}
              <ActionButton tone="quiet" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(`Join me on ${brand.appName}`)}&body=${encodeURIComponent(shareText + '\n' + shareUrl)}`; }}>Email</ActionButton>
            </div>
          </SectionCard>
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
    monthlyCap, setMonthlyCap, skipNextCharge, setSkipNextCharge, hasAccount, setHasAccount, feeMonths,
    chargeAdjustment, coverProcessing, setCoverProcessing,
    demoMode, setDemoMode, demoActive, saveDisplayName, serverCaps,
  } = useApp();
  const { message: toast, showToast, clearToast } = useWebToast();
  // realAcct: a real identity with demo mode OFF - the only state in which a
  // control's value is a promise about real money. showDemo: whether demo-only
  // affordances (typed-in card, bank debit) render on this surface (lib/demo).
  // previewControls: Skip / Cap / Adjust / Cover have not reached the server
  // for this account yet, so each carries the PREVIEW_NOTE tag.
  const realAcct = !!hasAccount && !demoMode;
  const showDemo = useShowDemoAffordances(demoMode);
  const previewControls = realAcct && !serverCaps?.donorSettings;
  // Inline profile-name edit (round-3 item 7c) - the web home of "what
  // should we call you", mirrored server-side via saveDisplayName.
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const [prefs, setPrefsState] = useState(loadPrefs);
  function updatePref(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefsState(next);
    saveKey('pc_prefs', next);
  }
  const [commsOptin, setCommsOptinState] = useState(() => loadKey('pc_comms_optin', true));
  function updateCommsOptin(v) { setCommsOptinState(v); saveKey('pc_comms_optin', v); }

  const [modal, setModal] = useState(null); // 'card' | 'payment' | 'switch' | 'privacy' | 'cancel' | 'skip' | 'billing' | 'changeEmail'

  // Dates come from lib/billing - the old local `new Date(y, m + 1, 11)` was
  // wrong for days 1 to 10, when the upcoming charge is THIS month's 11th.
  // The skip is labelled with skipTargetMonth(): during the 1st-10th review
  // window the charge on the 11th is LAST month's locked cycle, so that is the
  // month a skip actually stops; from the 11th it is the month accruing now.
  const skipMonthName = skipTargetMonth().label;
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
  // which is the same value in the demo. memberSince comes from the real
  // identity's joinedAt (lib/format joinedDateISO); monthlyHistory is the demo
  // series ONLY while demo data is on - a real account's charge history is not
  // synced to the client yet, so it exports an empty list with a note rather
  // than Alex's months.
  function buildExportData() {
    // No push on web and the charge notice is always on, so neither is a
    // preference a browser-only account should report.
    const { notifications: _notifications, chargeReminder: _chargeReminder, ...exportPrefs } = prefs;
    return {
      exportedAt: new Date().toISOString(),
      user: {
        name: hasAccount?.name ?? DEMO_USER.name,
        email: hasAccount?.email ?? DEMO_USER.email,
        memberSince: joinedDateISO(hasAccount, demoActive),
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
      monthlyHistory: demoActive
        ? MONTHLY_DATA.map(m => ({ month: m.month, year: m.year, donated: m.donated }))
        : [],
      ...(demoActive ? {} : { monthlyHistoryNote: 'Charge history sync is pending; your charge confirmations by email are the record of each month.' }),
      trackedCard: trackedCard
        ? { name: trackedCard.name, brand: trackedCard.brand, last4: trackedCard.last4, institution: trackedCard.institution }
        : null,
      paymentMethod: paymentMethod
        ? { type: paymentMethod.type, label: paymentMethod.label, last4: paymentMethod.last4 ?? null }
        : null,
      linkedCards: (linkedCards ?? []).map(c => ({ brand: c.brand, last4: c.last4 })),
      preferences: { ...exportPrefs, productUpdates: !!prefs.marketingEmails, accountEmailsAndNonprofitUpdates: commsOptin },
    };
  }

  useEffect(() => {
    if (pendingSettingsAction === 'change-payment') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal('payment');
      clearPendingSettingsAction();
    } else if (pendingSettingsAction === 'track-card' || pendingSettingsAction === 'link-bank') {
      // WebDashboard's "Link your bank" button lands here: open the Plaid modal.
      setModal('card');
      clearPendingSettingsAction();
    }
  }, [pendingSettingsAction, clearPendingSettingsAction]);

  const np = selectedNonprofit;
  const npShort = np?.shortName ?? 'your nonprofit';
  // Real identity's join month for a real account; the demo user's otherwise.
  const memberSince = memberSinceLabel(hasAccount, demoActive);
  // THE billing explanation, from lib/donorContent. Settings is its only home in
  // the product now (the app's Settings renders the same paragraphs). The portal
  // previously had none at all, so a web donor's only account of how billing works
  // was a schedule sentence buried in Overview's estimate card. The floor is the
  // one fixed MONTHLY_FLOOR for every nonprofit, and the dates come from
  // lib/billing rather than literals.
  const billingParagraphs = billingExplainer({
    orgShort: npShort,
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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.3px', color: INK.primary }}>Settings</h1>
        {/* Identity only. The lifetime "$61.05 donated" used to ride along here;
            Overview's hero owns that figure and a settings header is not where a
            donor looks for it. */}
        {editingName ? (
          <form
            style={{ display: 'flex', gap: 8, marginTop: 6, maxWidth: 480, flexWrap: 'wrap' }}
            onSubmit={e => {
              e.preventDefault();
              if (nameInput.trim()) { saveDisplayName(nameInput); showToast('Name updated'); }
              setEditingName(false);
            }}
          >
            <input
              autoFocus type="text" value={nameInput} maxLength={60}
              onChange={e => setNameInput(e.target.value)}
              placeholder="What should we call you?"
              aria-label="Your name"
              data-testid="web-settings-name-input"
              style={{ ...INPUT, flex: '1 1 220px', minWidth: 220, width: 'auto' }}
            />
            {/* Button defaults to fullWidth, which in this flex row left the
                input 30px wide (QA 11/7). Save and Cancel size to their labels
                here so the field keeps at least 220px. */}
            <ActionButton fullWidth={false} onClick={() => { if (nameInput.trim()) { saveDisplayName(nameInput); showToast('Name updated'); } setEditingName(false); }}>Save</ActionButton>
            <ActionButton fullWidth={false} tone="quiet" onClick={() => setEditingName(false)}>Cancel</ActionButton>
          </form>
        ) : (
          <p style={{ margin: '3px 0 0', fontSize: 15, color: INK.secondary, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0 10px' }} data-testid="web-settings-identity">
            <span>{hasAccount?.name ?? DEMO_USER.name} · {hasAccount?.email ?? DEMO_USER.email} · Member since {memberSince}</span>
            {hasAccount && (
              <button
                type="button"
                onClick={() => { setNameInput(hasAccount?.nameGuessed ? '' : (hasAccount?.name ?? '')); setEditingName(true); }}
                data-testid="web-settings-name-edit"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', minHeight: 44, fontSize: 15, fontWeight: 700, color: NAVY, textDecoration: 'underline', padding: '0 4px', fontFamily: 'inherit', borderRadius: RADIUS.xs }}
              >
                Edit name
              </button>
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Round-up settings">
            {previewControls && (
              <p style={{ margin: '-4px 0 16px', fontSize: 14, color: INK.subtle }} data-testid="web-previews-note">{PREVIEWS_NOTE}</p>
            )}
            <Row
              label="Multiplier"
              sub={`${roundUpMultiplier}×  -  ${MULTIPLIER_OPTIONS.find(o => o.value === roundUpMultiplier)?.desc ?? ''}`}
            />
            {/* The app explains each multiplier in its own sheet; web shows all
                three descriptions inline (it used to be a bare 1/2/3 row). */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '2px 0 4px' }} role="group" aria-label="Round-up multiplier">
              {MULTIPLIER_OPTIONS.map(opt => {
                const on = roundUpMultiplier === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setRoundUpMultiplier(opt.value)}
                    aria-pressed={on}
                    className="pc-btn"
                    style={{
                      minHeight: 44, padding: '10px 12px', borderRadius: RADIUS.sm, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      border: on ? `2px solid ${NAVY}` : '1px solid var(--line)',
                      background: on ? '#eef4fa' : '#fff',
                    }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 16, color: on ? NAVY : INK.primary }}>
                      {opt.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 13, color: INK.subtle, marginTop: 2, lineHeight: 1.35 }}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Lock-time rule, stated plainly: the multiplier applies to the whole
                month's round-ups when the month closes (lib/donorContent). */}
            <p style={{ margin: '8px 0 10px', fontSize: 13, lineHeight: 1.6, color: INK.subtle }} data-testid="web-multiplier-note">{MULTIPLIER_NOTE}</p>
            <div style={HAIRLINE} />
            <Row label="Skip a month"
              sub={<>
                {skipNextCharge
                  ? skipRowSub({ monthName: skipMonthName, feeMonths })
                  : skipRowOfferSub(skipMonthName)}
              </>}
              right={skipNextCharge ? (
                <Button variant="secondary" size="md" surface="web" fullWidth={false} onClick={() => setSkipNextCharge(false)} data-testid="web-skip-undo">
                  Undo
                </Button>
              ) : (
                <Button variant="primary" size="md" surface="web" fullWidth={false} onClick={() => { setSkipNextCharge(true); setModal('skip'); }} data-testid="web-skip-button">
                  Skip {skipMonthName}
                </Button>
              )} />
            <div style={HAIRLINE} />
            <div style={{ paddingTop: 10 }}>
              <CapControl value={monthlyCap} onChange={setMonthlyCap} />
            </div>
          </SectionCard>

          {/* Null = nothing linked yet. No placeholder card, no Watching badge:
              an account that never linked anything says so and offers the one
              action that fixes it. */}
          <SectionCard label="Card we track  -  never charged">
            {trackedCard ? (
              <Row label={trackedCard.name} sub={`•••• ${trackedCard.last4} · Read-only via Plaid${trackedCard.source && trackedCard.source !== 'plaid' ? ' · Practice mode' : ''}`}
                right={<span style={{ fontSize: 13, fontWeight: 700, color: TEAL_INK, background: 'var(--teal-50)', borderRadius: RADIUS.pill, padding: '4px 10px' }}>Watching</span>} />
            ) : (
              <Row label="No card linked yet" sub="Track a card to start counting round-ups" onPress={() => setModal('card')}
                right={<Chevron />} />
            )}
            <div style={HAIRLINE} />
            <Row label={trackedCard ? 'Track a different card' : 'Track a card'} sub="Switch which card we watch for round-ups" onPress={() => setModal('card')}
              right={<Chevron />} />
          </SectionCard>

          <SectionCard label="How you pay  -  your payment card">
            {paymentMethod ? (
              <Row label={paymentMethod.label ?? 'Credit or Debit Card'}
                sub={paymentMethod.last4 ? `•••• ${paymentMethod.last4} · One monthly charge from ${npShort}` : `One monthly charge from ${npShort}`}
                right={<span style={{ color: INK.secondary, display: 'inline-flex' }}>{{ ach: <Landmark size={20} aria-hidden="true" />, apple_pay: <AppleLogo size={16} />, card: <CreditCard size={20} aria-hidden="true" /> }[paymentMethod.type] ?? <CreditCard size={20} aria-hidden="true" />}</span>} />
            ) : (
              <Row label="Add a payment method" sub={`Needed before your first monthly charge to ${npShort}`} onPress={() => setModal('payment')}
                right={<Chevron />} />
            )}
            <div style={HAIRLINE} />
            <Row label="Change payment method" sub={showDemo ? 'Bank account, Apple Pay, or card' : 'Apple Pay or card'} onPress={() => setModal('payment')}
              right={<Chevron />} />
            <div style={HAIRLINE} />
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
                sub={<>
                  {coverEstimate > 0
                    ? `Adds about $${fmtMoney(coverEstimate)} to your ${chargeLabel} charge so ${npShort} keeps your full round-ups. Every cent of it goes to ${npShort}, never to PocketCache.`
                    : `Adds the card cost to your monthly charge so ${npShort} keeps your full round-ups. Every cent of it goes to ${npShort}, never to PocketCache.`}
                </>}
                right={<WebToggle value={coverProcessing} onChange={setCoverProcessing} label="Cover processing costs" />}
              />
            </div>
            <div style={HAIRLINE} />
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
              right={<Chevron />}
            />
          </SectionCard>

          <SectionCard label="Your cause">
            <Row label={np?.name ?? ' - '} sub="Where your round-ups go" />
            <div style={HAIRLINE} />
            <Row label="Switch nonprofit" sub="Enter a different org's code" onPress={() => setModal('switch')}
              right={<Chevron />} />
          </SectionCard>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Preferences">
            {/* No push row on web: a browser has no push subscription here, and
                nothing sends a weekly summary, so a toggle for it would be a
                control that does nothing. */}
            {/* The 1st-of-month notice is the 10 days' notice the billing model
                rests on, sent by cycle-lock regardless of any preference - so it
                is a non-toggle row, built from the billing constants, never a
                switch a donor could believe turns it off. */}
            <Row label="Charge notice" sub={`Exact amount emailed on the ${ord(LOCK_DAY)}, charge runs the ${ord(CHARGE_DAY)}`}
              right={<span style={{ color: INK.subtle, fontSize: 14, fontWeight: 700 }}>Always on</span>} />
            <div style={HAIRLINE} />
            {/* Split from a single "Account emails & X updates" toggle (Terms
                §4a): charge confirmations and account/security notices are
                mandatory service messages while the account is active and
                cannot be turned off. Receipts are NOT on this list - the
                nonprofit, not PocketCache, issues the tax receipt. Only the
                nonprofit's optional updates are a real toggle - pc_comms_optin
                keeps its existing storage key and semantics for that one. Same
                split as Settings.jsx's donor Preferences card. */}
            <Row label="Service emails" sub="Charge confirmations and account & security notices - required while your account is active (your tax receipt comes from your nonprofit)"
              right={<span style={{ color: INK.subtle, fontSize: 14, fontWeight: 700 }}>Always on</span>} />
            <div style={HAIRLINE} />
            <Row label={`${npShort} updates`} sub="Optional giving updates and news from your cause"
              right={<WebToggle value={commsOptin} onChange={updateCommsOptin} label={`${npShort} updates`} />} />
            <div style={HAIRLINE} />
            <Row label="Privacy & security" sub="Data, analytics, delete account" onPress={() => setModal('privacy')}
              right={<Chevron />} />
            <div style={HAIRLINE} />
            <Row label="Change email address" sub={`Sign in with a different email · ${hasAccount?.email ?? DEMO_USER.email}`} onPress={() => setModal('changeEmail')}
              right={<Chevron />} />
            <div style={HAIRLINE} />
            {/* Demo mode: wired to the AppContext demoMode contract (setDemoMode).
                Optional-chained so it stays a safe no-op until that contract merges. */}
            <Row label="Demo mode" sub="Show sample numbers for demos. Your real account data is untouched. Shaking the phone also toggles it."
              right={<WebToggle value={!!demoMode} onChange={v => setDemoMode?.(v)} label="Demo mode" />} />
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
              onPress={() => { window.location.href = 'mailto:support@pocketcache.app'; }} right={<ExternalLink size={16} aria-hidden="true" style={{ color: INK.muted, flexShrink: 0 }} />} />
          </SectionCard>

          {/* Account, NOT a subscription - PocketCache is an account, not a
              recurring plan. Closing stops round-ups and removes the linked card;
              nothing further is charged. Settle-up mechanics are unchanged. */}
          <SectionCard label="Account">
            <p style={{ margin: '0 0 12px', fontSize: 13, color: INK.subtle, lineHeight: 1.6 }}>
              Closing your account never costs anything  -  you choose whether this month&apos;s round-ups become a final donation or are simply never charged. Closing stops round-ups and removes your linked card; nothing further is charged.
            </p>
            <ActionButton tone="danger" onClick={() => setModal('cancel')}>Close my account</ActionButton>
          </SectionCard>
        </div>
      </div>

      {/* Version line: the shared AppVersion (version + build id), the same
          component the app's Settings tab and the shell render, so a web donor
          reporting a bug can quote a build that actually identifies one. */}
      <p
        data-testid="web-settings-version"
        style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 13, color: INK.subtle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <CoinMark size={14} /><AppVersion />
      </p>

      {/* ── Modals ── */}
      <TrackCardModal
        show={modal === 'card'} onClose={() => setModal(null)} current={trackedCard} showDemo={showDemo}
        onConnected={card => {
          setTrackedCard(card);
          // Only a real Plaid connection can honestly claim the old card's
          // round-ups stop; a practice or typed-in card is simulated and says so.
          showToast(card.source === 'plaid'
            ? `Now tracking ${card.name}. Round-ups from your old card stop today; new purchases on this card count from now on.`
            : `Now tracking ${card.name} (practice mode - this connection is simulated).`);
        }}
      />
      <ChangePaymentModal
        show={modal === 'payment'} onClose={() => setModal(null)}
        onChanged={method => { setPaymentMethod(method); showToast('Payment method updated.'); }}
      />
      <SwitchOrgModal show={modal === 'switch'} onClose={() => setModal(null)} currentId={np?.id}
        onBind={org => { setSelectedNonprofit(org); showToast(`Your round-ups now go to ${org.shortName ?? org.name}.`); }} />
      {/* Delete / cancel resolve to true only when the account is really gone:
          AppContext asks the server first for a real account and answers
          { ok } either way; the demo keeps its local behaviour ({ ok, local }).
          The modals show the retry/email copy on anything but ok. */}
      <PrivacyModal show={modal === 'privacy'} onClose={() => setModal(null)}
        prefs={prefs} updatePref={updatePref} adminOrgName={adminRole ? npShort : null}
        hasAccount={hasAccount} realAcct={realAcct}
        onDeleteAccount={async () => {
          const res = await deleteAccount();
          return res?.ok === true;
        }}
        buildExportData={buildExportData} onToast={showToast} />
      <CancelModal show={modal === 'cancel'} onClose={() => setModal(null)}
        pendingRoundUps={pendingRoundUps} feeMonths={feeMonths} nonprofit={np}
        monthlyCap={monthlyCap} chargeAdjustment={chargeAdjustment}
        realAcct={realAcct} demoActive={demoActive}
        onDonate={boostDonation}
        onCancelled={async ({ final }) => {
          const res = await cancelAccount({ final });
          return res?.ok === true;
        }} />
      <WebChangeEmailModal show={modal === 'changeEmail'} onClose={() => setModal(null)}
        currentEmail={hasAccount?.email ?? DEMO_USER.email}
        onChanged={(email) => {
          // Update the local identity so every surface reads the new address.
          // setHasAccount with an already-real identity does NOT reset progress.
          if (hasAccount) setHasAccount({ ...hasAccount, email });
          showToast('Email updated.');
        }} />
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
            <p key={i} style={{ margin: i === all.length - 1 ? '0 0 16px' : '0 0 10px', fontSize: 15, color: INK.secondary, lineHeight: 1.6 }}>
              {para}
            </p>
          ))}
          {previewControls && <p style={{ margin: '-6px 0 16px' }}><PreviewTag testId="web-skip-modal-preview" style={{ marginTop: 0 }} /></p>}
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
              {i > 0 && <div style={HAIRLINE} />}
              <p style={{ margin: 0, padding: '9px 0', fontSize: 15, lineHeight: 1.65, color: INK.secondary }}>{para}</p>
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
function TrackCardModal({ show, onClose, current, onConnected, showDemo = false }) {
  const [connected, setConnected] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      setConnected(null); setShowManualForm(false);
    }, 0);
    return () => clearTimeout(id);
  }, [show]);

  // The real connection is the shared PlaidBankConnect (web variant): Plaid Link
  // when the server is reachable, the labelled practice fallback otherwise. It
  // replaced an issuer-tile grid that invented a random last4 for whichever
  // logo was clicked - a card that had never been connected anywhere. The
  // connected card is still staged locally (see the header note) until confirm().
  const practice = connected && connected.source !== 'plaid';

  function confirm() {
    if (!connected) return;
    onConnected(connected);
    onClose();
  }

  return (
    <Modal show={show} onClose={onClose} title="Track a Different Card (Never Charged)">
      {connected ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }} data-testid="web-track-card-confirm">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--green)' }}><CheckCircle2 size={44} aria-hidden="true" /></div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>{connected.name} ····{connected.last4} connected</p>
          <p style={{ margin: '6px 0 16px', fontSize: 15, color: INK.secondary }}>
            {practice
              ? 'Practice connection - this card is simulated, so no real purchases are read from it. Nothing changes until you confirm.'
              : 'We\'ll watch purchases and calculate round-ups as they happen  -  nothing changes until you confirm. This card is never charged.'}
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
          <p style={{ margin: '0 0 12px', fontSize: 15, color: INK.secondary }}>
            {current
              ? <>Currently watching <strong>{current.name} ····{current.last4}</strong>. Connect the bank behind the card you want us to watch  -  read-only via Plaid, never charged.</>
              : <>Connect the bank behind the card you want us to watch  -  read-only via Plaid, never charged.</>}
          </p>
          <PlaidBankConnect variant="web" onConnected={card => setConnected(card)} />
          {/* Demo-only shortcut, labelled as such: a typed-in number is kept as a
              last4 for the demo and never reads real purchases. */}
          {showDemo && (
            <button
              type="button"
              onClick={() => setShowManualForm(true)}
              className="pc-btn"
              data-testid="web-track-card-manual"
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '10px 12px', marginTop: 8, borderRadius: RADIUS.sm, border: '1px dashed var(--teal-100)', background: 'var(--teal-50)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            >
              <span style={{ width: 36, height: 36, borderRadius: RADIUS.xs, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: TEAL_INK }}>
                <CreditCard size={18} aria-hidden="true" />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: INK.primary }}>Enter a card manually</span>
                <span style={{ display: 'block', fontSize: 13, color: INK.subtle }}>Demo only - type a test card; we keep just the last 4 digits</span>
              </span>
            </button>
          )}
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
 *
 * EXPORTED, because the reactivation check-in needs the same modal. The phone's
 * check-in has no room for one, so its "Change" reopens the account and
 * deep-links into Settings (App.jsx handleChangePaymentFromCheckin); the web
 * page (WebReactivate) opens THIS, changes the method in place, and leaves the
 * account closed until the donor actually restarts. One modal, both callers -
 * a second copy would be the third implementation of the same Stripe form.
 */
export function ChangePaymentModal({ show, onClose, onChanged }) {
  const { selectedNonprofit, trackedCard, demoMode } = useApp();
  // Bank debit is a demo affordance for now (the web signup offers it in the
  // same places); outside those, the real choices are Apple Pay and card.
  const showDemo = useShowDemoAffordances(demoMode);
  const [saving, setSaving] = useState(null);
  const [staged, setStaged] = useState(null);   // ready to confirm, NOT committed
  const [cardEntry, setCardEntry] = useState(false);
  const [showApplePay, setShowApplePay] = useState(false);
  // Bank account requires an authorized SOURCE here too (item 2), same rule
  // as the signup payment steps on both surfaces.
  const [bankAuth, setBankAuth] = useState(false);
  const [applePayOk] = useState(webApplePayAvailable);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setSaving(null); setStaged(null); setCardEntry(false); setShowApplePay(false); setBankAuth(false); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function pick(opt) {
    if (opt.id === 'card') { setCardEntry(true); return; }
    if (opt.id === 'apple_pay') { if (applePayOk) setShowApplePay(true); return; }
    if (opt.id === 'ach') { setBankAuth(true); return; }
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

  const title = cardEntry ? 'Add Your Payment Card' : 'Change Payment Method';
  // Apple Pay is not offered as a greyed-out tile where it cannot work; the
  // list shows what this browser can actually do and one muted line says where
  // Apple Pay would appear.
  const options = PAYMENT_METHOD_OPTIONS.filter(o => (o.id !== 'ach' || showDemo) && (o.id !== 'apple_pay' || applePayOk));

  return (
    <Modal show={show} onClose={onClose} title={title}>
      {staged ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }} data-testid="web-change-payment-confirm">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--green)' }}><CheckCircle2 size={44} aria-hidden="true" /></div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>
            {staged.label} ready{staged.last4 ? ` ····${staged.last4}` : ''}
          </p>
          <p style={{ margin: '6px 0 16px', fontSize: 15, color: INK.secondary }}>
            Confirm and your next monthly charge uses this method. Secured by Stripe.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={confirm}>Confirm →</ActionButton>
            <ActionButton tone="quiet" onClick={onClose}>Cancel</ActionButton>
          </div>
        </div>
      ) : bankAuth ? (
        <>
          {/* Only a Plaid-linked checking/savings account can be debited; a
              tracked CARD (or a typed-in / practice card) is not a bank source,
              so BankPaymentAuth gets null and asks for one instead of offering
              to debit a credit card. */}
          <BankPaymentAuth
            variant="web"
            linkedBank={isDebitableBank(trackedCard) ? trackedCard : null}
            authorized={null}
            onAuthorized={src => { setBankAuth(false); setStaged({ type: 'ach', label: 'Bank Account', last4: src.last4, institution: src.institution, authorized: true }); }}
          />
          <ActionButton tone="quiet" onClick={() => setBankAuth(false)}>Cancel</ActionButton>
        </>
      ) : cardEntry ? (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 15, color: INK.secondary }}>
            This is the payment card your monthly round-up charge comes from  -  a different card than the one we track for purchases. Stripe holds the details  -  PocketCache never sees the number.
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
          <p style={{ margin: '0 0 12px', fontSize: 15, color: INK.secondary }}>Payments are processed by Stripe  -  PocketCache never sees your details.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {options.map(opt => (
              <button key={opt.id} type="button" onClick={() => pick(opt)}
                className="pc-btn"
                data-testid={`web-payment-option-${opt.id}`}
                aria-busy={saving === opt.id ? 'true' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '10px 12px', borderRadius: RADIUS.sm, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: saving && saving !== opt.id ? 0.4 : 1 }}>
                <span style={{ width: 36, height: 36, borderRadius: RADIUS.xs, background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: NAVY }}>{opt.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: INK.primary }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 13, color: INK.subtle }}>{opt.sub}</span>
                </span>
                {saving === opt.id ? <span style={{ fontSize: 13, fontWeight: 600, color: TEAL_INK }}>Saving…</span> : <Chevron />}
              </button>
            ))}
          </div>
          {!applePayOk && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: INK.subtle, textAlign: 'center' }} data-testid="web-payment-applepay-note">
              Apple Pay appears here in Safari on Apple devices.
            </p>
          )}
          <p style={{ margin: '12px 0 0', fontSize: 13, color: INK.subtle, textAlign: 'center' }}>
            Nothing changes until you confirm on the next screen.
          </p>
        </>
      )}
      <WebApplePayConfirm
        show={showApplePay}
        payee={selectedNonprofit?.name}
        onCancel={() => setShowApplePay(false)}
        onSuccess={info => { setShowApplePay(false); setStaged(info); }}
      />
    </Modal>
  );
}


function SwitchOrgModal({ show, onClose, onBind, currentId }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setCode(''); setError(null); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  async function submit(e) {
    e.preventDefault();
    const np = await resolveOrgByCode(code);
    if (!np) { setError('Code not found. Ask the nonprofit for their PocketCache code.'); return; }
    // Still awaiting the platform owner's approval - held back from donors.
    if (isOrgPending(np)) { setError(ORG_PENDING_MESSAGE); return; }
    // Re-entering the current org's code is not a switch: say so rather than
    // rebind and toast "Your round-ups now go to..." the same place.
    if (currentId != null && np.id === currentId) { setError('You already give to ' + (np.shortName ?? np.name) + '.'); return; }
    onBind(np);
    onClose();
  }

  return (
    <Modal show={show} onClose={onClose} title="Switch Nonprofit">
      <p style={{ margin: '0 0 12px', fontSize: 15, color: INK.secondary }}>
        Your history stays with you  -  future round-ups go to the new cause.
      </p>
      <form onSubmit={submit}>
        <input
          type="text" placeholder="Enter code (e.g. BGCA)" value={code}
          aria-label="Nonprofit code"
          aria-invalid={error ? 'true' : undefined}
          data-testid="web-switch-org-code"
          onChange={e => { setCode(e.target.value); setError(null); }}
          style={{ ...INPUT, ...(error ? INPUT_ERROR : null), fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', textTransform: 'uppercase', marginBottom: 8 }}
        />
        {error && <p role="alert" style={{ ...ERROR_TEXT, margin: '0 0 8px' }} data-testid="web-switch-org-error">{error}</p>}
        <ActionButton disabled={!code.trim()} onClick={submit}>Switch</ActionButton>
      </form>
    </Modal>
  );
}

function PrivacyModal({ show, onClose, prefs, updatePref, adminOrgName, onDeleteAccount, buildExportData, onToast, hasAccount, realAcct = false }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // Face ID / Touch ID unlock  -  real WebAuthn enrollment, shared with the app.
  // The passkey is registered under the signed-in identity, not the demo user.
  const [bioEnrolled, setBioEnrolled] = useState(biometricEnrolled);
  async function toggleBio(v) {
    if (v) {
      const ok = await biometricEnroll({ name: hasAccount?.name ?? DEMO_USER.name, email: hasAccount?.email ?? DEMO_USER.email });
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
    const id = setTimeout(() => { setConfirmDelete(false); setDeleting(false); setDeleteError(null); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  // Delete is reported done only when it is: onDeleteAccount resolves true
  // once the account is really gone (server-confirmed for a real account,
  // local for the demo). Anything else leaves the account in place and shows
  // the retry/email copy instead of a success the server never gave.
  async function handleDelete() {
    if (deleting) return;
    setDeleting(true); setDeleteError(null);
    let ok = false;
    try { ok = (await onDeleteAccount?.()) === true; } catch { ok = false; }
    setDeleting(false);
    if (!ok) setDeleteError("We couldn't close your account right now. Please try again, or email info@pocketcache.app and we'll close it for you.");
  }

  // Two-factor wording follows the sign-in provider. Email sign-in IS a one-time
  // code every time; Apple and Google bring their own second factor.
  const provider = hasAccount?.provider;
  const twoFactorSub = provider === 'email'
    ? 'Each sign-in uses a one-time code sent to your email'
    : provider === 'apple' ? 'Managed by your sign-in provider (Apple)'
    : provider === 'google' ? 'Managed by your sign-in provider (Google)'
    : 'Managed by your sign-in provider (Apple / Google)';

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
        right={<WebToggle value={bioEnrolled} onChange={toggleBio} label="Face ID / Touch ID unlock" />} />
      <div style={HAIRLINE} />
      <Row label="Two-factor authentication" sub={twoFactorSub} />
      <div style={HAIRLINE} />
      <Row label="Anonymous analytics" sub="Help us improve (no personal data)"
        right={<WebToggle value={prefs.dataSharing} onChange={v => updatePref('dataSharing', v)} label="Anonymous analytics" />} />
      <div style={HAIRLINE} />
      {/* Product updates, off by default - PocketCache sends news about the
          product only. Donation asks come from the nonprofit, never from us,
          and the row says so. (Storage key kept: pc_prefs.marketingEmails.) */}
      <Row label="PocketCache product updates" sub="Product news only - PocketCache never asks you for donations"
        right={<WebToggle value={!!prefs.marketingEmails} onChange={v => updatePref('marketingEmails', v)} label="PocketCache product updates" />} />
      <div style={HAIRLINE} />
      <Row label="Download My Data" sub="Get a copy of everything we have" onPress={downloadData}
        right={<Download size={18} aria-hidden="true" style={{ color: INK.muted, flexShrink: 0 }} />} />
      <div style={{ ...HAIRLINE, marginBottom: 12 }} />
      {confirmDelete ? (
        <div style={{ background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: RADIUS.sm, padding: 14 }} data-testid="web-delete-confirm">
          <p style={{ margin: '0 0 10px', fontSize: 15, color: '#991b1b', lineHeight: 1.55 }}>
            This permanently removes your giving account and data{adminOrgName ? `  -  your admin account for ${adminOrgName} is untouched` : ''}. This can&apos;t be undone.{realAcct ? '' : ' (demo)'}
          </p>
          {deleteError && (
            <p role="alert" style={{ ...ERROR_TEXT, margin: '0 0 10px', fontSize: 14, lineHeight: 1.5 }} data-testid="web-delete-error">{deleteError}</p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton tone="danger" filled disabled={deleting} onClick={handleDelete} testId="web-delete-final">{deleting ? 'Deleting…' : 'Yes, delete my account'}</ActionButton>
            <ActionButton tone="quiet" onClick={() => setConfirmDelete(false)}>Keep my account</ActionButton>
          </div>
        </div>
      ) : (
        <ActionButton tone="danger" onClick={() => setConfirmDelete(true)}>Delete account…</ActionButton>
      )}
    </Modal>
  );
}

/**
 * WebChangeEmailModal - the web twin of Settings.jsx ChangeEmailSheet, same
 * honest flow (see src/lib/emailChange.js): a REAL Supabase auth email change
 * that sends a confirmation LINK, so we say so and poll getUser() until the
 * address flips rather than faking a code step the donor finishes in an inbox.
 */
function WebChangeEmailModal({ show, onClose, currentEmail, onChanged }) {
  const [stage, setStage] = useState('enter'); // 'enter' | 'nosession' | 'sent' | 'done'
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setStage('enter'); setNewEmail(''); setError(null); setSending(false); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  useEffect(() => {
    if (stage !== 'sent') return;
    let cancelled = false;
    const id = setInterval(async () => {
      const { email } = await pollConfirmed();
      if (cancelled) return;
      if (email && email.toLowerCase() === newEmail.trim().toLowerCase()) {
        clearInterval(id);
        await syncServerEmail({ role: 'donor', oldEmail: currentEmail });
        if (cancelled) return;
        onChanged?.(newEmail.trim());
        setStage('done');
      }
    }, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [stage, newEmail, currentEmail, onChanged]);

  async function handleSend(e) {
    e?.preventDefault?.();
    const addr = newEmail.trim();
    if (!isValidEmail(addr)) { setError('Enter a valid email address.'); return; }
    if (addr.toLowerCase() === (currentEmail || '').toLowerCase()) { setError('That is already your email address.'); return; }
    setSending(true); setError(null);
    if (!(await hasRealSession())) { setSending(false); setStage('nosession'); return; }
    const res = await requestEmailChange(addr);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    setStage('sent');
  }

  return (
    <Modal show={show} onClose={onClose} title="Change email address">
      {stage === 'done' ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }} data-testid="web-change-email-done">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--green)' }}><CheckCircle2 size={44} aria-hidden="true" /></div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>Email updated</p>
          <p style={{ margin: '6px 0 16px', fontSize: 15, color: INK.secondary }}>You now sign in with <strong>{newEmail.trim()}</strong>.</p>
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      ) : stage === 'nosession' ? (
        <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: NAVY }}><KeyRound size={40} aria-hidden="true" /></div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: INK.primary }}>Sign in first</p>
          <p style={{ margin: '6px 0 16px', fontSize: 15, color: INK.secondary }}>You need to sign in again before changing your email. Sign out and back in, then try again.</p>
          <ActionButton tone="quiet" onClick={onClose}>Got it</ActionButton>
        </div>
      ) : stage === 'sent' ? (
        <div data-testid="web-change-email-sent">
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: RADIUS.sm, padding: 14, marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 16, color: INK.primary }}>Check your inbox</p>
            <p style={{ margin: 0, fontSize: 15, color: INK.secondary, lineHeight: 1.55 }}>
              We sent a confirmation link to <strong>{newEmail.trim()}</strong> and to your current address ({currentEmail}). Open the link in each email, then come back here  -  we&apos;ll update automatically.
            </p>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: INK.subtle, textAlign: 'center' }}>Waiting for you to confirm…</p>
          <ActionButton tone="quiet" onClick={onClose}>Close  -  I&apos;ll finish later</ActionButton>
        </div>
      ) : (
        <form onSubmit={handleSend}>
          <p style={{ margin: '0 0 10px', fontSize: 15, color: INK.secondary }}>Your sign-in email is <strong>{currentEmail}</strong>. Enter the new address you want to use.</p>
          <label htmlFor="web-change-email-input" style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 600, color: INK.secondary }}>New email address</label>
          <input
            id="web-change-email-input"
            type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
            value={newEmail}
            aria-invalid={error ? 'true' : undefined}
            onChange={e => { setNewEmail(e.target.value); setError(null); }}
            style={{ ...INPUT, ...(error ? INPUT_ERROR : null), marginBottom: 8 }}
          />
          {error && <p role="alert" style={{ ...ERROR_TEXT, margin: '0 0 8px' }}>{error}</p>}
          <ActionButton disabled={!newEmail.trim() || sending} onClick={handleSend}>
            {sending ? 'Sending…' : 'Send confirmation link'}
          </ActionButton>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: INK.subtle, textAlign: 'center' }}>We&apos;ll email a link to confirm it&apos;s really you. Nothing changes until you open it.</p>
        </form>
      )}
    </Modal>
  );
}

function CancelModal({ show, onClose, pendingRoundUps, feeMonths, nonprofit, monthlyCap, chargeAdjustment, onDonate, onCancelled, realAcct = false, demoActive = true }) {
  const { coverProcessing: coverPref } = useApp();
  // Seeded from the donor's STANDING preference, not a hardcoded true: someone
  // who turned the cover off in Settings should not find it silently re-ticked
  // on the way out. It stays local from there - this is a one-off settle-up, so
  // changing it here must not rewrite the standing preference of an account the
  // donor is about to close. Same two lines as the app's CancelSheet
  // (Settings.jsx ~659).
  const [coverProcessing, setCoverProcessing] = useState(coverPref);
  const [result, setResult] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setResult(null); setCoverProcessing(coverPref); setClosing(false); setCloseError(null); }, 0);
    return () => clearTimeout(id);
  }, [show, coverPref]);

  // The close is committed BEFORE the success screen, not two seconds after it.
  // The old flow showed "Account closed" and then fired onCancelled on a timer,
  // so the headline ran ahead of the store (and, for a real account, ahead of
  // the server). Now onCancelled({ final }) - AppContext.cancelAccount's
  // contract, final = 'donate' | 'waive' - is awaited and must resolve true
  // before "closed" is shown; otherwise the donor sees the retry / email copy
  // and keeps the account. The local total is bumped (onDonate) only once the
  // close has actually gone through.
  async function close(donate) {
    if (closing) return;
    setClosing(true); setCloseError(null);
    let ok = false;
    try {
      ok = (await onCancelled?.({ final: donate ? 'donate' : 'waive' })) === true;
    } catch { ok = false; }
    setClosing(false);
    if (!ok) { setCloseError("We couldn't close your account right now. Please try again, or email info@pocketcache.app and we'll close it for you."); return; }
    if (donate) onDonate?.(chargeable);
    setResult(donate ? 'donated' : 'cancelled');
  }

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
  // The app fee is itemized only where it is charged: in the demo's sample
  // numbers, or once APP_FEE_LIVE flips. A real account sees the pending-fee
  // line from lib/donorContent instead of a $1 x N row that is not billed yet.
  const feeItemized = APP_FEE_LIVE || demoActive;
  const total = chargeTotal({
    pendingRoundUps: raw,
    monthlyCap,
    chargeAdjustment,
    feeMonths,
    processingCover: coverProcessing ? processingCover : 0,
    includeFee: feeItemized,
  });
  // Measured against what is actually charged, not what accrued: a $4 cap on
  // $13.89 of round-ups really is under the $5 floor.
  const belowMin = chargeable < MONTHLY_FLOOR;
  // Under 50 cents there is nothing a card network will settle, so there is no
  // final donation to offer - closing simply never charges it.
  const nothingToSend = chargeable < 0.5;
  const npShort = nonprofit?.shortName ?? 'your cause';

  function donateAndCancel() { close(true); }

  return (
    <Modal show={show} onClose={onClose} title="Before you go…">
      {result === 'donated' || result === 'cancelled' ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }} data-testid="web-cancel-done">
          <div style={{ fontSize: 52, marginBottom: 8 }}>{result === 'donated' ? '💚' : '👋'}</div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: INK.primary }}>
            {result === 'donated' ? 'Donated! Your account is closed.' : 'Account closed'}{realAcct ? '' : ' (demo)'}
          </p>
          <p style={{ margin: '6px 0 16px', fontSize: 15, color: INK.secondary }}>
            {result === 'donated'
              ? `Thank you for your final donation to ${npShort}. Round-ups have stopped and your linked card is removed - nothing further is charged.`
              : "This month's round-ups won't be charged  -  as if the month never happened. Your linked card is removed and nothing further is charged."}
          </p>
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 15, color: INK.secondary, lineHeight: 1.6 }}>
            You&apos;ve rounded up <strong style={{ color: INK.primary, ...NUMS }}>${fmtMoney(raw)}</strong> for {npShort} this month.
            {nothingToSend
              ? ' You have no round-ups to send - closing costs nothing.'
              : ' Would you like to make this month\'s donation before closing your account?'}
          </p>
          {!nothingToSend && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: RADIUS.sm, padding: 14, marginBottom: 10, fontSize: 15 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: INK.secondary }}>Round-ups</span>
                <span style={{ fontWeight: 700, color: INK.primary, ...NUMS }} data-testid="web-cancel-roundups">
                  {trimmed
                    ? <><s style={{ color: INK.muted, fontWeight: 400 }}>${fmtMoney(raw)}</s> ${chargeableStr}</>
                    : `$${fmtMoney(raw)}`}
                </span>
              </div>
              {trimmed && (
                <p style={{ margin: '0 0 2px', fontSize: 14, color: 'var(--warning)' }} data-testid="web-cancel-note">
                  {chargeAdjustment !== null && chargeAdjustment !== undefined
                    ? `Adjusted to $${chargeableStr} for this month  -  the rest is never charged.`
                    : `Capped at $${fmtMoney(monthlyCap)}/month  -  the rest is never charged.`}
                </p>
              )}
              {feeItemized ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.subtle }}>
                  {/* "(not tax-deductible)" is on the app's settle-up row and on the
                      web wizard's review row; it was missing here alone. */}
                  <span>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span><span style={NUMS}>+${fmtMoney(feeMonths)}</span>
                </div>
              ) : (
                <p style={{ margin: 0, padding: '2px 0', fontSize: 13, color: INK.subtle }} data-testid="web-cancel-fee-pending">{appFeePendingLine(feeMonths)}</p>
              )}
              {coverProcessing && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.subtle }}>
                  <span>Processing cover (goes to {npShort})</span><span style={NUMS}>+${fmtMoney(processingCover)}</span>
                </div>
              )}
              <div style={{ ...HAIRLINE, margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: INK.primary }}>Total</span><span style={{ fontWeight: 700, color: NAVY, ...NUMS }} data-testid="web-cancel-total">${fmtMoney(total)}</span>
              </div>
            </div>
          )}
          {belowMin && !nothingToSend && (
            <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--warning)', background: 'var(--warning-50)', borderRadius: RADIUS.xs, padding: '8px 12px', lineHeight: 1.55 }} data-testid="web-cancel-below-floor">
              Note: ${chargeableStr} is below the ${MONTHLY_FLOOR} floor, so in a normal month it would roll forward rather than charge. If you close without donating, this amount is never charged.
            </p>
          )}
          {!nothingToSend && (
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, fontSize: 15, color: INK.secondary, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={coverProcessing} onChange={e => setCoverProcessing(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: NAVY }} data-testid="web-cancel-cover" />
              <span>Cover {npShort}&apos;s card-processing costs (~${fmtMoney(processingCover)}) so 100% of my round-ups reach them</span>
            </label>
          )}
          {closeError && (
            <p role="alert" style={{ ...ERROR_TEXT, margin: '0 0 10px', fontSize: 14, lineHeight: 1.5, background: 'var(--danger-50)', borderRadius: RADIUS.xs, padding: '8px 12px' }} data-testid="web-cancel-error">{closeError}</p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {/* "Send", matching the app's CancelSheet CTA - the two settle-up
                buttons carried different verbs for the same action. */}
            {!nothingToSend && (
              <ActionButton onClick={donateAndCancel} disabled={closing} testId="web-cancel-send">Send ${fmtMoney(total)} &amp; close account</ActionButton>
            )}
            <ActionButton tone="danger" filled={nothingToSend} onClick={() => close(false)} disabled={closing} testId="web-cancel-close">{closing ? 'Closing…' : 'Close without donating'}</ActionButton>
            <ActionButton tone="quiet" onClick={onClose}>Never mind  -  keep giving</ActionButton>
          </div>
        </>
      )}
    </Modal>
  );
}
