import { useState, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Lock } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { useTheme } from '../store/ThemeContext';
import { saveKey, IDENTITY_KEYS } from '../store/identityStore';
import { useDonorAuth, nativeSSOAvailable } from '../lib/donorAuth';
import { DEMO_USER } from '../data/derived';
import { US_STATES, PAYMENT_OPTIONS } from './Onboarding';
import { findOrgByCode, resolveOrgByCode, isOrgPending, ORG_PENDING_MESSAGE } from '../store/orgStore';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import SsoButtons from '../components/SsoButtons';
import StripeCardForm from '../components/StripeCardForm';
import PlaidBankConnect from '../components/PlaidBankConnect';
import ManualCardForm from '../components/ManualCardForm';
import ApplePaySheet from '../components/ApplePaySheet';
import AppleLogo from '../components/AppleLogo';
import { CapControl } from './WebPortalPages';
import { isNative, queueAppDownloadPrompt } from '../components/AppDownloadQRModal';
import { fmtMoney } from '../lib/format';
import { pcBeacon } from '../lib/beacon.js';
import { chargeTotal, nextChargeLabel, processingCoverFor } from '../lib/billing';
import { EXAMPLE_MONTH_ROUNDUPS, EXAMPLE_DISCLAIMER } from '../lib/donorContent';
import { useStepHistory } from '../lib/stepHistory';
// Draft persistence (survives the mobile/desktop breakpoint remount) and the
// Settings-deep-link step map - shared with Onboarding.jsx via this one
// module so the two surfaces cannot drift out of sync on which step means
// what. See src/lib/donorDraft.js for the full rationale.
import { loadDonorDraft, saveDonorDraft, clearDonorDraft, DEEP_LINK_MAP } from '../lib/donorDraft';

// ─── Web-native account creation ─────────────────────────────────────────────
// The signup journey as a real webpage. Left rail carries the pitch + step
// progress; the right panel is the current step. On completion it hands off to
// WebDashboard (page → 'home').
//
// TWO WAYS IN, ONE WIZARD
// A donor who followed an org join link (?org=CODE, or a micro-site button) has
// the nonprofit implied and starts at 'account'. A donor who arrives cold from
// pocketcache.app (/demo/?app=1  -  no org, no code) starts one step earlier, at
// 'join': the web-native version of the phone's OrgGateScreen (code entry with
// the same validation and the same error copy, the "already have an account"
// door, and the "Create your nonprofit page" CTA). It is a step of THIS wizard
// rather than a second desktop screen, because the two entries differ by exactly
// one question  -  which nonprofit  -  and a parallel screen would have to
// duplicate the chrome, the rail and the handoff to keep them looking alike.
// Before this existed the codeless donor fell through App.jsx's router into the
// WebPortal column and got the phone UI at 440px on a 1440px page.

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

// The four-step wizard has no in-UI back control between its own steps
// (StepList above is a read-only progress rail, not a nav) - so its own
// definition of order, STEPS, IS the only "back" semantics that already
// exist for hardware back to mirror. 'account' (the first of the four) has
// no entry here on purpose: going further back means leaving the wizard
// entirely, which is handled as a special case in stepBack below.
const PREV_STEP = Object.fromEntries(STEPS.map((s, i) => [s.id, STEPS[i - 1]?.id ?? null]));

// The numbered step list. `idx` of -1 (the join step, which is not one of the
// four) leaves every row muted, so the rail reads as "here is what is ahead".
function StepList({ idx }) {
  return (
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
  );
}

function StepRail({ current, org }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <aside style={{ position: 'sticky', top: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {org && <OrgLogo nonprofit={org} size={12} rounded="xl" />}
        <div>
          {/* The QR / join-link landing greeting (owner punch-list item 2):
              this surface is the nonprofit's round-up MICROSITE, named for
              the org the donor just scanned - never generic app-first copy. */}
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary, lineHeight: 1.25 }} data-testid="web-rail-welcome">
            Welcome to the {org?.name ?? 'your nonprofit'} round-up microsite
          </p>
          <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>Their own giving program  -  and you&apos;re in.</p>
        </div>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
        Round up your everyday purchases and your spare change quietly adds up
        for {org?.shortName ?? 'your cause'}  -  one small monthly charge, straight to them.
      </p>
      <StepList idx={idx} />
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: INK.muted }}>
        🔒 Bank connection is read-only via Plaid. Payments are processed by
        Stripe  -  {org?.shortName ?? 'your nonprofit'} is who charges you, never us. No passwords, ever.
      </p>
    </aside>
  );
}

// Rail for the join and sign-in steps: no nonprofit is bound yet, so it carries
// the PocketCache pitch instead of the org's, and previews the four steps that
// follow. Same geometry as StepRail so the page does not jump when the code
// lands and the rail switches over to the nonprofit's own story.
function JoinRail({ preview = true }) {
  return (
    <aside style={{ position: 'sticky', top: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <CoinMark size={44} />
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary, lineHeight: 1.25 }}>Round-up giving</p>
          <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>for the nonprofit you already care about.</p>
        </div>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
        Your nonprofit hands out a short code  -  it is on their flyer, their
        email, their website. Enter it and your everyday purchases round up to
        the nearest dollar, with the spare change going straight to them in one
        small monthly charge.
      </p>
      {preview && (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
            Then, about two minutes
          </p>
          <StepList idx={-1} />
        </>
      )}
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: INK.muted }}>
        🔒 Bank connection is read-only via Plaid. Payments are processed by
        Stripe  -  your nonprofit is who charges you, never us. No passwords, ever.
      </p>
    </aside>
  );
}

// "For Nonprofits" first, donor path below  -  the phone gate's order
// (Onboarding.jsx OrgGateScreen ~319), so the two surfaces lead with the same
// thing. goToOnboardingStep('nonprofit-signup') is what App.jsx's WebExperience
// latches on to route to the desktop nonprofit signup wizard instead of here.
/**
 * The "I am nonprofit staff, not a donor" door.
 *
 * `placement` decides which side the divider sits on, because this block is
 * used both above the donor content (account step) and below it (join step).
 * On the join step the donor path leads - that step is what "Start giving as a
 * donor" lands on, so opening with a nonprofit CTA answered a question the
 * visitor had not asked.
 */
function NonprofitCta({ onSignup, placement = 'above' }) {
  const below = placement === 'below';
  const divider = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: below ? '0 0 16px' : '16px 0 0' }}>
      <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: INK.muted, whiteSpace: 'nowrap' }}>
        {below ? 'Are you the nonprofit?' : 'Looking to support a nonprofit?'}
      </span>
      <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
    </div>
  );
  return (
    <div style={{ marginBottom: below ? 0 : 18, marginTop: below ? 22 : 0 }}>
      {below && divider}
      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
        For Nonprofits
      </p>
      <button
        onClick={onSignup}
        data-testid="web-nonprofit-cta"
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg, ${NAVY}, #001a33)`, color: '#fff', fontWeight: 700, fontSize: 15,
        }}
      >
        Create your nonprofit page
      </button>
      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.55, color: INK.muted }}>
        Run a nonprofit? List it on PocketCache and get your own round-up program  -  live in minutes.
      </p>
      {!below && divider}
    </div>
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

export default function WebOnboarding({ entryOrg, entryCode, entryIntent, onAdminSignIn }) {
  const {
    selectedNonprofit, setSelectedNonprofit, hasAccount, accountStatus,
    setHasAccount, setAccountStatus, setLastMode, setTrackedCard, setPaymentMethod,
    setPage, feeMonths, monthlyCap, setMonthlyCap,
    initialOnboardingStep, clearInitialOnboardingStep, goToOnboardingStep,
    coverProcessing, setCoverProcessing, adminRole, setAdminRole, lastMode,
  } = useApp();
  const { adoptOrgById } = useNp();
  const brand = useTheme();
  const org = selectedNonprofit ?? entryOrg;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';

  // A draft from a prior mount of THIS wizard in the same tab (see
  // DONOR_DRAFT_KEY above) - restored below wherever it beats the plain
  // default, so the mobile/desktop breakpoint swap does not reset progress.
  const [draft] = useState(loadDonorDraft);

  // No nonprofit yet means one extra question first. Decided once, on mount: the
  // join step binds the org itself, and re-deriving this would bounce the donor
  // straight back out of the step they just completed.
  const [step, setStep] = useState(() => {
    // Returning here after an Apple/Google sign-in redirect (see
    // src/lib/donorAuth.js) - land back on the account step so it can pick up
    // the completed session instead of dumping the donor at the join step,
    // even if a stale draft from before the redirect suggests otherwise.
    if (new URLSearchParams(window.location.search).get('authResume') === 'web') return 'account';
    if (draft?.step) return draft.step;
    // entryIntent: the marketing site's device-aware ?signin=1 / ?join=1 links
    // (see App.jsx's WebExperience). A returning donor's "Sign in" click opens
    // straight on this wizard's own sign-in door instead of the join/code
    // step; "Start giving" opens on the join/code step explicitly, same as the
    // default below, but without depending on `org` being unset.
    if (entryIntent === 'signin') return 'signin';
    if (entryIntent === 'join') return 'join';
    return org ? 'account' : 'join';
  });
  // Join step. A join link whose code this device cannot resolve prefills the
  // input and explains itself rather than failing silently  -  same behaviour as
  // the phone gate (Onboarding.jsx OrgGateScreen ~216).
  const [code, setCode] = useState(() => draft?.code ?? (entryCode && !findOrgByCode(entryCode) ? entryCode.toUpperCase() : ''));
  const [codeError, setCodeError] = useState(() => (
    entryCode && !findOrgByCode(entryCode) ? 'Code not found. Ask your nonprofit for their PocketCache code.' : null
  ));
  // Sign-in step
  const [ssoChosen, setSsoChosen] = useState(null);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInEmailError, setSignInEmailError] = useState(null);
  // Account step
  const [selectedState, setSelectedState] = useState(() => draft?.selectedState ?? '');
  const [agreedTerms, setAgreedTerms] = useState(() => draft?.agreedTerms ?? false);
  const [commsOptin, setCommsOptin] = useState(() => draft?.commsOptin ?? true);
  const [chosen, setChosen] = useState(null);
  const [provider, setProvider] = useState(() => draft?.provider ?? 'demo');
  // Real donor sign-in (email code, plus Apple/Google once configured) - see
  // src/lib/donorAuth.js for the shared logic behind both signup surfaces.
  // Deliberately NOT draft-restored: a code mid-verification is single-use and
  // short-lived, so a remount here always re-shows a clean "send code" form.
  const donorAuth = useDonorAuth({ resumeKey: 'web' });
  const [emailInput, setEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState(null);
  // Restored so a remount past the account step (signup already verified, but
  // AppContext's hasAccount is not set until handleConfirm on the review step)
  // does not strand the donor on 'card'/'payment'/'review' with no identity.
  const [signupIdentity, setSignupIdentity] = useState(() => draft?.signupIdentity ?? null);
  // Card step
  const [connected, setConnected] = useState(() => draft?.connected ?? null);
  // Manual "type your card" entry, the same simulated tracking-card form the
  // app's connect-card step has (item 10a). Toggled open under the Plaid
  // button; never restored from draft (it holds nothing worth keeping).
  const [manualEntry, setManualEntry] = useState(false);
  // Payment step
  const [paymentSel, setPaymentSel] = useState(() => draft?.paymentSel ?? null);
  const [showApplePay, setShowApplePay] = useState(false);
  // Real card details, captured through Stripe Elements when the donor picks
  // "Credit or Debit Card" - the wizard used to store last4: null no matter what.
  const [cardEntry, setCardEntry] = useState(false);
  const [cardInfo, setCardInfo] = useState(() => draft?.cardInfo ?? null);
  // "Code sent" feedback for the Resend code buttons below (the 'signin' step
  // and the 'account' step each have their own code form, but both share this
  // one donorAuth instance/stage, so one flag covers whichever is mounted).
  // Auto-clears. Loading (donorAuth.sendingCode) and failure incl. rate-limit
  // (donorAuth.sendError) already come from the shared hook.
  const [justResent, setJustResent] = useState(false);
  async function handleResend(addr, opts) {
    const ok = await donorAuth.sendCode(addr, opts);
    if (ok) {
      setJustResent(true);
      setTimeout(() => setJustResent(false), 3000);
    }
  }
  // Review step.
  // `coverProcessing` is NOT local state here. It was, and that is exactly the
  // bug: the checkbox below is pre-checked, the donor agrees to cover the
  // nonprofit's card-processing cost, and the moment onboarding finished the
  // value was thrown away with the component - so no monthly charge on either
  // surface ever included it. It now reads and writes the persisted preference in
  // AppContext (`pc_cover_processing`), the same store the app's checkout writes,
  // so the consent survives signup and both dashboards bill it.

  const isCA = selectedState === 'CA';
  // The full gate (owner punch-list item 4): BOTH checkboxes AND a state
  // selection before "Email me a code" or any SSO button is usable.
  const canContinue = agreedTerms && commsOptin && selectedState !== '' && !isCA;

  // Persist a draft of wizard progress to sessionStorage on every meaningful
  // change, so the mobile/desktop breakpoint remount (see DONOR_DRAFT_KEY
  // above) can restore it on the other surface's mount.
  useEffect(() => {
    saveDonorDraft({
      step, code, selectedState, agreedTerms, commsOptin, provider,
      signupIdentity, connected, paymentSel, cardInfo,
    });
  }, [step, code, selectedState, agreedTerms, commsOptin, provider,
    signupIdentity, connected, paymentSel, cardInfo]);

  // Hardware/browser back for this wizard's OWN step transitions - mirrors
  // exactly what already moves the donor backward on this surface: the
  // explicit "← Back" button on 'signin' (setStep('join')), and PREV_STEP's
  // order (the same order StepList already renders) for the four-step
  // account/card/payment/review sequence, which has no in-UI back button of
  // its own to mirror. 'join' is excluded below (see `active`) - it is this
  // wizard's own landing screen, same as Onboarding.jsx's 'gate'.
  function stepBack() {
    if (step === 'signin') { setStep('join'); donorAuth.resetToEmail(); return; }
    let prev = PREV_STEP[step];
    // Once the account exists, back from the card step must NEVER return to
    // the account step (owner punch-list item 4) - it skips over it to the
    // join screen, the step that precedes account creation on this surface.
    if (prev === 'account' && (signupIdentity || hasAccount)) prev = null;
    // 'account' (PREV_STEP['account'] is null) has nothing before it in the
    // four-step sequence - back from here leaves the wizard for the join
    // screen, same landing spot 'signin' backs out to, and is an explicit
    // exit from the signup flow itself (not a breakpoint remount), so the
    // draft that exists only to survive THAT should not survive this.
    if (!prev) clearDonorDraft();
    setStep(prev ?? 'join');
  }
  useStepHistory(step, stepBack, { active: step !== 'join' });

  // Bind the org this page was reached from (replaces the app's gate auto-bind)
  useEffect(() => {
    if (!selectedNonprofit && entryOrg) setSelectedNonprofit(entryOrg);
  }, [selectedNonprofit, entryOrg, setSelectedNonprofit]);

  // Honor deep-links from Settings ("change payment method" etc.)
  useEffect(() => {
    if (initialOnboardingStep) {
      const mapped = DEEP_LINK_MAP[initialOnboardingStep];
      if (mapped) setStep(mapped);
      clearInitialOnboardingStep();
    }
  }, [initialOnboardingStep, clearInitialOnboardingStep]);

  // Join step: the real lookup, not a re-implementation of code matching  -
  // resolveOrgByCode is the same server-first resolver the phone gate, the
  // ?org= link and the vanity-URL forwarder all go through, so a code from
  // any device (not just the one that created the org) resolves here too.
  async function handleJoin(e) {
    e?.preventDefault?.();
    const np = await resolveOrgByCode(code);
    if (!np) {
      setCodeError('Code not found. Ask your nonprofit for their PocketCache code.');
      return;
    }
    if (isOrgPending(np)) {
      // The org exists but is still awaiting the platform owner's approval -
      // held back from donors until it flips to approved (org-approve).
      setCodeError(ORG_PENDING_MESSAGE);
      return;
    }
    setCodeError(null);
    setSelectedNonprofit(np);
    // A signed-in donor who was only missing the cause binding (the state a
    // fresh sign-in on a new browser lands in) is done the moment the code
    // resolves - straight to the dashboard, never back through signup.
    if (hasAccount && accountStatus === 'active') {
      setLastMode('giving');
      setPage('home');
      return;
    }
    // Mid-wizard identity already created (e.g. the donor backed out to the
    // join step after verifying) - the account step is done, skip it.
    if (signupIdentity) { setStep('card'); return; }
    setStep('account');
  }

  // One sign-in for every role, same routing as the app's gate
  // (Onboarding.jsx resumeSession ~2260): donor-only → giving, admin-only →
  // dashboard, both → last-used mode.
  //
  // With one addition the phone does not need: the donor dashboard is
  // per-nonprofit, so an identity that resolves with nothing bound on this
  // device has no dashboard to land on. It comes back to the join step for the
  // one question that is missing instead of being handed an empty one.
  function resumeSession() {
    const donorOnly = hasAccount && !adminRole;
    const adminOnly = adminRole && !hasAccount;
    if (adminOnly) { setLastMode('admin'); setPage('np-dashboard'); return; }
    if (donorOnly) {
      if (!selectedNonprofit) { setStep('join'); return; }
      setLastMode('giving'); setPage('home'); return;
    }
    if (lastMode === 'admin' && adminRole) { setPage('np-dashboard'); return; }
    if (!selectedNonprofit) { setStep('join'); return; }
    setPage('home');
  }

  // Real sign-in, shared with the 'account' step's donorAuth instance (only
  // one step is mounted at a time, so sharing donorAuth.stage/email/codeInput
  // across them is safe - same pattern as the phone's GateSignInScreen).
  function finishSignIn(identity) {
    saveKey(IDENTITY_KEYS.identity, identity);
    setHasAccount(identity);
    setAccountStatus('active');
    setTimeout(() => resumeSession(), 500);
  }

  function handleSendSignInCode(e) {
    e?.preventDefault?.();
    const addr = signInEmail.trim();
    if (!addr.includes('@') || !addr.split('@')[1]?.includes('.')) {
      setSignInEmailError('Enter a valid email address.');
      return;
    }
    setSignInEmailError(null);
    // shouldCreateUser: false - this is a sign-in door, not a signup form.
    donorAuth.sendCode(addr, { shouldCreateUser: false });
  }

  async function handleVerifySignInCode(e) {
    e?.preventDefault?.();
    const identity = await donorAuth.verifyCode(donorAuth.codeInput);
    if (identity) finishSignIn(identity);
  }

  async function handleSignInSSO(p) {
    if (ssoChosen) return;
    setSsoChosen(p);
    // Native resolves with the identity (in-app browser round trip); web
    // navigates away on success, so past this line = failure or sheet closed.
    const identity = await donorAuth.startOAuth(p);
    if (identity) return finishSignIn(identity);
    setSsoChosen(null);
  }

  // Demo-only shortcut, carried over from the phone's sign-in empty state, so a
  // prospect can see the admin side without creating an org first.
  function previewAdminDashboard() {
    const orgId = adminRole?.orgId ?? 'bgca';
    if (!adminRole) setAdminRole({ orgId: 'bgca', joinCode: 'BGCA' });
    adoptOrgById(orgId);
    setLastMode('admin');
    setPage('np-dashboard');
  }

  async function handleSSO(p) {
    if (hasAccount) { setLastMode('giving'); setPage('home'); return; }
    if (!canContinue) return;
    if (chosen) return; // prevent double-tap while a native sheet is up
    setChosen(p);
    // Native resolves with the identity (in-app browser round trip); web
    // navigates away on success, so past this line = failure or sheet closed.
    const identity = await donorAuth.startOAuth(p);
    if (identity) return finishSignup(identity);
    setChosen(null);
  }

  // Writes pc_identity the same way for every sign-in path, then continues
  // the existing flow exactly as it already proceeded after signup.
  function finishSignup(identity) {
    saveKey(IDENTITY_KEYS.identity, identity);
    setSignupIdentity(identity);
    setProvider(identity.provider);
    setChosen(identity.provider);
    saveKey('pc_comms_optin', commsOptin);
    setTimeout(() => setStep('card'), 500);
  }

  function handleSendCode(e) {
    e?.preventDefault?.();
    if (hasAccount) { setLastMode('giving'); setPage('home'); return; }
    if (!canContinue) return;
    const addr = emailInput.trim();
    if (!addr.includes('@') || !addr.split('@')[1]?.includes('.')) {
      setEmailInputError('Enter a valid email address.');
      return;
    }
    setEmailInputError(null);
    donorAuth.sendCode(addr);
  }

  // A successful verify advances IMMEDIATELY (owner punch-list item 4): no
  // confirm-your-name stop, no second look at the SSO buttons - the account
  // exists, so the wizard moves straight to the card step. The display name
  // starts as the friendly guess from the email and is editable in Settings.
  async function handleVerifyCode(e) {
    e?.preventDefault?.();
    const identity = await donorAuth.verifyCode(donorAuth.codeInput);
    if (identity) finishSignup(identity);
  }

  // Signed-in users BYPASS the account step entirely (item 4): a live
  // Supabase session found while this step is showing - including the
  // Apple/Google redirect return trip (?authResume=web lands here) - adopts
  // the identity and advances automatically to the card step. No
  // "Continue as {email}" button exists any more, so a long address can
  // never wrap one. An app-level account routes to its dashboard instead.
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (step !== 'account' || autoAdvanced) return;
    if (hasAccount && accountStatus === 'active') { setAutoAdvanced(true); setLastMode('giving'); setPage('home'); return; }
    // An identity created earlier in this wizard run means the account step is
    // simply done - advance without re-adopting.
    if (signupIdentity) { setAutoAdvanced(true); setStep('card'); return; }
    if (donorAuth.checkingSession || !donorAuth.existingSession) return;
    setAutoAdvanced(true);
    finishSignup(donorAuth.existingSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, donorAuth.checkingSession, donorAuth.existingSession, hasAccount, autoAdvanced]);

  function handleConfirm() {
    // A real signup already wrote the verified identity (email code or
    // Apple/Google) above - use it here rather than overwrite it. The
    // DEMO_USER fallback only covers the old, no-longer-reachable placeholder
    // path so this never leaves hasAccount empty.
    setHasAccount(signupIdentity ?? {
      name: DEMO_USER.name,
      email: DEMO_USER.email,
      provider: provider || 'demo',
      joinedAt: new Date().toISOString(),
    });
    setAccountStatus('active');
    setLastMode('giving');
    if (connected) {
      // connected already carries the real institution/name/mask from Plaid
      // (or an equivalent shape from the offline practice-mode fallback) -
      // keep those fields instead of collapsing everything to the bank name.
      setTrackedCard({
        name: connected.name,
        last4: connected.last4,
        brand: connected.brand ?? connected.name,
        institution: connected.institution ?? connected.name,
      });
    }
    const opt = PAYMENT_OPTIONS.find(o => o.id === paymentSel);
    // A card's last4/brand come from the Stripe result; bank/Apple Pay have none.
    if (opt) setPaymentMethod({ type: opt.id, label: opt.label, last4: opt.id === 'card' ? (cardInfo?.last4 ?? null) : null, ...(opt.id === 'card' && cardInfo?.brand ? { brand: cardInfo.brand } : {}), ...(opt.id === 'card' && cardInfo?.simulated ? { simulated: true } : {}) });
    // pc_page flips to 'home' IMMEDIATELY - this used to stay 'onboarding'
    // until the QR modal was dismissed, so a reload before that dismiss (or a
    // donor who never dismissed it) landed back on this step, not signed in.
    // Native never shows the QR popup at all; the popup itself is now a
    // one-shot flag (queueAppDownloadPrompt) consumed by AppDownloadPrompt once
    // WebDashboard mounts, so it still shows up "on top" of the dashboard even
    // though this wizard unmounts the instant `page` changes.
    if (!isNative()) queueAppDownloadPrompt();
    setPage('home');
    pcBeacon('donor signup', { org: org?.shortName, surface: 'web' });
    // Signup is done - the draft that exists only to survive a breakpoint
    // remount mid-wizard has nothing left to protect.
    clearDonorDraft();
  }

  // ILLUSTRATIVE EXAMPLE, NOT AN ESTIMATE (owner punch-list item 11). A
  // brand-new account has accrued NOTHING, so this step never presents a
  // figure as the donor's own current total - it walks through "here is how
  // a month could look" using the shared obviously-sample figure. Same
  // constants as the app's CheckoutConfirmScreen so the two surfaces cannot
  // drift. The fee and cover math still comes from lib/billing so the example
  // adds up exactly the way a real charge will.
  const exampleRoundUps = EXAMPLE_MONTH_ROUNDUPS;
  const processingCover = processingCoverFor(exampleRoundUps);
  const total = chargeTotal({
    pendingRoundUps: exampleRoundUps,
    feeMonths,
    processingCover: coverProcessing ? processingCover : 0,
  });
  const chargeOn = nextChargeLabel();
  const cardReady = paymentSel !== 'card' || !!cardInfo;

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
          {step === 'join' || step === 'signin'
            ? <JoinRail preview={step === 'join'} />
            : <StepRail current={step} org={org} />}

          <AnimatePresence mode="wait">
            <motion.section
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              style={{ ...PANEL, padding: 28 }}
            >
              {/* ── JOIN: which nonprofit? ──
                  Only for a donor who arrived without one. Everything the phone
                  gate offers, in the portal's own language.

                  ORDER MATTERS: the donor code comes FIRST. This step is what
                  "Start giving as a donor" on the marketing site lands on, and
                  leading with a full-width navy "Create your nonprofit page"
                  button answered a question the visitor did not ask. The
                  nonprofit door stays on the page, below, for the minority who
                  came here as staff. */}
              {step === 'join' && (
                <>
                  <PanelTitle
                    title="Which nonprofit are you giving to?"
                    sub="Enter the PocketCache code they gave you. It is short enough to say out loud  -  BGCA, for example."
                  />
                  {/* Not a "continue as you" button, which is what the phone
                      gate offers: on THIS step there is by definition no
                      nonprofit bound, so there is nothing to continue to. It
                      greets the identity and names the one thing still missing.
                      This is also where a successful sign-in lands when the
                      account has no nonprofit on this device (resumeSession). */}
                  {hasAccount && accountStatus === 'active' && (
                    <div
                      data-testid="web-join-signed-in"
                      style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 12, border: '1px solid #FBBF24', background: '#FFFBEB', fontSize: 13.5, fontWeight: 600, color: '#92400e' }}
                    >
                      👋 Signed in as {hasAccount.name}  -  pick your nonprofit to carry on.
                    </div>
                  )}
                  <form onSubmit={handleJoin}>
                    <label htmlFor="pc-join-code" style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted, marginBottom: 6 }}>
                      Nonprofit code
                    </label>
                    <input
                      id="pc-join-code"
                      type="text"
                      autoComplete="off"
                      data-testid="web-join-code"
                      placeholder="BGCA"
                      value={code}
                      onChange={e => { setCode(e.target.value.toUpperCase()); setCodeError(null); }}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 12,
                        border: `1.5px solid ${codeError ? '#ef4444' : code ? '#FBBF24' : '#d1d5db'}`,
                        background: '#f9fafb', fontFamily: 'monospace', fontSize: 17, letterSpacing: '0.14em',
                        textTransform: 'uppercase', color: INK.primary, outline: 'none',
                      }}
                    />
                    {codeError && (
                      <p data-testid="web-join-error" style={{ margin: '7px 0 0', fontSize: 12.5, color: '#dc2626' }}>{codeError}</p>
                    )}
                    <p style={{ margin: '7px 0 14px', fontSize: 12, lineHeight: 1.55, color: INK.muted }}>
                      Demo code: BGCA. Holding their flyer? Point your phone camera at
                      the QR code on it and it opens this page with the code already filled in.
                    </p>
                    <PrimaryButton disabled={!code} onClick={handleJoin}>Continue →</PrimaryButton>
                  </form>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 14px' }}>
                    <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: INK.muted, whiteSpace: 'nowrap' }}>Been here before?</span>
                    <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  </div>
                  <button
                    onClick={() => setStep('signin')}
                    data-testid="web-join-signin"
                    style={{ width: '100%', padding: '13px 16px', borderRadius: 14, border: 'none', cursor: 'pointer', background: '#f0f4f8', color: '#0B2A4A', fontWeight: 700, fontSize: 15 }}
                  >
                    Already have an account? Sign in
                  </button>
                  <NonprofitCta onSignup={() => goToOnboardingStep('nonprofit-signup')} placement="below" />
                </>
              )}

              {/* ── SIGN IN ──
                  The gate's universal door (Onboarding.jsx GateSignInScreen):
                  one identity, whichever roles it holds. */}
              {step === 'signin' && (
                <>
                  <PanelTitle title="Welcome back" sub="Sign in with the account you used before." />

                  {!donorAuth.checkingSession && donorAuth.existingSession && (
                    <button
                      onClick={() => finishSignIn(donorAuth.existingSession)}
                      style={{ width: '100%', textAlign: 'left', marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: '1px solid #FBBF24', background: '#FFFBEB', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#92400e' }}
                    >
                      👋 Continue as {donorAuth.existingSession.email} →
                    </button>
                  )}

                  {donorAuth.stage === 'code' ? (
                    <form onSubmit={handleVerifySignInCode}>
                      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: INK.secondary }}>
                        We sent a 6-digit code to <strong style={{ color: INK.primary }}>{donorAuth.email}</strong>.
                      </p>
                      <input
                        type="text" inputMode="numeric" maxLength={6} value={donorAuth.codeInput}
                        onChange={e => donorAuth.setCodeInput(e.target.value.replace(/\D/g, ''))}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 12,
                          border: `1.5px solid ${donorAuth.codeError ? '#ef4444' : '#d1d5db'}`, background: '#f9fafb',
                          fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.4em', textAlign: 'center', color: INK.primary, marginBottom: 8,
                        }}
                      />
                      {donorAuth.codeError && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#dc2626' }}>{donorAuth.codeError}</p>}
                      <PrimaryButton onClick={handleVerifySignInCode} disabled={donorAuth.codeInput.length !== 6 || donorAuth.verifying}>
                        {donorAuth.verifying ? 'Checking…' : 'Verify code →'}
                      </PrimaryButton>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10 }}>
                        <button type="button" disabled={donorAuth.sendingCode}
                          onClick={() => handleResend(donorAuth.email, { shouldCreateUser: false })}
                          style={{ border: 'none', background: 'transparent', cursor: donorAuth.sendingCode ? 'default' : 'pointer', fontSize: 12.5, color: INK.muted, opacity: donorAuth.sendingCode ? 0.6 : 1 }}>
                          {donorAuth.sendingCode ? 'Sending…' : justResent ? 'Code sent' : 'Resend code'}
                        </button>
                        <button type="button" onClick={donorAuth.resetToEmail} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: INK.muted }}>Change email</button>
                      </div>
                      {donorAuth.sendError && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#dc2626', textAlign: 'center' }}>{donorAuth.sendError}</p>}
                    </form>
                  ) : (
                    <form onSubmit={handleSendSignInCode} style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted, marginBottom: 6 }}>
                        Your email
                      </label>
                      <input
                        type="email"
                        value={signInEmail}
                        onChange={e => { setSignInEmail(e.target.value); setSignInEmailError(null); }}
                        placeholder="you@example.com"
                        data-testid="web-signin-email"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${signInEmailError || donorAuth.sendError ? '#ef4444' : '#d1d5db'}`, background: '#f9fafb', fontSize: 14, color: INK.primary, marginBottom: 8 }}
                      />
                      {signInEmailError && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#dc2626' }}>{signInEmailError}</p>}
                      {donorAuth.sendError && <p data-testid="web-signin-error" style={{ margin: '0 0 8px', fontSize: 12.5, color: '#dc2626' }}>{donorAuth.sendError}</p>}
                      <PrimaryButton onClick={handleSendSignInCode} disabled={!signInEmail.trim() || donorAuth.sendingCode}>
                        {donorAuth.sendingCode ? 'Sending…' : 'Email me a code →'}
                      </PrimaryButton>
                    </form>
                  )}

                  {/* Same SSO rule as the phone screens: web always, native
                      only when the shell can run the in-app OAuth flow (see
                      nativeSSOAvailable). WebOnboarding only ever renders on
                      desktop in practice - gated anyway so this screen cannot
                      drift from the phone screens' rule. */}
                  {(!isNative() || nativeSSOAvailable()) && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 14px' }}>
                        <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: INK.muted }}>or</span>
                        <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                      </div>
                      <SsoButtons onPress={handleSignInSSO} chosen={ssoChosen} errors={donorAuth.oauthErrors} />
                    </>
                  )}
                  <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.6, color: INK.muted, textAlign: 'center' }}>
                    No passwords here  -  we&apos;ll email you a one-time code, or use Apple or Google.
                  </p>
                  {onAdminSignIn && (
                    <button
                      onClick={onAdminSignIn}
                      data-testid="web-signin-admin"
                      style={{ width: '100%', marginTop: 14, padding: '10px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: INK.muted }}
                    >
                      Nonprofit admin? <span style={{ fontWeight: 700, textDecoration: 'underline', color: NAVY }}>Sign in with your work email</span>
                    </button>
                  )}
                  {/* Demo-only shortcut so prospects can see the admin side without creating an org */}
                  <button
                    onClick={previewAdminDashboard}
                    style={{ width: '100%', marginTop: 2, padding: '10px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: INK.muted }}
                  >
                    Demo: preview the BGCA admin dashboard →
                  </button>
                  <button
                    onClick={() => { setStep('join'); donorAuth.resetToEmail(); }}
                    data-testid="web-signin-back"
                    style={{ width: '100%', marginTop: 4, padding: '10px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: INK.muted }}
                  >
                    ← Back
                  </button>
                </>
              )}

              {step === 'account' && (
                <>
                  {/* ── FOR NONPROFITS (first, same as the phone gate) ──
                      A nonprofit admin who follows an org join link on a laptop
                      lands in THIS donor wizard (App.jsx routes ?org=CODE by
                      viewport width alone), and the desktop wizard had no way out:
                      the phone gate's OrgGateScreen leads with "For Nonprofits /
                      Create your nonprofit page" above the donor path, and this
                      had nothing. Same order, same words, web chrome. */}
                  <NonprofitCta onSignup={() => goToOnboardingStep('nonprofit-signup')} />
                  <PanelTitle title="Create your account" sub="Sign up in seconds. No payment required yet." />
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
                      {/* Tokenized to the joined nonprofit's FULL name (item
                          9a) - never a hardcoded org, graceful fallback
                          before one is bound. */}
                      PocketCache and {org?.name ?? 'your chosen nonprofit partner'} may contact me with account and giving updates  -  details in our{' '}
                      <a href="/legal/terms/#communications" target="_blank" rel="noopener" style={{ color: NAVY, fontWeight: 600 }}>Terms</a>.
                    </Checkbox>
                  </div>

                  {/* Signed-in users never see the forms below again: the
                      auto-advance effect adopts a live session and moves to
                      the card step, so there is no "Continue as {email}"
                      button any more (item 4). The placeholder keeps the SSO
                      buttons from flashing while the session check runs. */}
                  {donorAuth.checkingSession || autoAdvanced ? (
                    <div data-testid="web-account-session-check" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 0', color: INK.muted, fontSize: 13 }}>
                      One moment…
                    </div>
                  ) : donorAuth.stage === 'code' ? (
                    <form onSubmit={handleVerifyCode}>
                      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: INK.secondary }}>
                        We sent a 6-digit code to <strong style={{ color: INK.primary }}>{donorAuth.email}</strong>.
                      </p>
                      <input
                        type="text" inputMode="numeric" maxLength={6} value={donorAuth.codeInput}
                        onChange={e => donorAuth.setCodeInput(e.target.value.replace(/\D/g, ''))}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 12,
                          border: `1.5px solid ${donorAuth.codeError ? '#ef4444' : '#d1d5db'}`, background: '#f9fafb',
                          fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.4em', textAlign: 'center', color: INK.primary, marginBottom: 8,
                        }}
                      />
                      {donorAuth.codeError && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#dc2626' }}>{donorAuth.codeError}</p>}
                      <PrimaryButton onClick={handleVerifyCode} disabled={donorAuth.codeInput.length !== 6 || donorAuth.verifying}>
                        {donorAuth.verifying ? 'Checking…' : 'Verify code →'}
                      </PrimaryButton>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10 }}>
                        <button type="button" disabled={donorAuth.sendingCode}
                          onClick={() => handleResend(donorAuth.email)}
                          style={{ border: 'none', background: 'transparent', cursor: donorAuth.sendingCode ? 'default' : 'pointer', fontSize: 12.5, color: INK.muted, opacity: donorAuth.sendingCode ? 0.6 : 1 }}>
                          {donorAuth.sendingCode ? 'Sending…' : justResent ? 'Code sent' : 'Resend code'}
                        </button>
                        <button type="button" onClick={donorAuth.resetToEmail} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: INK.muted }}>Change email</button>
                      </div>
                      {donorAuth.sendError && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#dc2626', textAlign: 'center' }}>{donorAuth.sendError}</p>}
                    </form>
                  ) : (
                    <>
                      <form onSubmit={handleSendCode} style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted, marginBottom: 6 }}>
                          Your email
                        </label>
                        <input
                          type="email"
                          value={emailInput}
                          onChange={e => { setEmailInput(e.target.value); setEmailInputError(null); }}
                          placeholder="you@example.com"
                          data-testid="web-account-email"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${emailInputError || donorAuth.sendError ? '#ef4444' : '#d1d5db'}`, background: '#f9fafb', fontSize: 14, color: INK.primary, marginBottom: 8 }}
                        />
                        {emailInputError && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#dc2626' }}>{emailInputError}</p>}
                        {donorAuth.sendError && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#dc2626' }}>{donorAuth.sendError}</p>}
                        {/* Disabled until the state + BOTH consent boxes above
                            are complete (item 4) - the hint below says which
                            part is still missing. */}
                        <PrimaryButton onClick={handleSendCode} disabled={!canContinue || donorAuth.sendingCode}>
                          {donorAuth.sendingCode ? 'Sending…' : 'Email me a code →'}
                        </PrimaryButton>
                      </form>

                      {/* Same SSO rule as Onboarding.jsx's SignUpScreen: web
                          always, native only when the shell can run the in-app
                          OAuth flow (see nativeSSOAvailable). WebOnboarding only
                          ever renders on desktop in practice - gated anyway so
                          this screen cannot drift from the phone screens' rule. */}
                      {(!isNative() || nativeSSOAvailable()) && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 14px' }}>
                            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                            <span style={{ fontSize: 12, fontWeight: 500, color: INK.muted }}>or</span>
                            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                          </div>

                          <div style={{ opacity: canContinue ? 1 : 0.55, pointerEvents: chosen ? 'none' : 'auto' }}>
                            <SsoButtons onPress={handleSSO} chosen={chosen} disabled={!canContinue} errors={donorAuth.oauthErrors} />
                          </div>
                        </>
                      )}
                      {!canContinue && !isCA && (
                        <p style={{ margin: '10px 0 0', fontSize: 12, color: INK.muted, textAlign: 'center' }} data-testid="web-account-gate-hint">
                          {selectedState === ''
                            ? 'Select your state above to continue'
                            : 'Check both boxes above to continue'}
                        </p>
                      )}
                      <p style={{ margin: '12px 0 0', fontSize: 12, color: INK.muted, textAlign: 'center' }}>
                        {isNative() && !nativeSSOAvailable()
                          ? `Sign in with your email  -  we'll send you a 6-digit code, no password needed. Tax receipts from ${npShort} go to your sign-in email.`
                          : `No passwords here  -  we'll email you a one-time code, or use Apple or Google. Tax receipts from ${npShort} go to your sign-in email.`}
                      </p>
                    </>
                  )}
                </>
              )}

              {step === 'card' && (
                <>
                  <PanelTitle title="Which card should we track?" sub={`Every purchase on this card rounds up  -  the change goes straight to ${npShort}. This card is never charged, we only watch it.`} />
                  {connected ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                      <CheckCircle size={22} color="#0D9488" />
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#134e4a' }}>{connected.name} connected</p>
                        <p style={{ margin: 0, fontSize: 12.5, color: '#0f766e' }}>Card ending ····{connected.last4}  -  we&apos;ll track purchases and tally round-ups as they happen.</p>
                      </div>
                    </div>
                  ) : manualEntry ? (
                    <div style={{ border: '1.5px solid #99f6e4', borderRadius: 14, padding: 16, marginBottom: 12 }}>
                      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: INK.muted }}>
                        Enter your card manually
                      </p>
                      <ManualCardForm
                        variant="web"
                        onCancel={() => setManualEntry(false)}
                        onConnect={card => { setConnected(card); setManualEntry(false); }}
                      />
                    </div>
                  ) : (
                    <div style={{ marginBottom: 12 }}>
                      <PlaidBankConnect variant="web" onConnected={card => setConnected(card)} />
                      {/* Manual entry - the same simulated tracking-card form
                          the app has (item 10a): clearly the WATCHED card,
                          raw numbers never sent anywhere. */}
                      <button
                        onClick={() => setManualEntry(true)}
                        data-testid="web-manual-card-entry"
                        style={{
                          width: '100%', marginTop: 10, padding: '13px 16px', borderRadius: 14, cursor: 'pointer',
                          border: '2px dashed #d1d5db', background: '#fff', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}
                      >
                        <Lock size={16} color="#0d9488" />
                        <span>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: INK.primary }}>Enter your card manually</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>Type the card we should watch  -  encrypted via Plaid, never charged</span>
                        </span>
                      </button>
                    </div>
                  )}
                  <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK.muted, margin: '0 0 16px' }}>
                    <Lock size={12} /> Read-only access via Plaid · Never charged · Your credentials are never stored by PocketCache
                  </p>
                  <PrimaryButton disabled={!connected} onClick={() => setStep('payment')}>
                    {connected ? 'Continue →' : 'Select a card to continue'}
                  </PrimaryButton>
                </>
              )}

              {step === 'payment' && (
                <>
                  <PanelTitle title="How should we collect your round-ups?" sub="Once a month, your round-ups total into one clean charge  -  to the method you pick here." />
                  <button
                    onClick={() => setShowApplePay(true)}
                    data-testid="web-apple-pay-pill"
                    style={{
                      width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: '#000', color: '#fff', fontWeight: 700, fontSize: 15,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6,
                    }}
                  >
                    <AppleLogo size={16} color="#fff" /> Pay
                  </button>
                  <p style={{ margin: '0 0 16px', fontSize: 11.5, color: INK.muted, textAlign: 'center' }}>
                    Fastest on iPhone and Safari
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 14px' }}>
                    <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: INK.muted, whiteSpace: 'nowrap' }}>or choose another way to pay</span>
                    <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  </div>
                  <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                    {PAYMENT_OPTIONS.map(opt => (
                      <button key={opt.id} onClick={() => {
                        // Apple Pay always goes through the real (simulated) sheet,
                        // whether picked here or via the pill button above.
                        if (opt.id === 'apple_pay') { setShowApplePay(true); return; }
                        setPaymentSel(opt.id);
                        // Picking the card option opens the real Stripe form.
                        if (opt.id === 'card') { if (!cardInfo) setCardEntry(true); }
                        else { setCardEntry(false); }
                      }}
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
                  {/* Real card capture  -  the same Stripe Elements form the app
                      uses (Onboarding.jsx CardEntryScreen). Web used to collect
                      nothing at all here and store last4: null. */}
                  {paymentSel === 'card' && (cardEntry || !cardInfo) && (
                    <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: INK.muted }}>
                        Payment card
                      </p>
                      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: INK.secondary, lineHeight: 1.55 }}>
                        This is the card we actually charge. Stripe handles it  -  we never see the number. Round-ups collect monthly on {npShort}&apos;s behalf.
                      </p>
                      <StripeCardForm
                        variant="web"
                        submitLabel="Save card →"
                        onSuccess={card => { setCardInfo(card); setCardEntry(false); }}
                      />
                    </div>
                  )}
                  {paymentSel === 'card' && cardInfo && !cardEntry && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                      <CheckCircle size={20} color="#0D9488" />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: '#134e4a' }}>{cardInfo.brand} ····{cardInfo.last4} saved</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>Your monthly round-up charge comes from this card.</p>
                      </div>
                      <button
                        onClick={() => { setCardInfo(null); setCardEntry(true); }}
                        style={{ border: '1px solid #99f6e4', background: '#fff', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#0f766e', cursor: 'pointer' }}
                      >Change</button>
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: INK.muted, margin: '0 0 14px', textAlign: 'center' }}>
                    Change this anytime in Settings. Payments are processed by Stripe  -  not us.
                  </p>
                  {/* Quiet monthly-max opt-in  -  deliberately understated */}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                    <CapControl subtle value={monthlyCap} onChange={setMonthlyCap} />
                  </div>
                  <PrimaryButton disabled={!paymentSel || !cardReady} onClick={() => setStep('review')}>
                    {!paymentSel ? 'Choose a payment method' : !cardReady ? 'Add your card to continue' : 'Continue →'}
                  </PrimaryButton>
                  <ApplePaySheet
                    show={showApplePay}
                    payee={npShort}
                    contextLine="Charged once a month for your round-ups  -  set up now, nothing charges today."
                    onCancel={() => setShowApplePay(false)}
                    onSuccess={() => { setPaymentSel('apple_pay'); setCardEntry(false); setShowApplePay(false); }}
                    fixed
                  />
                </>
              )}

              {step === 'review' && (
                <>
                  <PanelTitle title="Review & confirm" sub={`Your round-ups are collected monthly by ${org?.name ?? 'your nonprofit'}.`} />
                  {/* Example card - an ILLUSTRATION, never the donor's own
                      total (item 11). Same framing, sample figure and
                      disclaimer as the app's confirm step. */}
                  <div style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>Here is how a month could look</p>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Example</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '3px 0' }}>
                      <span style={{ color: INK.secondary }}>Round-ups in a sample month</span>
                      <span style={{ fontWeight: 700, color: INK.primary }} data-testid="web-confirm-roundups">${fmtMoney(exampleRoundUps)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: INK.secondary }}>
                      <span>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span>
                      <span>+${fmtMoney(feeMonths)}</span>
                    </div>
                    {feeMonths > 1 && (
                      <p style={{ margin: '2px 0 0', fontSize: 11.5, color: INK.secondary }}>
                        {feeMonths - 1} month{feeMonths - 1 !== 1 ? 's' : ''} of the $1 fee rolled over from a skipped month, so {feeMonths} land on the {chargeOn} charge.
                      </p>
                    )}
                    {coverProcessing && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: INK.secondary }} data-testid="web-confirm-cover">
                        <span>Processing cover (goes to {npShort})</span>
                        <span>+${fmtMoney(processingCover)}</span>
                      </div>
                    )}
                    <div style={{ height: 1, background: '#cbd5e1', margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: INK.primary }}>One charge from {npShort}</span>
                      <span style={{ fontWeight: 800, fontSize: 18, color: NAVY }} data-testid="web-confirm-total">${fmtMoney(total)}</span>
                    </div>
                    {monthlyCap !== null && monthlyCap !== undefined && (
                      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#b45309' }} data-testid="web-confirm-cap-note">
                        Your ${monthlyCap}/month cap applies  -  round-ups above it are simply never charged.
                      </p>
                    )}
                    <p style={{ margin: '8px 0 0', fontSize: 11.5, fontStyle: 'italic', color: INK.muted }} data-testid="web-confirm-example-note">{EXAMPLE_DISCLAIMER}</p>
                  </div>

                  {/* Writes straight through to the persisted preference (the
                      AppContext setter takes a value, not an updater), so what
                      the donor leaves checked here is what every later charge
                      on BOTH surfaces bills. Settings carries the same standing
                      control if they change their mind. */}
                  <div
                    onClick={() => setCoverProcessing(!coverProcessing)}
                    data-testid="web-confirm-cover-toggle"
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
                          ? `The ~$${fmtMoney(processingCover)} in the example goes directly to ${npShort}  -  PocketCache never touches it. It counts as part of your donation and scales with your actual round-ups.`
                          : `${npShort} receives your round-ups minus standard card-processing costs, like any donation.`}
                      </span>
                    </span>
                  </div>

                  <p style={{ fontSize: 12, lineHeight: 1.6, color: INK.muted, margin: '0 0 16px' }}>
                    Once a month, {org?.name ?? 'your nonprofit'} bundles your round-ups into one charge  -  you&apos;ll see
                    &ldquo;{npShort}&rdquo; on your statement, not PocketCache, and they send your tax receipt. Months under
                    ${org?.monthlyMinimum ?? 5} roll forward (we settle up within 3 months).{' '}
                    Tracking starts now; your round-ups total through the last day of the month, we email your{' '}
                    <strong style={{ color: INK.secondary }}>exact amount on the 1st</strong>, and the{' '}
                    <strong style={{ color: INK.secondary }}>charge runs on the 11th</strong>  -  a full 10 days to review it, and nothing before today ever counts.
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
    </div>
  );
}
