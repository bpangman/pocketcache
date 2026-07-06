import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { loadKey, saveKey } from '../store/identityStore';
import { findOrgByCode, resolveAdminOrgByEmail } from '../store/orgStore';
import { DEMO_USER, monthsGiving } from '../data/derived';
import { getOrgStats } from '../lib/orgStats';
import { fmtMoneyCompact } from '../lib/format';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import MatchBadge from '../components/MatchBadge';
import { biometricEnrolled, biometricEnroll, biometricDisable, markSessionUnlocked } from '../lib/biometric';

// ─── Web-native My Cause / Share / Settings + shared modals ──────────────────
// True webpage versions of the app's tabs — same store, same account, web
// presentation. Anything the app can do, these can do (see PRELAUNCH parity
// rule). App-only items (Face ID, app icon, text size) are intentionally
// absent — they are device features, noted in the parity audit.

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';
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

function fmt2(n) { return Number(n).toFixed(2); }

// ─── Shared web UI pieces ────────────────────────────────────────────────────

export function Modal({ show, onClose, title, children, width = 460 }) {
  if (!show) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(11,42,74,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', padding: 24 }}
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

function SectionCard({ label, children, style }) {
  return (
    <div style={{ ...CARD, padding: 20, ...style }}>
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

// ─── Admin sign-in (web page) — passwordless work-email code ────────────────
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
    const c = String(Math.floor(100000 + Math.random() * 900000));
    setCode(c);
    setCodeInput(c); // DEMO: auto-filled; live version emails it
    setCodeError(null);
    setSent(true);
  }

  function verify(e) {
    e?.preventDefault?.();
    if (codeInput.trim() !== code) { setCodeError("That code doesn't match — check the email and try again."); return; }
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
            Sign in with your organization&apos;s work email. No password — we email you a fresh 6-digit code each time.
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
                  Demo: we filled the code in for you — the live version emails it.
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

// ─── Give Extra — multi-step: amount → review → done ────────────────────────
const BOOST_PRESETS = [1, 5, 10, 25];

export function GiveExtraModal({ show, onClose }) {
  const { selectedNonprofit, boostDonation } = useApp();
  const [step, setStep] = useState('amount'); // amount | review | done
  const [selected, setSelected] = useState(5);
  const [custom, setCustom] = useState('');
  const [coverProcessing, setCoverProcessing] = useState(true);

  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';
  const amount = custom ? parseFloat(custom) : selected;
  const valid = amount > 0 && !isNaN(amount);
  const processingFee = valid ? parseFloat((amount * 0.022 + 0.30).toFixed(2)) : 0;
  const total = valid ? parseFloat((amount + 1.00 + (coverProcessing ? processingFee : 0)).toFixed(2)) : 0;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setStep('amount'); setSelected(5); setCustom(''); setCoverProcessing(true); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function confirm() {
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
                <span style={{ fontWeight: 700, color: INK.primary }}>${fmt2(amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.muted }}>
                <span>App fee (required)</span><span>$1.00</span>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0 2px', cursor: 'pointer', color: INK.muted, fontSize: 12.5 }}
                onClick={() => setCoverProcessing(v => !v)}>
                <input type="checkbox" readOnly checked={coverProcessing} style={{ marginTop: 2, accentColor: '#059669' }} />
                <span>Cover {npShort}&apos;s card processing (~${fmt2(processingFee)}) — goes to them, counts as part of your gift</span>
              </label>
              <div style={{ height: 1, background: '#e5e7eb', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: INK.primary }}>Total today</span>
                <span style={{ fontWeight: 800, color: NAVY }}>${fmt2(total)}</span>
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
            <p style={{ margin: '6px 0', fontSize: 34, fontWeight: 800, color: NAVY }}>${fmt2(amount)}</p>
            <p style={{ margin: 0, fontSize: 13.5, color: INK.secondary }}>
              to <strong style={{ color: INK.primary }}>{selectedNonprofit?.name ?? npShort}</strong>
            </p>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 12.5, color: INK.secondary, lineHeight: 1.6 }}>
            Total charge today: <strong style={{ color: INK.primary }}>${fmt2(total)}</strong> — your ${fmt2(amount)} gift, the $1 app fee{coverProcessing ? `, and ~$${fmt2(processingFee)} processing cover (goes to ${npShort})` : ''}.
            Charged to your saved payment method. {npShort} sends your receipt. <em>Demo — no real charge is made.</em>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={confirm}>Confirm — give ${fmt2(amount)}</ActionButton>
            <ActionButton tone="quiet" onClick={() => setStep('amount')}>← Go back</ActionButton>
          </div>
        </>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>💚</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: INK.primary }}>Thank you!</p>
          <p style={{ margin: '6px 0 18px', fontSize: 13.5, color: INK.secondary }}>
            Your extra ${fmt2(amount)} is on its way to {npShort}.
          </p>
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      )}
    </Modal>
  );
}

// ─── Monthly cap control (shared: settings + wizard) ────────────────────────
export function CapControl({ value, onChange, subtle = false }) {
  const enabled = value !== null && value !== undefined;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: subtle ? 13 : 13.5, color: subtle ? INK.secondary : INK.primary }}>
            {subtle ? 'Set a monthly maximum (optional)' : 'Monthly Cap'}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: INK.muted, marginTop: 1 }}>
            {enabled ? `Capped at $${value}/month — round-ups above this are simply never charged` : subtle ? 'Cap what a month can ever charge you' : 'No cap set'}
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
    </div>
  );
}

// ─── My Cause (web) ──────────────────────────────────────────────────────────
function impactTier(total) {
  if (total >= 100) return 'About $100 could support roughly a month of after-school programming for one Club member — an example equivalency provided by the nonprofit.';
  if (total >= 60) return 'About $60 might cover approximately 2 weeks of after-school snacks for a Club member — example equivalency.';
  if (total >= 25) return 'About $25 could fund art and sports supplies for a Club session — example equivalency.';
  return 'Every dollar helps fund safe, staffed after-school spaces for young people in their community.';
}

function InvolvementModal({ kind, show, onClose, npShort }) {
  const [fields, setFields] = useState({});
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setFields({}); setSubmitted(false); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  const COPY = {
    volunteer: {
      title: 'Volunteer Opportunities',
      intro: `Express your interest in volunteering with ${npShort}.`,
      done: { emoji: '🙌', head: 'Interest Noted!', body: `${npShort} will reach out about volunteer opportunities near you.` },
      inputs: [{ key: 'interest', placeholder: "Tell us how you'd like to help…", textarea: true, required: true }],
      cta: 'Express Interest',
    },
    suggest: {
      title: 'Suggest a Match Sponsor',
      intro: `Know a company that should be matching round-ups for ${npShort}? Let us know — ${npShort}'s corporate partnerships team will reach out to them.`,
      done: { emoji: '🏢', head: 'Inquiry Sent!', body: `${npShort}'s corporate partnerships team will follow up about sponsoring the monthly match.` },
      inputs: [{ key: 'company', placeholder: "Company you'd like to suggest", required: true }],
      cta: 'Send Suggestion',
    },
    sponsor: {
      title: 'Become a Match Sponsor',
      intro: `Partner with ${npShort} this month. Your company sponsors the monthly round-up match — donors see your logo, you get a community impact report. Flat campaign fee; 100% of your match goes to ${npShort}.`,
      done: { emoji: '🤝', head: 'Application Sent!', body: `${npShort}'s corporate partnerships team will be in touch within 2 business days.` },
      inputs: [
        { key: 'company', placeholder: 'Company name', required: true },
        { key: 'contact', placeholder: 'Contact name', required: true },
        { key: 'email', placeholder: 'Email', required: true, type: 'email' },
        { key: 'budget', placeholder: 'Budget (e.g. $10,000–$50,000)' },
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
          <ActionButton disabled={!requiredOk} onClick={() => setSubmitted(true)}>{COPY.cta}</ActionButton>
        </>
      )}
    </Modal>
  );
}

export function WebMyCause() {
  const { selectedNonprofit, totalDonated } = useApp();
  const [orgStats, setOrgStats] = useState(null);
  const [giveExtra, setGiveExtra] = useState(false);
  const [involve, setInvolve] = useState(null); // 'volunteer' | 'suggest' | 'sponsor'
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
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: INK.secondary }}>{impactTier(totalDonated)}</p>
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
          {match?.active && (
            <div>
              {match.sample && (
                <p style={{ margin: '0 0 6px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>Example partnership — demo</span>
                </p>
              )}
              <MatchBadge match={match} />
            </div>
          )}
          <SectionCard label="Get more involved">
            <div style={{ display: 'grid', gap: 10 }}>
              <ActionButton onClick={() => setGiveExtra(true)}>＋ Give Extra Now</ActionButton>
              <ActionButton tone="quiet" onClick={() => setInvolve('sponsor')}>🏢 Become a Match Sponsor</ActionButton>
              <ActionButton tone="quiet" onClick={() => setInvolve('suggest')}>🏘 Suggest a Match Sponsor</ActionButton>
              <ActionButton tone="quiet" onClick={() => setInvolve('volunteer')}>🙌 Volunteer Opportunities</ActionButton>
            </div>
          </SectionCard>
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
  const shareText = `I give to ${np.name} with every purchase I make — spare change that actually adds up. You should try it too. 💙`;

  function copy(text, setter) {
    navigator.clipboard?.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>Share</h1>
        <p style={{ margin: '3px 0 0', fontSize: 13.5, color: INK.secondary }}>Spread the word — every share grows {np.shortName ?? np.name}&apos;s quiet-giving crowd.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr]" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ ...CARD, border: 'none', overflow: 'hidden' }}>
          <div style={{ padding: 24, color: '#fff', background: brand.gradient ?? `linear-gradient(135deg, ${NAVY}, #0B2A4A)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <CoinMark size={26} />
              <span style={{ fontWeight: 800 }}>{brand.appName}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>I&apos;ve donated</p>
            <p style={{ margin: '4px 0', fontSize: 40, fontWeight: 800 }}>${totalDonated.toFixed(2)}</p>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>to {np.name}</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
              🔥 {monthsGiving}-month giving streak
            </span>
            {np.impact && (
              <p style={{ margin: '14px 0 0', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: 12, opacity: 0.75 }}>{np.impact}</p>
            )}
          </div>
          <div style={{ padding: '12px 20px', background: '#fff', fontSize: 12.5, color: INK.secondary }}>
            Spare change from every purchase — it adds up. 💙
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Message preview">
            <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>{shareText}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: NAVY, wordBreak: 'break-all' }}>{displayUrl}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <ActionButton tone="quiet" onClick={() => copy(`${shareText}\n${shareUrl}`, setCopied)}>{copied ? '✓ Copied' : 'Copy link'}</ActionButton>
              <ActionButton tone="quiet" onClick={() => navigator.share?.({ title: brand.appName, text: shareText, url: shareUrl })}>Share via…</ActionButton>
              <ActionButton tone="quiet" onClick={() => window.open(`mailto:?subject=Join me on ${brand.appName}&body=${encodeURIComponent(shareText + '\n' + shareUrl)}`)}>Email</ActionButton>
            </div>
          </SectionCard>
          <div style={{ ...CARD, border: 'none', padding: 20, background: `linear-gradient(135deg, ${NAVY}, #0B2A4A)`, color: '#fff' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 15 }}>Invite a Friend</p>
            <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
              When someone joins with your link, we waive their first month&apos;s $1 app fee —
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
    trackedCard, setTrackedCard, paymentMethod, setPaymentMethod,
    pendingSettingsAction, clearPendingSettingsAction,
    monthlyCap, setMonthlyCap, skipNextCharge, setSkipNextCharge, hasAccount, feeMonths,
  } = useApp();

  const [prefs, setPrefsState] = useState(loadPrefs);
  function updatePref(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefsState(next);
    saveKey('pc_prefs', next);
  }
  const [commsOptin, setCommsOptinState] = useState(() => loadKey('pc_comms_optin', true));
  function updateCommsOptin(v) { setCommsOptinState(v); saveKey('pc_comms_optin', v); }

  const [modal, setModal] = useState(null); // 'card' | 'payment' | 'switch' | 'privacy' | 'cancel'

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

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>Settings</h1>
        <p style={{ margin: '3px 0 0', fontSize: 13.5, color: INK.secondary }}>
          {hasAccount?.name ?? DEMO_USER.name} · {hasAccount?.email ?? DEMO_USER.email} · Member since {memberSince} · ${totalDonated.toFixed(2)} donated
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard label="Round-up settings">
            <Row
              label="Multiplier" sub="Multiply every round-up for more impact"
              right={
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {[1, 2, 3].map(m => (
                    <button key={m} onClick={() => setRoundUpMultiplier(m)}
                      style={{
                        padding: '6px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                        border: roundUpMultiplier === m ? `2px solid ${NAVY}` : '1.5px solid #e5e7eb',
                        background: roundUpMultiplier === m ? '#eef4fa' : '#fff', color: roundUpMultiplier === m ? NAVY : INK.secondary,
                      }}>
                      {m}×
                    </button>
                  ))}
                </span>
              }
            />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Skip a month"
              sub={skipNextCharge
                ? "Skipping — your round-ups and the $1 fee roll into next month's charge ($1 × 2)"
                : 'Need a breather? Your round-ups roll into next month instead (the $1 fee rolls too)'}
              right={<WebToggle value={skipNextCharge} onChange={setSkipNextCharge} />} />
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
              sub={paymentMethod?.last4 ? `····${paymentMethod.last4} · One monthly charge from ${npShort}` : `One monthly charge from ${npShort}`}
              right={<span style={{ fontSize: 18 }}>{{ ach: '🏦', apple_pay: '🍎', card: '💳' }[paymentMethod?.type] ?? '💳'}</span>} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Change payment method" sub="Bank account, Apple Pay, or card" onPress={() => setModal('payment')}
              right={<span style={{ color: INK.muted }}>›</span>} />
          </SectionCard>

          <SectionCard label="Your cause">
            <Row label={np?.name ?? '—'} sub="Where your round-ups go" />
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
            <Row label="Charge reminder" sub="Your exact amount on the 1st — charge runs the 5th"
              right={<WebToggle value={prefs.chargeReminder} onChange={v => updatePref('chargeReminder', v)} />} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label={`Account emails & ${npShort} updates`} sub="Giving updates from PocketCache and your cause"
              right={<WebToggle value={commsOptin} onChange={updateCommsOptin} />} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Privacy & security" sub="Data, analytics, delete account" onPress={() => setModal('privacy')}
              right={<span style={{ color: INK.muted }}>›</span>} />
          </SectionCard>

          <SectionCard label="Help & support">
            <Row label="Contact support" sub="support@pocketcache.app · we reply within 2 business days"
              onPress={() => window.open('mailto:support@pocketcache.app')} right={<span style={{ color: INK.muted }}>↗</span>} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Terms of Service" onPress={() => window.open('/legal/terms/', '_blank')} right={<span style={{ color: INK.muted }}>↗</span>} />
            <div style={{ height: 1, background: '#f1f5f9' }} />
            <Row label="Privacy Policy" onPress={() => window.open('/legal/privacy/', '_blank')} right={<span style={{ color: INK.muted }}>↗</span>} />
          </SectionCard>

          <SectionCard label="Subscription">
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: INK.muted, lineHeight: 1.6 }}>
              Cancelling never costs anything — you choose whether this month&apos;s round-ups become a final donation or are simply never charged.
            </p>
            <ActionButton tone="danger" onClick={() => setModal('cancel')}>Cancel my giving subscription</ActionButton>
          </SectionCard>
        </div>
      </div>

      {/* ── Modals ── */}
      <TrackCardModal show={modal === 'card'} onClose={() => setModal(null)} current={trackedCard} onConnected={setTrackedCard} />
      <ChangePaymentModal show={modal === 'payment'} onClose={() => setModal(null)} onChanged={setPaymentMethod} />
      <SwitchOrgModal show={modal === 'switch'} onClose={() => setModal(null)} onBind={setSelectedNonprofit} />
      <PrivacyModal show={modal === 'privacy'} onClose={() => setModal(null)}
        prefs={prefs} updatePref={updatePref} adminOrgName={adminRole ? npShort : null} onDeleteAccount={deleteAccount} />
      <CancelModal show={modal === 'cancel'} onClose={() => setModal(null)}
        pendingRoundUps={pendingRoundUps} feeMonths={feeMonths} nonprofit={np}
        onDonate={boostDonation} onCancelled={cancelAccount} />
    </>
  );
}

// ─── Settings modals ─────────────────────────────────────────────────────────
function TrackCardModal({ show, onClose, current, onConnected }) {
  const [connecting, setConnecting] = useState(null);
  const [connected, setConnected] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setConnecting(null); setConnected(null); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function pick(bank) {
    setConnecting(bank.id);
    setTimeout(() => {
      const card = { name: bank.name, last4: String(Math.floor(1000 + Math.random() * 9000)), brand: bank.name, institution: bank.name };
      setConnecting(null);
      setConnected(card);
      onConnected(card);
    }, 1100);
  }

  return (
    <Modal show={show} onClose={onClose} title="Track a Different Card">
      {connected ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary }}>{connected.name} connected</p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: INK.secondary }}>Now watching ····{connected.last4} for round-ups.</p>
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: INK.secondary }}>
            Currently watching <strong>{current?.name ?? 'Chase Sapphire'} ····{current?.last4 ?? '4242'}</strong>. Pick a new card issuer — read-only via Plaid.
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
          </div>
        </>
      )}
    </Modal>
  );
}

function ChangePaymentModal({ show, onClose, onChanged }) {
  const [saving, setSaving] = useState(null);
  const [done, setDone] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setSaving(null); setDone(null); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function pick(opt) {
    setSaving(opt.id);
    setTimeout(() => {
      const method = { type: opt.id, label: opt.label, last4: opt.id === 'card' ? String(Math.floor(1000 + Math.random() * 9000)) : null };
      onChanged(method);
      setSaving(null);
      setDone(method);
    }, 900);
  }

  return (
    <Modal show={show} onClose={onClose} title="Change Payment Method">
      {done ? (
        <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary }}>{done.label} saved</p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: INK.secondary }}>Your next monthly charge uses this method. Secured by Stripe.</p>
          <ActionButton tone="quiet" onClick={onClose}>Done</ActionButton>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: INK.secondary }}>Payments are processed by Stripe — PocketCache never sees your details.</p>
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
        Your history stays with you — future round-ups go to the new cause.
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

function PrivacyModal({ show, onClose, prefs, updatePref, adminOrgName, onDeleteAccount }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Face ID / Touch ID unlock — real WebAuthn enrollment, shared with the app
  const [bioEnrolled, setBioEnrolled] = useState(biometricEnrolled);
  async function toggleBio(v) {
    if (v) {
      const ok = await biometricEnroll({ name: DEMO_USER.name, email: DEMO_USER.email });
      if (ok) { markSessionUnlocked(); setBioEnrolled(true); }
    } else {
      biometricDisable();
      setBioEnrolled(false);
    }
  }
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setConfirmDelete(false), 0);
    return () => clearTimeout(id);
  }, [show]);

  function downloadData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('pc_')) { try { data[k] = JSON.parse(localStorage.getItem(k)); } catch { data[k] = localStorage.getItem(k); } }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pocketcache-my-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
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
      <Row label="Download my data" sub="JSON export of everything stored for this account" onPress={downloadData}
        right={<span style={{ color: INK.muted }}>⬇</span>} />
      <div style={{ height: 1, background: '#f1f5f9', marginBottom: 12 }} />
      {confirmDelete ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 14 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#991b1b', lineHeight: 1.55 }}>
            This permanently removes your giving account and data{adminOrgName ? ` — your admin account for ${adminOrgName} is untouched` : ''}. This can&apos;t be undone.
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

function CancelModal({ show, onClose, pendingRoundUps, feeMonths, nonprofit, onDonate, onCancelled }) {
  const [coverProcessing, setCoverProcessing] = useState(true);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setResult(null); setCoverProcessing(true); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  const raw = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  const processingCover = parseFloat((raw * 0.022 + 0.30).toFixed(2));
  const total = (feeMonths + raw + (coverProcessing ? processingCover : 0)).toFixed(2);
  const belowMin = raw < (nonprofit?.monthlyMinimum ?? 5);
  const npShort = nonprofit?.shortName ?? 'your cause';

  function donateAndCancel() {
    onDonate(raw);
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
              : "This month's round-ups won't be charged — as if the month never happened."}
          </p>
          <ActionButton tone="quiet" onClick={() => { onClose(); onCancelled(); }}>Done</ActionButton>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: INK.secondary, lineHeight: 1.6 }}>
            You&apos;ve rounded up <strong style={{ color: INK.primary }}>${raw.toFixed(2)}</strong> for {npShort} this month.
            Would you like to make this month&apos;s donation before cancelling?
          </p>
          <div style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5', borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ color: INK.secondary }}>Round-ups</span><span style={{ fontWeight: 700, color: INK.primary }}>${raw.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.muted }}>
              <span>App fee — $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''}</span><span>+${feeMonths.toFixed(2)}</span>
            </div>
            {coverProcessing && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: INK.muted }}>
                <span>Processing cover</span><span>+${processingCover.toFixed(2)}</span>
              </div>
            )}
            <div style={{ height: 1, background: '#cbd5e1', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: INK.primary }}>Total</span><span style={{ fontWeight: 800, color: NAVY }}>${total}</span>
            </div>
          </div>
          {belowMin && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#92400e', background: '#fffbeb', borderRadius: 10, padding: '8px 12px', lineHeight: 1.55 }}>
              Note: ${raw.toFixed(2)} is below the ${nonprofit?.monthlyMinimum ?? 5} minimum — in a live account this would roll over rather than charge. Cancelling now forfeits this amount.
            </p>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: INK.secondary, marginBottom: 14, cursor: 'pointer' }}
            onClick={() => setCoverProcessing(v => !v)}>
            <input type="checkbox" readOnly checked={coverProcessing} style={{ marginTop: 2, accentColor: '#059669' }} />
            <span>Cover {npShort}&apos;s card-processing costs (~${processingCover.toFixed(2)}) so 100% of my round-ups reach them</span>
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            <ActionButton onClick={donateAndCancel}>Donate ${total} &amp; cancel</ActionButton>
            <ActionButton tone="danger" onClick={() => setResult('cancelled')}>Cancel without donating</ActionButton>
            <ActionButton tone="quiet" onClick={onClose}>Never mind — keep giving</ActionButton>
          </div>
        </>
      )}
    </Modal>
  );
}
