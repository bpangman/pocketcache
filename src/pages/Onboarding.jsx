import { useState, useEffect, useRef } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight, Building2, Lock, ArrowLeft } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { QRCodeSVG } from 'qrcode.react';
import bgcaLogoUrl from '../assets/bgca-logo.png';

// In production, replace with your publishable key from environment variables
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder');
import CoinLogo from '../components/CoinLogo';
import CoinMark from '../components/CoinMark';
import PocketCacheLogo from '../components/PocketCacheLogo';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { findOrgByCode, buildOrgFromSignup, saveCustomOrg, generateJoinCode } from '../store/orgStore';
import { loadKey } from '../store/identityStore';
import { DEMO_USER } from '../data/derived';
import OrgLogo from '../components/OrgLogo';


const SLIDES = [
  {
    id: 0,
    bg: '',
    bgStyle: { background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)' },
    illustration: (
      <div className="relative flex items-center justify-center w-full">
        <PocketCacheLogo size={44} onDark={true} />
      </div>
    ),
    title: '',
    subtitle: 'Your own branded giving app — live in minutes. Donors give with every purchase. Flat pricing, no percentages, just giving.',
    cta: 'Get Started',
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
    subtitle: 'Every purchase rounds up to the next dollar. Coffee for $3.40? That 60¢ goes straight to your cause. Cover the $1/month fee and 100% of your round-ups reach them — never a percentage.',
    cta: 'Next',
  },
  {
    id: 2,
    bg: '',
    bgStyle: { background: '#003865' },
    illustration: null,
    title: 'Your App,\nYour Cause',
    // Dynamic subtitle injected in render
    subtitle: '',
    cta: 'Next',
  },
  {
    id: 3,
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
      </div>
    ),
    title: 'Watch Your\nImpact Grow',
    subtitle: 'Every round-up adds up. Track your giving, hit milestones, and share your story with friends.',
    cta: 'Sign Up →',
  },
];

// ─── Org Gate Screen ─────────────────────────────────────────────────────────
// Layout (per founder direction): nonprofit entry first, donor entry below.

function OrgGateScreen({ onBind, onNonprofitSignup, onNpSignIn, autoBindOrg, hasAccount, onWelcomeBack }) {
  const [code, setCode] = useState('');
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
      {/* Header — leads with the nonprofit pitch */}
      <div
        className="flex flex-col items-center justify-end px-8 pb-5 pt-10 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: '40%' }}
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
        <p className="text-white font-semibold text-sm text-center leading-relaxed mb-4 px-2">
          Your own round-up app. Live in minutes!
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
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onNpSignIn}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-base"
              style={{ background: '#f0f4f8', color: '#0B2A4A' }}
            >
              Login to your Admin Account
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
                  Welcome back — continue as {hasAccount.name} →
                </span>
              </motion.button>
            )}
            {scanned ? (
              <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm border-2 border-green-400 bg-green-50 text-green-700">
                <CheckCircle size={16} className="text-green-500" />
                QR scanned — BGCA
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={handleScan}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm border-2 border-dashed"
                style={{ borderColor: '#FBBF24', color: '#D97706', background: '#FEF3C7' }}
              >
                {scanning ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                      className="w-4 h-4 rounded-full border-2 border-amber-200 border-t-amber-500"
                    />
                    Scanning…
                  </>
                ) : (
                  <><span>📷</span> Scan QR Code</>
                )}
              </motion.button>
            )}

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Nonprofit Code</label>
              <input
                type="text"
                placeholder="Enter code (e.g. BGCA)"
                value={code}
                onChange={e => { setCode(e.target.value); setError(null); }}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border-2 transition-colors font-mono uppercase"
                style={{ borderColor: error ? '#ef4444' : code ? '#FBBF24' : '#e5e7eb' }}
              />
              {error && <p className="text-red-500 text-xs mt-1 px-1">{error}</p>}
              <p className="text-gray-400 text-xs mt-1 px-1">Demo code: BGCA</p>
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

        <div className="px-5 pb-8 pt-2">
          <p className="text-center text-gray-400 text-xs">
            PocketCache — round-up giving software for nonprofits
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Nonprofit Sign-In Screen (simple email → demo BGCA dashboard) ────────────

function NpSignInScreen({ onSignIn, onBack }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSignIn();
    }, 900);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div
        className="flex flex-col justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: '38%' }}
      >
        <button onClick={onBack} className="text-white/60 text-sm font-semibold mb-4 self-start flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center overflow-hidden shadow-lg">
            <img src={bgcaLogoUrl} alt="BGCA" className="w-full h-full object-contain p-1" />
          </div>
          <p className="text-white/70 text-sm font-semibold">Demo — signs into BGCA</p>
        </div>
        <h1 className="text-white font-bold text-4xl leading-tight" style={{ letterSpacing: '-0.5px' }}>
          Nonprofit{'\n'}Sign In
        </h1>
        <p className="text-white/70 text-sm mt-2">
          In the live product, you&apos;d receive a magic link. For this demo, any email works.
        </p>
      </div>

      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-6 pt-6 pb-10">
        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Admin Email</label>
            <input
              type="email"
              required
              placeholder="admin@yourorg.org"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400"
            />
          </div>

          <motion.button
            whileTap={email ? { scale: 0.97 } : {}}
            type="submit"
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: email ? 'linear-gradient(135deg, #0d9488, #003865)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              opacity: email ? 1 : 0.5,
            }}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </span>
              : 'Sign In →'
            }
          </motion.button>
        </form>
      </div>
    </motion.div>
  );
}

// ─── Sign-up screen ──────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL ?? '/';

const US_STATES = [
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

function SignUpScreen({ onNext, nonprofit, hasAccount, accountStatus, onGoToDashboard, onProviderChosen }) {
  const [chosen, setChosen] = useState(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [showTermsHint, setShowTermsHint] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const isCA = selectedState === 'CA';
  const canContinue = agreedTerms && selectedState !== '' && !isCA;

  const npName = nonprofit?.name ?? 'your nonprofit';

  function handleSignIn() {
    if (!hasAccount) return;
    if (accountStatus === 'cancelled') { onGoToDashboard?.(); return; }
    setWelcomeBack(true);
    setTimeout(() => onGoToDashboard?.(), 900);
  }

  function handleSSO(provider) {
    if (hasAccount) return handleSignIn();
    if (!canContinue) { setShowTermsHint(true); return; }
    onProviderChosen?.(provider);
    setChosen(provider);
    setTimeout(() => onNext(), 700);
  }

  function handleEmail(e) {
    e.preventDefault();
    if (!canContinue) { setShowTermsHint(true); return; }
    if (email && password) onNext();
  }

  const ssoButtons = [
    {
      id: 'apple',
      label: 'Continue with Apple',
      bg: '#000',
      color: '#fff',
      icon: (
        <svg width="18" height="18" viewBox="0 0 814 1000" fill="white">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-42.1-150.3-109.6C27.1 733.7 1 614.9 1 502.1 1 303.7 117.8 197.4 232.8 197.4c68.7 0 125.2 45.8 164.9 45.8 38.1 0 103.7-48.3 181-48.3zm-192-131.9c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
        </svg>
      ),
    },
    {
      id: 'google',
      label: 'Continue with Google',
      bg: '#fff',
      color: '#374151',
      border: '1.5px solid #e5e7eb',
      icon: (
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
      ),
    },
    {
      id: 'facebook',
      label: 'Continue with Facebook',
      bg: '#1877f2',
      color: '#fff',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Hero */}
      <div
        className="flex flex-col items-center justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)', minHeight: '38%' }}
      >
        <motion.div className="mb-5 flex flex-col items-center gap-3">
          {nonprofit
            ? <OrgLogo nonprofit={nonprofit} size={16} rounded="2xl" className="bg-white/20 mb-2" />
            : <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl mb-2">&#127952;</div>
          }
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white/20 rounded-2xl px-4 py-2"
          >
            <p className="text-white text-xs font-semibold text-center">
              Supporting {npName}
            </p>
          </motion.div>
        </motion.div>
        <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
          Create Your{'\n'}Account
        </h1>
        <p className="text-white/80 text-sm mt-2 text-center">
          Sign up in seconds. No payment required yet.
        </p>
      </div>

      {/* CA Block overlay */}
      <AnimatePresence>
        {isCA && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center px-8"
            style={{ background: 'rgba(0,56,101,0.96)' }}
          >
            <div className="text-center">
              <div className="text-5xl mb-4">&#127968;</div>
              <h2 className="text-white font-bold text-xl mb-3">Not Available in California Yet</h2>
              <p className="text-white/75 text-sm leading-relaxed mb-6">
                PocketCache isn&apos;t available in California yet. We&apos;re working on it! Ask your favorite nonprofit for updates.
              </p>
              <button
                onClick={() => setSelectedState('')}
                className="bg-white/20 text-white font-semibold px-6 py-3 rounded-2xl text-sm"
              >
                ← Go Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom sheet */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-hidden">
        <div className="flex-1 px-4 pt-5 pb-2 space-y-3 overflow-y-auto">

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

          {!showEmail ? (
            <>
              {ssoButtons.map((btn) => (
                <motion.button
                  key={btn.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSSO(btn.id)}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold text-sm transition-all"
                  style={{
                    background: chosen === btn.id ? '#e0f0ff' : btn.bg,
                    color: btn.color,
                    border: btn.border ?? 'none',
                    opacity: !canContinue ? 0.4 : chosen && chosen !== btn.id ? 0.5 : 1,
                    cursor: canContinue ? 'pointer' : 'default',
                  }}
                >
                  {btn.icon}
                  {btn.label}
                </motion.button>
              ))}

              <div className="flex items-center gap-3 px-1">
                <div className="flex-1 h-px bg-gray-100" />
                <p className="text-gray-400 text-xs">or</p>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              <button
                onClick={() => setShowEmail(true)}
                className="w-full py-3.5 rounded-2xl font-semibold text-sm"
                style={{ color: '#003865', background: '#e8f0fa' }}
              >
                Use email &amp; password
              </button>
              {/* Already have an account? */}
              <button
                onClick={handleSignIn}
                className="w-full text-center py-2"
              >
                <span className="text-gray-400 text-sm">Already have an account? </span>
                <span className="text-sm font-semibold underline" style={{ color: '#003865' }}>Sign in</span>
              </button>
            </>
          ) : (
            <form onSubmit={handleEmail} className="space-y-3">
              <button type="button" onClick={() => setShowEmail(false)}
                className="text-sm font-semibold" style={{ color: '#003865' }}>
                ← Back
              </button>
              <input
                type="email" placeholder="Email address" value={email}
                onChange={e => setEmail(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400"
              />
              <input
                type="password" placeholder="Create password" value={password}
                onChange={e => setPassword(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400"
              />
              <motion.button
                whileTap={canContinue ? { scale: 0.97 } : {}}
                type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{
                  background: 'linear-gradient(135deg, #003865, #001a33)',
                  opacity: canContinue ? 1 : 0.4,
                  cursor: canContinue ? 'pointer' : 'default',
                }}
              >
                Create Account
              </motion.button>
            </form>
          )}
        </div>

        {/* Consent checkbox */}
        <div className="px-5 pb-8 pt-3 space-y-3">
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
      </div>
      {/* Welcome back overlay */}
      <AnimatePresence>
        {welcomeBack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-8"
            style={{ background: 'rgba(0, 56, 101, 0.97)' }}
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

// ─── Step 1: Connect card for monitoring ─────────────────────────────────────

const BANKS = [
  { id: 'chase',   name: 'Chase',        sub: 'Sapphire, Freedom, Ink', color: '#1a56db', emoji: '🏦' },
  { id: 'capital', name: 'Capital One',  sub: 'Venture, Quicksilver',   color: '#c0392b', emoji: '💳' },
  { id: 'amex',    name: 'American Express', sub: 'Gold, Platinum, Blue Cash', color: '#007bc1', emoji: '💳' },
  { id: 'bofa',    name: 'Bank of America', sub: 'Customized Cash, Travel', color: '#e31837', emoji: '🏦' },
];

function ConnectCardScreen({ onNext }) {
  const [connecting, setConnecting] = useState(null);
  const [connected, setConnected] = useState(null);

  function handleSelect(bank) {
    if (connected) return;
    setConnecting(bank.id);
    setTimeout(() => { setConnecting(null); setConnected(bank); }, 1200);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div
        className="flex flex-col items-center justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #003865 100%)', minHeight: '38%' }}
      >
        <motion.div className="mb-5 flex flex-col items-center gap-3">
          <motion.div
            initial={{ rotate: -4, y: 12, opacity: 0 }}
            animate={{ rotate: -4, y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 180 }}
            className="w-64 h-36 rounded-3xl p-5 shadow-2xl relative overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <div className="flex justify-between items-start mb-5">
              <div className="w-9 h-6 rounded bg-white/50" />
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded-full bg-white/40" />
                <div className="w-6 h-6 rounded-full bg-white/25 -ml-2" />
              </div>
            </div>
            <p className="text-white/80 font-mono text-sm tracking-widest">•••• •••• •••• ••••</p>
            <div className="flex justify-between mt-2">
              <p className="text-white/60 text-xs">Your Card</p>
              <p className="text-xs font-semibold text-white/80">👁 Watching purchases</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring' }}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            <span className="text-white text-sm">☕ $3.40</span>
            <span className="text-white/60 text-sm">→</span>
            <span className="text-white font-bold text-sm">+$0.60 donated 💚</span>
          </motion.div>
        </motion.div>
        <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
          Which card should{'\n'}we track?
        </h1>
        <p className="text-white/80 text-sm mt-2 text-center leading-relaxed">
          Every purchase on this card rounds up — the change goes straight to your cause.
        </p>
      </div>

      <div className="flex-1 rounded-t-3xl -mt-4 flex flex-col overflow-hidden" style={{ background: '#f0fdfb' }}>
        <div className="flex-1 px-4 pt-5 pb-2 space-y-2.5 overflow-y-auto">

          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest px-1 pb-1">Select your card issuer</p>

          {connected ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: '#f0fdfa', border: '1px solid #99f6e4' }}
            >
              <CheckCircle size={22} className="shrink-0" style={{ color: '#0D9488' }} />
              <div>
                <p className="font-bold text-sm" style={{ color: '#134e4a' }}>{connected.name} connected</p>
                <p className="text-xs mt-0.5" style={{ color: '#0f766e' }}>We&apos;ll track your purchases and calculate round-ups as they happen</p>
              </div>
            </motion.div>
          ) : (
            BANKS.map(bank => (
              <motion.button
                key={bank.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelect(bank)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl text-left"
                style={{ background: '#fff', border: '1.5px solid #99f6e4', opacity: connecting && connecting !== bank.id ? 0.4 : 1 }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl bg-gray-50">
                  {bank.emoji}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">{bank.name}</p>
                  <p className="text-gray-400 text-xs">{bank.sub}</p>
                </div>
                {connecting === bank.id
                  ? <span className="text-xs text-teal-600 font-semibold">Connecting…</span>
                  : <ArrowRight size={16} className="text-gray-300 shrink-0" />
                }
              </motion.button>
            ))
          )}

          {!connected && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left border-2 border-dashed border-gray-200 bg-white"
              onClick={() => handleSelect({ id: 'other', name: 'My Bank', sub: '' })}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gray-100">
                <Building2 size={20} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-700 text-sm">Search all banks & cards</p>
                <p className="text-gray-400 text-xs">12,000+ institutions supported via Plaid</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 shrink-0" />
            </motion.button>
          )}

          <div className="flex items-center gap-2 px-1 pt-1">
            <Lock size={12} className="text-gray-400 shrink-0" />
            <p className="text-gray-400 text-xs">Read-only access via Plaid · Your credentials are never stored by PocketCache</p>
          </div>
        </div>

        <div className="px-4 pb-10 pt-3 border-t border-teal-100" style={{ background: '#f0fdfb' }}>
          <motion.button
            whileTap={connected ? { scale: 0.97 } : {}}
            onClick={() => connected && onNext()}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: connected ? 'linear-gradient(135deg, #0d9488, #003865)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              cursor: connected ? 'pointer' : 'default',
            }}
          >
            {connected ? 'Continue →' : 'Select a card to continue'}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Step 2: Choose payment method ───────────────────────────────────────────

const PAYMENT_OPTIONS = [
  {
    id: 'ach',
    icon: '🏦',
    label: 'Bank Account',
    sub: 'Direct bank transfer · Flat $0.50/month processing fee',
    badge: null,
  },
  {
    id: 'apple_pay',
    icon: '🍎',
    label: 'Apple Pay',
    sub: 'Set up once, fully automatic · Flat $0.50/month processing fee',
    badge: null,
  },
  {
    id: 'card',
    icon: '💳',
    label: 'Credit or Debit Card',
    sub: 'Visa, Mastercard, Amex, or Discover · Flat $0.50/month processing fee',
    badge: null,
  },
];

function PaymentMethodScreen({ onNext }) {
  const { selectedNonprofit } = useApp();
  const [selected, setSelected] = useState(null);
  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';
  const npName  = selectedNonprofit?.name      ?? 'your nonprofit';

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div
        className="flex flex-col items-center justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: '38%' }}
      >
        <motion.div className="mb-5 flex flex-col items-center gap-3">
          <div className="flex gap-3">
            {['🏦', '🍎', '💳'].map((icon, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.1 + 0.2, type: 'spring', stiffness: 280 }}
                className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl"
              >
                {icon}
              </motion.div>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex items-center gap-2 bg-white/20 rounded-2xl px-4 py-2"
          >
            <span className="text-white text-sm font-semibold">Charged once a month · $10 minimum</span>
          </motion.div>
        </motion.div>
        <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
          How should we collect{'\n'}your round-up payments?
        </h1>
        <p className="text-white/80 text-sm mt-2 text-center leading-relaxed">
          Once a month, your round-ups total up into one clean charge — to the payment method you choose below.
        </p>
      </div>

      <div className="flex-1 bg-gray-50 rounded-t-3xl -mt-4 flex flex-col overflow-hidden">
        <div className="flex-1 px-4 pt-5 pb-2 space-y-2.5 overflow-y-auto">

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
            Change this anytime in Settings. Payments are processed by Stripe — not us.
          </p>
        </div>

        <div className="px-4 pb-10 pt-3 bg-gray-50 border-t border-gray-100">
          <motion.button
            whileTap={selected ? { scale: 0.97 } : {}}
            onClick={() => selected && onNext(selected)}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: selected ? 'linear-gradient(135deg, #FBBF24, #E5A800)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              color: selected ? '#0B2A4A' : '#fff',
              cursor: selected ? 'pointer' : 'default',
            }}
          >
            {selected ? 'Continue →' : 'Choose a payment method'}
          </motion.button>
          <p className="text-center text-gray-400 text-xs leading-relaxed px-2 mt-3">
            Your round-ups charge once a month through {npName}&apos;s Stripe. You&apos;ll see &ldquo;{npShort}&rdquo; on your statement. They issue your receipt.
          </p>
        </div>
      </div>
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    // In production: call your backend to create a SetupIntent, then confirmCardSetup.
    // For the prototype we simulate a successful save after a brief delay.
    await new Promise(r => setTimeout(r, 1200));

    // Simulate success (replace with real stripe.confirmCardSetup in production)
    setLoading(false);
    onSuccess();
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

function CardEntryScreen({ onNext }) {
  const { selectedNonprofit } = useApp();
  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';

  return (
    <Elements stripe={stripePromise}>
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="flex flex-col h-full overflow-hidden"
      >
        <div
          className="flex flex-col items-center justify-end px-8 pb-8 pt-14 shrink-0"
          style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)', minHeight: '32%' }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 280 }}
            className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl mb-5"
          >
            💳
          </motion.div>
          <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
            Add your card
          </h1>
          <p className="text-white/80 text-sm mt-2 text-center leading-relaxed">
            Stripe handles your card — we never see the number. Round-ups collect monthly on {npShort}&apos;s behalf.
          </p>
        </div>

        <div className="flex-1 bg-gray-50 rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-4 pt-6 pb-10">
          <CardEntryForm onSuccess={onNext} />
          <p className="text-center text-gray-400 text-xs leading-relaxed px-2 mt-4">
            Round-ups collect monthly on {npShort}&apos;s behalf. They issue your tax receipt directly.
          </p>
        </div>
      </motion.div>
    </Elements>
  );
}

// ─── Checkout confirm screen ─────────────────────────────────────────────────

function CheckoutConfirmScreen({ onConfirm }) {
  const { selectedNonprofit, pendingRoundUps } = useApp();
  const [coverFee, setCoverFee] = useState(true);
  const roundUps = pendingRoundUps ?? 4.63;
  const fee = 1.00;
  const total = coverFee ? roundUps + fee : roundUps;

  const npName  = selectedNonprofit?.name      ?? 'your nonprofit';
  const npShort = selectedNonprofit?.shortName ?? 'your nonprofit';

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
      className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col items-center justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #003865 0%, #001a33 100%)', minHeight: '38%' }}>
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
        <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
          Review &amp;{'\n'}Confirm
        </h1>
        <p className="text-white/80 text-sm mt-2 text-center">
          Your round-ups are collected monthly by {npName}.
        </p>
      </div>

      {/* Sheet */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-hidden">
        <div className="flex-1 px-5 pt-5 pb-2 space-y-4 overflow-y-auto">

          {/* Estimate card */}
          <div className="rounded-2xl p-4" style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5' }}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Monthly Estimate</p>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-700">Round-ups this month</span>
              <span className="font-bold text-gray-900">${roundUps.toFixed(2)}</span>
            </div>
            {coverFee && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">App fee (you&apos;re covering it)</span>
                <span className="text-sm text-gray-500">+$1.00</span>
              </div>
            )}
            <div className="h-px bg-slate-200 my-2" />
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-900">One charge from {npShort}</span>
              <span className="font-bold text-xl" style={{ color: '#003865' }}>${total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 italic">
              This is an example — no real charge is made in this demo.
            </p>
          </div>

          {/* Cover fee checkbox */}
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-2xl"
            onClick={() => setCoverFee(v => !v)}
            style={{ background: coverFee ? '#d1fae5' : '#f9fafb', border: coverFee ? '1.5px solid #6ee7b7' : '1.5px solid #e5e7eb' }}>
            <div
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
              style={{ borderColor: coverFee ? '#059669' : '#d1d5db', background: coverFee ? '#059669' : '#fff' }}>
              {coverFee && <CheckCircle size={12} className="text-white" />}
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-900">
                Cover the $1/month fee — 100% of your round-ups reach {npShort}.
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                {coverFee
                  ? `The $1/month keeps the app running. Every dollar of your $${roundUps.toFixed(2)} in round-ups lands at ${npShort}.`
                  : `Opted out — 50¢ comes from your round-ups and 50¢ is billed to ${npShort}. Your round-ups still reach ${npShort}.`}
              </p>
            </div>
          </label>

          {/* One-charge explanation */}
          <div className="rounded-2xl p-4 bg-gray-50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">How charges work</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Once a month, {npName} bundles your round-ups into one charge. You&apos;ll see{' '}
              <strong>&ldquo;{npShort}&rdquo;</strong> on your statement — not PocketCache.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {npShort} sends your tax receipt — they&apos;re the ones receiving your donation.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              The $1/month fee keeps the app running and isn&apos;t tax-deductible, but your donation is. Opt out and the dollar splits: 50¢ from your round-ups, 50¢ from {npShort}. Months under ${selectedNonprofit?.monthlyMinimum ?? 10} just roll forward — we settle up within 3 months at most.
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Tracking starts the moment your card is linked. Your <strong>first charge hits on the 1st of next month</strong> — nothing before today ever counts.
            </p>
          </div>
        </div>

        <div className="px-4 pb-10 pt-3 bg-white border-t border-gray-100">
          <motion.button whileTap={{ scale: 0.97 }} onClick={onConfirm}
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
      </div>
    </motion.div>
  );
}

// ─── EIN lookup helpers ───────────────────────────────────────────────────────

function formatEIN(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

async function lookupEIN(digits9) {
  const res = await fetch(
    `https://projects.propublica.org/nonprofits/api/v2/organizations/${digits9}.json`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const org = data.organization;
  if (!org) throw new Error('No org found');
  return {
    name:     org.name ?? '',
    city:     org.city ?? '',
    state:    org.state ?? '',
    is501c3:  org.subsection_code === 3 || org.subsection_code === '3',
  };
}

// ─── Nonprofit self-serve signup flow ─────────────────────────────────────────

function NonprofitSignupFlow({ onBack, onGoLive }) {
  const [step, setStep] = useState('ein');
  const [ein, setEin] = useState('');
  const [einError, setEinError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [einDemoMode, setEinDemoMode] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [org501c3, setOrg501c3] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [story, setStory] = useState('');
  const [color, setColor] = useState('#003865');
  const [accepted, setAccepted] = useState(false);
  const [showLicenseHint, setShowLicenseHint] = useState(false);
  const [monthlyMinimum, setMonthlyMinimum] = useState(10);
  const [logoPreview, setLogoPreview] = useState(bgcaLogoUrl);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const fileInputRef = useRef(null);

  const joinCode = generateJoinCode(orgName);

  async function handleVerifyEIN(e) {
    e.preventDefault();
    const digits = ein.replace(/\D/g, '');
    if (digits.length !== 9) {
      setEinError('EIN must be exactly 9 digits (format: XX-XXXXXXX).');
      return;
    }
    setEinError(null);
    setVerifying(true);
    setEinDemoMode(false);

    try {
      const result = await lookupEIN(digits);
      setVerifying(false);
      setOrgName(result.name || 'Boys & Girls Clubs of America');
      setOrgAddress(result.city && result.state ? `${result.city}, ${result.state}` : 'Atlanta, GA');
      setOrg501c3(result.is501c3);
      setEinDemoMode(false);
      setStep('confirm-org');
    } catch {
      // Graceful fallback — use simulated BGCA result with demo note
      setVerifying(false);
      setOrgName('Boys & Girls Clubs of America');
      setOrgAddress('Atlanta, GA');
      setOrg501c3(true);
      setEinDemoMode(true);
      setStep('confirm-org');
    }
  }

  function handleStripeConnect() {
    setStripeConnecting(true);
    setTimeout(() => {
      setStripeConnecting(false);
      setStripeConnected(true);
    }, 1500);
  }

  function handleBrandingNext(e) {
    e.preventDefault();
    setStep('license');
  }

  function handleAccept(e) {
    e.preventDefault();
    if (!accepted) { setShowLicenseHint(true); return; }
    setStep('live');
  }

  function handleGoLive() {
    onGoLive({
      name:           orgName,
      shortName:      joinCode,
      color,
      logoPreview,
      mission:        story,
      monthlyMinimum,
      adminEmail,
      joinCode,
      ein,
      orgAddress,
    });
  }

  const stepBack = {
    ein:          onBack,
    'confirm-org': () => setStep('ein'),
    stripe:        () => setStep('confirm-org'),
    branding:      () => setStep('stripe'),
    license:       () => setStep('branding'),
    live:          () => setStep('license'),
  };

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
      className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #003865 100%)', minHeight: '30%' }}>
        <button onClick={stepBack[step]} className="text-white/60 text-sm font-semibold mb-4 self-start">← Back</button>
        <h1 className="text-white font-bold text-3xl leading-tight" style={{ letterSpacing: '-0.5px' }}>
          {step === 'ein'          && 'Verify Your\nNonprofit'}
          {step === 'confirm-org'  && 'Confirm\nYour Org'}
          {step === 'stripe'       && 'Connect\nStripe'}
          {step === 'branding'     && 'Customize\nYour Page'}
          {step === 'license'      && 'License\nAgreement'}
          {step === 'live'         && "You're\nLive! 🎉"}
        </h1>
      </div>

      {/* Sheet */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-5 pt-6 pb-10 space-y-4">

        {step === 'ein' && (
          <form onSubmit={handleVerifyEIN} className="space-y-4">
            <p className="text-gray-500 text-sm">
              Enter your organization&apos;s EIN. We&apos;ll verify your 501(c)(3) status with IRS data from ProPublica.
            </p>
            <div>
              <input
                type="text"
                placeholder="XX-XXXXXXX"
                value={ein}
                onChange={e => { setEin(formatEIN(e.target.value)); setEinError(null); }}
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
                <div>
                  <p className="font-bold text-gray-900 text-base">{orgName}</p>
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
                  Demo data — live verification uses IRS public records.
                </p>
              )}
            </div>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep('stripe')}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}>
              Confirm — this is us →
            </motion.button>
            <button onClick={() => setStep('ein')} className="w-full text-center text-sm text-gray-400 py-1 font-medium">
              No, re-enter EIN
            </button>
          </div>
        )}

        {step === 'stripe' && (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm">
              Connect your Stripe account. Donations charge directly on your Stripe — you&apos;re the merchant of record the whole time.
            </p>
            {stripeConnected ? (
              <div className="rounded-2xl p-4 bg-green-50 border border-green-200">
                <p className="text-green-800 text-sm font-bold">&#10003; Stripe Connected</p>
                <p className="text-green-700 text-xs mt-1">You are the merchant of record for all donations</p>
              </div>
            ) : (
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleStripeConnect}
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #635bff, #4b45c6)' }}>
                {stripeConnecting ? 'Connecting…' : 'Connect with Stripe'}
              </motion.button>
            )}
            {stripeConnected && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep('branding')}
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}>
                Continue →
              </motion.button>
            )}
            <p className="text-gray-400 text-xs text-center px-2">PocketCache never touches the money — it goes straight from donors into your Stripe account.</p>
          </div>
        )}

        {step === 'branding' && (
          <form onSubmit={handleBrandingNext} className="space-y-4">
            <p className="text-gray-500 text-sm">Customize how your page looks to donors.</p>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Organization Name</label>
              <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Admin Contact Email</label>
              <input type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="you@yourorg.org"
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400" />
              <p className="text-gray-400 text-xs mt-1">We&apos;ll use this to reach whoever manages your page.</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Your Mission (shown to donors)</label>
              <textarea value={story} onChange={e => setStory(e.target.value)} rows={4} maxLength={600} placeholder="Tell donors what you do…"
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400 resize-none" />
              <p className="text-gray-400 text-xs mt-1">Keep it concise — this shows on your public donor page.</p>
              <p className="text-gray-400 text-xs text-right mt-0.5">{story.length}/600</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Brand Color</label>
              <div className="flex flex-wrap gap-3">
                {['#003865', '#0D9488', '#059669', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#F59E0B'].map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className="w-10 h-10 rounded-xl border-2 transition-all"
                    style={{ background: c, borderColor: color === c ? '#111' : 'transparent' }} />
                ))}
                <label className="flex flex-col items-center justify-center w-10 h-10 rounded-xl border-2 cursor-pointer transition-all overflow-hidden"
                  style={{ borderColor: !['#003865','#0D9488','#059669','#2563EB','#4F46E5','#7C3AED','#DB2777','#DC2626','#EA580C','#F59E0B'].includes(color) ? '#111' : 'transparent', background: color }}>
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
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setLogoPreview(URL.createObjectURL(file));
                }}
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
                onBlur={e => { if (e.target.value) setLogoPreview(e.target.value); }}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none border border-gray-200 focus:border-teal-400"
              />
              <p className="text-gray-400 text-xs mt-1">If you skip this, a default emoji is used as your app mark.</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">
                Monthly Minimum — ${monthlyMinimum} <span className="text-gray-400 font-normal normal-case">(default $10)</span>
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
          </form>
        )}

        {step === 'license' && (
          <form onSubmit={handleAccept} className="space-y-4">
            <p className="text-gray-500 text-sm">Review and accept the Nonprofit Software License Agreement before going live.</p>
            <div className="rounded-2xl p-4 bg-gray-50 border border-gray-200 space-y-2 text-xs text-gray-600">
              <p><strong>Free for you when donors keep the $1/month fee</strong> (it&apos;s pre-selected — most do). You&apos;re billed a flat $0.50/donor/month only for donors who opt out. Never a % of donations.</p>
              <p><strong>You are the merchant of record.</strong> Donations charge directly on your Stripe. PocketCache never holds donation funds.</p>
              <p><strong>You issue tax receipts</strong> directly to donors. PocketCache does not.</p>
              <p><strong>You handle charitable solicitation registration</strong> in applicable states.</p>
              <p><strong>California:</strong> Not available at launch. Do not promote to CA residents until PocketCache confirms availability.</p>
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

        {step === 'live' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4 bg-green-50 border border-green-200 text-center">
              <p className="text-green-800 font-bold text-base mb-1">Your page is live!</p>
              <p className="text-green-700 text-sm font-mono">
                pocketcache.app/{joinCode.toLowerCase()}
              </p>
            </div>
            {/* Join code — primary thing to share */}
            <div className="rounded-2xl p-5 text-center" style={{ background: '#f0fdf4', border: '2px solid #86efac' }}>
              <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">Your Donor Join Code</p>
              <p className="text-5xl font-black tracking-wider mb-2" style={{ color: '#065f46' }}>{joinCode}</p>
              <p className="text-green-700 text-xs">Donors enter this in the PocketCache app to join your program</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">QR Code</p>
              <div className="bg-white rounded-xl p-3 inline-block border border-gray-100">
                <QRCodeSVG value={`https://pocketcache.app/demo/?org=${joinCode}`} size={96} level="M" includeMargin />
              </div>
              <p className="text-gray-400 text-xs mt-1">Donors scan this to join <strong>{orgName || 'your program'}</strong></p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Embed Widget</p>
              <div className="bg-gray-900 rounded-xl p-3 max-w-full overflow-x-auto">
                <code className="text-green-400 text-xs whitespace-pre-wrap break-all">
                  {`<script src="https://cdn.pocketcache.app/widget.js" data-org="${joinCode.toLowerCase()}"></script>`}
                </code>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleGoLive}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}
            >
              Open your dashboard →
            </motion.button>
            <p className="text-gray-400 text-xs text-center">Check your email for next steps from PocketCache.</p>
          </div>
        )}

      </div>
    </motion.div>
  );
}

// ─── Main onboarding shell ───────────────────────────────────────────────────

export default function Onboarding() {
  const { setPage, setSelectedNonprofit, selectedNonprofit, hasAccount, accountStatus, setHasAccount, setAccountStatus, initialOnboardingStep, clearInitialOnboardingStep, adminRole, setAdminRole, lastMode, setLastMode } = useApp();
  const { setNpOrg } = useNp();
  const [slide, setSlide] = useState(0);
  const [signupProvider, setSignupProvider] = useState('demo');
  const [step, setStep] = useState(() => {
    if (loadKey('pc_account_status', 'active') === 'cancelled') return 'gate';
    return loadKey('pc_cause_id') ? 'slides' : 'gate';
  }); // 'gate' | 'slides' | 'signup' | 'connect-card' | 'payment-method' | 'card-entry' | 'checkout-confirm' | 'nonprofit-signup' | 'np-signin'

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

  function handleBind(np) {
    setSelectedNonprofit(np);
    setStep('slides');
  }

  function handleGoLive(config) {
    // Build and persist the real org object
    const org = buildOrgFromSignup({
      name:           config.name,
      adminEmail:     config.adminEmail,
      story:          config.mission,
      color:          config.color,
      logoPreview:    config.logoPreview !== bgcaLogoUrl ? config.logoPreview : null,
      monthlyMinimum: config.monthlyMinimum,
      ein:            config.ein,
      orgAddress:     config.orgAddress,
    });
    saveCustomOrg(org);

    setNpOrg({
      name:           org.name,
      shortName:      org.shortName,
      color:          config.color,
      logoPreview:    org.logoUrl,
      mission:        org.description,
      monthlyMinimum: org.monthlyMinimum,
      adminEmail:     org.adminEmail,
      joinCode:       org.shortName,
      _orgId:         org.id,
    });
    setAdminRole({ orgId: org.id, joinCode: org.shortName });
    setLastMode('admin');
    setPage('np-dashboard');
  }

  function handleNpSignIn() {
    setAdminRole({ orgId: 'bgca', joinCode: 'BGCA' });
    setLastMode('admin');
    setPage('np-dashboard');
  }

  // Returning users land in their last-used mode.
  function resumeSession() {
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
      return `This app is built for ${selectedNonprofit.name}. Your spare change goes straight to them every month — nothing in between.`;
    }
    return 'This app is built for your cause. Your spare change goes straight to them every month — nothing in between.';
  }

  // Slide 0 welcomes whoever is actually looking at it: a donor who just joined
  // their nonprofit's app shouldn't see the pitch written for nonprofits.
  function slide0Subtitle() {
    if (selectedNonprofit) {
      return `${selectedNonprofit.shortName ?? selectedNonprofit.name} has its own giving app — and you're in. Round up your everyday purchases and your spare change quietly adds up for them.`;
    }
    return SLIDES[0].subtitle;
  }

  if (step === 'gate') return (
    <OrgGateScreen
      onBind={handleBind}
      onNonprofitSignup={() => setStep('nonprofit-signup')}
      onNpSignIn={() => setStep('np-signin')}
      autoBindOrg={autoBindOrg}
      hasAccount={hasAccount}
      onWelcomeBack={resumeSession}
    />
  );
  if (step === 'np-signin') return (
    <NpSignInScreen onSignIn={handleNpSignIn} onBack={() => setStep('gate')} />
  );
  if (step === 'nonprofit-signup') return (
    <NonprofitSignupFlow onBack={() => setStep('gate')} onGoLive={handleGoLive} />
  );
  if (step === 'checkout-confirm') return <CheckoutConfirmScreen onConfirm={() => {
    setHasAccount({
      name: DEMO_USER.name,
      email: DEMO_USER.email,
      provider: signupProvider || 'demo',
      joinedAt: new Date().toISOString(),
    });
    setAccountStatus('active');
    setLastMode('giving');
    setPage('home');
  }} />;
  if (step === 'card-entry') return <CardEntryScreen onNext={() => setStep('checkout-confirm')} />;
  if (step === 'payment-method') return <PaymentMethodScreen onNext={method => setStep(method === 'card' ? 'card-entry' : 'checkout-confirm')} />;
  if (step === 'connect-card') return <ConnectCardScreen onNext={() => setStep('payment-method')} />;
  if (step === 'signup') return <SignUpScreen
    onNext={() => setStep('connect-card')}
    nonprofit={selectedNonprofit}
    hasAccount={hasAccount}
    accountStatus={accountStatus}
    onGoToDashboard={resumeSession}
    onProviderChosen={p => setSignupProvider(p)}
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
          className={`flex-1 flex flex-col items-center justify-center px-8 pt-8 pb-6`}
          style={current.bgStyle}
        >
          {/* Illustration */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            {slide === 2 ? (
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
              {slide === 2 ? slide2Subtitle() : slide === 0 ? slide0Subtitle() : current.subtitle}
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
            {slide > 0 && (
              <button
                onClick={() => setStep('signup')}
                className="text-white/60 text-sm py-2"
              >
                Skip for now
              </button>
            )}
          </div>

          {/* Nonprofit CTA — pinned banner on slide 0 */}
          {slide === 0 && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setStep('nonprofit-signup')}
              className="w-full mt-3 py-3.5 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm border-2 border-white/40 bg-white/15"
              style={{ color: '#fff' }}
            >
              Nonprofits: get your own giving app free →
            </motion.button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
