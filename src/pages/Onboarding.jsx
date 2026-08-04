import { useState, useEffect, useRef, useCallback } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight, Lock, ArrowLeft, ChevronDown } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { QRCodeSVG } from 'qrcode.react';
import bgcaLogoUrl from '../assets/bgca-logo.png';

import { STRIPE_PUBLISHABLE_KEY } from '../lib/stripeKey';
import { saveCardWithSetupIntent, currentDonorEmail } from '../lib/stripeSetup';

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
import CoinLogo from '../components/CoinLogo';
import CoinMark from '../components/CoinMark';
import SplashAnimation from '../components/SplashAnimation';
import PocketCacheLogo from '../components/PocketCacheLogo';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { findOrgByCode, resolveAdminOrg, getAppleApproval } from '../store/orgStore';
import {
  useNpSignup, useNpGoLive, generateOneTimeCode,
  NP_BRAND_COLORS, NP_LICENSE_POINTS, widgetSnippet, joinQrValue, launchKitMailto,
  APPLE_TEAM_ID, BENEVITY_PORTAL_URL,
} from '../lib/npSignup';
import { loadKey, saveKey, IDENTITY_KEYS } from '../store/identityStore';
import { useDonorAuth } from '../lib/donorAuth';
import { DEMO_USER } from '../data/derived';
import OrgLogo from '../components/OrgLogo';
import SsoButtons from '../components/SsoButtons';
import { useHeroCollapse } from '../lib/useHeroCollapse';
import { isNative, queueAppDownloadPrompt } from '../components/AppDownloadQRModal';
import { queueWebPortalPrompt } from '../components/WebPortalLinkModal';
import HeroBackButton from '../components/HeroBackButton';
import ManualCardForm from '../components/ManualCardForm';
import PlaidBankConnect from '../components/PlaidBankConnect';
import ApplePaySheet from '../components/ApplePaySheet';
import AppleLogo from '../components/AppleLogo';
import { CHARGE_DAY, REVIEW_WINDOW_LAST_DAY, chargeAfterNextLabel, chargeTotal, effectiveCharge, nextChargeLabel, processingCoverFor } from '../lib/billing';
import { Z, scrim } from '../lib/overlay';
import { safeBottomAtLeast } from '../lib/safeArea';
import { pcBeacon } from '../lib/beacon.js';
import { copyText } from '../lib/clipboard';


const SLIDES = [
  {
    id: 0,
    bg: '',
    bgStyle: { background: '#003865' },
    illustration: null,
    title: 'Your App,\nYour Cause',
    // Dynamic subtitle injected in render
    subtitle: '',
    cta: 'Next',
  },
  {
    id: 1,
    bg: '',
    bgStyle: { background: 'linear-gradient(135deg, #0B2A4A 0%, #0D9488 100%)' },
    illustration: (
      <div className="relative flex flex-col items-center gap-3">
        {[
          { icon: '☕', amount: '$4.75', round: '+$0.25', delay: 0 },
          { icon: '🛒', amount: '$23.40', round: '+$0.60', delay: 0.1 },
          { icon: '🚗', amount: '$11.85', round: '+$0.15', delay: 0.2 },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: item.delay + 0.3, duration: 0.4 }}
            className="flex items-center gap-3 bg-white/20 rounded-2xl px-5 py-3 w-72"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-white font-medium flex-1">{item.amount}</span>
            <span className="text-white/90 font-bold text-sm bg-white/25 rounded-full px-2.5 py-1">{item.round}</span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-2 flex items-center gap-2 bg-white rounded-2xl px-6 py-3"
        >
          <span className="font-bold text-lg" style={{ color: '#0D9488' }}>$1.00</span>
          <span className="text-gray-500 text-sm">donated ❤️</span>
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
    bgStyle: { background: 'linear-gradient(135deg, #003865 0%, #0B2A4A 100%)' },
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
              <div className="text-white/70 text-xs mt-0.5">{stat.label}</div>
            </motion.div>
          ))}
        </div>
        <p className="text-white/50 text-xs mt-3">Example  -  your numbers grow from zero.</p>
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

function OrgGateScreen({ onBind, onNonprofitSignup, autoBindOrg, hasAccount, onWelcomeBack, onUniversalSignIn }) {
  // If a join link carried a code this device can't resolve (demo caveat:
  // custom orgs live in the creator's localStorage), prefill it in the input
  // rather than failing silently.
  const [code, setCode] = useState(() => (autoBindOrg && !findOrgByCode(autoBindOrg) ? autoBindOrg : ''));
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [autoBound, setAutoBound] = useState(false);
  const [boundNp, setBoundNp] = useState(null);

  useEffect(() => {
    if (autoBindOrg) {
      const np = findOrgByCode(autoBindOrg);
      if (np) {
        setAutoBound(true);
        setBoundNp(np);
        setTimeout(() => onBind(np), 800);
      } else {
        setError('Code not found. Ask your nonprofit for their PocketCache code.');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBindOrg]);

  function handleSubmit(e) {
    e.preventDefault();
    const np = findOrgByCode(code);
    if (!np) {
      setError('Code not found. Ask your nonprofit for their PocketCache code.');
      return;
    }
    onBind(np);
  }

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
        {boundNp ? <OrgLogo nonprofit={boundNp} size={16} rounded="2xl" /> : <div className="text-6xl">🏀</div>}
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
        <p className="text-white/70 text-xs text-center leading-relaxed mb-4 px-2">
          Checkout round-ups raise hundreds of millions for causes every year  -  this puts that power in your nonprofit&apos;s pocket.
        </p>
      </div>

      {/* Bottom sheet */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-hidden">
        <div className="flex-1 px-5 pt-5 pb-2 overflow-y-auto space-y-4">

          {/* ── FOR NONPROFITS (primary) ── */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">For Nonprofits</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onNonprofitSignup}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base mb-2"
              style={{ background: 'linear-gradient(135deg, #0B2A4A, #003865)', color: '#fff' }}
            >
              Create your nonprofit page
            </motion.button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <p className="text-gray-400 text-xs font-medium">Looking to support a nonprofit?</p>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* ── FOR DONORS (secondary) ── */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Welcome back shortcut */}
            {hasAccount && (
              <motion.button
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={onWelcomeBack}
                className="w-full flex items-center gap-2 px-3 py-3 rounded-2xl border text-left mb-1"
                style={{ borderColor: '#FBBF24', background: '#FFFBEB' }}
              >
                <span className="text-amber-500">👋</span>
                <span className="text-amber-800 text-sm font-semibold flex-1">
                  Welcome back  -  continue as {hasAccount.name} →
                </span>
              </motion.button>
            )}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Nonprofit Code</label>
              {/* Code input with the QR scanner tucked inside as a trailing button */}
              <div
                className="relative w-full rounded-2xl border-2 transition-colors bg-gray-50"
                style={{ borderColor: error ? '#ef4444' : scanned ? '#4ade80' : code ? '#FBBF24' : '#e5e7eb' }}
              >
                <input
                  type="text"
                  placeholder="Enter code (e.g. BGCA)"
                  value={code}
                  onChange={e => { setCode(e.target.value); setError(null); }}
                  className="w-full bg-transparent rounded-2xl pl-4 pr-14 py-3.5 text-sm outline-none font-mono uppercase"
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={handleScan}
                  aria-label="Scan QR code"
                  title="Scan QR code"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: scanned ? '#dcfce7' : '#FEF3C7' }}
                >
                  {scanning ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                      className="w-4 h-4 rounded-full border-2 border-amber-200 border-t-amber-500"
                    />
                  ) : scanned ? (
                    <CheckCircle size={18} className="text-green-500" />
                  ) : (
                    <span className="text-lg" aria-hidden>📷</span>
                  )}
                </motion.button>
              </div>
              {error && <p className="text-red-500 text-xs mt-1 px-1">{error}</p>}
              <p className="text-gray-400 text-xs mt-1 px-1">
                {scanned ? 'QR scanned ✓' : 'Demo code: BGCA · tap 📷 to scan a QR instead'}
              </p>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              className="w-full py-4 rounded-2xl font-bold text-base"
              style={{
                background: code ? 'linear-gradient(135deg, #FBBF24, #E5A800)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
                color: code ? '#0B2A4A' : '#fff',
                cursor: code ? 'pointer' : 'default',
              }}
            >
              Continue →
            </motion.button>
          </form>
        </div>

        {/* "Already have an account?"  -  full-size, visible even without local identity (fresh device / new phone) */}
        <div className="px-5 pb-1">
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={onUniversalSignIn}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-base"
            style={{ background: '#f0f4f8', color: '#0B2A4A' }}
          >
            Already have an account? Sign in
          </motion.button>
        </div>

        {/* Bottom-most block on the gate, so this is the one that owes the home
            indicator its clearance. */}
        <div className="px-5 pt-0" style={{ paddingBottom: safeBottomAtLeast(32, 12) }}>
          <p className="text-center text-gray-400 text-xs">
            PocketCache  -  round-up giving software for nonprofits
          </p>
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
      {nonprofit ? <OrgLogo nonprofit={nonprofit} size={18} rounded="2xl" /> : <div className="text-6xl">🏀</div>}
      <h1 className="text-white font-bold text-2xl leading-tight">
        {nonprofit?.name ?? 'This nonprofit'} is almost in the iPhone app
      </h1>
      <p className="text-white/70 text-sm leading-relaxed">
        Apple is still verifying {nonprofit?.name ? `${nonprofit.name}'s` : 'their'} listing before it can appear
        inside the PocketCache app. That&apos;s an app-only step  -  their giving page works today.
      </p>
      <div className="w-full bg-white/10 rounded-2xl p-4 mt-2">
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Join today on the web</p>
        <p className="text-white text-sm font-mono break-all">{webUrl}</p>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => window.open(webUrl, '_blank', 'noopener')}
        className="w-full py-4 rounded-2xl font-bold text-base mt-1"
        style={{ background: 'linear-gradient(135deg, #FBBF24, #E5A800)', color: '#0B2A4A' }}
      >
        Open their webpage →
      </motion.button>
      <button onClick={onBack} className="text-white/60 text-sm font-semibold py-2">
        ← Back
      </button>
    </motion.div>
  );
}

// ─── Nonprofit Sign-In Screen (SSO → demo BGCA or custom-org admin dashboard) ──

// ─── Sign-up screen ──────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL ?? '/';

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

function SignUpScreen({ onNext, onBack, nonprofit, hasAccount, accountStatus, onGoToDashboard, onProviderChosen, onIdentityVerified }) {
  const {
    frameRef, scrollRef, heroRef, onScroll,
    heroMinHeight, heroExpandedOpacity, heroCompactOpacity, sheetMinHeight, barHeight,
  } = useHeroCollapse();
  const { sheetPadBottom, showFade, syncFade } = useSheetScroll(scrollRef);
  const [chosen, setChosen] = useState(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [commsOptin, setCommsOptin] = useState(true);
  const [selectedState, setSelectedState] = useState('');
  const [showTermsHint, setShowTermsHint] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const isCA = selectedState === 'CA';
  const canContinue = agreedTerms && selectedState !== '' && !isCA;

  const npName = nonprofit?.name ?? 'your nonprofit';

  // Real donor sign-in (email code, plus Apple/Google once configured) - see
  // src/lib/donorAuth.js for the shared logic behind both signup surfaces.
  const donorAuth = useDonorAuth({ resumeKey: 'app' });
  const [emailInput, setEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState(null);
  const [verifiedIdentity, setVerifiedIdentity] = useState(null);
  const [displayName, setDisplayName] = useState('');

  function handleSignIn() {
    if (!hasAccount) return;
    if (accountStatus === 'cancelled') { onGoToDashboard?.(); return; }
    setWelcomeBack(true);
    setTimeout(() => onGoToDashboard?.(), 900);
  }

  // Writes pc_identity the same way for every sign-in path, then continues
  // the existing flow exactly as it already proceeded after signup.
  function finishSignup(identity) {
    saveKey(IDENTITY_KEYS.identity, identity);
    onIdentityVerified?.(identity);
    onProviderChosen?.(identity.provider);
    saveKey('pc_comms_optin', commsOptin);
    setChosen(identity.provider);
    setTimeout(() => onNext(), 500);
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

  async function handleVerifyCode(e) {
    e?.preventDefault?.();
    const identity = await donorAuth.verifyCode(donorAuth.codeInput);
    if (identity) {
      setVerifiedIdentity(identity);
      setDisplayName(identity.name);
    }
  }

  function handleConfirmName(e) {
    e?.preventDefault?.();
    if (!canContinue) { setShowTermsHint(true); return; }
    finishSignup({ ...verifiedIdentity, name: displayName.trim() || verifiedIdentity.name });
  }

  function handleContinueExisting() {
    if (hasAccount) return handleSignIn();
    if (!canContinue) { setShowTermsHint(true); return; }
    finishSignup(donorAuth.existingSession);
  }

  function handleSSO(provider) {
    if (hasAccount) return handleSignIn();
    if (!canContinue) { setShowTermsHint(true); return; }
    donorAuth.startOAuth(provider);
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
          <span className="text-white font-bold text-sm px-6 truncate max-w-full">Create Your Account</span>
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
          <motion.div className="mb-3 flex flex-col items-center gap-2">
            {nonprofit
              ? <OrgLogo nonprofit={nonprofit} size={14} rounded="2xl" className="bg-white/20" />
              : <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl">&#127952;</div>
            }
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white/20 rounded-xl px-3 py-1.5"
            >
              <p className="text-white text-xs font-semibold text-center">
                Supporting {npName}
              </p>
            </motion.div>
          </motion.div>
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
            Create Your{'\n'}Account
          </h1>
          <p className="text-white/80 text-xs mt-1 text-center">
            Sign up in seconds. No payment required yet.
          </p>
        </div>
      </div>

      {/* Bottom sheet */}
        <div className="bg-white rounded-t-3xl -mt-4" style={{ minHeight: sheetMinHeight }}>
          <div className="px-4 pt-10 space-y-3" style={{ paddingBottom: sheetPadBottom }}>

          {/* State selector */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 mb-1 block">Your State</label>
            <select
              value={selectedState}
              onChange={e => setSelectedState(e.target.value)}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400 text-gray-900"
              style={{ appearance: 'none', WebkitAppearance: 'none' }}
            >
              <option value="">Select your state…</option>
              {US_STATES.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Returning donor with a live sign-in already on this browser -
              skip straight past the email/code screen. */}
          {!donorAuth.checkingSession && donorAuth.existingSession && !verifiedIdentity && (
            <motion.button
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleContinueExisting}
              className="w-full flex items-center gap-2 px-3 py-3.5 rounded-2xl border text-left"
              style={{ borderColor: '#FBBF24', background: '#FFFBEB' }}
            >
              <span className="text-amber-500">👋</span>
              <span className="text-amber-800 text-sm font-semibold flex-1">
                Continue as {donorAuth.existingSession.email} →
              </span>
            </motion.button>
          )}

          {/* Real email sign-in: address -> 6-digit code -> confirm name */}
          {verifiedIdentity ? (
            <form onSubmit={handleConfirmName} className="space-y-3">
              <div className="rounded-2xl px-3 py-2.5 bg-teal-50 border border-teal-200">
                <p className="text-xs text-teal-700 font-semibold">
                  You&apos;re verified as {verifiedIdentity.email}
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Your Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400 text-gray-900"
                />
              </div>
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl font-bold text-base text-white"
                style={{ background: 'linear-gradient(135deg, #0B2A4A, #003865)' }}>
                Continue →
              </motion.button>
            </form>
          ) : donorAuth.stage === 'code' ? (
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <p className="text-gray-500 text-sm px-1">
                We sent a 6-digit code to <strong className="text-gray-900">{donorAuth.email}</strong>.
              </p>
              <input
                type="text" inputMode="numeric" maxLength={6} value={donorAuth.codeInput}
                onChange={e => donorAuth.setCodeInput(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 outline-none border border-gray-200 focus:border-blue-400 font-mono text-center text-xl tracking-[0.5em]"
                style={{ borderColor: donorAuth.codeError ? '#ef4444' : '#e5e7eb' }}
              />
              {donorAuth.codeError && <p className="text-red-500 text-xs px-1">{donorAuth.codeError}</p>}
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl font-bold text-base text-white"
                style={{ background: 'linear-gradient(135deg, #0B2A4A, #003865)', opacity: donorAuth.codeInput.length === 6 && !donorAuth.verifying ? 1 : 0.4 }}>
                {donorAuth.verifying ? 'Checking…' : 'Verify code →'}
              </motion.button>
              <div className="flex justify-center gap-4">
                <button type="button" onClick={() => donorAuth.sendCode(donorAuth.email)} className="text-sm text-gray-400 font-medium">Resend code</button>
                <button type="button" onClick={donorAuth.resetToEmail} className="text-sm text-gray-400 font-medium">Change email</button>
              </div>
            </form>
          ) : (
            <>
              {!(donorAuth.existingSession && !donorAuth.checkingSession) && (
                <form onSubmit={handleSendCode} className="space-y-2">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Your Email</label>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => { setEmailInput(e.target.value); setEmailInputError(null); }}
                      placeholder="you@example.com"
                      className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400 text-gray-900"
                      style={{ borderColor: emailInputError || donorAuth.sendError ? '#ef4444' : '#e5e7eb' }}
                    />
                    {emailInputError && <p className="text-red-500 text-xs mt-1 px-1">{emailInputError}</p>}
                    {donorAuth.sendError && <p className="text-red-500 text-xs mt-1 px-1">{donorAuth.sendError}</p>}
                  </div>
                  <motion.button whileTap={{ scale: 0.97 }} type="submit"
                    className="w-full py-3.5 rounded-2xl font-bold text-sm text-white"
                    style={{ background: 'linear-gradient(135deg, #0B2A4A, #003865)', opacity: canContinue && !donorAuth.sendingCode ? 1 : 0.4 }}>
                    {donorAuth.sendingCode ? 'Sending…' : 'Email me a code →'}
                  </motion.button>
                </form>
              )}

              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-gray-100" />
                <p className="text-gray-400 text-xs font-medium">or</p>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              <SsoButtons onPress={handleSSO} chosen={chosen} disabled={!canContinue} errors={donorAuth.oauthErrors} />

              <p className="text-gray-400 text-xs text-center px-2 pt-1">
                No passwords here  -  we&apos;ll email you a one-time code, or use Apple or Google.
              </p>
              <p className="text-gray-400 text-xs text-center px-2">
                Tax receipts from {nonprofit?.shortName ?? 'your nonprofit'} go to your sign-in email.
              </p>
            </>
          )}

          {/* Already have an account? */}
          <button
            onClick={handleSignIn}
            className="w-full text-center py-2"
          >
            <span className="text-gray-400 text-sm">Already have an account? </span>
            <span className="text-sm font-semibold underline" style={{ color: '#003865' }}>Sign in</span>
          </button>
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
              <div className="text-5xl mb-4">&#127968;</div>
              <h2 className="text-white font-bold text-xl mb-3">Not Available in California Yet</h2>
              <p className="text-white/75 text-sm leading-relaxed mb-6">
                PocketCache isn&apos;t available in California yet. We&apos;re working on it! Ask your favorite nonprofit for updates.
              </p>
              <motion.button
                whileTap={{ scale: 0.9, opacity: 0.6 }}
                onClick={() => setSelectedState('')}
                className="bg-white/20 text-white font-semibold px-6 py-3 rounded-2xl text-sm"
              >
                ← Go Back
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Consent checkbox  -  pinned below the scroll area */}
      <div className="bg-white px-5 pt-3 space-y-3" style={{ paddingBottom: safeBottomAtLeast(32, 12) }}>
          <label
            className="flex items-start gap-3 cursor-pointer"
            onClick={e => { if (e.target.tagName !== 'A') { setAgreedTerms(v => !v); setShowTermsHint(false); } }}
            style={showTermsHint && !agreedTerms ? { outline: '2px solid #f59e0b', borderRadius: 8, padding: 4 } : {}}
          >
            <div
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
              style={{ borderColor: agreedTerms ? '#003865' : '#d1d5db', background: agreedTerms ? '#003865' : '#fff' }}
            >
              {agreedTerms && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-xs text-gray-500 leading-relaxed">
              I am at least 18 years old and agree to the{' '}
              <a href="/legal/terms/" target="_blank" rel="noopener" className="font-semibold underline" style={{ color: '#003865' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/legal/privacy/" target="_blank" rel="noopener" className="font-semibold underline" style={{ color: '#003865' }}>Privacy Policy</a>.
            </span>
          </label>
          <label
            className="flex items-start gap-3 cursor-pointer"
            onClick={e => { if (e.target.tagName !== 'A') setCommsOptin(v => !v); }}
          >
            <div
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
              style={{ borderColor: commsOptin ? '#003865' : '#d1d5db', background: commsOptin ? '#003865' : '#fff' }}
            >
              {commsOptin && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-xs text-gray-500 leading-relaxed">
              PocketCache and {nonprofit?.shortName ?? 'your nonprofit'} may contact me with account and giving updates  -  details in our{' '}
              <a href="/legal/terms/#communications" target="_blank" rel="noopener" className="font-semibold underline" style={{ color: '#003865' }}>Terms</a>.
            </span>
          </label>
          {selectedState === '' && (
            <p className="text-xs text-center text-gray-400">Select your state above to continue</p>
          )}
          {selectedState !== '' && !agreedTerms && (
            <p className="text-xs text-center text-gray-400">Check the box above to continue</p>
          )}
          {showTermsHint && !agreedTerms && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-amber-600 font-medium text-center"
            >
              Please confirm this to continue
            </motion.p>
          )}
      </div>
      {/* Welcome back overlay */}
      <AnimatePresence>
        {welcomeBack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center gap-4 px-8"
            style={{ ...scrim('opaque'), zIndex: Z.blocking }}
          >
            <div className="text-5xl">👋</div>
            <p className="text-white font-bold text-2xl text-center">Welcome back, {hasAccount?.name}!</p>
            <p className="text-white/70 text-sm text-center">Taking you to your dashboard…</p>
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
    // onComplete resolves the org this email actually administers and returns
    // false for an email it does not recognize - stay on this screen and say
    // so instead of navigating into a dashboard that is not this admin's.
    const ok = onComplete(email.trim().toLowerCase());
    if (!ok) { setCodeError("We don't recognize that email. Use the work email you verified during setup."); return; }
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
        <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onBack} className="text-white/60 text-sm font-semibold mb-4 self-start flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </motion.button>
        <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
          Nonprofit{'\n'}Admin
        </h1>
        <p className="text-white/70 text-xs mt-2 leading-relaxed">
          Sign in with your organization&apos;s work email. No password  -  we email you a fresh code each time.
        </p>
      </div>
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-6 pt-6 pb-10">
        {!sent ? (
          <form onSubmit={send} className="space-y-3">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Work email</label>
            <input
              type="email" required value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="you@yourorg.org"
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400"
              style={{ borderColor: error ? '#ef4444' : '#e5e7eb' }}
            />
            {error && <p className="text-red-500 text-xs px-1">{error}</p>}
            <motion.button whileTap={{ scale: 0.97 }} type="submit"
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0B2A4A, #003865)', opacity: email ? 1 : 0.4 }}>
              Email me a sign-in code →
            </motion.button>
            <p className="text-gray-400 text-xs leading-relaxed px-1">
              Your admin sign-in is the work email verified when your page was created.
              Nothing to remember, nothing to steal.
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-gray-500 text-sm">
              We sent a 6-digit code to <strong className="text-gray-900">{email}</strong>.
            </p>
            <div className="rounded-2xl px-3 py-2 bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700 font-semibold">
                Demo: we filled the code in for you  -  the live version emails it.
              </p>
            </div>
            <input
              type="text" inputMode="numeric" maxLength={6} value={codeInput}
              onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setCodeError(null); }}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 outline-none border border-gray-200 focus:border-blue-400 font-mono text-center text-xl tracking-[0.5em]"
              style={{ borderColor: codeError ? '#ef4444' : '#e5e7eb' }}
            />
            {codeError && <p className="text-red-500 text-xs px-1">{codeError}</p>}
            <motion.button whileTap={{ scale: 0.97 }} type="submit"
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0B2A4A, #003865)', opacity: codeInput.length === 6 ? 1 : 0.4 }}>
              Sign in →
            </motion.button>
            <div className="flex justify-center gap-4">
              <button type="button" onClick={send} className="text-sm text-gray-400 font-medium">Resend code</button>
              <button type="button" onClick={() => { setSent(false); setCodeInput(''); }} className="text-sm text-gray-400 font-medium">Change email</button>
            </div>
          </form>
        )}
      </div>
    </motion.div>
  );
}

// ─── Gate Sign-In Screen (universal "already have an account?" path) ─────────
// Shown when a returning user taps "Already have an account? Sign in" from the gate.
// Three demo outcomes after an SSO tap:
//   • Local identity found + active   → onSignIn() → resumeSession() → last-used mode
//   • Local identity found + cancelled → onSignIn() → resumeSession() → home (reactivate overlay)
//   • No local identity (fresh device) → empty state shown inline
//   Production: the backend looks up the account by SSO token, not local storage.

function GateSignInScreen({ onBack, hasAccount, adminRole, onSignIn, onDemoAdmin, onAdminSignIn }) {
  const [chosen, setChosen] = useState(null);
  const [emptyState, setEmptyState] = useState(false);

  function handleSSO(provider) {
    if (chosen) return; // prevent double-tap
    setChosen(provider);
    setTimeout(() => {
      if (!hasAccount && !adminRole) {
        // Production: backend identity lookup by SSO token finds the account anywhere.
        // Demo: no account found on this device  -  show the empty state.
        setEmptyState(true);
        setChosen(null);
        return;
      }
      // One door for everyone: onSignIn routes by the identity's roles  - 
      // donor-only → giving, admin-only → dashboard, both → last-used mode.
      // Cancelled donors see the Reactivate overlay on home.
      onSignIn();
    }, 800);
  }

  if (emptyState) {
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
          <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onBack} className="text-white/60 text-sm font-semibold mb-4 self-start flex items-center gap-1">
            <ArrowLeft size={14} /> Back
          </motion.button>
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
            No Account{'\n'}Found
          </h1>
          <p className="text-white/70 text-xs mt-2 leading-relaxed">
            We couldn&apos;t find an account on this device.
          </p>
        </div>
        <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col justify-center px-6 pb-10">
          <p className="text-gray-500 text-sm text-center leading-relaxed mb-6 px-2">
            In the real app, signing in with Apple or Google finds your account anywhere  -  no device lock-in.
          </p>
          <motion.button
            whileTap={{ scale: 0.9, opacity: 0.6 }}
            onClick={onBack}
            className="w-full py-4 rounded-2xl font-semibold text-sm"
            style={{ background: '#f0f4f8', color: '#0B2A4A' }}
          >
            ← Back to gate
          </motion.button>
          {/* Demo-only shortcut so prospects can see the admin side without creating an org */}
          <button
            onClick={onDemoAdmin}
            className="w-full text-center py-3 mt-2 text-xs text-gray-400"
          >
            Demo: preview the BGCA admin dashboard →
          </button>
        </div>
      </motion.div>
    );
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
        <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onBack} className="text-white/60 text-sm font-semibold mb-4 self-start flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </motion.button>
        <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
          Welcome{'\n'}Back
        </h1>
        <p className="text-white/70 text-xs mt-2 leading-relaxed">
          Sign in with the account you used before.
        </p>
      </div>
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-6 pt-6 pb-10 gap-4">
        <SsoButtons onPress={handleSSO} chosen={chosen} />
        <p className="text-gray-400 text-xs text-center leading-relaxed px-2">
          No passwords here  -  your Apple or Google account is your key, including its two-factor protection.
        </p>
        {onAdminSignIn && (
          <button onClick={onAdminSignIn} className="text-sm text-gray-400 text-center py-1">
            Nonprofit admin? <span className="font-semibold underline" style={{ color: '#003865' }}>Sign in with your work email</span>
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

function ConnectCardScreen({ onNext, onBack }) {
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
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
            Which card should{'\n'}we track?
          </h1>
          <p className="text-white/80 text-xs mt-2 text-center leading-relaxed">
            Every purchase rounds up  -  the change goes straight to your cause.
          </p>
        </div>
      </div>

        <div className="rounded-t-3xl -mt-4" style={{ background: '#f0fdfb', minHeight: sheetMinHeight }}>
          <div className="px-4 pt-10 space-y-2.5" style={{ paddingBottom: sheetPadBottom }}>

          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest px-1 pb-1">Connect your bank</p>

          {connected ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: '#f0fdfa', border: '1px solid #99f6e4' }}
            >
              <CheckCircle size={22} className="shrink-0" style={{ color: '#0D9488' }} />
              <div>
                <p className="font-bold text-sm" style={{ color: '#134e4a' }}>{connected.name} ····{connected.last4} connected</p>
                <p className="text-xs mt-0.5" style={{ color: '#0f766e' }}>We&apos;ll track your purchases and calculate round-ups as they happen</p>
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
              <PlaidBankConnect variant="app" onConnected={card => setConnected(card)} />
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl text-left border-2 border-dashed border-gray-200 bg-white mt-2.5"
                onClick={() => setShowManualEntry(true)}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-teal-50">
                  <Lock size={18} className="text-teal-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-700 text-sm">Enter your card manually</p>
                  <p className="text-gray-400 text-xs">Type your card number  -  encrypted via Plaid</p>
                </div>
                <ArrowRight size={16} className="text-gray-300 shrink-0" />
              </motion.button>
            </>
          )}

          <div className="flex items-center gap-2 px-1 pt-1">
            <Lock size={12} className="text-gray-400 shrink-0" />
            <p className="text-gray-400 text-xs">Read-only access via Plaid · Your credentials are never stored by PocketCache</p>
          </div>
          </div>
        </div>
        <ScrollFadeEdge show={showFade} rgb="240,253,251" />
      </div>

      <div className="px-4 pt-3 border-t border-teal-100" style={{ background: '#f0fdfb', paddingBottom: safeBottomAtLeast(40, 12) }}>
          <motion.button
            whileTap={connected ? { scale: 0.97 } : {}}
            onClick={() => connected && onNext(connected)}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: connected ? 'linear-gradient(135deg, #0d9488, #003865)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              cursor: connected ? 'pointer' : 'default',
            }}
          >
            {connected ? 'Continue →' : 'Select a card to continue'}
          </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Step 2: Choose payment method ───────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const PAYMENT_OPTIONS = [
  {
    id: 'ach',
    icon: '🏦',
    label: 'Bank Account',
    sub: 'Direct bank transfer · Includes flat $1/month app fee',
    badge: null,
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
    icon: '💳',
    label: 'Credit or Debit Card',
    sub: 'Visa, Mastercard, Amex, or Discover · Includes flat $1/month app fee',
    badge: null,
  },
];

function PaymentMethodScreen({ onNext, onBack }) {
  const {
    frameRef, scrollRef, heroRef, onScroll,
    heroMinHeight, heroExpandedOpacity, heroCompactOpacity, sheetMinHeight, barHeight,
  } = useHeroCollapse();
  const { sheetPadBottom, showFade, syncFade } = useSheetScroll(scrollRef);
  const { selectedNonprofit, monthlyCap, setMonthlyCap } = useApp();
  const [selected, setSelected] = useState(null);
  const [showApplePay, setShowApplePay] = useState(false);
  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';
  const npName  = selectedNonprofit?.name      ?? 'your nonprofit';

  function handleContinue() {
    if (!selected) return;
    if (selected === 'apple_pay') { setShowApplePay(true); return; }
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
              {['🏦', <AppleLogo key="apple-hero-icon" size={22} color="#fff" />, '💳'].map((icon, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.1 + 0.2, type: 'spring', stiffness: 280 }}
                  className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl"
                >
                  {icon}
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-2 bg-white/20 rounded-xl px-3 py-1.5"
            >
              <span className="text-white text-xs font-semibold">Charged once a month · $5 minimum</span>
            </motion.div>
          </motion.div>
          {/* Hard break, and both halves must fit 329px at text-3xl: "How should
              we collect" measures 329.34px, which is why this used to wrap into
              three lines and split "round-ups" across two of them. */}
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
            How do we collect{'\n'}your round-ups?
          </h1>
          <p className="text-white/80 text-xs mt-1 text-center leading-relaxed">
            One monthly charge  -  your choice of payment method.
          </p>
        </div>
      </div>

        <div className="bg-gray-50 rounded-t-3xl -mt-4" style={{ minHeight: sheetMinHeight }}>
          <div className="px-4 pt-10 space-y-2.5" style={{ paddingBottom: sheetPadBottom }}>

          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest px-1 pb-1">Choose your payment method</p>

          {PAYMENT_OPTIONS.map(opt => (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelected(opt.id)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all"
              style={selected === opt.id
                ? { background: '#FEF3C7', border: '2px solid #FBBF24' }
                : { background: '#fff', border: '1.5px solid #e5e7eb' }
              }
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-2xl bg-gray-50">
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-900 text-sm">{opt.label}</p>
                  {opt.badge && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ background: opt.badgeColor }}>
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-xs mt-0.5">{opt.sub}</p>
              </div>
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                style={selected === opt.id
                  ? { borderColor: '#FBBF24', background: '#FBBF24' }
                  : { borderColor: '#d1d5db', background: 'transparent' }
                }
              >
                {selected === opt.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </motion.button>
          ))}

          <p className="text-gray-400 text-xs text-center px-2 pt-1">
            Change this anytime in Settings. Payments are processed by Stripe  -  not us.
          </p>

          {/* Quiet monthly-max opt-in  -  deliberately understated (adjust later in Settings) */}
          <div className="rounded-2xl p-4 bg-white" style={{ border: '1.5px solid #e5e7eb' }}>
            <label
              className="flex items-start gap-3 cursor-pointer"
              onClick={() => setMonthlyCap(monthlyCap === null ? 20 : null)}
            >
              <div
                className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                style={{ borderColor: monthlyCap !== null ? '#003865' : '#d1d5db', background: monthlyCap !== null ? '#003865' : '#fff' }}
              >
                {monthlyCap !== null && <CheckCircle size={12} className="text-white" />}
              </div>
              <span className="text-xs text-gray-500 leading-relaxed">
                Set a monthly maximum (optional)  -  round-ups above it are simply never charged.
              </span>
            </label>
            {monthlyCap !== null && (
              <div className="mt-3">
                <div className="text-center py-1">
                  <span className="text-2xl font-bold text-gray-900">${monthlyCap}</span>
                  <span className="text-gray-400 text-sm ml-1">/month</span>
                </div>
                <input
                  type="range" min={5} max={200} step={5} value={monthlyCap}
                  onChange={e => setMonthlyCap(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className="flex justify-between text-xs text-gray-400"><span>$5</span><span>$200</span></div>
              </div>
            )}
          </div>
          </div>
        </div>
        <ScrollFadeEdge show={showFade} rgb="249,250,251" />
      </div>

      <div className="px-4 pt-3 bg-gray-50 border-t border-gray-100" style={{ paddingBottom: safeBottomAtLeast(40, 12) }}>
          <motion.button
            whileTap={selected ? { scale: 0.97 } : {}}
            onClick={handleContinue}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: selected ? 'linear-gradient(135deg, #FBBF24, #E5A800)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              color: selected ? '#0B2A4A' : '#fff',
              cursor: selected ? 'pointer' : 'default',
            }}
          >
            {selected === 'apple_pay' ? 'Pay with Apple Pay →' : selected ? 'Continue →' : 'Choose a payment method'}
          </motion.button>
          <p className="text-center text-gray-400 text-xs leading-relaxed px-2 mt-3">
            Your round-ups charge once a month through {npName}&apos;s Stripe. You&apos;ll see &ldquo;{npShort}&rdquo; on your statement. They issue your receipt.
          </p>
      </div>
      <ApplePaySheet
        show={showApplePay}
        payee={npName}
        contextLine="Charged once a month for your round-ups  -  set up now, nothing charges today."
        onCancel={() => setShowApplePay(false)}
        onSuccess={info => { setShowApplePay(false); onNext('apple_pay', info); }}
      />
    </motion.div>
  );
}

// ─── Step 3 (CC path): Enter card via Stripe Elements ───────────────────────

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#111827',
      fontFamily: '"Inter", system-ui, sans-serif',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#ef4444' },
  },
  hidePostalCode: false,
};

function CardEntryForm({ onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [practice, setPractice] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    // The real save: SetupIntent from our stripe-setup-intent edge function,
    // confirmCardSetup in the browser (card number goes straight to Stripe),
    // then stripe-setup-complete verifies server-side and returns the true
    // brand/last4. See src/lib/stripeSetup.js.
    try {
      const element = elements.getElement(CardElement);
      const email = await currentDonorEmail();
      const result = await saveCardWithSetupIntent(stripe, element, email);
      setLoading(false);
      if (result.error) { setError(result.error); return; } // decline/bad number - donor retries
      onSuccess(result.card);
      return;
    } catch {
      // Backend or Stripe unreachable before the card was involved: fall back
      // to the old simulated save so signup never dead-ends, shown as
      // practice mode (same pattern as the Plaid bank fallback).
    }

    setPractice(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    onSuccess({ last4, simulated: true });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div
        className="bg-white rounded-2xl px-4 py-4 border"
        style={{ borderColor: error ? '#ef4444' : '#e5e7eb' }}
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Card details</p>
        <CardElement
          options={CARD_ELEMENT_OPTIONS}
          onChange={e => {
            setCardComplete(e.complete);
            setError(e.error?.message ?? null);
          }}
        />
      </div>

      {error && <p className="text-red-500 text-xs px-1">{error}</p>}
      {practice && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a' }}>
          Practice mode  -  we could not reach the real card service right now, so this step is simulated.
        </p>
      )}

      <div className="flex items-center gap-2 px-1">
        <Lock size={13} className="text-gray-400 shrink-0" />
        <p className="text-gray-400 text-xs">
          Card details secured by <span className="font-semibold">Stripe</span>. PocketCache never sees your card number.
        </p>
      </div>

      <motion.button
        type="submit"
        whileTap={cardComplete && !loading ? { scale: 0.97 } : {}}
        disabled={!cardComplete || loading || !stripe}
        className="w-full py-4 rounded-2xl text-white font-bold text-base"
        style={{
          background: cardComplete && !loading
            ? 'linear-gradient(135deg, #FBBF24, #E5A800)'
            : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
          color: cardComplete && !loading ? '#0B2A4A' : '#fff',
          cursor: cardComplete && !loading ? 'pointer' : 'default',
        }}
      >
        {loading ? 'Saving card securely…' : 'Save Card →'}
      </motion.button>
    </form>
  );
}

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
    <Elements stripe={stripePromise}>
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
            <span className="text-white font-bold text-sm px-6 truncate max-w-full">Add your card</span>
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
                className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl mb-5"
              >
                💳
              </motion.div>
              <h1 className="text-white font-bold text-3xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
                Add your card
              </h1>
              <p className="text-white/80 text-xs mt-2 text-center leading-relaxed">
                Stripe handles your card  -  we never see the number. Round-ups collect monthly on {npShort}&apos;s behalf.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-t-3xl -mt-4" style={{ minHeight: sheetMinHeight }}>
            <div className="px-4 pt-8" style={{ paddingBottom: safeBottomAtLeast(40, 12) }}>
              <CardEntryForm onSuccess={(info) => onNext(info)} />
              <p className="text-center text-gray-400 text-xs leading-relaxed px-2 mt-4">
                Round-ups collect monthly on {npShort}&apos;s behalf. They issue your tax receipt directly.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </Elements>
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
    selectedNonprofit, pendingRoundUps, feeMonths, monthlyCap, chargeAdjustment,
    coverProcessing, setCoverProcessing,
  } = useApp();
  // The tick box below is the donor's standing answer, not a one-screen toggle.
  // It used to be local `useState(true)` that was thrown away when onboarding
  // finished, so a pre-checked promise ("100% of my round-ups reach them") never
  // reached a single monthly charge and the nonprofit quietly ate the card fee.
  // It now reads and writes the persisted `coverProcessing` in AppContext
  // (pc_cover_processing), which is the same value the dashboard, the charge
  // review alert and Settings bill from.
  //
  // The cap the donor just ticked on PaymentMethodScreen is live state, so this
  // screen has to honour it: without monthlyCap in the math, the same stored
  // state produced an uncapped total here and a capped one in the web review
  // step (WebOnboarding.jsx:219-227). Precedence lives in lib/billing.
  const accrued = pendingRoundUps ?? 4.63;
  const roundUps = effectiveCharge({ pendingRoundUps: accrued, monthlyCap, chargeAdjustment });
  const appFee = feeMonths;
  // Processing cover follows what is actually charged, not the raw accrual  -
  // same as WebOnboarding, so the two review screens agree to the cent.
  const processingCover = processingCoverFor(roundUps);
  // Amounts and dates both come from lib/billing  -  this screen must never do
  // its own charge math or assume "next month's 11th".
  const total = chargeTotal({
    pendingRoundUps: accrued,
    monthlyCap,
    chargeAdjustment,
    feeMonths,
    processingCover: coverProcessing ? processingCover : 0,
  });
  const capActive = monthlyCap !== null && monthlyCap !== undefined && accrued > monthlyCap;
  const adjusted = chargeAdjustment !== null && chargeAdjustment !== undefined;
  const chargeOn = nextChargeLabel();

  // Commit the answer on the way out, even when the donor never touched the box.
  // The box is pre-checked, so "left alone" is still an affirmative answer to a
  // question about money, and it should be a stored fact rather than an absent
  // key that only happens to default the right way.
  function confirm() {
    setCoverProcessing(coverProcessing);
    onConfirm();
  }
  const rolloverCharge = chargeAfterNextLabel();

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
          <h1 className="text-white font-bold text-3xl leading-tight text-center whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
            Review &amp;{'\n'}Confirm
          </h1>
          <p className="text-white/80 text-xs mt-2 text-center">
            Your round-ups are collected monthly by {npName}.
          </p>
        </div>
      </div>

      {/* Sheet */}
        <div className="bg-white rounded-t-3xl -mt-4" style={{ minHeight: sheetMinHeight }}>
          <div className="px-5 pt-8 space-y-4" style={{ paddingBottom: sheetPadBottom }}>

          {/* Estimate card */}
          <div className="rounded-2xl p-4" style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5' }}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Monthly Estimate</p>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-700">Round-ups this month</span>
              <span className="font-bold text-gray-900" data-testid="confirm-roundups">
                {roundUps !== accrued
                  ? <><s className="text-gray-400 font-normal">${accrued.toFixed(2)}</s> ${roundUps.toFixed(2)}</>
                  : `$${roundUps.toFixed(2)}`}
              </span>
            </div>
            {/* Same note, same wording as the web review step
                (WebOnboarding.jsx:446-450) so the two surfaces read identically. */}
            {capActive && !adjusted && (
              <p className="text-xs mb-2" style={{ color: '#b45309' }} data-testid="confirm-cap-note">
                Your ${monthlyCap}/month cap applies  -  round-ups above it are simply never charged.
              </p>
            )}
            {adjusted && (
              <p className="text-xs mb-2 font-semibold" style={{ color: '#059669' }}>
                Adjusted to ${chargeAdjustment.toFixed(2)} for this month.
              </p>
            )}
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span>
              <span className="text-sm text-gray-500">+${appFee.toFixed(2)}</span>
            </div>
            {feeMonths > 1 && (
              <p className="text-xs text-gray-500 mb-2">
                {feeMonths - 1} month{feeMonths - 1 !== 1 ? 's' : ''} of the $1 fee rolled over from a skipped month, so {feeMonths} land on the {chargeOn} charge.
              </p>
            )}
            {coverProcessing && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">Processing cover (goes to {npShort})</span>
                <span className="text-sm text-gray-500">+${processingCover.toFixed(2)}</span>
              </div>
            )}
            <div className="h-px bg-slate-200 my-2" />
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-900">One charge from {npShort}</span>
              <span className="font-bold text-xl" style={{ color: '#003865' }}>${total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 italic">
              This is an example  -  no real charge is made in this demo.
            </p>
          </div>

          {/* Processing cover toggle */}
          {/* Writes through to AppContext, so the answer survives onboarding and
              every later charge bills from it. `setCoverProcessing` persists a
              boolean - it is not a useState setter, so no updater function. */}
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl"
            data-testid="cover-processing-toggle"
            onClick={() => setCoverProcessing(!coverProcessing)}
            style={{ background: coverProcessing ? '#d1fae5' : '#f9fafb', border: coverProcessing ? '1.5px solid #6ee7b7' : '1.5px solid #e5e7eb' }}>
            <div
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
              style={{ borderColor: coverProcessing ? '#059669' : '#d1d5db', background: coverProcessing ? '#059669' : '#fff' }}>
              {coverProcessing && <CheckCircle size={12} className="text-white" />}
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-900">
                Cover {npShort}&apos;s card-processing costs too, so 100% of my round-ups reach them.
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                {coverProcessing
                  ? `The ~$${processingCover.toFixed(2)} goes directly to ${npShort}  -  PocketCache never touches it. It counts as part of your donation.`
                  : `${npShort} receives your round-ups minus standard card-processing costs, like any donation.`}
              </p>
            </div>
          </label>

          {/* One-charge explanation */}
          <div className="rounded-2xl p-4 bg-gray-50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">How charges work</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Once a month, {npName} bundles your round-ups into one charge. You&apos;ll see{' '}
              <strong>&ldquo;{npShort}&rdquo;</strong> on your statement  -  not PocketCache.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {npShort} sends your tax receipt  -  they&apos;re the ones receiving your donation.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              The flat $1/month app fee isn&apos;t tax-deductible, but your round-ups are. When you cover card-processing costs, that amount counts as part of your donation too. Months under ${selectedNonprofit?.monthlyMinimum ?? 5} roll forward to the {rolloverCharge} charge instead  -  we settle up within 3 months at most.
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Tracking starts the moment your card is linked. Your round-ups total up through the last day of the month, we email your <strong>exact amount on the 1st</strong>, and the <strong>charge runs on the {CHARGE_DAY}th</strong>  -  next one {chargeOn}, a full {REVIEW_WINDOW_LAST_DAY} days to review it, and nothing before today ever counts.
            </p>
          </div>
          </div>
        </div>
        <ScrollFadeEdge show={showFade} rgb="255,255,255" />
      </div>

      <div className="px-4 pt-3 bg-white border-t border-gray-100" style={{ paddingBottom: safeBottomAtLeast(40, 12) }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={confirm}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{ background: 'linear-gradient(135deg, #003865, #001a33)' }}>
            Start Giving to {npShort}
          </motion.button>
          <p className="text-center text-gray-400 text-xs leading-relaxed px-2 mt-3">
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
  ein:            { title: 'Verify Your\nNonprofit',   sub: 'We check your 501(c)(3) status against public IRS records. Takes a few seconds.' },
  'confirm-org':  { title: 'Confirm\nYour Org',        sub: 'Make sure this is the right organization before we set anything up.' },
  'verify-email': { title: 'Verify Your\nWork Email',  sub: 'An email on your own domain proves you can act for the organization. It becomes your admin sign-in.' },
  stripe:         { title: 'Connect\nStripe',          sub: 'Donations charge on your Stripe account. You stay the merchant of record.' },
  branding:       { title: 'Customize\nYour Page',     sub: 'This is what donors see when they scan your code or open your link.' },
  license:        { title: 'License\nAgreement',       sub: 'Always free for your nonprofit. Never a percentage of donations.' },
  'app-listing':  { title: 'One Last Thing\nfor the App', sub: 'Your webpage and widget are already live  -  this is only about the iPhone app.' },
  live:           { title: "You're\nLive! 🎉",         sub: 'Share your join code and donors can start rounding up today.' },
};

function NonprofitSignupFlow({ onBack }) {
  const {
    step,
    ein, setEin, einError, verifying, einDemoMode, einNameEditable,
    orgName, setOrgName, orgAddress, org501c3,
    adminEmail, workEmail, setWorkEmail, emailError,
    codeSent, codeInput, setCodeInput, codeError, demoBypassNote, requiredDomain,
    stripeConnecting, stripeConnected,
    story, setStory, color, setColor, monthlyMinimum, setMonthlyMinimum,
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
    config,
  } = useNpSignup({ onExit: onBack, defaultLogo: bgcaLogoUrl });
  const goLive = useNpGoLive();
  const fileInputRef = useRef(null);
  const [teamIdCopied, setTeamIdCopied] = useState(false);
  const [teamIdCopyFailed, setTeamIdCopyFailed] = useState(false);

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
        <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={back} className="text-white/60 text-sm font-semibold mb-4 self-start">← Back</motion.button>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 280 }}
          className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-3 self-start"
        >
          <CoinMark size={40} />
        </motion.div>
        <h1 className="text-white font-bold text-3xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
          {NP_SIGNUP_HEADER[step]?.title}
        </h1>
        <p className="text-white/80 text-xs mt-2 leading-relaxed">
          {NP_SIGNUP_HEADER[step]?.sub}
        </p>
      </div>

      {/* Sheet */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-5 pt-6 pb-10 space-y-4">

        {step === 'ein' && (
          <form onSubmit={verifyEIN} className="space-y-4">
            <p className="text-gray-500 text-sm">
              Enter your organization&apos;s EIN. We&apos;ll verify your 501(c)(3) status with IRS data from ProPublica.
            </p>
            <div>
              <input
                type="text"
                placeholder="XX-XXXXXXX"
                value={ein}
                onChange={e => setEin(e.target.value)}
                required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400 font-mono"
                style={{ borderColor: einError ? '#ef4444' : '#e5e7eb' }}
              />
              {einError && <p className="text-red-500 text-xs mt-1 px-1">{einError}</p>}
              <p className="text-gray-400 text-xs mt-1 px-1">Format: XX-XXXXXXX (9 digits)</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={verifying}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)', opacity: ein ? 1 : 0.4 }}>
              {verifying ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
                  Verifying…
                </span>
              ) : 'Verify EIN →'}
            </motion.button>
            <p className="text-gray-400 text-xs text-center px-2">
              We only use this to confirm your 501(c)(3) status. Takes a few seconds.
            </p>
          </form>
        )}

        {step === 'confirm-org' && (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm">We found a match. Is this your organization?</p>
            <div className="rounded-2xl p-5 bg-gray-50 border border-gray-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-white flex items-center justify-center border border-gray-100">
                  <img src={bgcaLogoUrl} alt="Org" className="w-full h-full object-contain p-1.5" style={{ display: 'block' }} />
                </div>
                <div className="flex-1 min-w-0">
                  {einNameEditable ? (
                    <input
                      type="text"
                      value={orgName}
                      onChange={e => setOrgName(e.target.value)}
                      placeholder="Your Nonprofit"
                      className="w-full font-bold text-gray-900 text-base bg-white rounded-lg px-2 py-1 outline-none border border-gray-200 focus:border-teal-400"
                    />
                  ) : (
                    <p className="font-bold text-gray-900 text-base">{orgName}</p>
                  )}
                  <p className="text-gray-500 text-xs">{orgAddress}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-green-500 shrink-0" />
                <p className="text-green-700 text-xs font-semibold">
                  {org501c3 ? '501(c)(3) Verified' : 'Organization found'} · EIN {ein}
                </p>
              </div>
              {einDemoMode && (
                <p className="text-xs text-amber-600 italic">
                  {einNameEditable
                    ? "Demo data  -  we couldn't match this EIN, so enter your organization's name."
                    : 'Demo data  -  live verification uses IRS public records.'}
                </p>
              )}
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={confirmOrg}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}>
              Confirm  -  this is us →
            </motion.button>
            <button onClick={reenterEIN} className="w-full text-center text-sm text-gray-400 py-1 font-medium">
              No, re-enter EIN
            </button>
          </div>
        )}

        {step === 'verify-email' && (
          <div className="space-y-4">
            {!codeSent ? (
              <form onSubmit={sendCode} className="space-y-4">
                <p className="text-gray-500 text-sm">
                  Prove you work at {orgName}: enter your work email on your organization&apos;s
                  own domain and we&apos;ll send a 6-digit code. This address becomes your admin sign-in.
                </p>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Your work email</label>
                  <input
                    type="email"
                    required
                    value={workEmail}
                    onChange={e => setWorkEmail(e.target.value)}
                    placeholder={requiredDomain ? `you@${requiredDomain}` : 'you@yourorg.org'}
                    className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400"
                    style={{ borderColor: emailError ? '#ef4444' : '#e5e7eb' }}
                  />
                  {emailError && <p className="text-red-500 text-xs mt-1 px-1">{emailError}</p>}
                </div>
                <motion.button whileTap={{ scale: 0.97 }} type="submit"
                  className="w-full py-4 rounded-2xl text-white font-bold text-base"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #003865)', opacity: workEmail ? 1 : 0.4 }}>
                  Email me a verification code →
                </motion.button>
                <p className="text-gray-400 text-xs px-1 leading-relaxed">
                  Personal addresses (Gmail, Yahoo, iCloud…) can&apos;t manage a nonprofit.
                  No password is ever created  -  admin sign-in works by emailed code, so there&apos;s
                  nothing for anyone to steal.
                </p>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-4">
                <p className="text-gray-500 text-sm">
                  We sent a 6-digit code to <strong className="text-gray-900">{workEmail}</strong>. Enter it to continue.
                </p>
                <div className="rounded-2xl px-3 py-2 bg-amber-50 border border-amber-200 space-y-1">
                  <p className="text-xs text-amber-700 font-semibold">
                    Demo: we filled the code in for you  -  the live version emails it to {workEmail}.
                  </p>
                  {demoBypassNote && (
                    <p className="text-xs text-amber-700">
                      Also demo-only: this email was accepted, but {demoBypassNote}.
                    </p>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value)}
                  placeholder="······"
                  className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 outline-none border border-gray-200 focus:border-teal-400 font-mono text-center text-xl tracking-[0.5em]"
                  style={{ borderColor: codeError ? '#ef4444' : '#e5e7eb' }}
                />
                {codeError && <p className="text-red-500 text-xs px-1">{codeError}</p>}
                <motion.button whileTap={{ scale: 0.97 }} type="submit"
                  className="w-full py-4 rounded-2xl text-white font-bold text-base"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #003865)', opacity: codeInput.length === 6 ? 1 : 0.4 }}>
                  Verify &amp; continue →
                </motion.button>
                <div className="flex justify-center gap-4">
                  <button type="button" onClick={sendCode} className="text-sm text-gray-400 font-medium">Resend code</button>
                  <button type="button" onClick={changeEmail} className="text-sm text-gray-400 font-medium">Change email</button>
                </div>
              </form>
            )}
          </div>
        )}

        {step === 'stripe' && (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm">
              Connect your Stripe account. Donations charge directly on your Stripe  -  you&apos;re the merchant of record the whole time.
            </p>
            {stripeConnected ? (
              <div className="rounded-2xl p-4 bg-green-50 border border-green-200">
                <p className="text-green-800 text-sm font-bold">&#10003; Stripe Connected</p>
                <p className="text-green-700 text-xs mt-1">You are the merchant of record for all donations</p>
              </div>
            ) : (
              <motion.button whileTap={{ scale: 0.97 }} onClick={connectStripe}
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #635bff, #4b45c6)' }}>
                {stripeConnecting ? 'Connecting…' : 'Connect with Stripe'}
              </motion.button>
            )}
            {stripeConnected && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={stripeNext}
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}>
                Continue →
              </motion.button>
            )}
            <p className="text-gray-400 text-xs text-center px-2">PocketCache never touches the money  -  it goes straight from donors into your Stripe account.</p>
          </div>
        )}

        {step === 'branding' && (
          <form onSubmit={submitBranding} className="space-y-4">
            <p className="text-gray-500 text-sm">Customize how your page looks to donors.</p>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Organization Name</label>
              <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Your Donor Join Code</label>
              <input type="text" value={joinCodeCustom} onChange={e => changeJoinCode(e.target.value)}
                placeholder={joinCode}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400 font-mono uppercase tracking-widest"
                style={{ borderColor: joinCodeError ? '#ef4444' : '#e5e7eb' }} />
              {joinCodeError && <p className="text-red-500 text-xs mt-1 px-1">{joinCodeError}</p>}
              <p className="text-gray-400 text-xs mt-1">
                Letters, numbers, dashes (2-8)  -  short enough to say out loud. This becomes your link  -  pocketcache.app/{joinCode || 'CODE'}  -  plus your QR code and widget. You can change it later in your dashboard.
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Admin Contact Email</label>
              <div className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm border border-gray-200 flex items-center gap-2">
                <CheckCircle size={14} className="text-green-500 shrink-0" />
                <span className="text-gray-900 truncate">{adminEmail}</span>
                <span className="text-xs text-green-700 font-semibold ml-auto shrink-0">Verified</span>
              </div>
              <p className="text-gray-400 text-xs mt-1">Verified in the previous step  -  this is your admin sign-in.</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Your Mission (shown to donors)</label>
              <textarea value={story} onChange={e => setStory(e.target.value)} rows={4} maxLength={600} placeholder="Tell donors what you do…"
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400 resize-none" />
              <p className="text-gray-400 text-xs mt-1">Keep it concise  -  this shows on your public donor page.</p>
              <p className="text-gray-400 text-xs text-right mt-0.5">{story.length}/600</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Brand Color</label>
              <div className="flex flex-wrap gap-3">
                {NP_BRAND_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className="w-10 h-10 rounded-xl border-2 transition-all"
                    style={{ background: c, borderColor: color === c ? '#111' : 'transparent' }} />
                ))}
                <label className="flex flex-col items-center justify-center w-10 h-10 rounded-xl border-2 cursor-pointer transition-all overflow-hidden"
                  style={{ borderColor: !NP_BRAND_COLORS.includes(color) ? '#111' : 'transparent', background: color }}>
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="opacity-0 w-0 h-0 absolute" />
                  <span className="text-white text-xs font-bold leading-none" style={{ textShadow: '0 0 3px rgba(0,0,0,0.5)' }}>+</span>
                </label>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Logo</label>
              <div className="flex items-center gap-3 mb-2">
                <img src={logoPreview} alt="Logo preview" className="h-10 object-contain rounded-lg bg-gray-100 px-2 py-1" />
                <span className="text-xs text-gray-500">Preview: your uploaded logo becomes the app mark for donors.</span>
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={e => setLogoFile(e.target.files?.[0])}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-teal-300 text-teal-600 text-sm font-semibold mb-2">
                Upload image
              </button>
              <input
                type="url"
                placeholder="or paste a logo URL"
                value={logoUrlInput}
                onChange={e => setLogoUrlInput(e.target.value)}
                onBlur={e => applyLogoUrl(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none border border-gray-200 focus:border-teal-400"
              />
              {logoUrlError && <p className="text-red-500 text-xs mt-1">{logoUrlError}</p>}
              <p className="text-gray-400 text-xs mt-1">If you skip this, a default emoji is used as your app mark.</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">
                Monthly Minimum  -  ${monthlyMinimum} <span className="text-gray-400 font-normal normal-case">(default $5)</span>
              </label>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={monthlyMinimum}
                onChange={e => setMonthlyMinimum(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
              <p className="text-gray-400 text-xs mt-1">Donors below this in a month roll over to the next month.</p>
            </div>
            <motion.button whileTap={{ scale: 0.97 }} type="submit"
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}>
              Continue →
            </motion.button>
            {/* submitBranding() refuses on a bad join code. Without this the
                button just did nothing, which reads as broken. */}
            {showBrandingHint && joinCodeError && (
              <p className="text-red-500 text-xs text-center">{joinCodeError}</p>
            )}
          </form>
        )}

        {step === 'license' && (
          <form onSubmit={acceptLicense} className="space-y-4">
            <p className="text-gray-500 text-sm">Review and accept the Nonprofit Software License Agreement before going live.</p>
            <div className="rounded-2xl p-4 bg-gray-50 border border-gray-200 space-y-2 text-xs text-gray-600">
              {NP_LICENSE_POINTS.map(([heading, body]) => (
                <p key={heading}><strong>{heading}</strong> {body}</p>
              ))}
            </div>
            <a href="/legal/nonprofit-license/" target="_blank" rel="noopener"
              className="block text-center text-sm font-semibold underline" style={{ color: '#003865' }}>
              Read full license →
            </a>
            <label className="flex items-start gap-3 cursor-pointer" onClick={() => setAccepted(v => !v)}>
              <div
                className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                style={{ borderColor: accepted ? '#059669' : '#d1d5db', background: accepted ? '#059669' : '#fff' }}>
                {accepted && <CheckCircle size={12} className="text-white" />}
              </div>
              <span className="text-xs text-gray-600 leading-relaxed">I accept the Nonprofit Software License Agreement on behalf of this organization.</span>
            </label>
            {showLicenseHint && !accepted && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-amber-600 font-medium"
              >
                Please accept the license to continue
              </motion.p>
            )}
            <motion.button whileTap={{ scale: 0.97 }} type="submit"
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)', opacity: accepted ? 1 : 0.4 }}>
              Accept &amp; Go Live →
            </motion.button>
          </form>
        )}

        {step === 'app-listing' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4 bg-green-50 border border-green-200">
              <p className="text-green-800 text-sm font-bold">Your webpage and widget go live today</p>
              <p className="text-green-700 text-xs mt-1">
                This next part only affects whether donors can find you inside the PocketCache iPhone app  -  everything else about your program is already set.
              </p>
            </div>
            <p className="text-gray-500 text-sm">
              Apple asks every nonprofit to be verified once before it can appear inside the iPhone app.
              Your organization doesn&apos;t have a Candid Seal of Transparency on file, so the fastest path
              is to register  -  free  -  at the Benevity Causes Portal, using your organization&apos;s
              details and the ID below.
            </p>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">PocketCache Developer ID</p>
              <div className="flex items-center gap-2 bg-gray-900 rounded-2xl p-3">
                <code className="text-green-400 text-sm font-mono flex-1 truncate">{APPLE_TEAM_ID}</code>
                <button
                  onClick={copyTeamId}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl"
                  style={{
                    background: teamIdCopied ? '#d1fae5' : teamIdCopyFailed ? '#fee2e2' : 'rgba(255,255,255,0.12)',
                    color: teamIdCopied ? '#065f46' : teamIdCopyFailed ? '#fecaca' : '#fff',
                  }}
                  title={teamIdCopyFailed ? 'Copy failed  -  select and copy manually' : undefined}
                >
                  {teamIdCopied ? 'Copied!' : teamIdCopyFailed ? 'Try again' : 'Copy'}
                </button>
              </div>
              <p className="text-gray-400 text-xs mt-1">Benevity will ask for this alongside your organization&apos;s own details.</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={openBenevityPortal}
              className="w-full py-4 rounded-2xl font-bold text-base border-2"
              style={{ borderColor: '#003865', color: '#003865', background: '#fff' }}
            >
              Open the Benevity portal →
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={confirmBenevityRegistered}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}
            >
              I have registered →
            </motion.button>
            <button onClick={deferBenevity} className="w-full text-center text-sm text-gray-400 py-1 font-medium">
              I&apos;ll do this later
            </button>
            <p className="text-gray-400 text-xs text-center px-2">
              Either choice takes you live right now. Nothing here blocks your webpage, your widget, or your donors.
            </p>
          </div>
        )}

        {step === 'live' && (
          <div className="space-y-4">
            <p className="text-xs font-bold text-teal-700 uppercase tracking-widest">Live right now</p>
            <div className="rounded-2xl p-4 bg-green-50 border border-green-200 text-center">
              <p className="text-green-800 font-bold text-base mb-1">Your page is live!</p>
              <p className="text-green-700 text-sm font-mono">
                pocketcache.app/{joinCode.toLowerCase()}
              </p>
            </div>
            {/* Join code  -  primary thing to share */}
            <div className="rounded-2xl p-5 text-center" style={{ background: '#f0fdf4', border: '2px solid #86efac' }}>
              <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">Your Donor Join Code</p>
              <p className="text-5xl font-black tracking-wider mb-2" style={{ color: '#065f46' }}>{joinCode}</p>
              <p className="text-green-700 text-xs">Donors enter this in the PocketCache app to join your program</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">QR Code</p>
              <div className="bg-white rounded-xl p-3 inline-block border border-gray-100">
                <QRCodeSVG value={joinQrValue(joinCode)} size={96} level="M" includeMargin />
              </div>
              <p className="text-gray-400 text-xs mt-1">Donors scan this to join <strong>{orgName || 'your program'}</strong></p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Embed Widget</p>
              <div className="bg-gray-900 rounded-xl p-3 max-w-full overflow-x-auto">
                <code className="text-green-400 text-xs whitespace-pre-wrap break-all">
                  {widgetSnippet(orgName, joinCode)}
                </code>
              </div>
              <p className="text-gray-400 text-xs mt-1">See a live preview anytime in your dashboard → Grow tab.</p>
            </div>

            {/* iPhone app listing  -  its own zone, on purpose: Apple has no say
                over the webpage/QR/widget above, so this status never delays it. */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-1">PocketCache iPhone app</p>
            <div className="rounded-2xl p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              {appleApproval.status === 'approved' ? (
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-500 shrink-0" />
                  <p className="text-gray-700 text-xs">
                    {appleApproval.method === 'candid_seal'
                      ? 'Verified through your Candid Seal of Transparency  -  nothing to do.'
                      : 'Approved and ready to appear in the app.'}
                  </p>
                </div>
              ) : appleApproval.status === 'benevity_submitted' ? (
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 shrink-0">⏳</span>
                  <p className="text-gray-700 text-xs">We&apos;ll list you in the iPhone app once Benevity approval comes through.</p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 shrink-0">⚠️</span>
                  <p className="text-gray-700 text-xs">Register with Benevity when you&apos;re ready  -  it&apos;s in your dashboard.</p>
                </div>
              )}
            </div>

            {/* Launch kit  -  auto-sent to the verified admin email at go-live;
                this button forwards a copy to a colleague (recipient left blank) */}
            <a
              href={launchKitMailto(orgName, joinCode)}
              className="block w-full py-4 rounded-2xl font-bold text-base text-center"
              style={{ background: '#f0fdf4', border: '2px solid #86efac', color: '#065f46', textDecoration: 'none' }}
            >
              📧 Send the launch kit to a colleague
            </a>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Your launch kit is emailed to {adminEmail || 'your verified admin address'} automatically
              the moment you go live (demo: shown on this page instead). Use the button above to
              forward it to a colleague  -  just add their address.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => goLive(config)}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}
            >
              Open your dashboard →
            </motion.button>
          </div>
        )}

        <div className="pt-2 text-center border-t border-gray-100">
          <a
            href="mailto:support@pocketcache.app"
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Stuck? Email us  -  support@pocketcache.app
          </a>
        </div>

      </div>
    </motion.div>
  );
}

// ─── Splash wrapper - plays the rolling coin entrance on every fresh gate mount ─

function GateWithSplash({ children }) {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      {!splashDone && (
        <SplashAnimation onDone={() => setSplashDone(true)} />
      )}
    </div>
  );
}

// ─── Main onboarding shell ───────────────────────────────────────────────────

export default function Onboarding() {
  const { setPage, setSelectedNonprofit, selectedNonprofit, hasAccount, accountStatus, setHasAccount, setAccountStatus, initialOnboardingStep, clearInitialOnboardingStep, goToOnboardingStep, returnFromOnboarding, adminRole, setAdminRole, lastMode, setLastMode, setTrackedCard, setPaymentMethod } = useApp();
  const { adoptOrgById } = useNp();
  const [slide, setSlide] = useState(0);
  const [signupProvider, setSignupProvider] = useState('demo');
  const [connectedBank, setConnectedBank] = useState(null);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState(null);
  // True when the nonprofit wizard was entered from the gate, which is the one
  // entry point whose "back" target is the gate itself rather than a page the
  // user came from. See enterNonprofitSignup below.
  const [npFromGate, setNpFromGate] = useState(false);
  const [signupIdentity, setSignupIdentity] = useState(null);
  const [step, setStep] = useState(() => {
    const urlP = new URLSearchParams(window.location.search);
    if (urlP.get('npsignin') === '1') return 'admin-signin';
    // Returning here after an Apple/Google sign-in redirect (see
    // src/lib/donorAuth.js) - land back on the signup screen so it can pick
    // up the completed session instead of dumping the donor at the gate.
    if (urlP.get('authResume') === 'app') return 'signup';
    if (loadKey('pc_account_status', 'active') === 'cancelled') return 'gate';
    return loadKey('pc_cause_id') ? 'slides' : 'gate';
  }); // 'gate' | 'gate-signin' | 'slides' | 'signup' | 'connect-card' | 'payment-method' | 'card-entry' | 'checkout-confirm' | 'nonprofit-signup'

  const urlParams = new URLSearchParams(window.location.search);
  const autoBindOrg = urlParams.get('org') || new URLSearchParams(window.location.hash.replace('#', '?')).get('org') || null;

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

  // Gate at the moment the org is actually resolved (manual code entry AND the
  // auto-bind ?org= link both funnel through here as `onBind`), so nothing
  // downstream has to know this check exists. Native only: Apple has no say
  // over the web, so a browser donor is never shown this screen.
  function handleBind(np) {
    setSelectedNonprofit(np);
    if (isNative() && getAppleApproval(np).status !== 'approved') {
      setStep('native-app-gate');
      return;
    }
    setStep('slides');
  }

  function handleNpSignIn() {
    // Production: backend verifies the SSO token and returns the org linked to this identity.
    // Demo: use an existing custom-org admin role if one was created; otherwise default to BGCA.
    const orgId = adminRole?.orgId ?? 'bgca';
    if (!adminRole) setAdminRole({ orgId: 'bgca', joinCode: 'BGCA' });
    adoptOrgById(orgId);
    setLastMode('admin');
    setPage('np-dashboard');
  }

  // Passwordless admin sign-in complete: the verified work email is the
  // username. Demo resolves custom orgs created on this device, and BGCA's own
  // demo admin address; every other email is refused - production does the
  // same lookup against a real backend. Returns false (and does nothing) for
  // an unrecognized email so AdminSignInScreen can show an inline error
  // instead of handing the caller a dashboard that belongs to someone else.
  function completeAdminSignIn(email) {
    const resolved = resolveAdminOrg(email);
    if (!resolved) return false;
    setAdminRole(resolved);
    adoptOrgById(resolved.orgId);
    setLastMode('admin');
    setPage('np-dashboard');
    return true;
  }

  // One sign-in for every role: donor-only → giving, admin-only → dashboard,
  // both roles → last-used mode (the profile menus toggle between them).
  function resumeSession() {
    const donorOnly = hasAccount && !adminRole;
    const adminOnly = adminRole && !hasAccount;
    if (adminOnly) { setLastMode('admin'); setPage('np-dashboard'); return; }
    if (donorOnly) { setLastMode('giving'); setPage('home'); return; }
    setPage(lastMode === 'admin' && adminRole ? 'np-dashboard' : 'home');
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
    <GateWithSplash>
      <OrgGateScreen
        onBind={handleBind}
        onNonprofitSignup={enterNonprofitSignup}
        autoBindOrg={autoBindOrg}
        hasAccount={hasAccount}
        onWelcomeBack={resumeSession}
        onUniversalSignIn={() => setStep('gate-signin')}
      />
    </GateWithSplash>
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
      hasAccount={hasAccount}
      adminRole={adminRole}
      onSignIn={resumeSession}
      onDemoAdmin={handleNpSignIn}
      onAdminSignIn={() => setStep('admin-signin')}
    />
  );
  if (step === 'nonprofit-signup') return (
    // Exit-back returns to wherever the user jumped in from (e.g. their donor
    // dashboard); falls back to the gate for cold visitors.
    <NonprofitSignupFlow onBack={exitNonprofitSignup} />
  );
  if (step === 'checkout-confirm') return (
    <CheckoutConfirmScreen
      onBack={() => setStep('payment-method')}
      onConfirm={() => {
        // A real signup already wrote the verified identity (email code or
        // Apple/Google) in SignUpScreen - use it here rather than overwrite it.
        // The DEMO_USER fallback only covers the old, no-longer-reachable
        // placeholder path so this never leaves hasAccount empty.
        setHasAccount(signupIdentity ?? {
          name: DEMO_USER.name,
          email: DEMO_USER.email,
          provider: signupProvider || 'demo',
          joinedAt: new Date().toISOString(),
        });
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
      }}
    />
  );
  if (step === 'card-entry') return <CardEntryScreen onBack={() => setStep('payment-method')} onNext={(cardInfo) => { setPendingPaymentMethod({ type: 'card', label: 'Credit or Debit Card', last4: cardInfo?.last4 ?? null, ...(cardInfo?.brand ? { brand: cardInfo.brand } : {}), ...(cardInfo?.simulated ? { simulated: true } : {}) }); setStep('checkout-confirm'); }} />;
  if (step === 'payment-method') return <PaymentMethodScreen onBack={() => setStep('connect-card')} onNext={(method, methodInfo) => { setPendingPaymentMethod(methodInfo); setStep(method === 'card' ? 'card-entry' : 'checkout-confirm'); }} />;
  if (step === 'connect-card') return <ConnectCardScreen onBack={() => setStep('signup')} onNext={(bank) => { setConnectedBank(bank); setStep('payment-method'); }} />;
  if (step === 'signup') return <SignUpScreen
    onBack={() => { setSlide(2); setStep('slides'); }}
    onNext={() => setStep('connect-card')}
    nonprofit={selectedNonprofit}
    hasAccount={hasAccount}
    accountStatus={accountStatus}
    onGoToDashboard={resumeSession}
    onProviderChosen={p => setSignupProvider(p)}
    onIdentityVerified={identity => setSignupIdentity(identity)}
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
            {current.title ? (
              <h1 className="text-white font-bold text-4xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
                {current.title}
              </h1>
            ) : null}
            <p className="text-white/80 text-base mt-4 leading-relaxed">
              {slide === 0 ? slide2Subtitle() : current.subtitle}
            </p>
          </div>

          {/* Dots */}
          <div className="flex gap-2 mt-8">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === slide ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40'
                }`}
              />
            ))}
          </div>

          {/* CTA */}
          <div className="w-full mt-8 flex flex-col gap-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={advance}
              className="w-full py-4 rounded-2xl bg-white font-bold text-base shadow-lg"
              style={{ color: '#0B2A4A' }}
            >
              {current.cta}
            </motion.button>
            <div style={{ height: 48 }} />
          </div>

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
