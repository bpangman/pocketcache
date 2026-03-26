import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowRight, Search, CreditCard, Building2, Lock } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// In production, replace with your publishable key from environment variables
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder');
import Logo from '../components/Logo';
import OrgLogo from '../components/OrgLogo';
import MatchBadge from '../components/MatchBadge';
import { useApp } from '../store/AppContext';
import { NONPROFITS } from '../data/nonprofits';

// Featured causes shown on the pick-your-cause screen
const FEATURED_IDS = ['bgca', 'stjude', 'wwf', 'khanacademy', 'feedamerica'];
const FEATURED = NONPROFITS.filter(n => FEATURED_IDS.includes(n.id));

const SLIDES = [
  {
    id: 0,
    bg: 'from-orange-500 to-amber-400',
    illustration: (
      <div className="relative flex items-center justify-center">
        <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center pulse-ring absolute" />
        <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
          <Logo size={72} />
        </div>
      </div>
    ),
    title: 'Welcome to\nPocketChange',
    subtitle: 'Turn everyday purchases into impactful donations — automatically.\nInspiring change, from your pocket.',
    cta: 'Get Started',
  },
  {
    id: 1,
    bg: 'from-violet-600 to-indigo-500',
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
          <span className="text-violet-600 font-bold text-lg">$1.00</span>
          <span className="text-gray-500 text-sm">donated to your cause ❤️</span>
        </motion.div>
      </div>
    ),
    title: 'Round Up Every\nPurchase',
    subtitle: 'We round up each transaction to the nearest dollar. The spare change goes straight to your chosen nonprofit.',
    cta: 'Next',
  },
  {
    id: 2,
    bg: 'from-emerald-500 to-teal-400',
    illustration: (
      <div className="flex flex-col items-center gap-4">
        <div className="text-6xl mb-2">🌍</div>
        <div className="grid grid-cols-3 gap-2">
          {['🏀', '📚', '🌾', '🏥', '🏠', '⚖️'].map((emoji, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.07 + 0.3, type: 'spring', stiffness: 300 }}
              className="w-16 h-16 rounded-2xl bg-white/25 flex items-center justify-center text-3xl"
            >
              {emoji}
            </motion.div>
          ))}
        </div>
      </div>
    ),
    title: 'Choose Your\nCause',
    subtitle: 'Pick from hundreds of verified nonprofits across the causes you care about most.',
    cta: 'Next',
  },
  {
    id: 3,
    bg: 'from-rose-500 to-pink-400',
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
    subtitle: 'Track every donation, see your cumulative impact, and share your generosity with others.',
    cta: 'Pick Your Cause',
  },
];

// ─── Sign-up screen ──────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL ?? '/';

function SignUpScreen({ onNext }) {
  const [chosen, setChosen] = useState(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedData, setAgreedData] = useState(false);
  const canContinue = agreedTerms && agreedData;

  function handleSSO(provider) {
    if (!canContinue) return;
    setChosen(provider);
    setTimeout(() => onNext(), 700);
  }

  function handleEmail(e) {
    e.preventDefault();
    if (email && password && canContinue) onNext();
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
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', minHeight: '38%' }}
      >
        <motion.div className="mb-5 flex flex-col items-center gap-3">
          {/* Avatar stack illustration */}
          <div className="flex -space-x-3 mb-2">
            {['🧑‍💼','👩‍🎓','👨‍🍳','👩‍💻','🧑‍🎨'].map((e, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.07 + 0.1, type: 'spring', stiffness: 300 }}
                className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center text-xl border-2 border-white/40"
              >
                {e}
              </motion.div>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white/20 rounded-2xl px-4 py-2"
          >
            <p className="text-white text-xs font-semibold text-center">Join 12,400+ donors making change</p>
          </motion.div>
        </motion.div>
        <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
          Create Your{'\n'}Account
        </h1>
        <p className="text-white/80 text-sm mt-2 text-center">
          Sign up in seconds. No credit card required yet.
        </p>
      </div>

      {/* Bottom sheet */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 flex flex-col overflow-hidden">
        <div className="flex-1 px-4 pt-5 pb-2 space-y-3 overflow-y-auto">
          {!showEmail ? (
            <>
              {ssoButtons.map((btn) => (
                <motion.button
                  key={btn.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSSO(btn.id)}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold text-sm transition-all"
                  style={{
                    background: chosen === btn.id ? '#e0e7ff' : btn.bg,
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
                className="w-full py-3.5 rounded-2xl font-semibold text-sm text-indigo-600 bg-indigo-50"
              >
                Use email & password
              </button>
            </>
          ) : (
            <form onSubmit={handleEmail} className="space-y-3">
              <button type="button" onClick={() => setShowEmail(false)}
                className="text-indigo-600 text-sm font-semibold">
                ← Back
              </button>
              <input
                type="email" placeholder="Email address" value={email}
                onChange={e => setEmail(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-indigo-400"
              />
              <input
                type="password" placeholder="Create password" value={password}
                onChange={e => setPassword(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-indigo-400"
              />
              <motion.button
                whileTap={canContinue ? { scale: 0.97 } : {}}
                type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  opacity: canContinue ? 1 : 0.4,
                  cursor: canContinue ? 'pointer' : 'default',
                }}
              >
                Create Account
              </motion.button>
            </form>
          )}
        </div>

        {/* Consent checkboxes */}
        <div className="px-5 pb-8 pt-3 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <div
              onClick={() => setAgreedTerms(v => !v)}
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
              style={{ borderColor: agreedTerms ? '#4f46e5' : '#d1d5db', background: agreedTerms ? '#4f46e5' : '#fff' }}
            >
              {agreedTerms && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-xs text-gray-500 leading-relaxed">
              I am at least 18 years old and agree to the{' '}
              <a href={`${BASE}terms.html`} target="_blank" rel="noopener" className="text-indigo-600 font-semibold underline">Terms of Service</a>
              {' '}and{' '}
              <a href={`${BASE}privacy.html`} target="_blank" rel="noopener" className="text-indigo-600 font-semibold underline">Privacy Policy</a>.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <div
              onClick={() => setAgreedData(v => !v)}
              className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
              style={{ borderColor: agreedData ? '#4f46e5' : '#d1d5db', background: agreedData ? '#4f46e5' : '#fff' }}
            >
              {agreedData && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-xs text-gray-500 leading-relaxed">
              I agree to share anonymized demographic data (age range, location, giving patterns) to help nonprofits understand donor trends. My financial data is never sold.
            </span>
          </label>
          {!canContinue && (
            <p className="text-xs text-center text-gray-400">Please check both boxes above to continue</p>
          )}
        </div>
      </div>
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
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)', minHeight: '38%' }}
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
              <p className="text-emerald-300 text-xs font-semibold">👁 Watching purchases</p>
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
          We'll track your everyday purchases on this card to calculate your round-ups.
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
              style={{ background: '#d1fae5', border: '1px solid #6ee7b7' }}
            >
              <CheckCircle size={22} className="text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-emerald-900 text-sm">{connected.name} connected</p>
                <p className="text-emerald-700 text-xs mt-0.5">We'll watch your purchases and calculate round-ups automatically</p>
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
            <p className="text-gray-400 text-xs">Read-only access via Plaid · Your credentials are never stored by PocketChange</p>
          </div>
        </div>

        <div className="px-4 pb-10 pt-3 border-t border-teal-100" style={{ background: '#f0fdfb' }}>
          <motion.button
            whileTap={connected ? { scale: 0.97 } : {}}
            onClick={() => connected && onNext()}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: connected ? 'linear-gradient(135deg, #0d9488, #0891b2)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
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
    sub: 'Direct bank transfer · 5% platform fee',
    badge: 'Best for most people',
    badgeColor: '#059669',
  },
  {
    id: 'apple_pay',
    icon: '🍎',
    label: 'Apple Pay',
    sub: 'Set up once, fully automatic · 10% platform fee',
    badge: null,
  },
  {
    id: 'card',
    icon: '💳',
    label: 'Credit or Debit Card',
    sub: 'Visa, Mastercard, Amex, or Discover · 10% platform fee',
    badge: null,
  },
];

function PaymentMethodScreen({ onNext }) {
  const [selected, setSelected] = useState(null);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div
        className="flex flex-col items-center justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', minHeight: '38%' }}
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
            <span className="text-white text-sm font-semibold">Charged once a month · $5 minimum</span>
          </motion.div>
        </motion.div>
        <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
          How should we{'\n'}collect your round-ups?
        </h1>
        <p className="text-white/80 text-sm mt-2 text-center leading-relaxed">
          Once a month, we'll add up your round-ups and charge your chosen payment method.
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
                ? { background: '#ede9fe', border: '2px solid #7c3aed' }
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
                  ? { borderColor: '#7c3aed', background: '#7c3aed' }
                  : { borderColor: '#d1d5db', background: 'transparent' }
                }
              >
                {selected === opt.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </motion.button>
          ))}

          <p className="text-gray-400 text-xs text-center px-2 pt-1">
            You can change this anytime in Settings. Donations are processed securely via Stripe.
          </p>
        </div>

        <div className="px-4 pb-10 pt-3 bg-gray-50 border-t border-gray-100">
          <motion.button
            whileTap={selected ? { scale: 0.97 } : {}}
            onClick={() => selected && onNext(selected)}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: selected ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              cursor: selected ? 'pointer' : 'default',
            }}
          >
            {selected === 'card' ? 'Continue — Add Card →' : selected ? 'Continue — Pick Your Cause →' : 'Choose a payment method'}
          </motion.button>
          <p className="text-center text-gray-400 text-xs leading-relaxed px-2 mt-3">
            PocketChange retains a <span className="font-semibold">5% fee</span> (ACH) or <span className="font-semibold">10% fee</span> (Apple Pay &amp; card). The remainder goes directly to your cause via{' '}
            <span className="font-semibold">Endaoment</span>, a registered 501(c)(3) donor-advised fund. Tax receipts issued automatically.
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
          Card details secured by <span className="font-semibold">Stripe</span>. PocketChange never sees your card number.
        </p>
      </div>

      <motion.button
        type="submit"
        whileTap={cardComplete && !loading ? { scale: 0.97 } : {}}
        disabled={!cardComplete || loading || !stripe}
        className="w-full py-4 rounded-2xl text-white font-bold text-base"
        style={{
          background: cardComplete && !loading
            ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
            : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
          cursor: cardComplete && !loading ? 'pointer' : 'default',
        }}
      >
        {loading ? 'Saving card securely…' : 'Save Card — Pick Your Cause →'}
      </motion.button>
    </form>
  );
}

function CardEntryScreen({ onNext }) {
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
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', minHeight: '32%' }}
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
            Saved securely via Stripe. A 10% platform fee applies to card payments.
          </p>
        </div>

        <div className="flex-1 bg-gray-50 rounded-t-3xl -mt-4 flex flex-col overflow-y-auto px-4 pt-6 pb-10">
          <CardEntryForm onSuccess={onNext} />
          <p className="text-center text-gray-400 text-xs leading-relaxed px-2 mt-4">
            Round-ups are charged once a month (minimum $5) and disbursed quarterly to your cause via{' '}
            <span className="font-semibold">Endaoment</span>, a registered 501(c)(3) DAF. Tax receipts issued automatically.
          </p>
        </div>
      </motion.div>
    </Elements>
  );
}

// ─── Cause selection screen ─────────────────────────────────────────────────

function CauseCard({ nonprofit, selected, onSelect }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(nonprofit)}
      className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all relative overflow-hidden"
      style={selected
        ? { background: nonprofit.brand.accentLight, boxShadow: `0 0 0 2px ${nonprofit.brand.primary}` }
        : { background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
      }
    >
      {/* Color accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl transition-all"
        style={{ background: selected ? nonprofit.brand.primary : 'transparent' }}
      />
      <OrgLogo nonprofit={nonprofit} size={12} rounded="xl" className="shrink-0 ml-1" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm leading-snug">{nonprofit.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-full inline-block"
            style={{ background: nonprofit.categoryColor + '18', color: nonprofit.categoryColor }}
          >
            {nonprofit.category}
          </span>
          <MatchBadge match={nonprofit.corporateMatch} compact />
        </div>
      </div>
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all"
        style={selected
          ? { background: nonprofit.brand.primary }
          : { background: '#f3f4f6' }
        }
      >
        {selected
          ? <CheckCircle size={14} className="text-white" />
          : <div className="w-3 h-3 rounded-full bg-gray-300" />
        }
      </div>
    </motion.button>
  );
}

function CauseSelectionScreen({ onComplete }) {
  const { setSelectedNonprofit, setTab, setPage } = useApp();
  const [picked, setPicked] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState('');

  const searchResults = NONPROFITS.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.category.toLowerCase().includes(search.toLowerCase())
  );

  function handleConfirm() {
    if (!picked) return;
    setSelectedNonprofit(picked);
    setPage('home');
  }

  function handleBrowseAll(nonprofit) {
    setSelectedNonprofit(nonprofit);
    setPage('home');
    setTab('nonprofits');
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Hero — same full-bleed gradient style as intro slides */}
      <div
        className="flex flex-col items-center justify-end px-8 pb-8 pt-14 shrink-0"
        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ec4899 55%, #8b5cf6 100%)', minHeight: '38%' }}
      >
        {/* Mini logo row preview */}
        <motion.div className="flex gap-2 mb-5">
          {FEATURED.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.07 + 0.15, type: 'spring', stiffness: 320 }}
              className="w-11 h-11 rounded-xl bg-white/25 p-1.5 flex items-center justify-center"
            >
              <OrgLogo nonprofit={n} size={7} rounded="lg" className="shrink-0" />
            </motion.div>
          ))}
        </motion.div>
        <h1 className="text-white font-bold text-4xl leading-tight text-center" style={{ letterSpacing: '-0.5px' }}>
          Pick Your{'\n'}Cause
        </h1>
        <p className="text-white/80 text-sm mt-2 text-center leading-relaxed">
          Your round-ups will support this cause.{'\n'}You can always change it later.
        </p>
      </div>

      {/* Bottom sheet card panel */}
      <div className="flex-1 bg-gray-50 rounded-t-3xl -mt-4 flex flex-col overflow-hidden">
        <div className="flex-1 scrollable px-4 pt-5 pb-2 space-y-2.5">
          {!showSearch ? (
            <>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest px-1 pb-1">Featured Causes</p>
              {FEATURED.map((nonprofit) => (
                <CauseCard
                  key={nonprofit.id}
                  nonprofit={nonprofit}
                  selected={picked?.id === nonprofit.id}
                  onSelect={setPicked}
                />
              ))}

              {/* Browse all */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowSearch(true)}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-dashed border-gray-200 bg-white text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center shrink-0">
                  <Search size={20} className="text-violet-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">Find a different cause</p>
                  <p className="text-gray-400 text-xs">Search all verified nonprofits</p>
                </div>
                <ArrowRight size={16} className="text-gray-300 ml-auto shrink-0" />
              </motion.button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowSearch(false)}
                className="text-sm font-semibold px-1 pb-1"
                style={{ color: '#f97316' }}
              >
                ← Featured causes
              </button>
              <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm">
                <Search size={16} className="text-gray-400 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search causes..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                />
              </div>
              <div className="space-y-2">
                {searchResults.map(nonprofit => (
                  <motion.button
                    key={nonprofit.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleBrowseAll(nonprofit)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white shadow-sm text-left"
                  >
                    <OrgLogo nonprofit={nonprofit} size={10} rounded="xl" className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{nonprofit.name}</p>
                      <p className="text-gray-400 text-xs">{nonprofit.category}</p>
                    </div>
                    <ArrowRight size={14} className="text-gray-300 shrink-0" />
                  </motion.button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* CTA */}
        {!showSearch && (
          <div className="px-4 pb-10 pt-3 bg-gray-50 border-t border-gray-100">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleConfirm}
              disabled={!picked}
              className="w-full py-4 rounded-2xl text-white font-bold text-base transition-all"
              style={{
                background: picked
                  ? picked.brand.gradient
                  : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
                opacity: picked ? 1 : 0.7,
              }}
            >
              {picked ? `Support ${picked.name}` : 'Select a cause to continue'}
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main onboarding shell ───────────────────────────────────────────────────

export default function Onboarding() {
  const [slide, setSlide] = useState(0);
  const [step, setStep] = useState('slides'); // 'slides' | 'signup' | 'connect-card' | 'payment-method' | 'card-entry' | 'cause'

  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  function advance() {
    if (isLast) {
      setStep('signup');
    } else {
      setSlide(s => s + 1);
    }
  }

  if (step === 'cause') return <CauseSelectionScreen />;
  if (step === 'card-entry') return <CardEntryScreen onNext={() => setStep('cause')} />;
  if (step === 'payment-method') return <PaymentMethodScreen onNext={method => setStep(method === 'card' ? 'card-entry' : 'cause')} />;
  if (step === 'connect-card') return <ConnectCardScreen onNext={() => setStep('payment-method')} />;
  if (step === 'signup') return <SignUpScreen onNext={() => setStep('connect-card')} />;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className={`flex-1 bg-gradient-to-br ${current.bg} flex flex-col items-center justify-center px-8 pt-16 pb-6`}
        >
          {/* Illustration */}
          <div className="h-56 flex items-center justify-center">
            {current.illustration}
          </div>

          {/* Text */}
          <div className="mt-10 text-center">
            <h1 className="text-white font-bold text-4xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
              {current.title}
            </h1>
            <p className="text-white/80 text-base mt-4 leading-relaxed">
              {current.subtitle}
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
              style={{ color: slide === 0 ? '#f97316' : slide === 1 ? '#7c3aed' : slide === 2 ? '#059669' : '#e11d48' }}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
