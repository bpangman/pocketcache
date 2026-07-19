import { useState, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight, Building2, Lock } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { saveKey } from '../store/identityStore';
import { DEMO_USER } from '../data/derived';
import { US_STATES, BANKS, PAYMENT_OPTIONS } from './Onboarding';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import SsoButtons from '../components/SsoButtons';
import { CapControl } from './WebPortalPages';
import AppDownloadQRModal, { isNative } from '../components/AppDownloadQRModal';

// ─── Web-native account creation ─────────────────────────────────────────────
// The signup journey as a real webpage: the donor arrived from THIS nonprofit's
// micro-site, so the org is implied  -  no gate, no QR, no code entry. Left rail
// carries the pitch + step progress; the right panel is the current step.
// On completion it hands off to WebDashboard (page → 'home').

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';
const PANEL = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid #e5e7eb',
  boxShadow: '0 16px 48px rgba(11,42,74,0.08), 0 2px 8px rgba(11,42,74,0.05)',
};

const STEPS = [
  { id: 'account', label: 'Create your account' },
  { id: 'card', label: 'Card to track' },
  { id: 'payment', label: 'Payment method' },
  { id: 'review', label: 'Review & confirm' },
];

// Settings deep-links reuse the app's step names
const DEEP_LINK_MAP = { 'connect-card': 'card', 'payment-method': 'payment', 'checkout-confirm': 'review', signup: 'account' };

function StepRail({ current, org }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <aside style={{ position: 'sticky', top: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {org && <OrgLogo nonprofit={org} size={12} rounded="xl" />}
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary, lineHeight: 1.25 }}>{org?.name}</p>
          <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>has its own giving program  -  and you&apos;re in.</p>
        </div>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
        Round up your everyday purchases and your spare change quietly adds up
        for {org?.shortName ?? 'your cause'}  -  one small monthly charge, straight to them.
      </p>
      <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'grid', gap: 2 }}>
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: done ? '#0D9488' : active ? NAVY : '#e2e8f0',
                color: done || active ? '#fff' : INK.muted,
              }}>
                {done ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? INK.primary : done ? INK.secondary : INK.muted }}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: INK.muted }}>
        🔒 Bank connection is read-only via Plaid. Payments are processed by
        Stripe  -  {org?.shortName ?? 'your nonprofit'} is who charges you, never us. No passwords, ever.
      </p>
    </aside>
  );
}

function PanelTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>{title}</h2>
      {sub && <p style={{ margin: '5px 0 0', fontSize: 13.5, color: INK.secondary, lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '13px 16px', borderRadius: 14, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: disabled ? 'linear-gradient(135deg, #d1d5db, #9ca3af)' : `linear-gradient(135deg, ${NAVY}, #001a33)`,
        color: '#fff', fontWeight: 700, fontSize: 15,
      }}
    >
      {children}
    </button>
  );
}

function Checkbox({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 12.5, color: INK.secondary, lineHeight: 1.55 }}
      onClick={e => { if (e.target.tagName !== 'A') onChange(!checked); }}>
      <span style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `2px solid ${checked ? NAVY : '#d1d5db'}`, background: checked ? NAVY : '#fff',
      }}>
        {checked && <CheckCircle size={12} color="#fff" />}
      </span>
      <span>{children}</span>
    </label>
  );
}

export default function WebOnboarding({ entryOrg }) {
  const {
    selectedNonprofit, setSelectedNonprofit, hasAccount, accountStatus,
    setHasAccount, setAccountStatus, setLastMode, setTrackedCard, setPaymentMethod,
    setPage, pendingRoundUps, feeMonths, monthlyCap, setMonthlyCap,
    initialOnboardingStep, clearInitialOnboardingStep,
  } = useApp();
  const brand = useTheme();
  const org = selectedNonprofit ?? entryOrg;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';

  const [step, setStep] = useState('account');
  // Account step
  const [selectedState, setSelectedState] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [commsOptin, setCommsOptin] = useState(true);
  const [chosen, setChosen] = useState(null);
  const [provider, setProvider] = useState('demo');
  // Card step
  const [connecting, setConnecting] = useState(null);
  const [connected, setConnected] = useState(null);
  // Payment step
  const [paymentSel, setPaymentSel] = useState(null);
  // Review step
  const [coverProcessing, setCoverProcessing] = useState(true);
  const [showAppModal, setShowAppModal] = useState(false);

  const isCA = selectedState === 'CA';
  const canContinue = agreedTerms && selectedState !== '' && !isCA;

  // Bind the org this page was reached from (replaces the app's gate auto-bind)
  useEffect(() => {
    if (!selectedNonprofit && entryOrg) setSelectedNonprofit(entryOrg);
  }, [selectedNonprofit, entryOrg, setSelectedNonprofit]);

  // Honor deep-links from Settings ("change payment method" etc.)
  useEffect(() => {
    if (initialOnboardingStep) {
      const mapped = DEEP_LINK_MAP[initialOnboardingStep];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (mapped) setStep(mapped);
      clearInitialOnboardingStep();
    }
  }, [initialOnboardingStep, clearInitialOnboardingStep]);

  function handleSSO(p) {
    if (hasAccount) { setLastMode('giving'); setPage('home'); return; }
    if (!canContinue) return;
    setChosen(p);
    setProvider(p);
    saveKey('pc_comms_optin', commsOptin);
    setTimeout(() => setStep('card'), 700);
  }

  function handleBank(bank) {
    if (connected) return;
    setConnecting(bank.id);
    setTimeout(() => {
      setConnecting(null);
      setConnected({ ...bank, last4: String(Math.floor(1000 + Math.random() * 9000)) });
    }, 1100);
  }

  function handleConfirm() {
    setHasAccount({
      name: DEMO_USER.name,
      email: DEMO_USER.email,
      provider: provider || 'demo',
      joinedAt: new Date().toISOString(),
    });
    setAccountStatus('active');
    setLastMode('giving');
    if (connected) {
      setTrackedCard({ name: connected.name, last4: connected.last4, brand: connected.name, institution: connected.name });
    }
    const opt = PAYMENT_OPTIONS.find(o => o.id === paymentSel);
    if (opt) setPaymentMethod({ type: opt.id, label: opt.label, last4: null });
    // Native never shows the QR popup - go straight home so the flow
    // doesn't wait on a dismiss that can't happen.
    if (isNative()) { setPage('home'); return; }
    setShowAppModal(true);
  }

  const roundUps = pendingRoundUps ?? 4.63;
  const processingCover = parseFloat((roundUps * 0.022 + 0.30).toFixed(2));
  const total = parseFloat((feeMonths + roundUps + (coverProcessing ? processingCover : 0)).toFixed(2));

  return (
    <div style={{position:'relative'}}>
    <div style={{ minHeight: '100dvh', background: '#f6f8fb', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav  -  same webpage chrome as the dashboard */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {org ? <OrgLogo nonprofit={org} size={9} rounded="lg" /> : <CoinMark size={30} />}
            <div style={{ lineHeight: 1.15 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary }}>{brand.appName ?? 'PocketCache'}</p>
              <p style={{ margin: 0, fontSize: 10.5, color: INK.muted }}>powered by PocketCache</p>
            </div>
          </div>
          {org && (
            <a href={`/demo/?orgpage=${encodeURIComponent(org.shortName || org.id.toUpperCase())}`}
              style={{ fontSize: 13, fontWeight: 600, color: NAVY, textDecoration: 'none' }}>
              About {npShort} →
            </a>
          )}
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 980, margin: '0 auto', padding: '36px 24px 48px' }}>
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr]" style={{ display: 'grid', gap: 36, alignItems: 'start' }}>
          <StepRail current={step} org={org} />

          <AnimatePresence mode="wait">
            <motion.section
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              style={{ ...PANEL, padding: 28 }}
            >
              {step === 'account' && (
                <>
                  <PanelTitle title="Create your account" sub="Sign up in seconds. No payment required yet." />
                  {hasAccount && accountStatus === 'active' && (
                    <button
                      onClick={() => { setLastMode('giving'); setPage('home'); }}
                      style={{ width: '100%', textAlign: 'left', marginBottom: 16, padding: '11px 14px', borderRadius: 12, border: '1px solid #FBBF24', background: '#FFFBEB', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#92400e' }}
                    >
                      👋 Welcome back  -  continue as {hasAccount.name} →
                    </button>
                  )}
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted, marginBottom: 6 }}>
                    Your state
                  </label>
                  <select
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 14, color: INK.primary, marginBottom: 14, appearance: 'none' }}
                  >
                    <option value="">Select your state…</option>
                    {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>

                  {isCA && (
                    <div style={{ background: '#FEF3C7', border: '1px solid #FBBF24', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 14 }}>
                      PocketCache isn&apos;t available in California yet  -  we&apos;re working on it. Ask {npShort} for updates.
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                    <Checkbox checked={agreedTerms} onChange={setAgreedTerms}>
                      I am at least 18 years old and agree to the{' '}
                      <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: NAVY, fontWeight: 600 }}>Terms of Service</a> and{' '}
                      <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: NAVY, fontWeight: 600 }}>Privacy Policy</a>.
                    </Checkbox>
                    <Checkbox checked={commsOptin} onChange={setCommsOptin}>
                      PocketCache and {npShort} may contact me with account and giving updates  -  details in our{' '}
                      <a href="/legal/terms/#communications" target="_blank" rel="noopener" style={{ color: NAVY, fontWeight: 600 }}>Terms</a>.
                    </Checkbox>
                  </div>

                  <div style={{ opacity: canContinue || hasAccount ? 1 : 0.55, pointerEvents: chosen ? 'none' : 'auto' }}>
                    <SsoButtons onPress={handleSSO} chosen={chosen} disabled={!canContinue && !hasAccount} />
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: 12, color: INK.muted, textAlign: 'center' }}>
                    No passwords here  -  your Apple or Google account is your key. Tax receipts from {npShort} go to your sign-in email.
                  </p>
                </>
              )}

              {step === 'card' && (
                <>
                  <PanelTitle title="Which card should we track?" sub={`Every purchase on this card rounds up  -  the change goes straight to ${npShort}.`} />
                  {connected ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                      <CheckCircle size={22} color="#0D9488" />
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#134e4a' }}>{connected.name} connected</p>
                        <p style={{ margin: 0, fontSize: 12.5, color: '#0f766e' }}>Card ending ····{connected.last4}  -  we&apos;ll track purchases and tally round-ups as they happen.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                      {BANKS.map(bank => (
                        <button key={bank.id} onClick={() => handleBank(bank)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', textAlign: 'left', opacity: connecting && connecting !== bank.id ? 0.4 : 1 }}>
                          <span style={{ fontSize: 22 }}>{bank.emoji}</span>
                          <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: INK.primary }}>{bank.name}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>{bank.sub}</span>
                          </span>
                          {connecting === bank.id
                            ? <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0D9488' }}>Connecting…</span>
                            : <ArrowRight size={15} color="#cbd5e1" />}
                        </button>
                      ))}
                      <button onClick={() => handleBank({ id: 'other', name: 'My Bank', sub: '' })}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, border: '2px dashed #e5e7eb', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                        <Building2 size={20} color="#94a3b8" />
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: INK.secondary }}>Search all banks &amp; cards</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>12,000+ institutions supported via Plaid</span>
                        </span>
                      </button>
                    </div>
                  )}
                  <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK.muted, margin: '0 0 16px' }}>
                    <Lock size={12} /> Read-only access via Plaid · Your credentials are never stored by PocketCache
                  </p>
                  <PrimaryButton disabled={!connected} onClick={() => setStep('payment')}>
                    {connected ? 'Continue →' : 'Select a card to continue'}
                  </PrimaryButton>
                </>
              )}

              {step === 'payment' && (
                <>
                  <PanelTitle title="How should we collect your round-ups?" sub="Once a month, your round-ups total into one clean charge  -  to the method you pick here." />
                  <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                    {PAYMENT_OPTIONS.map(opt => (
                      <button key={opt.id} onClick={() => setPaymentSel(opt.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                          border: paymentSel === opt.id ? '2px solid #FBBF24' : '1.5px solid #e5e7eb',
                          background: paymentSel === opt.id ? '#FEF3C7' : '#fff',
                        }}>
                        <span style={{ fontSize: 22 }}>{opt.icon}</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: INK.primary }}>{opt.label}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>{opt.sub}</span>
                        </span>
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          border: `2px solid ${paymentSel === opt.id ? '#FBBF24' : '#d1d5db'}`, background: paymentSel === opt.id ? '#FBBF24' : 'transparent',
                        }}>
                          {paymentSel === opt.id && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: INK.muted, margin: '0 0 14px', textAlign: 'center' }}>
                    Change this anytime in Settings. Payments are processed by Stripe  -  not us.
                  </p>
                  {/* Quiet monthly-max opt-in  -  deliberately understated */}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                    <CapControl subtle value={monthlyCap} onChange={setMonthlyCap} />
                  </div>
                  <PrimaryButton disabled={!paymentSel} onClick={() => setStep('review')}>
                    {paymentSel ? 'Continue →' : 'Choose a payment method'}
                  </PrimaryButton>
                </>
              )}

              {step === 'review' && (
                <>
                  <PanelTitle title="Review & confirm" sub={`Your round-ups are collected monthly by ${org?.name ?? 'your nonprofit'}.`} />
                  <div style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>Monthly estimate</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '3px 0' }}>
                      <span style={{ color: INK.secondary }}>Round-ups this month</span>
                      <span style={{ fontWeight: 700, color: INK.primary }}>${roundUps.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: INK.secondary }}>
                      <span>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span>
                      <span>+${feeMonths.toFixed(2)}</span>
                    </div>
                    {coverProcessing && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: INK.secondary }}>
                        <span>Processing cover (goes to {npShort})</span>
                        <span>+${processingCover.toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ height: 1, background: '#cbd5e1', margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: INK.primary }}>One charge from {npShort}</span>
                      <span style={{ fontWeight: 800, fontSize: 18, color: NAVY }}>${total.toFixed(2)}</span>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 11.5, fontStyle: 'italic', color: INK.muted }}>This is an example  -  no real charge is made in this demo.</p>
                  </div>

                  <div
                    onClick={() => setCoverProcessing(v => !v)}
                    style={{ display: 'flex', gap: 10, padding: 14, borderRadius: 14, cursor: 'pointer', marginBottom: 14, border: coverProcessing ? '1.5px solid #6ee7b7' : '1.5px solid #e5e7eb', background: coverProcessing ? '#d1fae5' : '#f9fafb' }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${coverProcessing ? '#059669' : '#d1d5db'}`, background: coverProcessing ? '#059669' : '#fff',
                    }}>
                      {coverProcessing && <CheckCircle size={12} color="#fff" />}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: INK.primary }}>
                        Cover {npShort}&apos;s card-processing costs too, so 100% of my round-ups reach them.
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: INK.secondary, marginTop: 2 }}>
                        {coverProcessing
                          ? `The ~$${processingCover.toFixed(2)} goes directly to ${npShort}  -  PocketCache never touches it. It counts as part of your donation.`
                          : `${npShort} receives your round-ups minus standard card-processing costs, like any donation.`}
                      </span>
                    </span>
                  </div>

                  <p style={{ fontSize: 12, lineHeight: 1.6, color: INK.muted, margin: '0 0 16px' }}>
                    Once a month, {org?.name ?? 'your nonprofit'} bundles your round-ups into one charge  -  you&apos;ll see
                    &ldquo;{npShort}&rdquo; on your statement, not PocketCache, and they send your tax receipt. Months under
                    ${org?.monthlyMinimum ?? 5} roll forward (we settle up within 3 months). Tracking starts now; your{' '}
                    round-ups total through the last day of the month, we email your <strong style={{ color: INK.secondary }}>exact amount on the 1st</strong>, and the <strong style={{ color: INK.secondary }}>charge runs on the 11th</strong>  -  a full 10 days to review it, and nothing before today ever counts.
                  </p>

                  <PrimaryButton onClick={handleConfirm}>Start Giving to {npShort}</PrimaryButton>
                  <p style={{ margin: '10px 0 0', fontSize: 11.5, color: INK.muted, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <CoinMark size={13} /> Powered by PocketCache, LLC. Cancel anytime in Settings.
                  </p>
                </>
              )}
            </motion.section>
          </AnimatePresence>
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
    <AppDownloadQRModal show={showAppModal} onDismiss={() => { setShowAppModal(false); setPage('home'); }} fixed />
    </div>
  );
}
