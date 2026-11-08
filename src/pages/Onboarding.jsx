import { useState, useEffect, useRef, useCallback } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, ArrowRight, Lock, ArrowLeft, ChevronDown, Info,
  ScanLine, Hourglass, AlertTriangle, Coffee, ShoppingCart, Car, Landmark, CreditCard, Mail,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import bgcaLogoUrl from '../assets/bgca-logo.png';

import CoinMark from '../components/CoinMark';
import PocketCacheLogo from '../components/PocketCacheLogo';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { findOrgByCode, resolveOrgByCode, getAppleApproval, isOrgPending, ORG_PENDING_MESSAGE } from '../store/orgStore';
import {
  useNpSignup, useNpGoLive,
  NP_BRAND_COLORS, NP_LICENSE_POINTS, widgetSnippet, joinQrValue, launchKitMailto,
  APPLE_TEAM_ID, BENEVITY_PORTAL_URL,
} from '../lib/npSignup';
import { useAdminAuth, getRememberedAdminEmail, rememberAdminEmail, forgetAdminEmail } from '../lib/adminAuth';
import { orgAdminLookup, orgConnectStripe, orgConnectStatus } from '../lib/npApi';
import { loadKey, saveKey, IDENTITY_KEYS } from '../store/identityStore';
import { useDonorAuth, nativeSSOAvailable, greetingNameFor } from '../lib/donorAuth';
import { fetchRoundupsMe, pushDonorProfile } from '../lib/roundupsMe';
import { isDebitableBank } from '../lib/plaid';
import { useShowDemoAffordances } from '../lib/demo';
import BankPaymentAuth from '../components/BankPaymentAuth';
import Button from '../components/ui/Button';
import OrgLogo from '../components/OrgLogo';
import SsoButtons from '../components/SsoButtons';
import { useHeroCollapse } from '../lib/useHeroCollapse';
import { isNative, queueAppDownloadPrompt } from '../components/AppDownloadQRModal';
import { queueWebPortalPrompt } from '../components/WebPortalLinkModal';
import HeroBackButton from '../components/HeroBackButton';
import ManualCardForm from '../components/ManualCardForm';
import PlaidBankConnect from '../components/PlaidBankConnect';
import StripeCardForm from '../components/StripeCardForm';
import ApplePaySheet from '../components/ApplePaySheet';
import AppleLogo from '../components/AppleLogo';
import { CHARGE_DAY, REVIEW_WINDOW_LAST_DAY, MONTHLY_FLOOR, chargeTotal, nextChargeLabel, processingCoverFor } from '../lib/billing';
import { EXAMPLE_MONTH_ROUNDUPS, EXAMPLE_DISCLAIMER, ROLL_FORWARD_NOTE } from '../lib/donorContent';
import { Z, scrim } from '../lib/overlay';
import { safeBottomAtLeast } from '../lib/safeArea';
import { pcBeacon } from '../lib/beacon.js';
import { copyText } from '../lib/clipboard';
import { useStepHistory } from '../lib/stepHistory';
import { loadDonorDraft, saveDonorDraft, clearDonorDraft, saveDonorProgress, loadDonorProgress, WEB_STEP_TO_APP_STEP } from '../lib/donorDraft';

// ─── Shared class strings (DESIGN.md type scale) ─────────────────────────────
// 11px caps label and 13px helper copy, in --slate so both clear AA on white
// and on the --surface sheets. Kept as constants so the many labels below stay
// identical instead of drifting apart again.
const CAPS = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--slate)]';
const HELP = 'text-[13px] text-[color:var(--slate)]';
// Inputs: 48px tall, 16px text (no iOS zoom), radius 12, 1px --line border.
// Focus ring comes from the global input:focus-visible rule in index.css.
const INPUT = 'w-full bg-white rounded-xl px-4 min-h-12 text-base outline-none border border-[color:var(--line)] text-[color:var(--ink)]';
// Text-only buttons: 44px hit area without changing their visual weight.
const TEXT_BTN = 'min-h-11 px-2 text-sm font-medium text-[color:var(--slate)]';

// Every slide shares the one navy gradient (DESIGN.md: no other full-screen
// washes) - the teal wash slide 2 used to carry appeared nowhere else.
const SLIDE_BG = { background: 'linear-gradient(135deg, #003865 0%, #0B2A4A 100%)' };

const SLIDES = [
  {
    id: 0,
    bg: '',
    bgStyle: SLIDE_BG,
    illustration: null,
    // Title and subtitle are rendered dynamically from the bound nonprofit
    // (see the slide === 0 branch in Onboarding below).
    cta: 'Next',
  },
  {
    id: 1,
    bg: '',
    bgStyle: SLIDE_BG,
    illustration: (
      <div className="relative flex flex-col items-center gap-3">
        {[
          { Icon: Coffee, label: 'Coffee', amount: '$4.75', round: '+$0.25', delay: 0 },
          { Icon: ShoppingCart, label: 'Groceries', amount: '$23.40', round: '+$0.60', delay: 0.1 },
          { Icon: Car, label: 'Gas', amount: '$11.85', round: '+$0.15', delay: 0.2 },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: item.delay + 0.3, duration: 0.4 }}
            className="flex items-center gap-3 bg-white/20 rounded-2xl px-5 py-3 w-72"
          >
            <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0" aria-label={item.label} role="img">
              <item.Icon size={18} color="#fff" aria-hidden />
            </span>
            <span className="text-white font-medium flex-1">{item.amount}</span>
            <span className="text-white/90 font-bold text-sm bg-white/25 rounded-full px-3 py-1">{item.round}</span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-2 flex items-center gap-2 bg-white rounded-2xl px-6 py-3"
        >
          <span className="font-bold text-lg" style={{ color: 'var(--green)' }}>$1.00</span>
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>donated ❤️</span>
        </motion.div>
      </div>
    ),
    title: 'Spare Change\nAdds Up',
    subtitle: 'Every purchase rounds up to the next dollar. Coffee for $3.40? That 60¢ goes straight to your cause. A flat $1/month keeps the app running  -  never a percentage of what you give.',
    cta: 'Next',
  },
  {
    id: 2,
    bg: '',
    bgStyle: SLIDE_BG,
    illustration: (
      <div className="flex flex-col items-center gap-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
          className="w-36 h-36 rounded-full bg-white/20 flex items-center justify-center"
        >
          <div className="text-center">
            <div className="text-white font-bold text-4xl">$60</div>
            <div className="text-white/80 text-sm mt-1">donated</div>
          </div>
        </motion.div>
        <div className="flex gap-4 mt-2">
          {[
            { label: 'Transactions', value: '247' },
            { label: 'Avg/month', value: '$10.10' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="bg-white/20 rounded-2xl px-5 py-3 text-center"
            >
              <div className="text-white font-bold text-xl">{stat.value}</div>
              <div className="text-white/70 text-xs mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </div>
        <p className="text-white/70 text-[13px] mt-3">Example  -  your numbers grow from zero.</p>
      </div>
    ),
    title: 'Watch Your\nImpact Grow',
    subtitle: 'Every round-up adds up. Track your giving, hit milestones, and share your story with friends.',
    cta: 'Sign Up →',
  },
];

// ─── Sheet bottom air + scroll affordance ────────────────────────────────────
// Four screens below (sign-up, connect card, payment method, checkout confirm)
// scroll a sheet above a CTA footer. At rest the tail of each sheet - the
// consent copy, the Plaid disclaimer, the whole "How charges work" block - sat
// below the fold with nothing on screen to say it was there, so a quiet fade at
// the bottom edge appears whenever there is more to scroll and disappears at the
// end.
//
// What this hook deliberately does NOT do any more is reserve footer clearance.
// The footer on all four screens is a STATIC SIBLING below the scroll area in
// the same `flex flex-col h-full` column, so the scrollport already stops
// exactly where the footer starts and nothing can ever be trapped underneath it.
// Padding the sheet by the measured footer height (161px on a 393x852 iPhone)
// therefore bought no clearance at all - it just parked ~172px of empty sheet
// after the last card, which is the "large gap after How charges work" the owner
// reported. All the sheet needs is its own bottom air. If a future screen ever
// overlays its footer on the scroll area, that screen owns the clearance.

const FADE_HEIGHT = 28;

/** Air under the last card so it does not sit flush against the footer border. */
const SHEET_BOTTOM_AIR = 24;

function useSheetScroll(scrollRef) {
  const [atEnd, setAtEnd] = useState(true);

  const syncFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight <= 4);
  }, [scrollRef]);

  // Re-check after every render: these sheets grow and shrink without any scroll
  // event (manual card form, monthly-cap slider, processing-cover copy). Setting
  // the same value is a no-op in React, so this cannot loop.
  useEffect(syncFade);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, syncFade]);

  return {
    sheetPadBottom: SHEET_BOTTOM_AIR,
    showFade: !atEnd,
    syncFade,
  };
}

/**
 * Quiet "there is more below" hint for the bottom edge of a scroll area.
 * Render it as the LAST child of the scrolling div: it sticks to the bottom of
 * the scrollport, is pulled back up by its own height so it costs no layout, and
 * fades out once the user reaches the end. `rgb` is the sheet colour underneath
 * it, as an "r,g,b" triple, so the gradient dissolves into that sheet.
 *
 * The gradient alone was not enough: on the payment-method and connect-card
 * sheets the fold lands in the gap BETWEEN two cards, and a gradient over
 * uniform sheet colour is by definition invisible. Hence the small chevron,
 * which carries the signal wherever the fold happens to land. It is deliberately
 * faint (38% brand navy, 16px) and never interactive.
 */
function ScrollFadeEdge({ show, rgb }) {
  return (
    <div
      aria-hidden
      className="sticky bottom-0 pointer-events-none flex items-end justify-center"
      style={{
        height: FADE_HEIGHT,
        marginTop: -FADE_HEIGHT,
        zIndex: 5,
        opacity: show ? 1 : 0,
        transition: 'opacity 180ms ease',
        background: `linear-gradient(to bottom, rgba(${rgb},0) 0%, rgba(${rgb},0.72) 55%, rgb(${rgb}) 100%)`,
      }}
    >
      <ChevronDown size={16} color="#0B2A4A" style={{ opacity: 0.38, marginBottom: 1 }} />
    </div>
  );
}

// ─── Org Gate Screen ─────────────────────────────────────────────────────────
// Layout (per founder direction): nonprofit entry first, donor entry below.

function OrgGateScreen({ onBind, onNonprofitSignup, autoBindOrg, hasAccount, onWelcomeBack, onUniversalSignIn, showDemo, notice: noticeProp }) {
  // If a join link carried a code this device can't resolve (demo caveat:
  // custom orgs live in the creator's localStorage), prefill it in the input
  // rather than failing silently.
  const [code, setCode] = useState(() => (autoBindOrg && !findOrgByCode(autoBindOrg) ? autoBindOrg : ''));
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [autoBound, setAutoBound] = useState(false);
  const [boundNp, setBoundNp] = useState(null);
  // Inline message under the welcome-back button when a returning donor has
  // no nonprofit bound anywhere (local or server). The identity is kept; the
  // code field below is the way forward, so it gets focus.
  const [notice, setNotice] = useState(noticeProp ?? null);
  const [resuming, setResuming] = useState(false);
  const codeInputRef = useRef(null);

  const NO_BINDING_NOTICE = 'We could not find your nonprofit - enter their code below to continue.';
  // Arrived here from the gate sign-in with the same notice: focus the code
  // field so the way forward is obvious without another tap.
  useEffect(() => {
    if (noticeProp) codeInputRef.current?.focus();
  }, [noticeProp]);

  useEffect(() => {
    if (!autoBindOrg) return;
    let cancelled = false;
    let timer = null;
    resolveOrgByCode(autoBindOrg).then(np => {
      if (cancelled) return;
      if (np && isOrgPending(np)) {
        // The org exists but is still awaiting the platform owner's approval -
        // held back from donors, so a QR/link scan lands here with a message
        // instead of silently binding to a page that is not live yet.
        setCode(autoBindOrg);
        setError(ORG_PENDING_MESSAGE);
      } else if (np) {
        setAutoBound(true);
        setBoundNp(np);
        timer = setTimeout(() => onBind(np), 800);
      } else {
        setCode(autoBindOrg);
        setError('Code not found. Ask your nonprofit for their PocketCache code.');
      }
    });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBindOrg]);

  async function handleSubmit(e) {
    e.preventDefault();
    const c = code.trim();
    if (!c) { setError("Enter your nonprofit's code."); return; }
    const np = await resolveOrgByCode(c);
    if (!np) {
      setError('Code not found. Ask your nonprofit for their PocketCache code.');
      return;
    }
    if (isOrgPending(np)) {
      setError(ORG_PENDING_MESSAGE);
      return;
    }
    onBind(np);
  }

  // Welcome back: resumeSession reports 'no-binding' when neither this device
  // nor the server knows the donor's nonprofit. That used to be a silent
  // no-op (it re-set the step we were already on).
  async function handleWelcomeBack() {
    if (resuming) return;
    setResuming(true);
    const result = await onWelcomeBack?.();
    setResuming(false);
    if (result === 'no-binding') {
      setNotice(NO_BINDING_NOTICE);
      codeInputRef.current?.focus();
    }
  }

  // Demo only: a fake scan that resolves to the seed org after a short delay.
  // Hidden outside demo (showDemo) - there is no real scanner behind it.
  function handleScan() {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScanned(true);
      setCode('BGCA');
      setTimeout(() => {
        const np = findOrgByCode('BGCA');
        if (np) onBind(np);
      }, 700);
    }, 900);
  }

  if (autoBound) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full items-center justify-center gap-4 px-8"
        style={{ background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)' }}
      >
        {boundNp ? <OrgLogo nonprofit={boundNp} size={16} rounded="2xl" /> : <CoinMark size={56} />}
        <p className="text-white font-bold text-xl text-center">Setting up your program…</p>
        <p className="text-white/70 text-sm text-center">Just a moment</p>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white"
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Header  -  leads with the nonprofit pitch */}
      <div
        className="flex flex-col items-center justify-end px-8 pb-5 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: '38%', paddingTop: 'calc(var(--pc-safe-top) + 8px)' }}
      >
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 280 }}
          className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-3"
        >
          <CoinMark size={40} />
        </motion.div>
        <div className="text-center mb-3">
          <p className="text-white/80 font-semibold text-base leading-tight mb-1">Welcome to</p>
          <PocketCacheLogo size={32} onDark={true} />
        </div>
        <p className="text-white font-semibold text-sm text-center leading-relaxed mb-1 px-2">
          Your own round-up app. Live in minutes!
        </p>
        <p className="text-white/80 text-[13px] text-center leading-relaxed mb-4 px-2">
          Checkout round-ups raise hundreds of millions for causes every year  -  this puts that power in your nonprofit&apos;s pocket.
        </p>
      </div>

      {/* Bottom sheet */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-hidden">
        <div className="flex-1 px-5 pt-5 overflow-y-auto flex flex-col space-y-4">

          {/* ── FOR NONPROFITS (primary) ── */}
          <div>
            <p className={`${CAPS} mb-2`}>For Nonprofits</p>
            <Button onClick={onNonprofitSignup} className="mb-2">
              Create your nonprofit page
            </Button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[color:var(--line)]" />
            <p className={`${HELP} font-medium`}>Looking to support a nonprofit?</p>
            <div className="flex-1 h-px bg-[color:var(--line)]" />
          </div>

          {/* ── FOR DONORS (secondary) ── */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Welcome back shortcut */}
            {hasAccount && (
              <div className="mb-1">
                <motion.button
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleWelcomeBack}
                  aria-busy={resuming ? 'true' : undefined}
                  className="w-full flex items-center gap-2 px-3 min-h-12 rounded-2xl border text-left"
                  style={{ borderColor: 'var(--gold)', background: 'var(--warning-50)' }}
                >
                  <span className="text-amber-500" aria-hidden>👋</span>
                  {/* Never the guessed email-local-part name (item 7c): a real
                      stored name, else the email itself - both truthful. */}
                  <span className="text-amber-800 text-sm font-semibold flex-1 min-w-0 truncate">
                    {resuming ? 'One moment…' : <>Welcome back  -  continue as {greetingNameFor(hasAccount) ?? hasAccount.email} →</>}
                  </span>
                </motion.button>
                {notice && (
                  <p role="status" className="text-[13px] mt-2 px-1" style={{ color: 'var(--warning)' }}>{notice}</p>
                )}
              </div>
            )}
            <div>
              <label htmlFor="gate-code" className={`${CAPS} mb-1 block`}>Nonprofit Code</label>
              {/* Code input; in demo the fake QR scanner sits inside it as a trailing button */}
              <div
                className="relative w-full rounded-xl border transition-colors bg-white"
                style={{ borderColor: error ? 'var(--danger)' : scanned ? 'var(--green)' : code ? 'var(--teal-ui)' : 'var(--line)' }}
              >
                <input
                  id="gate-code"
                  ref={codeInputRef}
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Enter your nonprofit's code"
                  value={code}
                  onChange={e => { setCode(e.target.value); setError(null); }}
                  className={`w-full bg-transparent rounded-xl pl-4 ${showDemo ? 'pr-14' : 'pr-4'} min-h-12 text-base outline-none uppercase placeholder:normal-case placeholder:text-[color:var(--muted)]`}
                />
                {showDemo && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={handleScan}
                    aria-label="Scan QR code (demo)"
                    title="Scan QR code (demo)"
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg flex items-center justify-center"
                    style={{ background: scanned ? 'var(--green-50)' : 'var(--gold-50)' }}
                  >
                    {scanning ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                        className="w-4 h-4 rounded-full border-2 border-amber-200 border-t-amber-500"
                      />
                    ) : scanned ? (
                      <CheckCircle size={20} style={{ color: 'var(--green)' }} />
                    ) : (
                      <ScanLine size={20} style={{ color: 'var(--gold-700)' }} aria-hidden />
                    )}
                  </motion.button>
                )}
              </div>
              {error && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{error}</p>}
              <p className={`${HELP} mt-1 px-1`}>
                {scanned ? 'QR scanned' : <>Enter the code from your nonprofit{showDemo ? ' · Demo code: BGCA' : ''}</>}
              </p>
            </div>

            <Button
              type="submit"
              disabled={!code.trim()}
              onDisabledPress={() => setError("Enter your nonprofit's code.")}
            >
              Continue →
            </Button>
          </form>

        {/* "Already have an account?"  -  full-size, visible even without local identity (fresh device / new phone).
            Inside the scroll area (mt-auto keeps it at the bottom on tall phones) so a short
            phone like the iPhone SE scrolls the whole sheet instead of clipping Continue. */}
        <div className="mt-auto pt-2">
          <Button variant="secondary" onClick={onUniversalSignIn}>
            Already have an account? Sign in
          </Button>
        </div>

        {/* Bottom-most block on the gate, so this is the one that owes the home
            indicator its clearance. */}
        <div style={{ paddingBottom: safeBottomAtLeast(32, 12) }}>
          <p className={`text-center ${HELP}`}>
            PocketCache  -  round-up giving software for nonprofits
          </p>
        </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Native app-listing gate ──────────────────────────────────────────────────
// Shown INSTEAD of the join flow when: this is the native iPhone app, AND the
// org is not yet approved to be listed inside it (see getAppleApproval).
// Apple has no say over the web, so this screen only ever appears here - a
// browser donor following the same join link goes straight through.
function NativeAppGateScreen({ nonprofit, onBack }) {
  const code = nonprofit?.shortName || nonprofit?.id?.toUpperCase() || '';
  const webUrl = `https://pocketcache.app/${code}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full items-center justify-center gap-4 px-8 text-center"
      style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', paddingTop: 'var(--pc-safe-top)' }}
    >
      {nonprofit ? <OrgLogo nonprofit={nonprofit} size={18} rounded="2xl" /> : <CoinMark size={56} />}
      <h1 className="text-white font-bold text-2xl leading-tight" style={{ textWrap: 'balance' }}>
        {nonprofit?.name ?? 'This nonprofit'} is almost in the iPhone app
      </h1>
      <p className="text-white/80 text-sm leading-relaxed">
        Apple is still verifying {nonprofit?.name ? `${nonprofit.name}'s` : 'their'} listing before it can appear
        inside the PocketCache app. That&apos;s an app-only step  -  their giving page works today.
      </p>
      <div className="w-full bg-white/10 rounded-2xl p-4 mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/70 mb-1">Join today on the web</p>
        <p className="text-white text-sm font-mono break-all">{webUrl}</p>
      </div>
      {/* window.open kept on purpose: to be tested on TestFlight before it is
          routed through the Capacitor Browser plugin (see Stripe Connect in
          NonprofitSignupFlow for the pattern). */}
      <Button onDark onClick={() => window.open(webUrl, '_blank', 'noopener')} className="mt-1">
        Open their webpage →
      </Button>
      <Button variant="tertiary" onDark onClick={onBack} className="text-white/80">
        ← Back
      </Button>
    </motion.div>
  );
}

// ─── Nonprofit Sign-In Screen (SSO → demo BGCA or custom-org admin dashboard) ──

// ─── Sign-up screen ──────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

function SignUpScreen({ onNext, onBack, nonprofit, hasAccount, accountStatus, onGoToDashboard, onProviderChosen, onIdentityVerified, interceptBackRef }) {
  const {
    frameRef, scrollRef, heroRef, onScroll,
    heroMinHeight, heroExpandedOpacity, heroCompactOpacity, sheetMinHeight, barHeight,
  } = useHeroCollapse();
  const { sheetPadBottom, showFade, syncFade } = useSheetScroll(scrollRef);
  // A draft left by this same screen (or by WebOnboarding's 'account' step)
  // earlier in this tab - see src/lib/donorDraft.js. Only the plain typed
  // fields below are restored; a code mid-verification is never kept (see
  // displayName's own note further down).
  const [draft] = useState(loadDonorDraft);
  const [chosen, setChosen] = useState(null);
  const [agreedTerms, setAgreedTerms] = useState(() => draft?.agreedTerms ?? false);
  const [commsOptin, setCommsOptin] = useState(() => draft?.commsOptin ?? true);
  const [selectedState, setSelectedState] = useState(() => draft?.selectedState ?? '');
  // "What should we call you?" (round-3 item 7c) - greetings use THIS, never
  // the email local part. Optional; skipping it just means the one-time
  // dashboard prompt asks later.
  const [displayName, setDisplayName] = useState(() => draft?.displayName ?? '');
  const [showTermsHint, setShowTermsHint] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const isCA = selectedState === 'CA';
  // The full gate (owner punch-list item 4): BOTH checkboxes AND a state
  // selection before "Email me a code" or any SSO button does anything.
  const canContinue = agreedTerms && commsOptin && selectedState !== '' && !isCA;
  // "Code sent" feedback for the Resend code buttons below - both forms on
  // this screen share the one donorAuth instance/stage, so one flag covers
  // whichever form is actually mounted. Auto-clears; donorAuth.sendingCode
  // (loading) and donorAuth.sendError (failure, incl. rate-limit) already
  // come from the shared hook - see src/lib/donorAuth.js.
  const [justResent, setJustResent] = useState(false);
  async function handleResend(addr, opts) {
    const ok = await donorAuth.sendCode(addr, opts);
    if (ok) {
      setJustResent(true);
      setTimeout(() => setJustResent(false), 3000);
    }
  }

  const npName = nonprofit?.name ?? 'your nonprofit';

  // Real donor sign-in (email code, plus Apple/Google once configured) - see
  // src/lib/donorAuth.js for the shared logic behind both signup surfaces.
  const donorAuth = useDonorAuth({ resumeKey: 'app' });
  const [emailInput, setEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState(null);

  // Persist the typed-in fields to the shared draft on every meaningful
  // change, so the mobile/desktop breakpoint remount (see
  // src/lib/donorDraft.js) can restore them on the other surface's mount.
  // step: 'account' is this screen's half of the mapping the outer
  // Onboarding() component reads back in (WEB_STEP_TO_APP_STEP).
  useEffect(() => {
    saveDonorDraft({ step: 'account', selectedState, agreedTerms, commsOptin, displayName });
  }, [selectedState, agreedTerms, commsOptin, displayName]);
  // "Already have an account? Sign in" (below): a real email/OTP sign-in,
  // independent of the terms/state gate above it - a returning donor is not
  // making a new round-up commitment, so they should not have to re-agree to
  // terms or re-pick a state just to sign back in.
  const [signInMode, setSignInMode] = useState(false);
  const [signInEmail, setSignInEmail] = useState(() => hasAccount?.email || '');
  const [signInEmailError, setSignInEmailError] = useState(null);

  function handleSignIn() {
    if (!hasAccount) return;
    if (accountStatus === 'cancelled') { onGoToDashboard?.(); return; }
    setWelcomeBack(true);
    setTimeout(() => onGoToDashboard?.(), 900);
  }

  // Writes pc_identity the same way for every sign-in path, then continues
  // the existing flow exactly as it already proceeded after signup. The
  // typed "What should we call you?" answer (item 7c) beats any guessed
  // name; AppContext's profile sync pushes it server-side once the account
  // adopts.
  function finishSignup(identity) {
    const named = displayName.trim()
      ? { ...identity, name: displayName.trim().slice(0, 60), nameGuessed: false }
      : identity;
    saveKey(IDENTITY_KEYS.identity, named);
    onIdentityVerified?.(named);
    onProviderChosen?.(named.provider);
    saveKey('pc_comms_optin', commsOptin);
    // Session exists from this moment - mirror the binding and typed name
    // server-side now (item 4/7c), same as WebOnboarding's finishSignup.
    pushDonorProfile({
      ...(nonprofit ? { org_join_code: (nonprofit.shortName || nonprofit.id || '').toUpperCase() } : {}),
      ...(displayName.trim() ? { display_name: displayName.trim().slice(0, 60) } : {}),
    });
    setChosen(named.provider);
    setTimeout(() => onNext(), 500);
  }

  // Same identity write as finishSignup (see above) - a real sign-in just
  // routes to the donor's existing dashboard instead of continuing the
  // signup wizard (connect card / payment method / checkout), since the
  // account, card, and payment method already exist server-side.
  function finishSignIn(identity) {
    saveKey(IDENTITY_KEYS.identity, identity);
    onIdentityVerified?.(identity);
    onProviderChosen?.(identity.provider);
    setTimeout(() => onGoToDashboard?.(), 500);
  }

  function handleSendSignInCode(e) {
    e?.preventDefault?.();
    const addr = signInEmail.trim();
    if (!addr.includes('@') || !addr.split('@')[1]?.includes('.')) {
      setSignInEmailError('Enter a valid email address.');
      return;
    }
    setSignInEmailError(null);
    // shouldCreateUser: false - this is a SIGN-IN, not a signup. An unknown
    // or mistyped email should say so, not quietly create a new donor.
    donorAuth.sendCode(addr, { shouldCreateUser: false });
  }

  async function handleVerifySignInCode(e) {
    e?.preventDefault?.();
    const identity = await donorAuth.verifyCode(donorAuth.codeInput);
    if (identity) finishSignIn(identity);
  }

  function exitSignInMode() {
    setSignInMode(false);
    setSignInEmailError(null);
    donorAuth.resetToEmail();
  }

  // Back (hero chevron or hardware/browser back) steps INSIDE this screen
  // first: out of sign-in mode, or from the code stage back to the email
  // stage. Only when there is nothing left to unwind does the parent fall
  // back to the intro slides. The parent calls this through interceptBackRef
  // and treats `true` as "handled". The draft is never cleared here.
  function interceptBack() {
    if (signInMode) { exitSignInMode(); return true; }
    if (donorAuth.stage === 'code') { donorAuth.resetToEmail(); return true; }
    return false;
  }
  useEffect(() => {
    if (!interceptBackRef) return;
    interceptBackRef.current = interceptBack;
    return () => { interceptBackRef.current = null; };
  });
  function handleBack() {
    if (interceptBack()) return;
    onBack?.();
  }

  function handleSendCode(e) {
    e?.preventDefault?.();
    if (hasAccount) return handleSignIn();
    if (!canContinue) { setShowTermsHint(true); return; }
    const addr = emailInput.trim();
    if (!addr.includes('@') || !addr.split('@')[1]?.includes('.')) {
      setEmailInputError('Enter a valid email address.');
      return;
    }
    setEmailInputError(null);
    donorAuth.sendCode(addr);
  }

  // A successful verify advances IMMEDIATELY (owner punch-list item 4): no
  // confirm-your-name stop, no re-showing of SSO buttons - the account
  // exists, so the flow moves straight to the next step. The display name
  // starts as the friendly guess from the email (nameFromEmail) and can be
  // edited later in Settings.
  async function handleVerifyCode(e) {
    e?.preventDefault?.();
    const identity = await donorAuth.verifyCode(donorAuth.codeInput);
    if (identity) finishSignup(identity);
  }

  // Signed-in users BYPASS this screen entirely (item 4): a live Supabase
  // session found on mount - including the SSO redirect return trip - adopts
  // the identity and advances automatically. No "Continue as {email}" button
  // exists any more, so a long address can never wrap one. `hasAccount`
  // (app-level identity already adopted) routes to the dashboard instead,
  // through the same welcome-back overlay the old tap produced.
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (autoAdvanced || signInMode) return;
    if (hasAccount) { setAutoAdvanced(true); handleSignIn(); return; }
    if (donorAuth.checkingSession || !donorAuth.existingSession) return;
    setAutoAdvanced(true);
    finishSignup(donorAuth.existingSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donorAuth.checkingSession, donorAuth.existingSession, hasAccount, autoAdvanced]);

  async function handleSSO(provider) {
    if (hasAccount) return handleSignIn();
    if (!canContinue) { setShowTermsHint(true); return; }
    if (chosen) return; // prevent double-tap while a native sheet is up
    setChosen(provider);
    // Native (new shells): resolves with the identity once the in-app
    // browser round trip completes - adopt it exactly like an email verify.
    // Web: navigates the whole page away on success, so anything after this
    // line only runs on failure or when the donor closed the native sheet.
    const identity = await donorAuth.startOAuth(provider);
    if (identity) return finishSignup(identity);
    setChosen(null);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      ref={frameRef}
      className="flex flex-col h-full overflow-hidden"
    >
      <div ref={scrollRef} onScroll={e => { onScroll(e); syncFade(); }} className="flex-1 overflow-y-auto relative">
        {/* Overscroll bleed  -  rubber-banding at the top shows hero color, not white */}
        <div className="absolute inset-x-0 pointer-events-none" style={{ top: -500, height: 500, background: '#003865' }} />
        {/* Compact bar  -  docked at the top, fades in as the hero scrolls away */}
        <div
          className="sticky top-0 z-10 flex items-center justify-center pointer-events-none"
          style={{
            height: barHeight,
            marginBottom: -barHeight,
            opacity: heroCompactOpacity,
            background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)',
          }}
        >
          <span className="text-white font-bold text-sm px-6 truncate max-w-full">{signInMode ? 'Welcome back' : 'Create Your Account'}</span>
        </div>
        {/* Hero  -  scrolls away 1:1 with the sheet, like native */}
        <div
          ref={heroRef}
          className="flex flex-col items-center justify-end px-8 pb-8"
          style={{ background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)', minHeight: heroMinHeight ?? '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)', position: 'relative' }}
        >
        <HeroBackButton onClick={handleBack} />
        {/* Expanded content */}
        <div
          className="w-full flex flex-col items-center"
          style={{ opacity: heroExpandedOpacity }}
        >
          <motion.div className="mb-3 flex flex-col items-center gap-2">
            {nonprofit
              ? <OrgLogo nonprofit={nonprofit} size={14} rounded="2xl" className="bg-white/20" />
              : <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center"><CoinMark size={40} /></div>
            }
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white/20 rounded-xl px-3 py-2"
            >
              <p className="text-white text-xs font-semibold text-center">
                Supporting {npName}
              </p>
            </motion.div>
          </motion.div>
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px', textWrap: 'balance' }}>
            {signInMode ? 'Welcome back' : <>Create Your{'\n'}Account</>}
          </h1>
          <p className="text-white/80 text-[13px] mt-1 text-center">
            {signInMode ? 'Sign in with your email' : 'Sign up in seconds. No payment required yet.'}
          </p>
        </div>
      </div>

      {/* Bottom sheet */}
        <div className="bg-white rounded-t-3xl -mt-4" style={{ minHeight: sheetMinHeight }}>
          <div className="px-4 pt-10 space-y-3" style={{ paddingBottom: sheetPadBottom }}>

          {/* State selector - a signup question, so hidden in sign-in mode */}
          {!signInMode && (
            <div>
              <label htmlFor="signup-state" className={`${CAPS} px-1 mb-1 block`}>Your State</label>
              <div className="relative">
                <select
                  id="signup-state"
                  value={selectedState}
                  onChange={e => setSelectedState(e.target.value)}
                  className={`${INPUT} pr-10`}
                  style={{ appearance: 'none', WebkitAppearance: 'none' }}
                >
                  <option value="">Select your state…</option>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--slate)' }} />
              </div>
            </div>
          )}

          {/* Signed-in users never see this section again: the auto-advance
              effect above adopts a live session and moves on, so there is no
              "Continue as {email}" button here any more (item 4). While the
              session check is in flight, a quiet placeholder holds the space
              so the SSO buttons cannot flash before a bypass. */}
          {!signInMode && (donorAuth.checkingSession || autoAdvanced ? (
            <div className="flex items-center justify-center py-8" data-testid="signup-session-check">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-gray-500"
              />
            </div>
          ) : donorAuth.stage === 'code' ? (
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <p className="text-sm px-1" style={{ color: 'var(--ink-2)' }}>
                We sent a 6-digit code to <strong style={{ color: 'var(--ink)' }}>{donorAuth.email}</strong>.
              </p>
              <input
                type="text" inputMode="numeric" maxLength={6} value={donorAuth.codeInput}
                aria-label="6-digit code" autoComplete="one-time-code"
                onChange={e => donorAuth.setCodeInput(e.target.value.replace(/\D/g, ''))}
                className={`${INPUT} font-mono text-center text-xl tracking-[0.5em]`}
                style={{ borderColor: donorAuth.codeError ? 'var(--danger)' : 'var(--line)' }}
              />
              {donorAuth.codeError && <p role="alert" className="text-[13px] px-1" style={{ color: 'var(--danger)' }}>{donorAuth.codeError}</p>}
              <Button type="submit" disabled={donorAuth.codeInput.length !== 6} loading={donorAuth.verifying}>
                {donorAuth.verifying ? 'Checking…' : 'Verify code →'}
              </Button>
              <div className="flex justify-center gap-4 -my-2">
                <button type="button" disabled={donorAuth.sendingCode}
                  onClick={() => handleResend(donorAuth.email)}
                  className={`${TEXT_BTN} disabled:opacity-50`}>
                  {donorAuth.sendingCode ? 'Sending…' : justResent ? 'Code sent' : 'Resend code'}
                </button>
                <button type="button" onClick={donorAuth.resetToEmail} className={TEXT_BTN}>Change email</button>
              </div>
              {donorAuth.sendError && <p role="alert" className="text-[13px] px-1 text-center" style={{ color: 'var(--danger)' }}>{donorAuth.sendError}</p>}
            </form>
          ) : (
            <>
              <form onSubmit={handleSendCode} className="space-y-2">
                {/* Name first (item 7c): greetings use this, never the email
                    local part - an Apple relay address must not become
                    "Hello safjbdwkfbd". Optional on purpose. */}
                <div>
                  <label htmlFor="signup-name" className={`${CAPS} mb-1 block`}>What should we call you?</label>
                  <input
                    id="signup-name"
                    type="text"
                    value={displayName}
                    maxLength={60}
                    autoComplete="given-name"
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your first name (optional)"
                    data-testid="signup-name-input"
                    className={`${INPUT} placeholder:text-[color:var(--muted)]`}
                  />
                </div>
                <div>
                  <label htmlFor="signup-email" className={`${CAPS} mb-1 block`}>Your Email</label>
                  <input
                    id="signup-email"
                    type="email"
                    value={emailInput}
                    autoComplete="email"
                    onChange={e => { setEmailInput(e.target.value); setEmailInputError(null); }}
                    placeholder="you@example.com"
                    className={`${INPUT} placeholder:text-[color:var(--muted)]`}
                    style={{ borderColor: emailInputError || donorAuth.sendError ? 'var(--danger)' : 'var(--line)' }}
                  />
                  {emailInputError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{emailInputError}</p>}
                  {donorAuth.sendError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{donorAuth.sendError}</p>}
                </div>
                {/* Disabled (one token, aria-disabled) until the state + both
                    consent boxes below are done (item 4); tapping it early
                    surfaces the hint right here, under the button. */}
                <Button type="submit"
                  data-testid="signup-email-code-button"
                  disabled={!canContinue}
                  loading={donorAuth.sendingCode}
                  onDisabledPress={() => { if (!canContinue) setShowTermsHint(true); }}>
                  {donorAuth.sendingCode ? 'Sending…' : 'Email me a code →'}
                </Button>
                {/* What still gates the button (item 4): state first, then
                    whichever box is still unchecked. Always on while gated;
                    turns amber after an early tap. */}
                {!canContinue && !isCA && (
                  <p
                    className="text-[13px] text-center"
                    data-testid="signup-gate-hint"
                    style={{ color: showTermsHint ? 'var(--warning)' : 'var(--slate)', fontWeight: showTermsHint ? 500 : 400 }}
                  >
                    {selectedState === ''
                      ? 'Select your state above to continue'
                      : 'Check both boxes below to continue'}
                  </p>
                )}
              </form>

              {/* SSO shows on the web AND on native shells that can run the
                  in-app OAuth flow (Browser + App plugins present - see
                  nativeSSOAvailable in lib/donorAuth.js; the plugin check IS
                  the shell-version gate). Old shells, where the OAuth hop
                  would bounce to external Safari and strand the donor there,
                  keep email code only. */}
              {(!isNative() || nativeSSOAvailable()) && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-[color:var(--line)]" />
                    <p className={`${HELP} font-medium`}>or</p>
                    <div className="flex-1 h-px bg-[color:var(--line)]" />
                  </div>

                  <SsoButtons onPress={handleSSO} chosen={chosen} disabled={!canContinue} errors={donorAuth.oauthErrors} />
                </>
              )}

              <p className={`${HELP} text-center px-2 pt-1`}>
                {isNative() && !nativeSSOAvailable()
                  ? "Sign in with your email  -  we'll send you a 6-digit code, no password needed."
                  : "No passwords here  -  we'll email you a one-time code, or use Apple or Google."}
              </p>
              <p className={`${HELP} text-center px-2`}>
                Tax receipts from {nonprofit?.shortName ?? 'your nonprofit'} go to your sign-in email.
              </p>
            </>
          ))}

          {/* Already have an account? - real email/OTP sign-in, not gated on
              terms/state above (see signInMode state + finishSignIn). */}
          {signInMode ? (
            <div className="space-y-3 pt-1">
              {donorAuth.stage === 'code' ? (
                <form onSubmit={handleVerifySignInCode} className="space-y-3">
                  <p className="text-sm px-1" style={{ color: 'var(--ink-2)' }}>
                    We sent a 6-digit code to <strong style={{ color: 'var(--ink)' }}>{donorAuth.email}</strong>.
                  </p>
                  <input
                    type="text" inputMode="numeric" maxLength={6} value={donorAuth.codeInput}
                    aria-label="6-digit code" autoComplete="one-time-code"
                    onChange={e => donorAuth.setCodeInput(e.target.value.replace(/\D/g, ''))}
                    className={`${INPUT} font-mono text-center text-xl tracking-[0.5em]`}
                    style={{ borderColor: donorAuth.codeError ? 'var(--danger)' : 'var(--line)' }}
                  />
                  {donorAuth.codeError && <p role="alert" className="text-[13px] px-1" style={{ color: 'var(--danger)' }}>{donorAuth.codeError}</p>}
                  <Button type="submit" disabled={donorAuth.codeInput.length !== 6} loading={donorAuth.verifying}>
                    {donorAuth.verifying ? 'Checking…' : 'Verify code →'}
                  </Button>
                  <div className="flex justify-center gap-4 -my-2">
                    <button type="button" disabled={donorAuth.sendingCode}
                      onClick={() => handleResend(donorAuth.email, { shouldCreateUser: false })}
                      className={`${TEXT_BTN} disabled:opacity-50`}>
                      {donorAuth.sendingCode ? 'Sending…' : justResent ? 'Code sent' : 'Resend code'}
                    </button>
                    <button type="button" onClick={() => donorAuth.resetToEmail()} className={TEXT_BTN}>Change email</button>
                  </div>
                  {donorAuth.sendError && <p role="alert" className="text-[13px] px-1 text-center" style={{ color: 'var(--danger)' }}>{donorAuth.sendError}</p>}
                </form>
              ) : (
                <form onSubmit={handleSendSignInCode} className="space-y-2">
                  <div>
                    <label htmlFor="signin-email" className={`${CAPS} mb-1 block`}>Your Email</label>
                    <input
                      id="signin-email"
                      type="email"
                      value={signInEmail}
                      autoComplete="email"
                      onChange={e => { setSignInEmail(e.target.value); setSignInEmailError(null); }}
                      placeholder="you@example.com"
                      className={`${INPUT} placeholder:text-[color:var(--muted)]`}
                      style={{ borderColor: signInEmailError || donorAuth.sendError ? 'var(--danger)' : 'var(--line)' }}
                    />
                    {signInEmailError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{signInEmailError}</p>}
                    {donorAuth.sendError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{donorAuth.sendError}</p>}
                  </div>
                  <Button type="submit" disabled={!signInEmail.trim()} loading={donorAuth.sendingCode}>
                    {donorAuth.sendingCode ? 'Sending…' : 'Email me a sign-in code →'}
                  </Button>
                </form>
              )}
              <Button variant="tertiary" size="md" onClick={exitSignInMode}>
                ← Back
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setSignInMode(true)}
              className="w-full text-center min-h-11 py-2"
            >
              <span className="text-sm" style={{ color: 'var(--slate)' }}>Already have an account? </span>
              <span className="text-sm font-semibold underline" style={{ color: 'var(--navy-deep)' }}>Sign in</span>
            </button>
          )}
          </div>
        </div>
        <ScrollFadeEdge show={showFade} rgb="255,255,255" />
      </div>

      {/* CA Block overlay  -  a compliance gate, so it stays near-opaque: the
          signup form must not be legible through it (see lib/overlay.js). */}
      <AnimatePresence>
        {isCA && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center px-8"
            style={{ ...scrim('opaque'), zIndex: Z.blockingScrim }}
          >
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4"><Info size={32} color="#fff" aria-hidden /></div>
              <h2 className="text-white font-bold text-xl mb-3" style={{ textWrap: 'balance' }}>Not Available in California Yet</h2>
              <p className="text-white/80 text-sm leading-relaxed mb-6">
                PocketCache isn&apos;t available in California yet. We&apos;re working on it! Ask your nonprofit for updates.
              </p>
              <Button variant="secondary" size="md" fullWidth={false} onClick={() => setSelectedState('')} className="px-6">
                ← Go Back
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Consent checkboxes  -  pinned below the scroll area. Signup only: a
          returning donor signing in is not making a new commitment (see
          signInMode). Both boxes stay REQUIRED (owner decision). A visually
          hidden native checkbox inside each label does the toggling, so the
          label, keyboard and screen readers all agree on the state. */}
      {!signInMode && (
      <div className="bg-white px-5 pt-3 space-y-2" style={{ paddingBottom: safeBottomAtLeast(32, 12) }}>
          <label
            className="flex items-start gap-3 cursor-pointer min-h-11 rounded-lg"
            style={showTermsHint && !agreedTerms ? { outline: '2px solid var(--warning)', outlineOffset: 2 } : {}}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={agreedTerms}
              onChange={e => { setAgreedTerms(e.target.checked); setShowTermsHint(false); }}
              data-testid="signup-terms-checkbox"
            />
            <div
              aria-hidden="true"
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all peer-focus-visible:ring-[3px] peer-focus-visible:ring-[color:rgba(13,148,136,0.35)]"
              style={{ borderColor: agreedTerms ? 'var(--navy-deep)' : 'var(--muted)', background: agreedTerms ? 'var(--navy-deep)' : '#fff' }}
            >
              {agreedTerms && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              I am at least 18 years old and agree to the{' '}
              <a href="/legal/terms/" target="_blank" rel="noopener" className="font-semibold underline" style={{ color: 'var(--navy-deep)' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/legal/privacy/" target="_blank" rel="noopener" className="font-semibold underline" style={{ color: 'var(--navy-deep)' }}>Privacy Policy</a>.
            </span>
          </label>
          <label
            className="flex items-start gap-3 cursor-pointer min-h-11 rounded-lg"
            style={showTermsHint && !commsOptin ? { outline: '2px solid var(--warning)', outlineOffset: 2 } : {}}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={commsOptin}
              onChange={e => { setCommsOptin(e.target.checked); setShowTermsHint(false); }}
              data-testid="signup-comms-checkbox"
            />
            <div
              aria-hidden="true"
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all peer-focus-visible:ring-[3px] peer-focus-visible:ring-[color:rgba(13,148,136,0.35)]"
              style={{ borderColor: commsOptin ? 'var(--navy-deep)' : 'var(--muted)', background: commsOptin ? 'var(--navy-deep)' : '#fff' }}
            >
              {commsOptin && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {/* Tokenized to the joined nonprofit's FULL name (item 9a) -
                  never a hardcoded org, and a graceful fallback before one
                  is bound. */}
              PocketCache and {nonprofit?.name ?? 'your chosen nonprofit partner'} may contact me with account and giving updates  -  details in our{' '}
              <a href="/legal/terms/#communications" target="_blank" rel="noopener" className="font-semibold underline" style={{ color: 'var(--navy-deep)' }}>Terms</a>.
            </span>
          </label>
      </div>
      )}
      {/* Welcome back overlay */}
      <AnimatePresence>
        {welcomeBack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center gap-4 px-8"
            style={{ ...scrim('opaque'), zIndex: Z.blocking }}
          >
            <div className="text-5xl" aria-hidden>👋</div>
            <p className="text-white font-bold text-2xl text-center" style={{ textWrap: 'balance' }}>Welcome back{greetingNameFor(hasAccount) ? `, ${greetingNameFor(hasAccount)}` : ''}!</p>
            <p className="text-white/80 text-sm text-center">Taking you to your dashboard…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Admin Sign-In (passwordless: work email + one-time code) ────────────────
// The admin username is the org-domain email verified at signup. No password
// exists  -  a fresh code is emailed per sign-in. Demo: any email works and the
// code auto-fills (labeled); production emails it and enforces the domain.

function AdminSignInScreen({ onBack, onComplete }) {
  const auth = useAdminAuth();
  const [email, setEmail] = useState(getRememberedAdminEmail);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [resolving, setResolving] = useState(false);
  // "Code sent" feedback for the Resend code button below - auto-clears.
  // Loading (auth.sendingCode) and failure incl. rate-limit (`error`, set
  // below) already come from the shared send() handler / useAdminAuth hook.
  const [justResent, setJustResent] = useState(false);
  const remembered = !!getRememberedAdminEmail();

  async function send(e) {
    e?.preventDefault?.();
    const wasAlreadySent = sent; // true only when this call is a RESEND
    const result = await auth.sendCode(email);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setCodeInput('');
    setCodeError(null);
    setSent(true);
    if (wasAlreadySent) {
      setJustResent(true);
      setTimeout(() => setJustResent(false), 3000);
    }
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
    // onComplete adopts the server org (NpContext.adoptServerOrg) and routes
    // to the dashboard.
    onComplete(verified.email, lookup.data.org);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div
        className="flex flex-col justify-end px-8 pb-8 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onBack} className="text-white/80 text-sm font-semibold mb-2 -ml-2 px-2 min-h-11 self-start flex items-center gap-1">
          <ArrowLeft size={16} aria-hidden /> Back
        </motion.button>
        <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
          Nonprofit{'\n'}Admin
        </h1>
        <p className="text-white/80 text-[13px] mt-2 leading-relaxed">
          Sign in with your organization&apos;s work email. No password  -  we email you a fresh code each time.
        </p>
      </div>
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-6 pt-6 pb-10">
        {!sent ? (
          <form onSubmit={send} className="space-y-3">
            <label htmlFor="admin-email" className={`${CAPS} block`}>Work email</label>
            <input
              id="admin-email"
              type="email" required value={email} autoComplete="email"
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="you@yourorg.org"
              className={`${INPUT} placeholder:text-[color:var(--muted)]`}
              style={{ borderColor: error ? 'var(--danger)' : 'var(--line)' }}
            />
            {remembered && (
              <button type="button" onClick={notYou} className={`${TEXT_BTN} underline -my-2`}>Not you?</button>
            )}
            {error && <p role="alert" className="text-[13px] px-1" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" disabled={!email} loading={auth.sendingCode}>
              {auth.sendingCode ? 'Sending…' : 'Email me a sign-in code →'}
            </Button>
            <p className={`${HELP} leading-relaxed px-1`}>
              Your admin sign-in is the work email verified when your page was created.
              Nothing to remember, nothing to steal.
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              We sent a 6-digit code to <strong style={{ color: 'var(--ink)' }}>{email}</strong>. Enter it to continue.
            </p>
            <input
              type="text" inputMode="numeric" maxLength={6} value={codeInput}
              aria-label="6-digit code" autoComplete="one-time-code"
              onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setCodeError(null); }}
              className={`${INPUT} font-mono text-center text-xl tracking-[0.5em]`}
              style={{ borderColor: codeError ? 'var(--danger)' : 'var(--line)' }}
            />
            {codeError && <p role="alert" className="text-[13px] px-1" style={{ color: 'var(--danger)' }}>{codeError}</p>}
            <Button type="submit" disabled={codeInput.length !== 6} loading={auth.verifying || resolving}>
              {auth.verifying || resolving ? 'Signing in…' : 'Sign in →'}
            </Button>
            <div className="flex justify-center gap-4 -my-2">
              <button type="button" disabled={auth.sendingCode} onClick={send}
                className={`${TEXT_BTN} disabled:opacity-50`}>
                {auth.sendingCode ? 'Sending…' : justResent ? 'Code sent' : 'Resend code'}
              </button>
              <button type="button" onClick={() => { setSent(false); setCodeInput(''); setCodeError(null); }} className={TEXT_BTN}>Change email</button>
            </div>
            {error && <p role="alert" className="text-[13px] px-1 text-center" style={{ color: 'var(--danger)' }}>{error}</p>}
          </form>
        )}
      </div>
    </motion.div>
  );
}

// ─── Gate Sign-In Screen (universal "already have an account?" path) ─────────
// Shown when a returning user taps "Already have an account? Sign in" from the
// gate. Real Supabase sign-in, shared with SignUpScreen via useDonorAuth:
//   • Email code (primary, works everywhere - no redirect hop).
//   • Apple / Google: web, plus native shells that can run the in-app OAuth
//     flow (see nativeSSOAvailable in lib/donorAuth.js). Old shells hide
//     these - their OAuth redirect would leave the app.
//   • A live Supabase session already on this device surfaces as "Continue as".
// On success: onIdentityVerified adopts the identity (pc_identity + app-level
// hasAccount), then onSignIn() routes by role - donor-only → giving,
// admin-only → dashboard, both → last-used mode.
function GateSignInScreen({ onBack, onSignIn, onIdentityVerified, onDemoAdmin, onAdminSignIn, showDemo }) {
  const donorAuth = useDonorAuth({ resumeKey: 'app' });
  const [chosen, setChosen] = useState(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  // "Code sent" feedback for the Resend code button below - auto-clears.
  const [justResent, setJustResent] = useState(false);
  // Set when the sign-in succeeded but no nonprofit is bound anywhere for
  // this donor (onSignIn resolved 'no-binding'): the parent moves back to the
  // gate with the same notice, so this just stops the screen looking stuck.
  const [notice, setNotice] = useState(null);
  async function handleResend(addr, opts) {
    const ok = await donorAuth.sendCode(addr, opts);
    if (ok) {
      setJustResent(true);
      setTimeout(() => setJustResent(false), 3000);
    }
  }

  function finishSignIn(identity) {
    onIdentityVerified?.(identity);
    setTimeout(async () => {
      const result = await onSignIn?.();
      if (result === 'no-binding') setNotice('Signed in - we could not find your nonprofit yet. Enter their code to continue.');
    }, 500);
  }

  function handleSendCode(e) {
    e?.preventDefault?.();
    const addr = email.trim();
    if (!addr.includes('@') || !addr.split('@')[1]?.includes('.')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    // shouldCreateUser: false - this is a sign-in door, not a signup form.
    donorAuth.sendCode(addr, { shouldCreateUser: false });
  }

  async function handleVerifyCode(e) {
    e?.preventDefault?.();
    const identity = await donorAuth.verifyCode(donorAuth.codeInput);
    if (identity) finishSignIn(identity);
  }

  async function handleSSO(provider) {
    if (chosen) return; // prevent double-tap
    setChosen(provider);
    // Native (new shells): resolves with the identity once the in-app
    // browser round trip completes - a real sign-in, route to the dashboard.
    // Web: navigates the whole page away on success, so anything after this
    // line only runs on failure or when the donor closed the native sheet.
    const identity = await donorAuth.startOAuth(provider);
    if (identity) return finishSignIn(identity);
    setChosen(null);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div
        className="flex flex-col justify-end px-8 pb-8 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onBack} className="text-white/80 text-sm font-semibold mb-2 -ml-2 px-2 min-h-11 self-start flex items-center gap-1">
          <ArrowLeft size={16} aria-hidden /> Back
        </motion.button>
        <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
          Welcome{'\n'}Back
        </h1>
        <p className="text-white/80 text-[13px] mt-2 leading-relaxed">
          Sign in with the account you used before.
        </p>
      </div>
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-6 pt-6 pb-10 gap-4">
        {!donorAuth.checkingSession && donorAuth.existingSession && (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => finishSignIn(donorAuth.existingSession)}
            className="w-full flex items-center gap-2 px-3 min-h-12 rounded-2xl border text-left"
            style={{ borderColor: 'var(--gold)', background: 'var(--warning-50)' }}
          >
            <span className="text-amber-500" aria-hidden>👋</span>
            {/* truncate: a long email must never wrap this button onto three
                awkward lines - the middle of the address is the part that can
                go missing without losing meaning. */}
            <span className="text-amber-800 text-sm font-semibold flex-1 min-w-0 truncate">
              Continue as {donorAuth.existingSession.email} →
            </span>
          </motion.button>
        )}
        {notice && (
          <p role="status" className="text-[13px] px-1 -mt-2" style={{ color: 'var(--warning)' }}>{notice}</p>
        )}

        {donorAuth.stage === 'code' ? (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <p className="text-sm px-1" style={{ color: 'var(--ink-2)' }}>
              We sent a 6-digit code to <strong style={{ color: 'var(--ink)' }}>{donorAuth.email}</strong>.
            </p>
            <input
              type="text" inputMode="numeric" maxLength={6} value={donorAuth.codeInput}
              aria-label="6-digit code" autoComplete="one-time-code"
              onChange={e => donorAuth.setCodeInput(e.target.value.replace(/\D/g, ''))}
              className={`${INPUT} font-mono text-center text-xl tracking-[0.5em]`}
              style={{ borderColor: donorAuth.codeError ? 'var(--danger)' : 'var(--line)' }}
            />
            {donorAuth.codeError && <p role="alert" className="text-[13px] px-1" style={{ color: 'var(--danger)' }}>{donorAuth.codeError}</p>}
            <Button type="submit" disabled={donorAuth.codeInput.length !== 6} loading={donorAuth.verifying}>
              {donorAuth.verifying ? 'Checking…' : 'Verify code →'}
            </Button>
            <div className="flex justify-center gap-4 -my-2">
              <button type="button" disabled={donorAuth.sendingCode}
                onClick={() => handleResend(donorAuth.email, { shouldCreateUser: false })}
                className={`${TEXT_BTN} disabled:opacity-50`}>
                {donorAuth.sendingCode ? 'Sending…' : justResent ? 'Code sent' : 'Resend code'}
              </button>
              <button type="button" onClick={() => donorAuth.resetToEmail()} className={TEXT_BTN}>Change email</button>
            </div>
            {donorAuth.sendError && <p role="alert" className="text-[13px] px-1 text-center" style={{ color: 'var(--danger)' }}>{donorAuth.sendError}</p>}
          </form>
        ) : (
          <form onSubmit={handleSendCode} className="space-y-2">
            <div>
              <label htmlFor="gate-signin-email" className={`${CAPS} mb-1 block`}>Your Email</label>
              <input
                id="gate-signin-email"
                type="email"
                value={email}
                autoComplete="email"
                onChange={e => { setEmail(e.target.value); setEmailError(null); }}
                placeholder="you@example.com"
                className={`${INPUT} placeholder:text-[color:var(--muted)]`}
                style={{ borderColor: emailError || donorAuth.sendError ? 'var(--danger)' : 'var(--line)' }}
              />
              {emailError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{emailError}</p>}
              {donorAuth.sendError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{donorAuth.sendError}</p>}
            </div>
            <Button type="submit" disabled={!email.trim()} loading={donorAuth.sendingCode}>
              {donorAuth.sendingCode ? 'Sending…' : 'Email me a code →'}
            </Button>
          </form>
        )}

        {/* Same SSO rule as SignUpScreen: web always, native only when the
            shell can run the in-app OAuth flow (see nativeSSOAvailable). */}
        {(!isNative() || nativeSSOAvailable()) && (
          <>
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-[color:var(--line)]" />
              <p className={`${HELP} font-medium`}>or</p>
              <div className="flex-1 h-px bg-[color:var(--line)]" />
            </div>
            <SsoButtons onPress={handleSSO} chosen={chosen} errors={donorAuth.oauthErrors} />
          </>
        )}
        <p className={`${HELP} text-center leading-relaxed px-2`}>
          {isNative() && !nativeSSOAvailable()
            ? "Sign in with your email  -  we'll send you a 6-digit code, no password needed."
            : 'No passwords here  -  we\'ll email you a one-time code, or use Apple or Google.'}
        </p>
        {onAdminSignIn && (
          <button onClick={onAdminSignIn} className="text-sm text-center min-h-11 py-1" style={{ color: 'var(--slate)' }}>
            Nonprofit admin? <span className="font-semibold underline" style={{ color: 'var(--navy-deep)' }}>Sign in with your work email</span>
          </button>
        )}
        {/* Demo-only shortcut so prospects can see the admin side without
            creating an org. Hidden outside demo (showDemo). */}
        {showDemo && (
          <button
            onClick={onDemoAdmin}
            className="w-full text-center min-h-11 text-[13px]"
            style={{ color: 'var(--slate)' }}
          >
            Demo: preview the BGCA admin dashboard →
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Step 1: Connect card for monitoring ─────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const BANKS = [
  { id: 'chase',   name: 'Chase',        sub: 'Sapphire, Freedom, Ink', color: '#1a56db', emoji: '🏦' },
  { id: 'capital', name: 'Capital One',  sub: 'Venture, Quicksilver',   color: '#c0392b', emoji: '💳' },
  { id: 'amex',    name: 'American Express', sub: 'Gold, Platinum, Blue Cash', color: '#007bc1', emoji: '💳' },
  { id: 'bofa',    name: 'Bank of America', sub: 'Customized Cash, Travel', color: '#e31837', emoji: '🏦' },
];

function ConnectCardScreen({ onNext, onBack, showDemo }) {
  const {
    frameRef, scrollRef, heroRef, onScroll,
    heroMinHeight, heroExpandedOpacity, heroCompactOpacity, sheetMinHeight, barHeight,
  } = useHeroCollapse();
  const { sheetPadBottom, showFade, syncFade } = useSheetScroll(scrollRef);
  const [connected, setConnected] = useState(null);
  const [showManualEntry, setShowManualEntry] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      ref={frameRef}
      className="flex flex-col h-full overflow-hidden"
    >
      <div ref={scrollRef} onScroll={e => { onScroll(e); syncFade(); }} className="flex-1 overflow-y-auto relative">
        {/* Overscroll bleed  -  rubber-banding at the top shows hero color, not white */}
        <div className="absolute inset-x-0 pointer-events-none" style={{ top: -500, height: 500, background: '#0d9488' }} />
        {/* Compact bar  -  docked at the top, fades in as the hero scrolls away */}
        <div
          className="sticky top-0 z-10 flex items-center justify-center pointer-events-none"
          style={{
            height: barHeight,
            marginBottom: -barHeight,
            opacity: heroCompactOpacity,
            background: 'linear-gradient(135deg, #0d9488 0%, #003865 100%)',
          }}
        >
          <span className="text-white font-bold text-sm px-6 truncate max-w-full">Which card should we track?</span>
        </div>
        {/* Hero  -  scrolls away 1:1 with the sheet, like native */}
        <div
          ref={heroRef}
          className="flex flex-col items-center justify-end px-8 pb-8"
          style={{ background: 'linear-gradient(135deg, #0d9488 0%, #003865 100%)', minHeight: heroMinHeight ?? '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)', position: 'relative' }}
        >
        <HeroBackButton onClick={onBack} />
        {/* Expanded content */}
        <div
          className="w-full flex flex-col items-center"
          style={{ opacity: heroExpandedOpacity }}
        >
          <motion.div className="mb-3 flex flex-col items-center gap-2">
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 180 }}
              className="w-44 h-26 rounded-2xl p-4 shadow-xl relative overflow-hidden flex flex-col justify-center"
              style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', width: 176, height: 104 }}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="w-7 h-5 rounded bg-white/50" />
                <div className="flex gap-1">
                  <div className="w-5 h-5 rounded-full bg-white/40" />
                  <div className="w-5 h-5 rounded-full bg-white/25 -ml-1.5" />
                </div>
              </div>
              <p className="text-white/80 font-mono whitespace-nowrap" style={{ fontSize: 10, letterSpacing: '0.16em' }}>•••• •••• •••• ••••</p>
            </motion.div>
          </motion.div>
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px', textWrap: 'balance' }}>
            Which card should{'\n'}we track?
          </h1>
          <p className="text-white/80 text-[13px] mt-2 text-center leading-relaxed">
            Every purchase rounds up  -  the change goes straight to your cause. This card is never charged, we only watch it.
          </p>
        </div>
      </div>

        <div className="rounded-t-3xl -mt-4" style={{ background: 'var(--teal-50)', minHeight: sheetMinHeight }}>
          <div className="px-4 pt-10 space-y-3" style={{ paddingBottom: sheetPadBottom }}>

          <p className={`${CAPS} px-1 pb-1`}>Connect your bank  -  never charged</p>

          {connected ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-2xl p-4 flex items-center gap-3 bg-white"
              style={{ border: '1px solid var(--teal-100)', boxShadow: 'var(--shadow-1)' }}
            >
              <CheckCircle size={22} className="shrink-0" style={{ color: 'var(--teal-ui)' }} />
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{connected.name} ····{connected.last4} connected</p>
                <p className="text-[13px] mt-1" style={{ color: 'var(--teal-700)' }}>We&apos;ll track your purchases and calculate round-ups as they happen</p>
              </div>
            </motion.div>
          ) : showManualEntry ? (
            <ManualCardForm
              variant="app"
              onCancel={() => setShowManualEntry(false)}
              onConnect={card => { setConnected(card); setShowManualEntry(false); }}
            />
          ) : (
            <>
              <PlaidBankConnect variant="app" showDemo={showDemo} onConnected={card => setConnected(card)} />
              {/* Typed-in card: demo scaffolding only (nothing is encrypted or
                  sent anywhere - see lib/manualCard.js). Real donors link a
                  card through Plaid Link above. */}
              {showDemo && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  className="w-full flex items-center gap-3 p-4 rounded-2xl text-left border border-dashed bg-white mt-3"
                  style={{ borderColor: 'var(--muted)' }}
                  onClick={() => setShowManualEntry(true)}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--teal-50)' }}>
                    <CreditCard size={18} style={{ color: 'var(--teal-700)' }} aria-hidden />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Enter your card manually</p>
                    <p className={HELP}>Demo only - type a card number (we keep just the last 4)</p>
                  </div>
                  <ArrowRight size={16} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden />
                </motion.button>
              )}
            </>
          )}

          <div className="flex items-center gap-2 px-1 pt-1">
            <Lock size={13} className="shrink-0" style={{ color: 'var(--slate)' }} aria-hidden />
            <p className={HELP}>Read-only access via Plaid · Never charged · Your credentials are never stored by PocketCache</p>
          </div>
          </div>
        </div>
        <ScrollFadeEdge show={showFade} rgb="232,251,247" />
      </div>

      <div className="px-4 pt-3 border-t" style={{ background: 'var(--teal-50)', borderColor: 'var(--teal-100)', paddingBottom: safeBottomAtLeast(40, 12) }}>
          <Button
            disabled={!connected}
            onClick={() => connected && onNext(connected)}
          >
            {connected ? 'Continue →' : 'Select a card to continue'}
          </Button>
      </div>
    </motion.div>
  );
}

// ─── Step 2: Choose payment method ───────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const PAYMENT_OPTIONS = [
  {
    id: 'ach',
    icon: <Landmark size={22} aria-hidden />,
    label: 'Bank Account',
    sub: 'Direct bank transfer · Includes flat $1/month app fee',
    badge: null,
    // Bank debit stays demo-only until the Stripe bank-debit authorization
    // exists (see BankPaymentAuth.jsx and PRELAUNCH.md).
    demoOnly: true,
  },
  {
    id: 'apple_pay',
    icon: <AppleLogo size={22} />,
    label: 'Apple Pay',
    sub: 'Set up once, fully automatic · Includes flat $1/month app fee',
    badge: null,
  },
  {
    id: 'card',
    icon: <CreditCard size={22} aria-hidden />,
    label: 'Credit or Debit Card',
    sub: 'Visa, Mastercard, Amex, or Discover · Includes flat $1/month app fee',
    badge: null,
  },
];

function PaymentMethodScreen({ onNext, onBack, linkedBank, showDemo }) {
  const {
    frameRef, scrollRef, heroRef, onScroll,
    heroMinHeight, heroExpandedOpacity, heroCompactOpacity, sheetMinHeight, barHeight,
  } = useHeroCollapse();
  const { sheetPadBottom, showFade, syncFade } = useSheetScroll(scrollRef);
  const { selectedNonprofit, monthlyCap, setMonthlyCap } = useApp();
  const [selected, setSelected] = useState(null);
  const [showApplePay, setShowApplePay] = useState(false);
  // Bank account as the PAYMENT method needs an authorized SOURCE (round-3
  // item 2) - the linked tracking bank via an explicit confirm, or a fresh
  // Plaid connect framed as payment authorization. Until one is set, the
  // option is not considered chosen. Production note: real ACH debits will
  // be authorized through Stripe Financial Connections per the launch
  // checklist (PRELAUNCH.md) - see BankPaymentAuth.jsx.
  const [achSource, setAchSource] = useState(null);
  const achReady = selected !== 'ach' || !!achSource;
  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';
  const npName  = selectedNonprofit?.name      ?? 'your nonprofit';
  // Only a real Plaid depository account may be offered as the debit source.
  // A typed-in card, the practice fallback or a Plaid-tracked credit card is a
  // tracking source, never a bank to charge (lib/plaid.js isDebitableBank).
  const debitableBank = isDebitableBank(linkedBank) ? linkedBank : null;
  const options = PAYMENT_OPTIONS.filter(o => showDemo || !o.demoOnly);

  function handleContinue() {
    if (!selected) return;
    if (selected === 'apple_pay') { setShowApplePay(true); return; }
    if (selected === 'ach') {
      if (!achSource) return; // the panel below is the way forward
      onNext('ach', { type: 'ach', label: 'Bank Account', last4: achSource.last4, institution: achSource.institution, authorized: true });
      return;
    }
    const opt = PAYMENT_OPTIONS.find(o => o.id === selected);
    onNext(selected, { type: selected, label: opt?.label ?? selected, last4: null });
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      ref={frameRef}
      className="flex flex-col h-full overflow-hidden"
    >
      <div ref={scrollRef} onScroll={e => { onScroll(e); syncFade(); }} className="flex-1 overflow-y-auto relative">
        {/* Overscroll bleed  -  rubber-banding at the top shows hero color, not white */}
        <div className="absolute inset-x-0 pointer-events-none" style={{ top: -500, height: 500, background: '#0B2A4A' }} />
        {/* Compact bar  -  docked at the top, fades in as the hero scrolls away */}
        <div
          className="sticky top-0 z-10 flex items-center justify-center pointer-events-none"
          style={{
            height: barHeight,
            marginBottom: -barHeight,
            opacity: heroCompactOpacity,
            background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)',
          }}
        >
          <span className="text-white font-bold text-sm px-6 truncate max-w-full">Collecting your round-ups</span>
        </div>
        {/* Hero  -  scrolls away 1:1 with the sheet, like native */}
        <div
          ref={heroRef}
          className="flex flex-col items-center justify-end px-8 pb-8"
          style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: heroMinHeight ?? '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)', position: 'relative' }}
        >
        <HeroBackButton onClick={onBack} />
        {/* Expanded content */}
        <div
          className="w-full flex flex-col items-center"
          style={{ opacity: heroExpandedOpacity }}
        >
          <motion.div className="mb-2 flex flex-col items-center gap-2">
            <div className="flex gap-2">
              {options.map((opt, i) => (
                <motion.div
                  key={opt.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.1 + 0.2, type: 'spring', stiffness: 280 }}
                  className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white"
                >
                  {opt.id === 'apple_pay' ? <AppleLogo size={22} color="#fff" /> : opt.icon}
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-2 bg-white/20 rounded-xl px-3 py-2"
            >
              <span className="text-white text-xs font-semibold">Charged once a month · ${MONTHLY_FLOOR} minimum</span>
            </motion.div>
          </motion.div>
          {/* Hard break, and both halves must fit 329px at text-3xl: "How should
              we collect" measures 329.34px, which is why this used to wrap into
              three lines and split "round-ups" across two of them. */}
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
            How do we collect{'\n'}your round-ups?
          </h1>
          <p className="text-white/80 text-[13px] mt-1 text-center leading-relaxed">
            One monthly charge  -  your choice of payment method.
          </p>
        </div>
      </div>

        <div className="rounded-t-3xl -mt-4" style={{ background: 'var(--surface)', minHeight: sheetMinHeight }}>
          <div className="px-4 pt-10 space-y-3" style={{ paddingBottom: sheetPadBottom }}>

          <p className={`${CAPS} px-1 pb-1`}>Choose your payment method</p>

          <div role="radiogroup" aria-label="Payment method" className="space-y-3">
          {options.map(opt => (
            <motion.button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected === opt.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelected(opt.id)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all"
              style={selected === opt.id
                ? { background: 'var(--gold-50)', border: '2px solid var(--gold)' }
                : { background: '#fff', border: '1px solid var(--line)', boxShadow: 'var(--shadow-1)' }
              }
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--brand-accent-light, #00386514)', color: 'var(--brand-primary, #003865)' }}>
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{opt.label}</p>
                  {opt.badge && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ background: opt.badgeColor }}>
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className={`${HELP} mt-1`}>{opt.sub}</p>
              </div>
              <div
                aria-hidden
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                style={selected === opt.id
                  ? { borderColor: 'var(--gold-700)', background: 'var(--gold-700)' }
                  : { borderColor: 'var(--muted)', background: 'transparent' }
                }
              >
                {selected === opt.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </motion.button>
          ))}
          </div>

          {/* Bank account authorization panel (item 2) - appears the moment
              the option is picked; Continue stays gated until a source is
              explicitly authorized. Only a debitable Plaid bank is offered as
              the pre-linked source (debitableBank above). */}
          {selected === 'ach' && (
            <div className="rounded-2xl p-4 bg-white" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-1)' }}>
              <p className={`${CAPS} pb-2`}>Bank account to charge</p>
              <BankPaymentAuth
                variant="app"
                linkedBank={debitableBank}
                authorized={achSource}
                onAuthorized={src => setAchSource(src)}
                onClear={() => setAchSource(null)}
              />
            </div>
          )}

          <p className={`${HELP} text-center px-2 pt-1`}>
            Change this anytime in Settings. Payments are processed by Stripe  -  not us.
          </p>

          {/* Quiet monthly-max opt-in  -  deliberately understated (adjust later in Settings) */}
          <div className="rounded-2xl p-4 bg-white" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-1)' }}>
            <label className="flex items-start gap-3 cursor-pointer min-h-11">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={monthlyCap !== null}
                onChange={e => setMonthlyCap(e.target.checked ? 20 : null)}
              />
              <div
                aria-hidden="true"
                className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all peer-focus-visible:ring-[3px] peer-focus-visible:ring-[color:rgba(13,148,136,0.35)]"
                style={{ borderColor: monthlyCap !== null ? 'var(--navy-deep)' : 'var(--muted)', background: monthlyCap !== null ? 'var(--navy-deep)' : '#fff' }}
              >
                {monthlyCap !== null && <CheckCircle size={12} className="text-white" />}
              </div>
              <span className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Set a monthly maximum (optional)  -  round-ups above it are simply never charged.
              </span>
            </label>
            {monthlyCap !== null && (
              <div className="mt-3">
                <div className="text-center py-1">
                  <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>${monthlyCap}</span>
                  <span className="text-sm ml-1" style={{ color: 'var(--slate)' }}>/month</span>
                </div>
                <input
                  type="range" min={5} max={200} step={5} value={monthlyCap}
                  aria-label="Monthly maximum"
                  onChange={e => setMonthlyCap(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className={`flex justify-between ${HELP}`}><span>$5</span><span>$200</span></div>
              </div>
            )}
          </div>
          </div>
        </div>
        <ScrollFadeEdge show={showFade} rgb="246,248,251" />
      </div>

      <div className="px-4 pt-3 border-t" style={{ background: 'var(--surface)', borderColor: 'var(--line)', paddingBottom: safeBottomAtLeast(40, 12) }}>
          <Button
            disabled={!selected || !achReady}
            onClick={handleContinue}
          >
            {!selected ? 'Choose a payment method'
              : selected === 'apple_pay' ? 'Pay with Apple Pay →'
                : !achReady ? 'Authorize a bank account above'
                  : 'Continue →'}
          </Button>
          <p className={`text-center ${HELP} leading-relaxed px-2 mt-3`}>
            Your round-ups charge once a month through {npName}&apos;s Stripe. You&apos;ll see &ldquo;{npShort}&rdquo; on your statement. They issue your receipt.
          </p>
      </div>
      <ApplePaySheet
        show={showApplePay}
        showDemo={showDemo}
        payee={npName}
        contextLine="Charged once a month for your round-ups  -  set up now, nothing charges today."
        onCancel={() => setShowApplePay(false)}
        onSuccess={info => { setShowApplePay(false); onNext('apple_pay', info); }}
      />
    </motion.div>
  );
}

// ─── Step 3 (CC path): Enter card via Stripe Elements ───────────────────────
// The form itself is the shared StripeCardForm (components/StripeCardForm.jsx):
// real SetupIntent save with server-verified brand/last4, practice-mode
// fallback when Stripe or the backend is unreachable, { last4, brand,
// simulated } in onSuccess - the same shape the local copy used to produce.

function CardEntryScreen({ onNext, onBack }) {
  // Same collapsing hero as its siblings in this flow - it was the only
  // card-flow screen still using a static shrink-0 header at a one-off 32%.
  const {
    frameRef, scrollRef, heroRef, onScroll,
    heroMinHeight, heroExpandedOpacity, heroCompactOpacity, sheetMinHeight, barHeight,
  } = useHeroCollapse();
  const { selectedNonprofit } = useApp();
  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';

  return (
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        ref={frameRef}
        className="flex flex-col h-full overflow-hidden"
      >
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto relative">
          {/* Overscroll bleed  -  rubber-banding at the top shows hero color, not white */}
          <div className="absolute inset-x-0 pointer-events-none" style={{ top: -500, height: 500, background: '#0B2A4A' }} />
          {/* Compact bar  -  docked at the top, fades in as the hero scrolls away */}
          <div
            className="sticky top-0 z-10 flex items-center justify-center pointer-events-none"
            style={{
              height: barHeight,
              marginBottom: -barHeight,
              opacity: heroCompactOpacity,
              background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)',
            }}
          >
            <span className="text-white font-bold text-sm px-6 truncate max-w-full">Add your payment card</span>
          </div>
          {/* Hero  -  scrolls away 1:1 with the sheet, like native */}
          <div
            ref={heroRef}
            className="flex flex-col items-center justify-end px-8 pb-8"
            style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: heroMinHeight ?? '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)', position: 'relative' }}
          >
            <HeroBackButton onClick={onBack} />
            {/* Expanded content */}
            <div
              className="w-full flex flex-col items-center"
              style={{ opacity: heroExpandedOpacity }}
            >
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 280 }}
                className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-5"
              >
                <CreditCard size={32} color="#fff" aria-hidden />
              </motion.div>
              <h1 className="text-white font-bold text-3xl leading-tight text-center" style={{ letterSpacing: '-0.5px', textWrap: 'balance' }}>
                Add your payment card
              </h1>
              <p className="text-white/80 text-[13px] mt-2 text-center leading-relaxed">
                This is the card {npShort} charges once a month for your round-ups. Stripe handles it  -  PocketCache never sees the number.
              </p>
            </div>
          </div>

          <div className="rounded-t-3xl -mt-4" style={{ background: 'var(--surface)', minHeight: sheetMinHeight }}>
            <div className="px-4 pt-8" style={{ paddingBottom: safeBottomAtLeast(40, 12) }}>
              <StripeCardForm variant="app" onSuccess={(info) => onNext(info)} />
              <p className={`text-center ${HELP} leading-relaxed px-2 mt-4`}>
                Round-ups are charged once a month by {npShort}, on their own Stripe account. They issue your tax receipt directly.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
  );
}

// ─── Checkout confirm screen ─────────────────────────────────────────────────

function CheckoutConfirmScreen({ onConfirm, onBack }) {
  const {
    frameRef, scrollRef, heroRef, onScroll,
    heroMinHeight, heroExpandedOpacity, heroCompactOpacity, sheetMinHeight, barHeight,
  } = useHeroCollapse();
  const { sheetPadBottom, showFade, syncFade } = useSheetScroll(scrollRef);
  const {
    selectedNonprofit, feeMonths, monthlyCap,
    coverProcessing, setCoverProcessing,
  } = useApp();
  // The tick box below is the donor's standing answer, not a one-screen toggle.
  // It reads and writes the persisted `coverProcessing` in AppContext
  // (pc_cover_processing), which is the same value the dashboard, the charge
  // review alert and Settings bill from.
  //
  // ILLUSTRATIVE EXAMPLE, NOT AN ESTIMATE (owner punch-list item 11). A
  // brand-new account has accrued NOTHING, so this step must never present a
  // "monthly estimate" as if round-ups already existed. It walks the donor
  // through how a month COULD look, using the shared obviously-sample figure
  // (EXAMPLE_MONTH_ROUNDUPS), labeled as an example everywhere - and says in
  // as many words that the donor's own count starts at $0.00 today. The fee
  // and cover math still comes from lib/billing so the example adds up the
  // same way a real charge will.
  const exampleRoundUps = EXAMPLE_MONTH_ROUNDUPS;
  const appFee = feeMonths;
  const processingCover = processingCoverFor(exampleRoundUps);
  const total = chargeTotal({
    pendingRoundUps: exampleRoundUps,
    feeMonths,
    processingCover: coverProcessing ? processingCover : 0,
  });
  const chargeOn = nextChargeLabel();

  // Commit the answer on the way out, even when the donor never touched the box.
  // The box is pre-checked, so "left alone" is still an affirmative answer to a
  // question about money, and it should be a stored fact rather than an absent
  // key that only happens to default the right way.
  function confirm() {
    setCoverProcessing(coverProcessing);
    onConfirm();
  }

  const npName  = selectedNonprofit?.name      ?? 'your nonprofit';
  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
      ref={frameRef}
      className="flex flex-col h-full overflow-hidden">
      <div ref={scrollRef} onScroll={e => { onScroll(e); syncFade(); }} className="flex-1 overflow-y-auto relative">
        {/* Overscroll bleed  -  rubber-banding at the top shows hero color, not white */}
        <div className="absolute inset-x-0 pointer-events-none" style={{ top: -500, height: 500, background: '#003865' }} />
        {/* Compact bar  -  docked at the top, fades in as the hero scrolls away */}
        <div
          className="sticky top-0 z-10 flex items-center justify-center pointer-events-none"
          style={{
            height: barHeight,
            marginBottom: -barHeight,
            opacity: heroCompactOpacity,
            background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)',
          }}
        >
          <span className="text-white font-bold text-sm px-6 truncate max-w-full">Review &amp; Confirm</span>
        </div>
        {/* Hero  -  scrolls away 1:1 with the sheet, like native */}
        <div
          ref={heroRef}
          className="flex flex-col items-center justify-end px-8 pb-8"
          style={{ background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)', minHeight: heroMinHeight ?? '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)', position: 'relative' }}
        >
        <HeroBackButton onClick={onBack} />
        {/* Expanded content */}
        <div
          className="w-full flex flex-col items-center"
          style={{ opacity: heroExpandedOpacity }}
        >
          <motion.div className="mb-5 flex flex-col items-center gap-3">
            {selectedNonprofit
              ? <OrgLogo nonprofit={selectedNonprofit} size={16} rounded="2xl" className="bg-white/20" />
              : <img src={bgcaLogoUrl} alt="logo" className="w-16 h-16 rounded-2xl bg-white object-contain p-2" />}
            <div className="bg-white/20 rounded-2xl px-4 py-2">
              <p className="text-white text-xs font-semibold text-center">
                One monthly charge · {npShort} on your statement
              </p>
            </div>
          </motion.div>
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px', textWrap: 'balance' }}>
            Review &amp;{'\n'}Confirm
          </h1>
          <p className="text-white/80 text-[13px] mt-2 text-center">
            Your round-ups are charged once a month by {npName}.
          </p>
        </div>
      </div>

      {/* Sheet */}
        <div className="bg-white rounded-t-3xl -mt-4" style={{ minHeight: sheetMinHeight }}>
          <div className="px-5 pt-8 space-y-4" style={{ paddingBottom: sheetPadBottom }}>

          {/* Example card - an ILLUSTRATION, never the donor's own total.
              Same framing, same sample figure and same disclaimer as the web
              review step (lib/donorContent EXAMPLE_*). */}
          <div className="rounded-2xl p-4 bg-white" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-2)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className={CAPS}>Here is how a month could look</p>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--warning-50)', color: 'var(--warning)' }}>Example</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Round-ups in a sample month</span>
              <span className="font-bold tabular-nums" style={{ color: 'var(--green)' }} data-testid="confirm-roundups">${exampleRoundUps.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm" style={{ color: 'var(--slate)' }}>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span>
              <span className="text-sm tabular-nums" style={{ color: 'var(--slate)' }}>+${appFee.toFixed(2)}</span>
            </div>
            {feeMonths > 1 && (
              <p className={`${HELP} mb-2`}>
                {feeMonths - 1} month{feeMonths - 1 !== 1 ? 's' : ''} of the $1 fee rolled over from a skipped month, so {feeMonths} land on the {chargeOn} charge.
              </p>
            )}
            {coverProcessing && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm" style={{ color: 'var(--slate)' }}>Processing cover (goes to {npShort})</span>
                <span className="text-sm tabular-nums" style={{ color: 'var(--slate)' }}>+${processingCover.toFixed(2)}</span>
              </div>
            )}
            <div className="h-px my-2" style={{ background: 'var(--line)' }} />
            <div className="flex justify-between items-center">
              <span className="font-bold" style={{ color: 'var(--ink)' }}>One charge from {npShort}</span>
              <span className="font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>${total.toFixed(2)}</span>
            </div>
            {monthlyCap !== null && monthlyCap !== undefined && (
              <p className="text-[13px] mt-2" style={{ color: 'var(--warning)' }} data-testid="confirm-cap-note">
                Your ${monthlyCap}/month cap applies  -  round-ups above it are simply never charged.
              </p>
            )}
            <p className={`${HELP} mt-2 italic`} data-testid="confirm-example-note">
              {EXAMPLE_DISCLAIMER}
            </p>
          </div>

          {/* Processing cover toggle */}
          {/* Writes through to AppContext, so the answer survives onboarding and
              every later charge bills from it. `setCoverProcessing` persists a
              boolean - it is not a useState setter, so no updater function. A
              visually hidden native checkbox inside the label does the toggling. */}
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl"
            data-testid="cover-processing-toggle"
            style={{ background: coverProcessing ? 'var(--green-50)' : '#fff', border: coverProcessing ? '1px solid #6ee7b7' : '1px solid var(--line)', boxShadow: 'var(--shadow-1)' }}>
            <input
              type="checkbox"
              className="sr-only peer"
              checked={!!coverProcessing}
              onChange={e => setCoverProcessing(e.target.checked)}
            />
            <div
              aria-hidden="true"
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all peer-focus-visible:ring-[3px] peer-focus-visible:ring-[color:rgba(13,148,136,0.35)]"
              style={{ borderColor: coverProcessing ? 'var(--green)' : 'var(--muted)', background: coverProcessing ? 'var(--green)' : '#fff' }}>
              {coverProcessing && <CheckCircle size={12} className="text-white" />}
            </div>
            <div>
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Cover {npShort}&apos;s card-processing costs too, so 100% of my round-ups reach them.
              </span>
              <p className={`${HELP} mt-1`}>
                {coverProcessing
                  ? `The ~$${processingCover.toFixed(2)} in the example goes directly to ${npShort}  -  PocketCache never touches it. It counts as part of your donation and scales with your actual round-ups.`
                  : `${npShort} receives your round-ups minus standard card-processing costs, like any donation.`}
              </p>
            </div>
          </label>

          {/* One-charge explanation */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface)' }}>
            <p className={`${CAPS} mb-2`}>How charges work</p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Once a month, {npName} bundles your round-ups into one charge. You&apos;ll see{' '}
              <strong>&ldquo;{npShort}&rdquo;</strong> on your statement  -  not PocketCache.
            </p>
            <p className={`${HELP} mt-2`}>
              {npShort} sends your tax receipt  -  they&apos;re the ones receiving your donation.
            </p>
            <p className={`${HELP} mt-1`}>
              The flat $1/month app fee isn&apos;t tax-deductible, but your round-ups are. When you cover card-processing costs, that amount counts as part of your donation too. {ROLL_FORWARD_NOTE}
            </p>
            <p className={`${HELP} mt-2 leading-relaxed`}>
              Tracking starts the moment your card is linked. Your round-ups total up through the last day of the month, we email your <strong>exact amount on the 1st</strong>, and the <strong>charge runs on the {CHARGE_DAY}th</strong>  -  next one {chargeOn}, a full {REVIEW_WINDOW_LAST_DAY} days to review it, and nothing before today ever counts.
            </p>
          </div>
          </div>
        </div>
        <ScrollFadeEdge show={showFade} rgb="255,255,255" />
      </div>

      <div className="px-4 pt-3 bg-white border-t" style={{ borderColor: 'var(--line)', paddingBottom: safeBottomAtLeast(40, 12) }}>
          <Button onClick={confirm}>
            Start Giving to {npShort}
          </Button>
          <p className={`text-center ${HELP} leading-relaxed px-2 mt-3`}>
            <span className="inline-flex items-center gap-1 justify-center">
              <CoinMark size={14} />
              Powered by PocketCache, LLC. You can cancel anytime in Settings.
            </span>
          </p>
      </div>
    </motion.div>
  );
}

// ─── Nonprofit self-serve signup flow ─────────────────────────────────────────
//
// PHONE surface only. Every non-visual part of this wizard  -  step sequence, the
// real ProPublica EIN lookup and its fallback, the demo one-time-code flow, the
// simulated Stripe connect, join-code rules, and the org record written at
// go-live  -  lives in src/lib/npSignup.js and is shared with the desktop wizard
// (pages/nonprofit/NpWebSignup.jsx). Nothing below this line is business logic.

// Header copy for the nonprofit wizard. The hero is 38% tall like its sibling
// heroes (SignUpScreen, CheckoutConfirmScreen), and like them it now carries the
// three things that fill that space: brand mark, title, and a one-line subtitle
// that says what this step actually does.
const NP_SIGNUP_HEADER = {
  ein:            { title: 'Verify Your\nNonprofit',   sub: 'Enter your EIN. We confirm your 501(c)(3) status before your page goes live.' },
  'confirm-org':  { title: 'Confirm\nYour Org',        sub: 'Make sure this is the right organization before we set anything up.' },
  'verify-email': { title: 'Verify Your\nWork Email',  sub: 'An email on your own domain proves you can act for the organization. It becomes your admin sign-in.' },
  stripe:         { title: 'Connect\nStripe',          sub: 'Donations charge on your Stripe account. You stay the merchant of record.' },
  branding:       { title: 'Customize\nYour Page',     sub: 'This is what donors see when they scan your code or open your link.' },
  license:        { title: 'License\nAgreement',       sub: 'Always free for your nonprofit. Never a percentage of donations.' },
  'app-listing':  { title: 'One Last Thing\nfor the App', sub: 'Your webpage and widget go live at approval - this is only about the iPhone app.' },
  live:           { title: "You're\nLive! 🎉",         sub: 'Share your join code and donors can start rounding up today.' },
};

function NonprofitSignupFlow({ onBack, showDemo }) {
  const {
    step,
    ein, setEin, einError, verifying, einDemoMode, einNameEditable,
    orgName, setOrgName, orgAddress, org501c3,
    seededOrg, pendingReview,
    adminEmail, workEmail, setWorkEmail, emailError,
    codeSent, codeInput, setCodeInput, codeError, requiredDomain,
    sendingCode, verifyingCode,
    // orgId is null until org-signup succeeds; orgCreateError says why it did
    // not. retryOrgCreate and joinCodeTakenNotice are read defensively - the
    // hook keeps both but does not return them yet (see foundation request).
    orgId, orgCreateError, retryOrgCreate, joinCodeTakenNotice,
    stripeConnecting, stripeConnected: hookStripeConnected, stripeError, practiceMode, practiceConnectStripe,
    story, setStory, color, setColor,
    logoPreview, logoUrlInput, setLogoUrlInput, logoUrlError,
    joinCode, joinCodeCustom, joinCodeError, showBrandingHint,
    accepted, setAccepted, showLicenseHint,
    appleApproval,
    openBenevityPortal, confirmBenevityRegistered, deferBenevity,
    verifyEIN, confirmOrg, reenterEIN,
    sendCode, changeEmail, verifyCode,
    connectStripe, stripeNext,
    changeJoinCode, setLogoFile, applyLogoUrl, submitBranding,
    acceptLicense, back,
    config, clearDraft,
  } = useNpSignup({ onExit: onBack, defaultLogo: bgcaLogoUrl });
  const goLive = useNpGoLive();
  const fileInputRef = useRef(null);

  // Stripe Connect inside the iPhone shell. The hook's connectStripe() does
  // window.location.assign(url), which in the Capacitor WKWebView replaces the
  // app with Stripe's page and leaves no way back to this wizard. Native opens
  // the hosted onboarding in the Capacitor Browser sheet instead and re-checks
  // org-connect-status when the sheet closes or the app resumes; the web keeps
  // the hook's own redirect/resume path (?npstripe=return).
  const [nativeStripeConnected, setNativeStripeConnected] = useState(false);
  const [nativeStripeBusy, setNativeStripeBusy] = useState(false);
  const [nativeStripeError, setNativeStripeError] = useState(null);
  const nativeListenersRef = useRef([]);
  const stripeConnected = hookStripeConnected || nativeStripeConnected;
  const nativeBrowser = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
    ? window.Capacitor?.Plugins?.Browser : null;
  async function refreshNativeStripeStatus() {
    if (!orgId) return;
    const res = await orgConnectStatus(orgId);
    if (res.ok && res.data?.connected) {
      setNativeStripeConnected(true);
      setNativeStripeBusy(false);
    }
  }
  function dropNativeListeners() {
    const handles = nativeListenersRef.current;
    nativeListenersRef.current = [];
    handles.forEach(h => { Promise.resolve(h).then(x => x?.remove?.()).catch(() => {}); });
  }
  useEffect(() => dropNativeListeners, []);
  async function handleConnectStripe() {
    if (!nativeBrowser || !orgId) { connectStripe(); return; }
    setNativeStripeError(null);
    setNativeStripeBusy(true);
    const res = await orgConnectStripe(orgId);
    if (!res.ok || !res.data?.url) {
      setNativeStripeBusy(false);
      setNativeStripeError(res.data?.error || 'Could not reach Stripe. Try again, or continue in practice mode.');
      return;
    }
    dropNativeListeners();
    const CapApp = window.Capacitor?.Plugins?.App;
    nativeListenersRef.current = [
      nativeBrowser.addListener?.('browserFinished', () => { refreshNativeStripeStatus(); }),
      CapApp?.addListener?.('appStateChange', ({ isActive }) => { if (isActive) refreshNativeStripeStatus(); }),
    ].filter(Boolean);
    try {
      await nativeBrowser.open({ url: res.data.url });
    } catch {
      setNativeStripeBusy(false);
      setNativeStripeError('Could not open Stripe. Try again.');
    }
  }
  // Scroll the sheet back to the top on every step change - the same `step`
  // this wizard's own back-button wiring (useStepHistory, inside
  // useNpSignup) already tracks. Without this, advancing off a long step
  // (e.g. the license summary) onto a short one (e.g. verify-email) left the
  // donor looking at a scrolled-down, mostly blank sheet.
  const sheetRef = useRef(null);
  useEffect(() => { sheetRef.current?.scrollTo({ top: 0 }); }, [step]);
  const [teamIdCopied, setTeamIdCopied] = useState(false);
  const [teamIdCopyFailed, setTeamIdCopyFailed] = useState(false);
  // "Code sent" feedback for the Resend code button below - auto-clears.
  const [justResent, setJustResent] = useState(false);
  async function handleResend() {
    const ok = await sendCode();
    if (ok) {
      setJustResent(true);
      setTimeout(() => setJustResent(false), 3000);
    }
  }

  async function copyTeamId() {
    const ok = await copyText(APPLE_TEAM_ID);
    if (ok) {
      setTeamIdCopied(true);
      setTeamIdCopyFailed(false);
      setTimeout(() => setTeamIdCopied(false), 2200);
    } else {
      setTeamIdCopyFailed(true);
      setTimeout(() => setTeamIdCopyFailed(false), 2500);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
      className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col justify-end px-8 pb-8 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #003865 100%)', minHeight: '38%', paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}>
        {/* 'live' is the end of the road (back() in useNpSignup is a no-op
            there too), so the header offers no Back on that step. */}
        {step !== 'live' ? (
          <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={back} className="text-white/80 text-sm font-semibold mb-2 -ml-2 px-2 min-h-11 self-start flex items-center gap-1">
            <ArrowLeft size={16} aria-hidden /> Back
          </motion.button>
        ) : <div className="mb-2 min-h-11" aria-hidden />}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 280 }}
          className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-3 self-start"
        >
          <CoinMark size={40} />
        </motion.div>
        <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px', textWrap: 'balance' }}>
          {step === 'live' && practiceMode ? 'Practice\nRun Done'
            : step === 'live' && pendingReview ? 'Almost\nThere!'
              : NP_SIGNUP_HEADER[step]?.title}
        </h1>
        <p className="text-white/80 text-[13px] mt-2 leading-relaxed">
          {step === 'live' && practiceMode
            ? 'Nothing is live yet - this was a practice run.'
            : step === 'live' && pendingReview
              ? "Your organization is in review. Your launch kit arrives by email as soon as you're approved."
              : NP_SIGNUP_HEADER[step]?.sub}
        </p>
      </div>

      {/* Sheet */}
      <div ref={sheetRef} className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-5 pt-6 pb-10 space-y-4">

        {step === 'ein' && (
          <form onSubmit={verifyEIN} className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Enter your organization&apos;s EIN. Your 501(c)(3) status is reviewed before approval.
            </p>
            <div>
              <label htmlFor="np-ein" className={`${CAPS} mb-1 block`}>EIN</label>
              <input
                id="np-ein"
                type="text"
                inputMode="numeric"
                placeholder="XX-XXXXXXX"
                value={ein}
                onChange={e => setEin(e.target.value)}
                required
                className={`${INPUT} font-mono placeholder:text-[color:var(--muted)]`}
                style={{ borderColor: einError ? 'var(--danger)' : 'var(--line)' }}
              />
              {einError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{einError}</p>}
              <p className={`${HELP} mt-1 px-1`}>Format: XX-XXXXXXX (9 digits)</p>
            </div>
            <Button type="submit" disabled={!ein} loading={verifying}>
              {verifying ? 'Verifying…' : 'Verify EIN →'}
            </Button>
            <p className={`${HELP} text-center px-2`}>
              We only use this to confirm your 501(c)(3) status before your page goes live.
            </p>
          </form>
        )}

        {step === 'confirm-org' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>We found a match. Is this your organization?</p>
            <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-white flex items-center justify-center" style={{ border: '1px solid var(--line)' }}>
                  {/* Only a genuinely seeded org (BGCA's real EIN) may show a
                      real logo here - an unknown or unverifiable EIN gets the
                      neutral PocketCache mark, never another org's branding. */}
                  {seededOrg?.logoUrl
                    ? <img src={seededOrg.logoUrl} alt="Org" className="w-full h-full object-contain p-1.5" style={{ display: 'block' }} />
                    : <CoinMark size={28} />}
                </div>
                <div className="flex-1 min-w-0">
                  {einNameEditable ? (
                    <input
                      type="text"
                      value={orgName}
                      onChange={e => setOrgName(e.target.value)}
                      placeholder="Your Nonprofit"
                      aria-label="Organization name"
                      className="w-full font-bold text-base bg-white rounded-lg px-2 min-h-11 outline-none border"
                      style={{ color: 'var(--ink)', borderColor: 'var(--line)' }}
                    />
                  ) : (
                    <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>{orgName}</p>
                  )}
                  {orgAddress && <p className={HELP}>{orgAddress}</p>}
                </div>
              </div>
              {einDemoMode ? (
                <div className="flex items-center gap-2">
                  <Info size={14} className="shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--warning)' }}>
                    Reviewed before approval · EIN {ein}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="shrink-0" style={{ color: 'var(--green)' }} aria-hidden />
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--green)' }}>
                    {org501c3 ? '501(c)(3) Verified' : 'Organization found'} · EIN {ein}
                  </p>
                </div>
              )}
              {einDemoMode && (
                <p className="text-[13px] italic" style={{ color: 'var(--warning)' }}>
                  {einNameEditable
                    ? "We couldn't match this EIN  -  enter your organization's name."
                    : showDemo ? 'This EIN matches a sample organization used for the demo.' : 'We confirm your 501(c)(3) status before your page goes live.'}
                </p>
              )}
            </div>
            <Button onClick={confirmOrg}>
              Confirm  -  this is us →
            </Button>
            <Button variant="tertiary" size="md" onClick={reenterEIN}>
              No, re-enter EIN
            </Button>
          </div>
        )}

        {step === 'verify-email' && (
          <div className="space-y-4">
            {!codeSent ? (
              <form onSubmit={sendCode} className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                  Prove you work at {orgName}: enter your work email on your organization&apos;s
                  own domain and we&apos;ll send a 6-digit code. This address becomes your admin sign-in.
                </p>
                <div>
                  <label htmlFor="np-work-email" className={`${CAPS} mb-1 block`}>Your work email</label>
                  <input
                    id="np-work-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={workEmail}
                    onChange={e => setWorkEmail(e.target.value)}
                    placeholder={requiredDomain ? `you@${requiredDomain}` : 'you@yourorg.org'}
                    className={`${INPUT} placeholder:text-[color:var(--muted)]`}
                    style={{ borderColor: emailError ? 'var(--danger)' : 'var(--line)' }}
                  />
                  {emailError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{emailError}</p>}
                </div>
                <Button type="submit" disabled={!workEmail} loading={sendingCode}>
                  {sendingCode ? 'Sending…' : 'Email me a verification code →'}
                </Button>
                <p className={`${HELP} px-1 leading-relaxed`}>
                  Personal addresses (Gmail, Yahoo, iCloud…) can&apos;t manage a nonprofit.
                  No password is ever created  -  admin sign-in works by emailed code, so there&apos;s
                  nothing for anyone to steal.
                </p>
              </form>
            ) : orgCreateError ? (
              /* The code verified but org-signup failed: the wizard stays here
                 (useNpSignup no longer slides into practice mode) and the
                 admin retries the server call. Nothing downstream can work
                 without the server org, so this card blocks until it exists. */
              <div className="space-y-4">
                <div role="alert" className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--danger-50)', border: '1px solid var(--danger)' }}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" style={{ color: 'var(--danger)' }} aria-hidden />
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>We couldn&apos;t create your organization yet</p>
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{orgCreateError}</p>
                </div>
                <Button onClick={() => (retryOrgCreate ? retryOrgCreate() : changeEmail())}>
                  {retryOrgCreate ? 'Try again' : 'Start over with your email'}
                </Button>
                <p className={`${HELP} text-center px-2`}>Your email is verified - only the server step needs to be repeated.</p>
              </div>
            ) : (
              <form onSubmit={verifyCode} className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                  We sent a 6-digit code to <strong style={{ color: 'var(--ink)' }}>{workEmail}</strong>. Enter it to continue.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codeInput}
                  aria-label="6-digit code"
                  autoComplete="one-time-code"
                  onChange={e => setCodeInput(e.target.value)}
                  placeholder="······"
                  className={`${INPUT} font-mono text-center text-xl tracking-[0.5em]`}
                  style={{ borderColor: codeError ? 'var(--danger)' : 'var(--line)' }}
                />
                {codeError && <p role="alert" className="text-[13px] px-1" style={{ color: 'var(--danger)' }}>{codeError}</p>}
                <Button type="submit" disabled={codeInput.length !== 6} loading={verifyingCode}>
                  {verifyingCode ? 'Verifying…' : 'Verify & continue →'}
                </Button>
                <div className="flex justify-center gap-4 -my-2">
                  <button type="button" disabled={sendingCode} onClick={handleResend}
                    className={`${TEXT_BTN} disabled:opacity-50`}>
                    {sendingCode ? 'Sending…' : justResent ? 'Code sent' : 'Resend code'}
                  </button>
                  <button type="button" onClick={changeEmail} className={TEXT_BTN}>Change email</button>
                </div>
                {emailError && <p role="alert" className="text-[13px] px-1 text-center" style={{ color: 'var(--danger)' }}>{emailError}</p>}
              </form>
            )}
          </div>
        )}

        {step === 'stripe' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Connect your Stripe account. Donations charge directly on your Stripe  -  you&apos;re the merchant of record the whole time.
            </p>
            {!orgId && !stripeConnected ? (
              /* Reachable only from a stale draft or a resume whose org lookup
                 failed: there is no server org to connect, so say so instead
                 of offering a Stripe button that cannot work. */
              <div className="space-y-3">
                <div role="alert" className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--danger-50)', border: '1px solid var(--danger)' }}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" style={{ color: 'var(--danger)' }} aria-hidden />
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Your organization isn&apos;t saved on our server yet</p>
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    {orgCreateError || "We couldn't create your organization on our server, so Stripe can't be connected yet."}
                  </p>
                </div>
                <Button onClick={() => (retryOrgCreate ? retryOrgCreate() : back())}>
                  {retryOrgCreate ? 'Try again' : 'Go back and try again'}
                </Button>
              </div>
            ) : stripeConnected ? (
              <div className="rounded-2xl p-4" style={{ background: 'var(--green-50)', border: '1px solid #6ee7b7' }}>
                <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  <CheckCircle size={16} style={{ color: 'var(--green)' }} aria-hidden /> Stripe Connected
                </p>
                <p className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>You are the merchant of record for all donations</p>
              </div>
            ) : (
              <Button
                onClick={handleConnectStripe}
                loading={stripeConnecting || nativeStripeBusy}
                style={stripeConnecting || nativeStripeBusy ? undefined : { background: '#635BFF', color: '#fff' }}
              >
                {stripeConnecting || nativeStripeBusy ? 'Connecting…' : 'Connect with Stripe'}
              </Button>
            )}
            {(stripeError || nativeStripeError) && (
              <div role="alert" className="rounded-2xl p-3 space-y-2" style={{ background: 'var(--danger-50)', border: '1px solid var(--danger)' }}>
                <p className="text-[13px]" style={{ color: 'var(--danger)' }}>{stripeError || nativeStripeError}</p>
                <button type="button" onClick={practiceConnectStripe} className={`${TEXT_BTN} underline font-semibold -ml-2`}>
                  Continue in practice mode instead
                </button>
              </div>
            )}
            {practiceMode && stripeConnected && (
              <p className="text-[13px] rounded-xl px-3 py-2" style={{ color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid var(--gold)' }}>
                Practice mode: your organization was not created on our server, so this connection is simulated. Nothing goes live from a practice run.
              </p>
            )}
            {stripeConnected && (
              <Button onClick={stripeNext}>
                Continue →
              </Button>
            )}
            <p className={`${HELP} text-center px-2`}>
              PocketCache never touches the money  -  it goes straight from donors into your Stripe account.{showDemo ? ' Test mode  -  no real money moves.' : ''}
            </p>
          </div>
        )}

        {step === 'branding' && (
          <form onSubmit={submitBranding} className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>Customize how your page looks to donors.</p>
            <div>
              <label htmlFor="np-org-name" className={`${CAPS} mb-1 block`}>Organization Name</label>
              <input id="np-org-name" type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required
                className={INPUT} />
            </div>
            <div>
              <label htmlFor="np-join-code" className={`${CAPS} mb-1 block`}>Your Donor Join Code</label>
              <input id="np-join-code" type="text" value={joinCodeCustom} onChange={e => changeJoinCode(e.target.value)}
                placeholder={joinCode}
                className={`${INPUT} font-mono uppercase tracking-widest placeholder:text-[color:var(--muted)]`}
                style={{ borderColor: joinCodeError ? 'var(--danger)' : 'var(--line)' }} />
              {joinCodeError && <p role="alert" className="text-[13px] mt-1 px-1" style={{ color: 'var(--danger)' }}>{joinCodeError}</p>}
              {joinCodeTakenNotice && (
                <p role="status" className="text-[13px] mt-1 px-1 font-medium" style={{ color: 'var(--warning)' }}>{joinCodeTakenNotice}</p>
              )}
              <p className={`${HELP} mt-1`}>
                Letters, numbers, dashes (2-8)  -  short enough to say out loud. This becomes your link  -  pocketcache.app/{joinCode || 'CODE'}  -  plus your QR code and widget. You can change it later in your dashboard.
              </p>
            </div>
            <div>
              <p className={`${CAPS} mb-1 block`}>Admin Contact Email</p>
              {adminEmail ? (
                <div className={`${INPUT} flex items-center gap-2`} style={{ background: 'var(--surface)' }}>
                  <CheckCircle size={14} className="shrink-0" style={{ color: 'var(--green)' }} aria-hidden />
                  <span className="truncate text-sm" style={{ color: 'var(--ink)' }}>{adminEmail}</span>
                  <span className="text-xs font-semibold ml-auto shrink-0" style={{ color: 'var(--green)' }}>Verified</span>
                </div>
              ) : (
                <div className={`${INPUT} flex items-center gap-2`} style={{ background: 'var(--surface)' }}>
                  <Info size={14} className="shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>Not available</span>
                </div>
              )}
              <p className={`${HELP} mt-1`}>
                {adminEmail ? 'Verified in the previous step  -  this is your admin sign-in.' : "We couldn't load your verified email  -  go back a step or refresh to try again."}
              </p>
            </div>
            <div>
              <label htmlFor="np-story" className={`${CAPS} mb-1 block`}>Your Mission (shown to donors)</label>
              <textarea id="np-story" value={story} onChange={e => setStory(e.target.value)} rows={4} maxLength={600} placeholder="Tell donors what you do…"
                className={`${INPUT} py-3 resize-none placeholder:text-[color:var(--muted)]`} />
              <div className="flex justify-between gap-3 mt-1">
                <p className={HELP}>Keep it concise  -  this shows on your public donor page.</p>
                <p className={`${HELP} shrink-0 tabular-nums`}>{story.length}/600</p>
              </div>
            </div>
            <div>
              <p className={`${CAPS} mb-2 block`}>Brand Color</p>
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Brand color">
                {NP_BRAND_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    role="radio" aria-checked={color === c} aria-label={`Brand color ${c}`}
                    className="w-11 h-11 rounded-xl border-2 transition-all"
                    style={{ background: c, borderColor: color === c ? 'var(--ink)' : 'transparent' }} />
                ))}
                <label className="flex flex-col items-center justify-center w-11 h-11 rounded-xl border-2 cursor-pointer transition-all overflow-hidden"
                  style={{ borderColor: !NP_BRAND_COLORS.includes(color) ? 'var(--ink)' : 'transparent', background: color }}>
                  <input type="color" value={color} aria-label="Custom brand color" onChange={e => setColor(e.target.value)} className="opacity-0 w-0 h-0 absolute" />
                  <span className="text-white text-xs font-bold leading-none" aria-hidden style={{ textShadow: '0 0 3px rgba(0,0,0,0.5)' }}>+</span>
                </label>
              </div>
            </div>
            <div>
              <p className={`${CAPS} mb-1 block`}>Logo</p>
              <div className="flex items-center gap-3 mb-2">
                {/* logoPreview is null for an unknown org that hasn't uploaded
                    one yet (see displayLogoPreview in lib/npSignup.js) - show
                    the neutral PocketCache mark, never another org's logo. */}
                {logoPreview
                  ? <img src={logoPreview} alt="Logo preview" className="h-10 object-contain rounded-lg px-2 py-1" style={{ background: 'var(--surface)' }} />
                  : <div className="h-10 w-14 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }}><CoinMark size={24} /></div>}
                <span className={HELP}>Preview: your uploaded logo becomes the app mark for donors.</span>
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={e => setLogoFile(e.target.files?.[0])}
              />
              <Button variant="secondary" size="md" onClick={() => fileInputRef.current?.click()} className="mb-2">
                Upload image
              </Button>
              <input
                type="url"
                aria-label="Logo URL"
                placeholder="or paste a logo URL"
                value={logoUrlInput}
                onChange={e => setLogoUrlInput(e.target.value)}
                onBlur={e => applyLogoUrl(e.target.value)}
                className={`${INPUT} placeholder:text-[color:var(--muted)]`}
              />
              {logoUrlError && <p role="alert" className="text-[13px] mt-1" style={{ color: 'var(--danger)' }}>{logoUrlError}</p>}
              <p className={`${HELP} mt-1`}>If you skip this, the PocketCache mark is used as your app mark.</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'var(--surface)' }}>
              <p className={`${CAPS} mb-1`}>Monthly minimum</p>
              {/* One platform-wide floor (lib/billing.js MONTHLY_FLOOR): the
                  charge job and the donor copy both use it, so it is stated
                  here rather than offered as a per-org setting. */}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Monthly minimum: ${MONTHLY_FLOOR}. Donors under ${MONTHLY_FLOOR} in a month roll forward to the next charge.
              </p>
            </div>
            <Button type="submit">
              Continue →
            </Button>
            {/* submitBranding() refuses on a bad join code. Without this the
                button just did nothing, which reads as broken. */}
            {showBrandingHint && joinCodeError && (
              <p role="alert" className="text-[13px] text-center" style={{ color: 'var(--danger)' }}>{joinCodeError}</p>
            )}
          </form>
        )}

        {step === 'license' && (
          <form onSubmit={acceptLicense} className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>Review and accept the Nonprofit Software License Agreement before going live.</p>
            <div className="rounded-2xl p-4 space-y-2 text-[13px] leading-relaxed" style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              {NP_LICENSE_POINTS.map(([heading, body]) => (
                <p key={heading}><strong style={{ color: 'var(--ink)' }}>{heading}</strong> {body}</p>
              ))}
            </div>
            <a href="/legal/nonprofit-license/" target="_blank" rel="noopener"
              className="flex items-center justify-center min-h-11 text-sm font-semibold underline" style={{ color: 'var(--navy-deep)' }}>
              Read full license →
            </a>
            <label className="flex items-start gap-3 cursor-pointer min-h-11">
              <input
                type="checkbox"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
                className="sr-only peer"
              />
              <div
                aria-hidden="true"
                className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all peer-focus-visible:ring-[3px] peer-focus-visible:ring-[color:rgba(13,148,136,0.35)]"
                style={{ borderColor: accepted ? 'var(--green)' : showLicenseHint ? 'var(--warning)' : 'var(--muted)', background: accepted ? 'var(--green)' : '#fff' }}>
                {accepted && <CheckCircle size={12} className="text-white" />}
              </div>
              <span className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>I accept the Nonprofit Software License Agreement on behalf of this organization.</span>
            </label>
            {showLicenseHint && !accepted && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="text-[13px] font-medium"
                style={{ color: 'var(--warning)' }}
              >
                Please accept the license to continue
              </motion.p>
            )}
            <Button type="submit" disabled={!accepted} onDisabledPress={() => acceptLicense()}>
              Accept &amp; Go Live →
            </Button>
          </form>
        )}

        {step === 'app-listing' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'var(--green-50)', border: '1px solid #6ee7b7' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Your webpage and widget go live at approval</p>
              <p className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>
                This next part only affects whether donors can find you inside the PocketCache iPhone app  -  everything else about your program is already set.
              </p>
            </div>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Apple asks every nonprofit to be verified once before it can appear inside the iPhone app.
              Your organization doesn&apos;t have a Candid Seal of Transparency on file, so the fastest path
              is to register  -  free  -  at the Benevity Causes Portal, using your organization&apos;s
              details and the ID below.
            </p>
            <div>
              <p className={`${CAPS} mb-2`}>PocketCache Developer ID</p>
              <div className="flex items-center gap-2 rounded-2xl p-3" style={{ background: 'var(--navy-deep)' }}>
                <code className="text-sm font-mono flex-1 truncate" style={{ color: 'var(--teal-logo)' }}>{APPLE_TEAM_ID}</code>
                <button
                  type="button"
                  onClick={copyTeamId}
                  className="shrink-0 text-xs font-semibold px-3 min-h-11 rounded-xl"
                  style={{
                    background: teamIdCopied ? 'var(--green-50)' : teamIdCopyFailed ? 'var(--danger-50)' : 'rgba(255,255,255,0.12)',
                    color: teamIdCopied ? 'var(--green)' : teamIdCopyFailed ? 'var(--danger)' : '#fff',
                  }}
                  title={teamIdCopyFailed ? 'Copy failed  -  select and copy manually' : undefined}
                >
                  {teamIdCopied ? 'Copied!' : teamIdCopyFailed ? 'Try again' : 'Copy'}
                </button>
              </div>
              <p className={`${HELP} mt-1`}>Benevity will ask for this alongside your organization&apos;s own details.</p>
            </div>
            <Button variant="secondary" onClick={openBenevityPortal}>
              Open the Benevity portal →
            </Button>
            <Button onClick={confirmBenevityRegistered}>
              I have registered →
            </Button>
            <Button variant="tertiary" size="md" onClick={deferBenevity}>
              I&apos;ll do this later
            </Button>
            <p className={`${HELP} text-center px-2`}>
              Either choice finishes your signup right now. Nothing here blocks your webpage, your widget, or your donors.
            </p>
          </div>
        )}

        {/* Completion, pending review: a real server org starts held back
            until the platform owner approves it (org-approve). No join code,
            QR, or widget yet - those arrive in the launch-kit email at
            approval, and handing them out early would only produce printed
            QR codes that point at a held-back page. */}
        {step === 'live' && pendingReview && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--warning-50)', border: '1px solid var(--gold)' }}>
              <div className="flex justify-center mb-2"><Hourglass size={28} className="text-amber-500" aria-hidden /></div>
              <p className="font-bold text-base mb-1" style={{ color: 'var(--ink)' }}>Almost there - awaiting review</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {orgName || 'Your organization'} is set up and PocketCache is reviewing your signup.
                You&apos;ll get your launch kit by email once approved.
              </p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
              <p className={`${CAPS} mb-2`}>What happens next</p>
              <ul className="text-sm space-y-2" style={{ color: 'var(--ink-2)' }}>
                <li>1. PocketCache reviews your organization - usually quick.</li>
                <li>2. Your launch kit lands at {adminEmail || 'your verified admin email'}: your page link, donor join code, QR code, and website widget.</li>
                <li>3. Your page goes live and donors can start rounding up.</li>
              </ul>
            </div>
            <p className={`${HELP} px-1`}>
              Your dashboard is ready now - donor tools unlock automatically the moment you&apos;re approved.
              Nothing else is needed from you.
            </p>
            <Button onClick={async () => { await goLive(config); clearDraft(); }}>
              Open your dashboard →
            </Button>
          </div>
        )}

        {/* Practice run: the server never heard of this org, so there is no
            page, QR or widget to hand out - handing out a code that resolves
            nowhere is exactly the failure this screen used to produce. */}
        {step === 'live' && !pendingReview && practiceMode && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--warning-50)', border: '1px solid var(--gold)' }}>
              <div className="flex justify-center mb-2"><AlertTriangle size={28} className="text-amber-500" aria-hidden /></div>
              <p className="font-bold text-base mb-1" style={{ color: 'var(--ink)' }}>Nothing is live yet - this was a practice run.</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Your organization was not created on our server, so no page, join code, QR code or widget exists yet.
                Run the signup again when you are ready to go live for real.
              </p>
            </div>
            <p className={`${HELP} rounded-xl px-3 py-2`} style={{ background: 'var(--surface)' }}>
              Practice mode: nothing is sent; your launch kit is shown on this page.
            </p>
            {joinCodeTakenNotice && (
              <p role="status" className="text-[13px] px-1 font-medium" style={{ color: 'var(--warning)' }}>{joinCodeTakenNotice}</p>
            )}
            <Button onClick={async () => { await goLive(config); clearDraft(); }}>
              Open your dashboard →
            </Button>
          </div>
        )}

        {step === 'live' && !pendingReview && !practiceMode && (
          <div className="space-y-4">
            <p className={CAPS} style={{ color: 'var(--teal-700)' }}>Live right now</p>
            <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--green-50)', border: '1px solid #6ee7b7' }}>
              <p className="font-bold text-base mb-1" style={{ color: 'var(--ink)' }}>Your page is live!</p>
              <p className="text-sm font-mono" style={{ color: 'var(--green)' }}>
                pocketcache.app/{joinCode}
              </p>
            </div>
            {joinCodeTakenNotice && (
              <p role="status" className="text-[13px] px-1 font-medium" style={{ color: 'var(--warning)' }}>{joinCodeTakenNotice}</p>
            )}
            {/* Join code  -  primary thing to share */}
            <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--green-50)', border: '2px solid #6ee7b7' }}>
              <p className={`${CAPS} mb-1`} style={{ color: 'var(--green)' }}>Your Donor Join Code</p>
              <p className="text-5xl font-extrabold tracking-wider mb-2 tabular-nums" style={{ color: 'var(--ink)' }}>{joinCode}</p>
              <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Donors enter this in the PocketCache app to join your program</p>
            </div>
            <div>
              <p className={`${CAPS} mb-2`}>QR Code</p>
              <div className="bg-white rounded-xl p-3 inline-block" style={{ border: '1px solid var(--line)' }}>
                <QRCodeSVG value={joinQrValue(joinCode)} size={96} level="M" includeMargin />
              </div>
              <p className={`${HELP} mt-1`}>Donors scan this to join <strong>{orgName || 'your program'}</strong></p>
            </div>
            <div>
              <p className={`${CAPS} mb-2`}>Embed Widget</p>
              <div className="rounded-xl p-3 max-w-full overflow-x-auto" style={{ background: 'var(--navy-deep)' }}>
                <code className="text-xs whitespace-pre-wrap break-all" style={{ color: 'var(--teal-logo)' }}>
                  {widgetSnippet(orgName, joinCode)}
                </code>
              </div>
              <p className={`${HELP} mt-1`}>See a live preview anytime in your dashboard → Grow tab.</p>
            </div>

            {/* iPhone app listing  -  its own zone, on purpose: Apple has no say
                over the webpage/QR/widget above, so this status never delays it. */}
            <p className={`${CAPS} pt-1`}>PocketCache iPhone app</p>
            <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
              {appleApproval.status === 'approved' ? (
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="shrink-0" style={{ color: 'var(--green)' }} aria-hidden />
                  <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                    {appleApproval.method === 'candid_seal'
                      ? 'Verified through your Candid Seal of Transparency  -  nothing to do.'
                      : 'Approved and ready to appear in the app.'}
                  </p>
                </div>
              ) : appleApproval.status === 'benevity_submitted' ? (
                <div className="flex items-center gap-2">
                  <Hourglass size={16} className="text-amber-500 shrink-0" aria-hidden />
                  <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>We&apos;ll list you in the iPhone app once Benevity approval comes through.</p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" aria-hidden />
                  <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Register with Benevity when you&apos;re ready  -  it&apos;s in your dashboard.</p>
                </div>
              )}
            </div>

            {/* Launch kit  -  sent to the verified admin email at approval
                (org-approve); this link forwards a copy to a colleague
                (recipient left blank). */}
            <a
              href={launchKitMailto(orgName, joinCode)}
              className="pc-btn flex items-center justify-center gap-2 w-full min-h-13 rounded-2xl font-bold text-base text-center"
              style={{ background: '#fff', border: '1px solid var(--navy-deep)', color: 'var(--navy-deep)', textDecoration: 'none' }}
            >
              <Mail size={18} aria-hidden /> Send the launch kit to a colleague
            </a>
            <p className={`${HELP} rounded-xl px-3 py-2`} style={{ background: 'var(--surface)' }}>
              Your launch kit is emailed to {adminEmail || 'your verified admin address'} as soon as your
              organization is approved. Use the button above to forward it to a colleague  -  just add their address.
            </p>
            <Button onClick={async () => { await goLive(config); clearDraft(); }}>
              Open your dashboard →
            </Button>
          </div>
        )}

        <div className="pt-2 text-center border-t" style={{ borderColor: 'var(--line)' }}>
          <a
            href="mailto:support@pocketcache.app"
            className="inline-flex items-center min-h-11 text-[13px] underline"
            style={{ color: 'var(--slate)' }}
          >
            Stuck? Email us  -  support@pocketcache.app
          </a>
        </div>

      </div>
    </motion.div>
  );
}

// The cold-open coin splash used to live here (GateWithSplash), which meant a
// signed-in cold open that skipped the gate never saw it. It now overlays
// whatever surface loads first - gate OR dashboard - from App.jsx's
// AppContent (see LaunchSplash in components/SplashAnimation.jsx).

// ─── Main onboarding shell ───────────────────────────────────────────────────

export default function Onboarding() {
  const app = useApp();
  const {
    setPage, setSelectedNonprofit, selectedNonprofit, hasAccount, accountStatus, setHasAccount, setAccountStatus,
    initialOnboardingStep, clearInitialOnboardingStep, goToOnboardingStep, returnFromOnboarding,
    adminRole, setAdminRole, lastMode, setLastMode, setTrackedCard, setPaymentMethod,
    demoMode, startAdminPreview,
  } = app;
  // Demo-only controls (scan button, demo code hint, admin preview link, typed
  // card entry, bank-debit option) show in the demo build, inside the website's
  // phone frame, or when the donor's own demo toggle is on - never on a real
  // native install (lib/demo.js). demoMode, not demoActive: the latter is also
  // true for every not-yet-signed-up donor, which is exactly who must not see
  // the scaffolding.
  const showDemo = useShowDemoAffordances(demoMode);
  // Parks a join code for a signed-in donor bound to a different nonprofit so
  // PendingOrgPrompt asks before anything is re-bound. AppContext does not yet
  // expose its setter, so the key is written directly and the prompt appears on
  // the next load (foundation request: export setPendingOrgCode).
  const parkPendingOrg = app.setPendingOrgCode ?? (code => saveKey('pc_pending_org', code));
  const { adoptOrgById, adoptServerOrg } = useNp();
  const [slide, setSlide] = useState(0);
  // Same-tab progress past the account step (see donorDraft.js
  // saveDonorProgress): the linked card's display fields and the verified
  // identity, so a breakpoint remount or reload mid-signup resumes at the
  // payment-method step instead of asking the donor to relink the card.
  const [donorProgress] = useState(loadDonorProgress);
  const [connectedBank, setConnectedBank] = useState(() => donorProgress?.connectedBank ?? null);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState(null);
  // True when the nonprofit wizard was entered from the gate, which is the one
  // entry point whose "back" target is the gate itself rather than a page the
  // user came from. See enterNonprofitSignup below.
  const [npFromGate, setNpFromGate] = useState(false);
  const [signupIdentity, setSignupIdentity] = useState(() => donorProgress?.identity ?? null);
  // SignUpScreen's in-screen back steps (code entry -> email, sign-in mode ->
  // signup) - the parent's hardware back and the hero chevron both ask it
  // first, so neither drops the donor back to the slides mid-form.
  const signupBackRef = useRef(null);
  // A draft left by WebOnboarding's 'account' step in the same tab (see
  // src/lib/donorDraft.js) - only consulted when it maps to a step this
  // surface understands (today, just 'signup') and only once selectedNonprofit
  // is already known, since SignUpScreen requires one.
  const [donorDraft] = useState(loadDonorDraft);
  const [step, setStep] = useState(() => {
    const urlP = new URLSearchParams(window.location.search);
    if (urlP.get('npsignin') === '1') return 'admin-signin';
    // Returning from Stripe's hosted onboarding (real Connect, test mode) -
    // useNpSignup itself reads ?npstripe=/&org= to resume mid-wizard at the
    // 'stripe' step (see src/lib/npSignup.js's stripeReturnParams); this just
    // needs to land on the wizard screen at all instead of the gate.
    if (urlP.get('npstripe') === 'return' || urlP.get('npstripe') === 'refresh') return 'nonprofit-signup';
    // Returning here after an Apple/Google sign-in redirect (see
    // src/lib/donorAuth.js) - land back on the signup screen so it can pick
    // up the completed session instead of dumping the donor at the gate.
    if (urlP.get('authResume') === 'app') return 'signup';
    // ?signin=1 / ?join=1: the marketing site's device-aware entry params
    // (see App.jsx's appEntry). On mobile web / native this is the app's own
    // gate, not WebOnboarding's - GateSignInScreen for signin, OrgGateScreen
    // (the plain 'gate' step, same as the default below) for join.
    if (urlP.get('signin') === '1') return 'gate-signin';
    if (urlP.get('join') === '1') return 'gate';
    // Mid-signup progress (card linked, account verified) in this tab: resume
    // at the payment-method step. Needs the cause still bound and an identity
    // (the draft's own or the stored one) - otherwise the normal entry applies.
    if (donorProgress?.appStep === 'payment-method' && donorProgress.connectedBank
      && (donorProgress.identity || loadKey(IDENTITY_KEYS.identity)) && loadKey('pc_cause_id')) {
      return 'payment-method';
    }
    const mappedDraftStep = donorDraft?.step && WEB_STEP_TO_APP_STEP[donorDraft.step];
    if (mappedDraftStep && selectedNonprofit) return mappedDraftStep;
    if (loadKey('pc_account_status', 'active') === 'cancelled') return 'gate';
    return loadKey('pc_cause_id') ? 'slides' : 'gate';
  }); // 'gate' | 'gate-signin' | 'slides' | 'signup' | 'connect-card' | 'payment-method' | 'card-entry' | 'checkout-confirm' | 'nonprofit-signup'

  const urlParams = new URLSearchParams(window.location.search);
  // ?org= is a donor join link EXCEPT on the Stripe Connect return
  // (/demo/?npstripe=return&org=<uuid>), where it names the admin's org id -
  // resolving that as a join code would try to bind the admin as a donor.
  const autoBindOrg = urlParams.get('npstripe')
    ? null
    : (urlParams.get('org') || new URLSearchParams(window.location.hash.replace('#', '?')).get('org') || null);

  // Handle deep-link from other screens (Feature 3)
  useEffect(() => {
    if (initialOnboardingStep) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(initialOnboardingStep);
      clearInitialOnboardingStep();
    }
  }, [initialOnboardingStep, clearInitialOnboardingStep]);

  // The gate's "Create your nonprofit page" button. The local step transition is
  // what moves the phone/native flow; goToOnboardingStep publishes the same jump
  // to AppContext so App.jsx's desktop router (WebExperience) can see it and
  // route to the web-native wizard (NpWebSignup) instead of the phone column.
  // Onboarding's initialOnboardingStep effect would set the step too, but doing
  // it locally as well keeps native instant and independent of that round trip.
  function enterNonprofitSignup() {
    setNpFromGate(true);
    goToOnboardingStep('nonprofit-signup');
    setStep('nonprofit-signup');
  }

  // Back out of the nonprofit wizard. Order matters: goToOnboardingStep records
  // a nav-return of the CURRENT page (onboarding), so for the gate entry point
  // that return has to be consumed and discarded, or "back" would resolve to the
  // page we are already on and appear to do nothing.
  function exitNonprofitSignup() {
    if (npFromGate) {
      setNpFromGate(false);
      returnFromOnboarding();
      setStep('gate');
      return;
    }
    if (!returnFromOnboarding()) setStep('gate');
  }

  // Back from the step after account creation must NEVER land on the account
  // step once the account exists (owner punch-list item 4): it skips over it
  // to the intro slides, the screen that precedes signup. Only a donor who
  // has not created an account yet backs into the signup form itself.
  function backFromConnectCard() {
    if (signupIdentity || hasAccount) { setSlide(2); setStep('slides'); return; }
    setStep('signup');
  }

  // Back from the account step: SignUpScreen gets first refusal (code entry
  // returns to the email field, sign-in mode returns to signup); only then do
  // we leave for the slides. The draft is kept either way - what was typed
  // must still be there on re-entry; it is cleared once signup completes.
  function backFromSignup() {
    if (signupBackRef.current?.()) return;
    setSlide(2);
    setStep('slides');
  }

  // Hardware/browser back for this wizard's OWN step transitions - mirrors
  // exactly what each screen's own onBack prop already does below, so this is
  // never a new "back" meaning, only the same one reachable through hardware
  // back too. 'nonprofit-signup' is deliberately excluded (see `active`
  // below): that screen's back/exit is entirely owned by useNpSignup's own
  // wiring (src/lib/npSignup.js), which already resolves the first-step exit
  // back to exitNonprofitSignup above - double-wiring it here would race the
  // same popstate event against two handlers.
  function stepBack() {
    switch (step) {
      case 'native-app-gate': setSelectedNonprofit(null); setStep('gate'); break;
      case 'admin-signin': if (!returnFromOnboarding()) setStep('gate'); break;
      case 'gate-signin': setStep('gate'); break;
      case 'checkout-confirm': setStep('payment-method'); break;
      case 'card-entry': setStep('payment-method'); break;
      case 'payment-method': setStep('connect-card'); break;
      case 'connect-card': backFromConnectCard(); break;
      case 'signup': backFromSignup(); break;
      // The intro carousel has no in-UI back control of its own (only Next /
      // dot navigation) - 'gate' is exactly where it came from, whether by
      // scanning a code or by handleBind, so that is where hardware back
      // sensibly returns to.
      case 'slides': setStep('gate'); break;
      default: break;
    }
  }
  // 'gate' is the wizard's own landing/entry screen - nothing to exit BACK to
  // at this level (that is the OS/browser's job), so it keeps no entry of its
  // own on the stack, same as 'nonprofit-signup' above.
  useStepHistory(step, stepBack, { active: step !== 'gate' && step !== 'nonprofit-signup' });

  // Gate at the moment the org is actually resolved (manual code entry AND the
  // auto-bind ?org= link both funnel through here as `onBind`), so nothing
  // downstream has to know this check exists. Native only: Apple has no say
  // over the web, so a browser donor is never shown this screen.
  function handleBind(np) {
    // A signed-in donor already bound to a DIFFERENT nonprofit is asked, never
    // silently re-bound: donor_profiles.org_join_code decides where their next
    // charge goes, so the code is parked and PendingOrgPrompt offers the switch
    // (EDGE-CASES D12/C12) - the same rule App.jsx applies to ?org= links.
    const currentId = loadKey('pc_cause_id');
    if (hasAccount && currentId && currentId !== np.id) {
      parkPendingOrg(np.shortName ?? np.id);
      setLastMode('giving');
      setPage('home');
      return;
    }
    setSelectedNonprofit(np);
    if (isNative() && getAppleApproval(np).status !== 'approved') {
      setStep('native-app-gate');
      return;
    }
    // A donor who already has an account (signed in, cause was just missing on
    // this device) is not re-signing up - binding the code is the last missing
    // piece, so they go straight to their dashboard.
    if (hasAccount) { setLastMode('giving'); setPage('home'); return; }
    setStep('slides');
  }

  // "Demo: preview the BGCA admin dashboard" (gate sign-in, demo only). A
  // read-only look through AppContext's startAdminPreview: nothing persisted -
  // no admin role, no mode, no page - so a prospect's phone never ends up
  // signed in as BGCA's admin. The old role-writing fallback survives only in
  // the demo build for a shell without startAdminPreview.
  function handleNpSignIn() {
    if (typeof startAdminPreview === 'function') { startAdminPreview(); return; }
    if (!showDemo) return;
    const orgId = adminRole?.orgId ?? 'bgca';
    if (!adminRole) setAdminRole({ orgId: 'bgca', joinCode: 'BGCA' });
    adoptOrgById(orgId);
    setLastMode('admin');
    setPage('np-dashboard');
  }

  // Passwordless admin sign-in complete: AdminSignInScreen already verified a
  // real Supabase OTP and resolved the org server-side (org-admin-lookup) -
  // `orgPublic` is that org's public row. adoptServerOrg mirrors it into the
  // local cache the rest of the app reads (dashboard, microsite) and returns
  // the npOrg-shaped record, whose `_orgId`/`shortName` are what setAdminRole
  // expects (the same local id/joinCode scheme adoptOrgById uses elsewhere).
  function completeAdminSignIn(email, orgPublic) {
    const adopted = adoptServerOrg(orgPublic, email);
    setAdminRole({ orgId: adopted._orgId, joinCode: adopted.shortName });
    setLastMode('admin');
    setPage('np-dashboard');
    return true;
  }

  // One sign-in for every role: donor-only → giving, admin-only → dashboard,
  // both roles → last-used mode (the profile menus toggle between them).
  //
  // WITH ONE GUARD the web surface already had and this one did not: the donor
  // dashboard is per-nonprofit, and every donor tab renders NOTHING without a
  // bound cause (the "sign in then every page is blank" bug). An identity that
  // resolves with no cause on this device comes back to the gate - which
  // greets them by name and asks for the one thing missing, their nonprofit's
  // code - instead of being handed an empty app.
  // With no cause bound on THIS device, ask the server first (round-3 item
  // 4): donor_profiles.org_join_code is where every bind is mirrored now, so
  // a returning donor on a fresh phone goes STRAIGHT to a populated
  // dashboard. Only an identity the server has no binding for still sees the
  // gate. (AppContext's profile-sync effect provides the same rescue as a
  // backstop for paths that do not come through here.)
  async function bindFromServer() {
    const me = await fetchRoundupsMe();
    const code = me?.profile?.org_join_code;
    if (!code) return null;
    const np = await resolveOrgByCode(code);
    if (np) setSelectedNonprofit(np);
    return np;
  }

  // Resolves to 'no-binding' when the identity is good but neither this device
  // nor the server knows their nonprofit: the caller (gate or gate sign-in)
  // then says so inline and asks for the code, instead of a silent bounce back
  // to a gate that looks like the tap did nothing.
  async function resumeSession() {
    const donorOnly = hasAccount && !adminRole;
    const adminOnly = adminRole && !hasAccount;
    if (adminOnly) { setLastMode('admin'); setPage('np-dashboard'); return 'ok'; }
    if (donorOnly) {
      if (!selectedNonprofit) {
        if (await bindFromServer()) { setLastMode('giving'); setPage('home'); return 'ok'; }
        setStep('gate'); return 'no-binding';
      }
      setLastMode('giving'); setPage('home'); return 'ok';
    }
    if (lastMode === 'admin' && adminRole) { setPage('np-dashboard'); return 'ok'; }
    if (!selectedNonprofit) {
      if (await bindFromServer()) { setLastMode('giving'); setPage('home'); return 'ok'; }
      setStep('gate'); return 'no-binding';
    }
    setPage('home');
    return 'ok';
  }
  // Gate sign-in that ends with no binding lands on the gate with the notice
  // already showing (the sign-in screen itself unmounts on the step change).
  const [gateNotice, setGateNotice] = useState(null);
  async function resumeFromGateSignIn() {
    const result = await resumeSession();
    if (result === 'no-binding') setGateNotice('We could not find your nonprofit - enter their code below to continue.');
    return result;
  }

  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  function advance() {
    if (isLast) {
      setStep('signup');
    } else {
      setSlide(s => s + 1);
    }
  }

  // Dynamic slide-2 subtitle based on bound nonprofit
  function slide2Subtitle() {
    if (selectedNonprofit) {
      return `This app is built for ${selectedNonprofit.name}. Your spare change goes straight to them every month  -  nothing in between.`;
    }
    return 'This app is built for your cause. Your spare change goes straight to them every month  -  nothing in between.';
  }

  if (step === 'gate') return (
    <OrgGateScreen
      onBind={handleBind}
      onNonprofitSignup={enterNonprofitSignup}
      autoBindOrg={autoBindOrg}
      hasAccount={hasAccount}
      onWelcomeBack={resumeSession}
      onUniversalSignIn={() => { setGateNotice(null); setStep('gate-signin'); }}
      showDemo={showDemo}
      notice={gateNotice}
    />
  );
  if (step === 'native-app-gate') return (
    <NativeAppGateScreen
      nonprofit={selectedNonprofit}
      onBack={() => { setSelectedNonprofit(null); setStep('gate'); }}
    />
  );
  if (step === 'admin-signin') return (
    <AdminSignInScreen
      onBack={() => setStep('gate')}
      onComplete={completeAdminSignIn}
    />
  );
  if (step === 'gate-signin') return (
    <GateSignInScreen
      onBack={() => setStep('gate')}
      onSignIn={resumeFromGateSignIn}
      onIdentityVerified={identity => { setHasAccount(identity); setAccountStatus('active'); }}
      onDemoAdmin={handleNpSignIn}
      onAdminSignIn={() => setStep('admin-signin')}
      showDemo={showDemo}
    />
  );
  if (step === 'nonprofit-signup') return (
    // Exit-back returns to wherever the user jumped in from (e.g. their donor
    // dashboard); falls back to the gate for cold visitors.
    <NonprofitSignupFlow onBack={exitNonprofitSignup} showDemo={showDemo} />
  );
  if (step === 'checkout-confirm') return (
    <CheckoutConfirmScreen
      onBack={() => setStep('payment-method')}
      onConfirm={() => {
        // A real signup already wrote the verified identity (email code or
        // Apple/Google) in SignUpScreen - use it here rather than overwrite it.
        // No identity at all (a stale draft restored past the account step)
        // means there is nobody to open an account for: back to signup, never
        // a placeholder person.
        const identity = signupIdentity ?? hasAccount;
        if (!identity) { setStep('signup'); return; }
        setHasAccount(identity);
        setAccountStatus('active');
        setLastMode('giving');
        if (connectedBank) {
          // connectedBank already carries the real institution/name/mask from
          // Plaid (or, for manual entry / the offline fallback, an equivalent
          // shape) - use those fields as-is instead of collapsing everything
          // down to the bank's display name.
          setTrackedCard({
            name: connectedBank.name,
            last4: connectedBank.last4,
            brand: connectedBank.brand ?? connectedBank.name,
            institution: connectedBank.institution ?? connectedBank.name,
          });
        }
        if (pendingPaymentMethod) {
          setPaymentMethod(pendingPaymentMethod);
        }
        // pc_page flips to 'home' IMMEDIATELY, in the same tick as the queued
        // prompt flag - a reload one second from now must land the signed-up
        // donor on their dashboard, not back at the intro slides (this used to
        // leave `page` at 'onboarding' until the QR modal was dismissed, which
        // never persisted if the donor reloaded, or never came, first). The
        // popup itself is a one-shot flag consumed by AppDownloadPrompt once
        // AppShell mounts, not local state here, so it still shows up "on top"
        // of the dashboard even though this screen unmounts the instant `page`
        // changes. Native goes straight home and shows the inverse (web-portal)
        // popup there instead - same mechanism, see WebPortalLinkModal.jsx.
        if (isNative()) queueWebPortalPrompt();
        else queueAppDownloadPrompt();
        setPage('home');
        pcBeacon('donor signup', { org: selectedNonprofit?.shortName, surface: 'app' });
        // Signup is done - the draft that exists only to survive a breakpoint
        // remount mid-wizard has nothing left to protect.
        clearDonorDraft();
      }}
    />
  );
  if (step === 'card-entry') return <CardEntryScreen onBack={() => setStep('payment-method')} onNext={(cardInfo) => { setPendingPaymentMethod({ type: 'card', label: 'Credit or Debit Card', last4: cardInfo?.last4 ?? null, ...(cardInfo?.brand ? { brand: cardInfo.brand } : {}), ...(cardInfo?.simulated ? { simulated: true } : {}) }); setStep('checkout-confirm'); }} />;
  if (step === 'payment-method') return <PaymentMethodScreen linkedBank={connectedBank} showDemo={showDemo} onBack={() => setStep('connect-card')} onNext={(method, methodInfo) => { setPendingPaymentMethod(methodInfo); setStep(method === 'card' ? 'card-entry' : 'checkout-confirm'); }} />;
  if (step === 'connect-card') return <ConnectCardScreen
    showDemo={showDemo}
    onBack={backFromConnectCard}
    onNext={(bank) => {
      setConnectedBank(bank);
      // Display fields only (no Plaid tokens) - see donorDraft.js. The pending
      // payment method is deliberately NOT saved: an authorization must be
      // given again, never restored.
      saveDonorProgress({ appStep: 'payment-method', connectedBank: bank, identity: signupIdentity });
      setStep('payment-method');
    }}
  />;
  if (step === 'signup') return <SignUpScreen
    onBack={backFromSignup}
    onNext={() => setStep('connect-card')}
    nonprofit={selectedNonprofit}
    hasAccount={hasAccount}
    accountStatus={accountStatus}
    onGoToDashboard={resumeSession}
    onIdentityVerified={identity => setSignupIdentity(identity)}
    interceptBackRef={signupBackRef}
  />;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className={`flex-1 flex flex-col items-center justify-center px-8 pb-6`}
          style={{ ...current.bgStyle, paddingTop: 'calc(var(--pc-safe-top) + 32px)' }}
        >
          {/* Illustration */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            {slide === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                >
                  <OrgLogo nonprofit={selectedNonprofit} size={24} rounded="2xl" />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-white font-bold text-lg text-center"
                >
                  {selectedNonprofit?.name ?? 'Your Nonprofit'}
                </motion.p>
              </div>
            ) : current.illustration}
          </div>

          {/* Text */}
          <div className="mt-4 text-center">
            {/* Slide 0 is the QR / join-link landing: it greets the donor with
                the nonprofit they just scanned, by name - never generic
                "Your App, Your Cause" copy (owner punch-list item 2). The org
                is always resolved by the time slides render (the gate's
                auto-bind and manual entry both go through resolveOrgByCode,
                the server-first lookup), so the fallback line below only
                covers a state that should not occur. */}
            {/* The short name ("BGCA", not the full legal name) keeps the
                greeting to three lines on a 390px screen; the full name is
                already shown with the logo above. */}
            {slide === 0 ? (
              <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px', textWrap: 'balance' }}>
                {selectedNonprofit
                  ? `Welcome to the\n${selectedNonprofit.shortName || selectedNonprofit.name}\nround-up app`
                  : 'Welcome to your\nround-up app'}
              </h1>
            ) : current.title ? (
              <h1 className="text-white font-bold text-4xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px', textWrap: 'balance' }}>
                {current.title}
              </h1>
            ) : null}
            <p className="text-white/80 text-base mt-4 leading-relaxed" style={{ textWrap: 'balance' }}>
              {slide === 0 ? slide2Subtitle() : current.subtitle}
            </p>
          </div>

          {/* Dots: 44px targets around 8px marks */}
          <div className="flex mt-4" role="tablist" aria-label="Intro slides">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === slide}
                aria-label={`Slide ${i + 1} of ${SLIDES.length}`}
                onClick={() => setSlide(i)}
                className="min-w-11 min-h-11 flex items-center justify-center"
              >
                <span
                  aria-hidden
                  className={`block rounded-full transition-all duration-300 ${
                    i === slide ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="w-full mt-4 flex flex-col gap-3">
            <Button
              onClick={advance}
              style={{ background: '#fff', color: 'var(--navy-deep)', boxShadow: 'var(--shadow-2)' }}
            >
              {current.cta}
            </Button>
            <div style={{ height: 48 }} />
          </div>

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
