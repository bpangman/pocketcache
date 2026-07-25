import { useEffect, useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ShieldCheck, Mail, Landmark, Search } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../../store/AppContext';
import CoinMark from '../../components/CoinMark';
import AppDownloadQRModal from '../../components/AppDownloadQRModal';
import {
  useNpSignup, useNpGoLive,
  NP_BRAND_COLORS, NP_LICENSE_POINTS,
  widgetSnippet, joinQrValue, launchKitMailto,
} from '../../lib/npSignup';
import { nextChargeLabel } from '../../lib/billing';

// ─── The browser-native nonprofit signup wizard ──────────────────────────────
// The admin counterpart to WebOnboarding: a real desktop webpage, not a phone
// column. Top nav, a horizontal step indicator, and multi-column steps that use
// the width for something real  -  the EIN lookup result sits BESIDE the form,
// the branding controls sit beside a live preview of the donor page, and the
// license is a scrollable pane with the accept control always visible.
//
// This file owns ZERO business logic. Step sequencing, the real ProPublica EIN
// lookup and its BGCA fallback, the demo one-time-code flow, the simulated
// Stripe connect, the join-code rules and the org record written at go-live all
// come from src/lib/npSignup.js, which the phone wizard
// (Onboarding.jsx → NonprofitSignupFlow) consumes too. If something here needs
// to change behavior, change it there and both surfaces move together.
//
// Design language deliberately matches WebOnboarding.jsx / NpWebShell.jsx: same
// INK scale, same NAVY, same CARD, same 62px nav, same footer, inline styles.

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';
const TEAL = '#0D9488';
const MAX_W = 1180;
const CARD = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 2px rgba(11,42,74,0.04)',
};
const PANEL = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid #e5e7eb',
  boxShadow: '0 16px 48px rgba(11,42,74,0.08), 0 2px 8px rgba(11,42,74,0.05)',
};

// The indicator collapses `ein` + `confirm-org` into one milestone, because on
// desktop they are one screen: the form on the left, the result on the right.
const STEP_BAR = [
  { key: 'verify',  label: 'Verify nonprofit', steps: ['ein', 'confirm-org'] },
  { key: 'email',   label: 'Work email',       steps: ['verify-email'] },
  { key: 'stripe',  label: 'Stripe',           steps: ['stripe'] },
  { key: 'brand',   label: 'Your page',        steps: ['branding'] },
  { key: 'license', label: 'License',          steps: ['license'] },
  { key: 'live',    label: 'Go live',          steps: ['live'] },
];

const NEEDS = [
  { icon: Landmark,    title: 'Your EIN',                     body: 'Checked against the IRS exempt-organization list, so only a real 501(c)(3) can go live.' },
  { icon: Mail,        title: 'A work email at your domain',  body: 'It becomes the account that approves every later change.' },
  { icon: ShieldCheck, title: 'A Stripe account',             body: 'Donations pay out to your Stripe directly. PocketCache never holds your money.' },
];

// ─── Small desktop primitives (real hover states, content-sized buttons) ─────

function Button({ children, onClick, type = 'button', tone = 'primary', disabled = false, style }) {
  const [hover, setHover] = useState(false);
  const tones = {
    primary: {
      background: hover ? `linear-gradient(135deg, #024d86, ${NAVY})` : `linear-gradient(135deg, ${NAVY}, #001a33)`,
      color: '#fff', border: '1px solid transparent',
      boxShadow: hover ? '0 6px 18px rgba(0,56,101,0.28)' : '0 1px 2px rgba(0,56,101,0.18)',
    },
    teal: {
      background: hover ? `linear-gradient(135deg, #0fb3a4, ${TEAL})` : `linear-gradient(135deg, ${TEAL}, #0f766e)`,
      color: '#fff', border: '1px solid transparent',
      boxShadow: hover ? '0 6px 18px rgba(13,148,136,0.28)' : '0 1px 2px rgba(13,148,136,0.18)',
    },
    stripe: {
      background: hover ? '#7a73ff' : '#635bff',
      color: '#fff', border: '1px solid transparent',
      boxShadow: hover ? '0 6px 18px rgba(99,91,255,0.32)' : '0 1px 2px rgba(99,91,255,0.2)',
    },
    quiet: {
      background: hover ? '#e8eef5' : '#f1f5f9',
      color: INK.primary, border: '1px solid #e2e8f0', boxShadow: 'none',
    },
    ghost: {
      background: hover ? '#f1f5f9' : 'transparent',
      color: INK.secondary, border: '1px solid transparent', boxShadow: 'none',
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer', transition: 'background 0.15s, box-shadow 0.15s',
        ...(disabled
          ? { background: '#e2e8f0', color: '#94a3b8', border: '1px solid transparent', boxShadow: 'none' }
          : tones[tone]),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Same look as Button, but a real link  -  used for the mailto launch kit. */
function LinkButton({ href, children }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
        background: hover ? '#e8eef5' : '#f1f5f9', color: INK.primary, border: '1px solid #e2e8f0',
        transition: 'background 0.15s',
      }}
    >
      {children}
    </a>
  );
}

function Pane({ title, hint, children, style }) {
  return (
    <section style={{ ...PANEL, padding: 26, minWidth: 0, ...style }}>
      {title && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>{title}</h2>
          {hint && <p style={{ margin: '5px 0 0', fontSize: 13.5, lineHeight: 1.55, color: INK.secondary }}>{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Side({ label, children, style }) {
  return (
    <aside style={{ ...CARD, padding: 20, minWidth: 0, ...style }}>
      {label && (
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
          {label}
        </p>
      )}
      {children}
    </aside>
  );
}

function Label({ children }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted, marginBottom: 6 }}>
      {children}
    </label>
  );
}

const inputStyle = (error, extra) => ({
  width: '100%', padding: '11px 14px', borderRadius: 12, fontSize: 14, color: INK.primary,
  background: '#f9fafb', outline: 'none',
  border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
  ...extra,
});

function Hint({ children, tone = 'muted' }) {
  const colors = { muted: INK.muted, error: '#ef4444', warn: '#b45309' };
  return <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: colors[tone] }}>{children}</p>;
}

function DemoNote({ children }) {
  return (
    <div style={{ background: '#FFFBEB', border: '1px solid #FBBF24', borderRadius: 12, padding: '11px 14px' }}>
      {children}
    </div>
  );
}

function StepBar({ step }) {
  const activeIdx = STEP_BAR.findIndex(s => s.steps.includes(step));
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
      {STEP_BAR.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <li key={s.key} style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 2px' }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11.5, fontWeight: 800,
                background: done ? TEAL : active ? NAVY : '#e2e8f0',
                color: done || active ? '#fff' : INK.muted,
              }}>
                {done ? '✓' : i + 1}
              </span>
              <span style={{
                fontSize: 13, whiteSpace: 'nowrap',
                fontWeight: active ? 700 : 500,
                color: active ? INK.primary : done ? INK.secondary : INK.muted,
              }}>
                {s.label}
              </span>
            </span>
            {i < STEP_BAR.length - 1 && (
              <span style={{ width: 34, height: 2, margin: '0 10px', borderRadius: 2, background: done ? TEAL : '#e2e8f0', flexShrink: 0 }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Branding step: a live preview of what a donor lands on ──────────────────

function DonorPagePreview({ orgName, joinCode, story, color, logoPreview, monthlyMinimum }) {
  return (
    <div style={{ ...CARD, overflow: 'hidden', padding: 0 }}>
      <div style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`, padding: '22px 22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoPreview
              ? <img src={logoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5, display: 'block' }} />
              : <CoinMark size={28} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {orgName || 'Your Nonprofit'}
            </p>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.8)', fontSize: 11.5 }}>Round-Up giving  -  powered by PocketCache</p>
          </div>
        </div>
        <p style={{ margin: '16px 0 0', color: 'rgba(255,255,255,0.92)', fontSize: 12.5, lineHeight: 1.55 }}>
          {story || 'Your mission appears here, in your words, on every page a donor sees.'}
        </p>
      </div>
      <div style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>Donor join code</p>
        <p style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '0.06em', color }}>{joinCode || 'CODE'}</p>
        <p style={{ margin: '2px 0 14px', fontSize: 12.5, color: INK.secondary, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
          pocketcache.app/{(joinCode || 'code').toLowerCase()}
        </p>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CoinMark size={26} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK.primary }}>Round up for {joinCode || 'us'}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: INK.muted }}>Spare change from every purchase. ${monthlyMinimum} monthly minimum.</p>
          </div>
          <span style={{ background: color, color: '#fff', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Join</span>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: INK.muted }}>
          This is the website widget donors see on your own site, too.
        </p>
      </div>
    </div>
  );
}

// ─── The wizard ───────────────────────────────────────────────────────────────

export default function NpWebSignup({ onExit }) {
  const { initialOnboardingStep, clearInitialOnboardingStep } = useApp();
  const w = useNpSignup({ onExit });
  const goLive = useNpGoLive();
  const [showAppModal, setShowAppModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    step, ein, setEin, einError, verifying, einDemoMode,
    orgName, setOrgName, orgAddress, org501c3,
    adminEmail, workEmail, setWorkEmail, emailError,
    codeSent, codeInput, setCodeInput, codeError, demoBypassNote, requiredDomain,
    stripeConnecting, stripeConnected,
    story, setStory, color, setColor, monthlyMinimum, setMonthlyMinimum,
    logoPreview, logoUrlInput, setLogoUrlInput, logoUrlError,
    joinCode, joinCodeError, accepted, setAccepted, showLicenseHint,
    config,
  } = w;

  const showBack = step !== 'live' && (step !== 'ein' || Boolean(onExit));

  // The jump signal that routed us here (App.jsx latches it) is consumed here on
  // desktop, because Onboarding  -  which normally clears it  -  never mounts.
  // Left set, it would re-route a later visit to 'onboarding' back into setup.
  useEffect(() => {
    if (initialOnboardingStep) clearInitialOnboardingStep();
  }, [initialOnboardingStep, clearInitialOnboardingStep]);

  function handleAccept(e) {
    if (w.acceptLicense(e)) setShowAppModal(true);
  }

  function copySnippet() {
    const text = widgetSnippet(orgName, joinCode);
    navigator.clipboard?.writeText?.(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top nav ── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: MAX_W, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <CoinMark size={30} />
            <div style={{ lineHeight: 1.15, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary }}>PocketCache for nonprofits</p>
              <p style={{ margin: 0, fontSize: 10.5, color: INK.muted }}>Set up your round-up program</p>
            </div>
          </div>
          <a href="mailto:support@pocketcache.app" style={{ fontSize: 13, fontWeight: 600, color: NAVY, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Talk to us instead →
          </a>
        </div>
      </header>

      {/* ── Step indicator ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: MAX_W, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <StepBar step={step} />
          {showBack && (
            <Button tone="ghost" onClick={w.back} style={{ padding: '7px 12px', fontSize: 13 }}>
              {step === 'ein' ? 'Leave setup' : '← Back'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <main style={{ flex: 1, width: '100%', maxWidth: MAX_W, margin: '0 auto', padding: '30px 24px 44px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step === 'confirm-org' ? 'ein' : step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            {/* ═══ Verify the nonprofit: form left, lookup result right ═══ */}
            {(step === 'ein' || step === 'confirm-org') && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 26, alignItems: 'start' }}>
                <Pane
                  title="List your nonprofit on PocketCache"
                  hint="Your supporters round up their everyday purchases and the spare change lands in your Stripe account once a month. Setup is self-serve and takes about ten minutes."
                >
                  <form onSubmit={w.verifyEIN}>
                    <Label>Your EIN</Label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        placeholder="XX-XXXXXXX"
                        value={ein}
                        onChange={e => setEin(e.target.value)}
                        disabled={step === 'confirm-org'}
                        style={inputStyle(einError, { width: 190, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em' })}
                      />
                      <Button type="submit" disabled={verifying || step === 'confirm-org'}>
                        {verifying ? 'Verifying…' : <>Verify EIN <Search size={15} /></>}
                      </Button>
                    </div>
                    {einError && <Hint tone="error">{einError}</Hint>}
                    <Hint>Format: XX-XXXXXXX (9 digits). We only use it to confirm your 501(c)(3) status  -  it is checked against public IRS records from ProPublica.</Hint>
                  </form>

                  <div style={{ height: 1, background: '#f1f5f9', margin: '22px 0 18px' }} />

                  <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
                    What you&apos;ll need
                  </p>
                  <div style={{ display: 'grid', gap: 14 }}>
                    {NEEDS.map(need => {
                      const NeedIcon = need.icon;
                      return (
                        <div key={need.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eef4fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <NeedIcon size={17} style={{ color: NAVY }} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: INK.primary }}>{need.title}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.5, color: INK.secondary }}>{need.body}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 20, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '13px 15px' }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#166534' }}>$0 for your organization, always</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#15803d' }}>
                      Donors cover the flat $1 monthly app fee, and most also cover card processing. PocketCache never takes a percentage of a donation.
                    </p>
                  </div>
                </Pane>

                {/* Lookup result  -  beside the form, not after it */}
                <Side label="IRS lookup" style={{ position: 'sticky', top: 24 }}>
                  {step !== 'confirm-org' && !verifying && (
                    <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                      <div style={{ width: 46, height: 46, borderRadius: 12, background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <Landmark size={22} color="#94a3b8" />
                      </div>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: INK.primary }}>Nothing looked up yet</p>
                      <p style={{ margin: '5px auto 0', fontSize: 12.5, lineHeight: 1.55, color: INK.secondary, maxWidth: 300 }}>
                        Enter your EIN and we&apos;ll show your organization&apos;s legal name, city, and exemption status right here before anything is created.
                      </p>
                    </div>
                  )}
                  {verifying && (
                    <div style={{ textAlign: 'center', padding: '34px 10px' }}>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: NAVY, margin: '0 auto 12px' }}
                      />
                      <p style={{ margin: 0, fontSize: 13.5, color: INK.secondary }}>Checking IRS records…</p>
                    </div>
                  )}
                  {step === 'confirm-org' && !verifying && (
                    <div>
                      <p style={{ margin: 0, fontSize: 12.5, color: INK.secondary }}>We found a match. Is this your organization?</p>
                      <div style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#f9fafb' }}>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK.primary, lineHeight: 1.3 }}>{orgName}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 13, color: INK.secondary }}>{orgAddress}</p>
                        <p style={{ margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#15803d' }}>
                          <CheckCircle size={15} color="#22c55e" />
                          {org501c3 ? '501(c)(3) Verified' : 'Organization found'} · EIN {ein}
                        </p>
                        {einDemoMode && (
                          <p style={{ margin: '10px 0 0', fontSize: 12, fontStyle: 'italic', color: '#b45309' }}>
                            Demo data  -  live verification uses IRS public records.
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                        <Button onClick={w.confirmOrg}>Confirm  -  this is us →</Button>
                        <Button tone="quiet" onClick={w.reenterEIN}>No, re-enter EIN</Button>
                      </div>
                    </div>
                  )}
                </Side>
              </div>
            )}

            {/* ═══ Work email + DEMO one-time code ═══ */}
            {step === 'verify-email' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 26, alignItems: 'start' }}>
                <Pane
                  title="Verify your work email"
                  hint={`An email on ${orgName || 'your organization'}'s own domain proves you can act for the organization. It becomes your admin sign-in.`}
                >
                  {!codeSent ? (
                    <form onSubmit={w.sendCode}>
                      <Label>Your work email</Label>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <input
                          autoFocus
                          type="email"
                          required
                          value={workEmail}
                          onChange={e => setWorkEmail(e.target.value)}
                          placeholder={requiredDomain ? `you@${requiredDomain}` : 'you@yourorg.org'}
                          style={inputStyle(emailError, { flex: 1, minWidth: 240 })}
                        />
                        <Button type="submit" disabled={!workEmail}>Email me a code →</Button>
                      </div>
                      {emailError && <Hint tone="error">{emailError}</Hint>}
                      <Hint>
                        Personal addresses (Gmail, Yahoo, iCloud…) can&apos;t manage a nonprofit. No password is ever
                        created  -  admin sign-in works by emailed code, so there&apos;s nothing for anyone to steal.
                      </Hint>
                    </form>
                  ) : (
                    <form onSubmit={w.verifyCode}>
                      <p style={{ margin: '0 0 14px', fontSize: 13.5, color: INK.secondary }}>
                        We sent a 6-digit code to <strong style={{ color: INK.primary }}>{workEmail}</strong>. Enter it to continue.
                      </p>
                      <Label>Verification code</Label>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <input
                          autoFocus
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={codeInput}
                          onChange={e => setCodeInput(e.target.value)}
                          style={inputStyle(codeError, { width: 190, fontFamily: 'ui-monospace, monospace', textAlign: 'center', fontSize: 20, letterSpacing: '0.4em' })}
                        />
                        <Button type="submit" disabled={codeInput.length !== 6}>Verify &amp; continue →</Button>
                      </div>
                      {codeError && <Hint tone="error">{codeError}</Hint>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <Button tone="quiet" onClick={w.sendCode} style={{ padding: '8px 14px', fontSize: 13 }}>Resend code</Button>
                        <Button tone="quiet" onClick={w.changeEmail} style={{ padding: '8px 14px', fontSize: 13 }}>Change email</Button>
                      </div>
                    </form>
                  )}
                </Pane>

                <div style={{ display: 'grid', gap: 16 }}>
                  {codeSent && (
                    <DemoNote>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>
                        Demo: we filled the code in for you  -  the live version emails it to {workEmail}.
                      </p>
                      {demoBypassNote && (
                        <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#92400e' }}>
                          Also demo-only: this email was accepted, but {demoBypassNote}.
                        </p>
                      )}
                    </DemoNote>
                  )}
                  <Side label="Why we ask">
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: INK.secondary }}>
                      This address is the only credential your PocketCache admin account has. Every future sign-in
                      emails a fresh one-time code to it, and every change to your page  -  join code, brand, payout
                      account  -  is approved from it.
                    </p>
                    <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.6, color: INK.secondary }}>
                      Use a shared address your team controls (like info@ or giving@) if you want more than one person
                      to be able to sign in.
                    </p>
                  </Side>
                </div>
              </div>
            )}

            {/* ═══ Stripe (DEMO connect) ═══ */}
            {step === 'stripe' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 26, alignItems: 'start' }}>
                <Pane
                  title="Connect Stripe"
                  hint="Donations charge directly on your Stripe account  -  you are the merchant of record the whole time."
                >
                  {stripeConnected ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 14, padding: 16 }}>
                      <CheckCircle size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#166534' }}>Stripe connected</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#15803d' }}>
                          You are the merchant of record for all donations. Payouts follow your existing Stripe schedule.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Button tone="stripe" onClick={w.connectStripe} disabled={stripeConnecting}>
                      {stripeConnecting ? 'Connecting…' : 'Connect with Stripe'}
                    </Button>
                  )}
                  {stripeConnected && (
                    <div style={{ marginTop: 18 }}>
                      <Button onClick={w.stripeNext}>Continue →</Button>
                    </div>
                  )}
                  <Hint>PocketCache never touches the money  -  it goes straight from donors into your Stripe account.</Hint>
                </Pane>
                <Side label="What connecting does">
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: INK.secondary }}>
                    Your Stripe account becomes the destination for every donor charge. Donors see your name on their
                    statement, not PocketCache, and you issue their tax receipts.
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.6, color: INK.secondary }}>
                    Donor charges run on the <strong style={{ color: INK.primary }}>{nextChargeLabel()}</strong> of each month,
                    after a 10-day review window in which donors can adjust or skip.
                  </p>
                  <p style={{ margin: '12px 0 0', fontSize: 12, fontStyle: 'italic', color: '#b45309' }}>
                    Demo: this connect button is simulated  -  no Stripe account is contacted.
                  </p>
                </Side>
              </div>
            )}

            {/* ═══ Branding: controls left, live desktop preview right ═══ */}
            {step === 'branding' && (
              <form onSubmit={w.submitBranding}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 26, alignItems: 'start' }}>
                  <Pane title="Customize your page" hint="This is what donors see when they scan your code or open your link. Everything here is editable later in your dashboard.">
                    <div style={{ display: 'grid', gap: 18 }}>
                      <div>
                        <Label>Organization name</Label>
                        <input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)} style={inputStyle(false)} />
                      </div>

                      <div>
                        <Label>Your donor join code</Label>
                        <input
                          type="text"
                          value={joinCode}
                          onChange={e => w.changeJoinCode(e.target.value)}
                          style={inputStyle(joinCodeError, { width: 220, fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 })}
                        />
                        {joinCodeError && <Hint tone="error">{joinCodeError}</Hint>}
                        <Hint>
                          Letters, numbers, dashes (2-8)  -  short enough to say out loud. This becomes your link
                          (pocketcache.app/{joinCode || 'CODE'}), your QR code, and your website widget.
                        </Hint>
                      </div>

                      <div>
                        <Label>Admin contact email</Label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb' }}>
                          <CheckCircle size={15} color="#22c55e" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 13.5, color: INK.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminEmail}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#15803d', flexShrink: 0 }}>Verified</span>
                        </div>
                        <Hint>Verified in the previous step  -  this is your admin sign-in.</Hint>
                      </div>

                      <div>
                        <Label>Your mission (shown to donors)</Label>
                        <textarea
                          value={story}
                          onChange={e => setStory(e.target.value)}
                          rows={4}
                          maxLength={600}
                          placeholder="Tell donors what you do…"
                          style={inputStyle(false, { resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' })}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <Hint>Keep it concise  -  this shows on your public donor page.</Hint>
                          <Hint>{story.length}/600</Hint>
                        </div>
                      </div>

                      <div>
                        <Label>Brand color</Label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {NP_BRAND_COLORS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setColor(c)}
                              aria-label={`Brand color ${c}`}
                              style={{
                                width: 34, height: 34, borderRadius: 10, cursor: 'pointer', background: c,
                                border: `2px solid ${color === c ? '#111827' : 'transparent'}`,
                                boxShadow: color === c ? '0 0 0 2px #fff inset' : 'none',
                              }}
                            />
                          ))}
                          <label
                            style={{
                              width: 34, height: 34, borderRadius: 10, cursor: 'pointer', background: color,
                              border: `2px solid ${!NP_BRAND_COLORS.includes(color) ? '#111827' : 'transparent'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
                            }}
                          >
                            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                            <span style={{ color: '#fff', fontSize: 15, fontWeight: 800, textShadow: '0 0 3px rgba(0,0,0,0.5)' }}>+</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <Label>Logo</Label>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <label
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12,
                              border: '2px dashed #99f6e4', color: '#0f766e', background: '#f0fdfa',
                              fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            Upload image
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => w.setLogoFile(e.target.files?.[0])}
                            />
                          </label>
                          <input
                            type="url"
                            placeholder="or paste a logo URL"
                            value={logoUrlInput}
                            onChange={e => setLogoUrlInput(e.target.value)}
                            onBlur={e => w.applyLogoUrl(e.target.value)}
                            style={inputStyle(logoUrlError, { flex: 1, minWidth: 220 })}
                          />
                        </div>
                        {logoUrlError && <Hint tone="error">{logoUrlError}</Hint>}
                        <Hint>Skip this and a default coin mark is used. The preview beside this form updates as you go.</Hint>
                      </div>

                      <div>
                        <Label>Monthly minimum  -  ${monthlyMinimum}</Label>
                        <input
                          type="range"
                          min={5}
                          max={50}
                          step={5}
                          value={monthlyMinimum}
                          onChange={e => setMonthlyMinimum(Number(e.target.value))}
                          style={{ width: 320, maxWidth: '100%', accentColor: TEAL }}
                        />
                        <Hint>Donors below this in a month roll over to the next month. Default $5.</Hint>
                      </div>

                      <div>
                        <Button type="submit">Continue →</Button>
                      </div>
                    </div>
                  </Pane>

                  <div style={{ position: 'sticky', top: 24, display: 'grid', gap: 12, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
                      Live preview  -  what donors see
                    </p>
                    <DonorPagePreview
                      orgName={orgName}
                      joinCode={joinCode}
                      story={story}
                      color={color}
                      logoPreview={logoPreview}
                      monthlyMinimum={monthlyMinimum}
                    />
                  </div>
                </div>
              </form>
            )}

            {/* ═══ License: scrollable pane, accept control always visible ═══ */}
            {step === 'license' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 26, alignItems: 'start' }}>
                <Pane title="Nonprofit Software License Agreement" hint="Always free for your nonprofit. Never a percentage of donations.">
                  <div
                    style={{
                      maxHeight: 360, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 14,
                      padding: 18, background: '#f9fafb', display: 'grid', gap: 12,
                    }}
                  >
                    {NP_LICENSE_POINTS.map(([heading, body]) => (
                      <p key={heading} style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: INK.secondary }}>
                        <strong style={{ color: INK.primary }}>{heading}</strong> {body}
                      </p>
                    ))}
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: INK.secondary }}>
                      <strong style={{ color: INK.primary }}>Donor relationship.</strong> Donors are your donors. PocketCache
                      is the software that collects their round-ups on your behalf, and it never contacts them about
                      anything other than their own account.
                    </p>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: INK.secondary }}>
                      <strong style={{ color: INK.primary }}>Ending it.</strong> You can turn your program off at any time
                      from your dashboard. Round-ups already collected still settle to you.
                    </p>
                  </div>
                  <a
                    href="/legal/nonprofit-license/"
                    target="_blank"
                    rel="noopener"
                    style={{ display: 'inline-block', marginTop: 14, fontSize: 13.5, fontWeight: 700, color: NAVY }}
                  >
                    Read the full license →
                  </a>
                </Pane>

                <Side label="Accept and go live" style={{ position: 'sticky', top: 24 }}>
                  <form onSubmit={handleAccept}>
                    <label
                      onClick={e => { if (e.target.tagName !== 'A') setAccepted(!accepted); }}
                      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
                    >
                      <span style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${accepted ? '#059669' : '#d1d5db'}`, background: accepted ? '#059669' : '#fff',
                      }}>
                        {accepted && <CheckCircle size={12} color="#fff" />}
                      </span>
                      <span style={{ fontSize: 12.5, lineHeight: 1.6, color: INK.secondary }}>
                        I accept the Nonprofit Software License Agreement on behalf of this organization.
                      </span>
                    </label>
                    {showLicenseHint && !accepted && (
                      <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: '#b45309' }}>
                        Please accept the license to continue
                      </p>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <Button type="submit" tone="teal" disabled={!accepted}>Accept &amp; go live →</Button>
                    </div>
                    <p style={{ margin: '14px 0 0', fontSize: 12, lineHeight: 1.55, color: INK.muted }}>
                      Signing for {orgName || 'your organization'} as {adminEmail || 'the verified admin'}.
                    </p>
                  </form>
                </Side>
              </div>
            )}

            {/* ═══ You're live ═══ */}
            {step === 'live' && (
              <div style={{ display: 'grid', gap: 22 }}>
                <div style={{ ...PANEL, padding: 26, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 24, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#15803d' }}>
                      You&apos;re live 🎉
                    </p>
                    <h2 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.4px', color: INK.primary }}>
                      {orgName} is on PocketCache
                    </h2>
                    <p style={{ margin: '6px 0 0', fontSize: 13.5, color: INK.secondary, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                      pocketcache.app/{joinCode.toLowerCase()}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <LinkButton href={launchKitMailto(orgName, joinCode)}>
                      📧 Send the launch kit
                    </LinkButton>
                    <Button tone="teal" onClick={() => goLive(config)}>Open your dashboard →</Button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr)', gap: 20, alignItems: 'start' }}>
                  <Side label="Your donor join code">
                    <p style={{ margin: 0, fontSize: 42, fontWeight: 900, letterSpacing: '0.06em', color: '#065f46', lineHeight: 1.1 }}>{joinCode}</p>
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.55, color: INK.secondary }}>
                      Donors enter this in the PocketCache app, or open your link, to join your program.
                    </p>
                  </Side>

                  <Side label="QR code">
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, display: 'inline-block' }}>
                      <QRCodeSVG value={joinQrValue(joinCode)} size={112} level="M" includeMargin />
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.55, color: INK.secondary }}>
                      Posters, newsletters, event tables. Also on your dashboard&apos;s Grow tab.
                    </p>
                  </Side>

                  <Side label="Website widget">
                    <div style={{ background: '#0f172a', borderRadius: 12, padding: 12, overflowX: 'auto' }}>
                      <code style={{ fontSize: 11.5, color: '#4ade80', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {widgetSnippet(orgName, joinCode)}
                      </code>
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button tone="quiet" onClick={copySnippet} style={{ padding: '8px 14px', fontSize: 13 }}>
                        {copied ? 'Copied ✓' : 'Copy snippet'}
                      </Button>
                      <span style={{ fontSize: 12, color: INK.muted }}>Paste where the &ldquo;Round up for us&rdquo; card should appear.</span>
                    </div>
                  </Side>
                </div>

                <DemoNote>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: '#92400e' }}>
                    Your launch kit is emailed to {adminEmail || 'your verified admin address'} automatically the moment
                    you go live (demo: shown on this page instead). Use &ldquo;Send the launch kit&rdquo; to forward a copy
                    to a colleague  -  just add their address.
                  </p>
                </DemoNote>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer style={{ padding: '0 24px 26px', textAlign: 'center' }}>
        <p style={{ color: INK.muted, fontSize: 12, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/nonprofit-license/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Nonprofit License</a>{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>{' '}
          <a href="mailto:support@pocketcache.app" style={{ color: INK.secondary }}>Stuck? Email us</a>
        </p>
      </footer>

      <AppDownloadQRModal show={showAppModal} onDismiss={() => setShowAppModal(false)} fixed />
    </div>
  );
}
