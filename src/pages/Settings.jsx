import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Bell, Shield, ChevronRight, Plus, Zap, Lock, Trash2, Fingerprint, FileText, ExternalLink, Eye } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Sheet from '../components/Sheet';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import CoinLogo from '../components/CoinLogo';
import CoinMark from '../components/CoinMark';
import CoinAccent from '../components/CoinAccent';
import OrgLogo from '../components/OrgLogo';
import { NONPROFITS } from '../data/nonprofits';
import bgcaLogoUrl from '../assets/bgca-logo.png';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder');

function findNonprofitByCode(code) {
  if (!code) return null;
  const lower = code.toLowerCase().trim();
  return NONPROFITS.find(n => n.id === lower || n.shortName.toLowerCase() === lower) ?? null;
}

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

function Toggle({ value, onChange, color }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="rounded-full transition-all duration-200 relative flex items-center px-0.5"
      style={{ width: 48, height: 28, background: value ? color : '#e5e7eb' }}
    >
      <motion.div
        layout
        className="w-5 h-5 bg-white rounded-full shadow-sm"
        style={{ marginLeft: value ? 'auto' : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      />
    </button>
  );
}

function SettingRow({ icon, label, sub, right, onPress, color }) {
  const inner = (
    <>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 text-sm font-semibold">{label}</p>
        {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
      </div>
      {right}
    </>
  );
  if (onPress) {
    return (
      <button onClick={onPress} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        {inner}
      </button>
    );
  }
  return (
    <div className="w-full flex items-center gap-3 px-4 py-3.5">
      {inner}
    </div>
  );
}


const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1×', desc: 'Standard round-up' },
  { value: 2, label: '2×', desc: 'Double your impact' },
  { value: 3, label: '3×', desc: 'Triple your impact' },
];

const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Discover'];

function AddCardForm({ onAdd, onClose, brand }) {
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

    // In production: call backend to create a SetupIntent, then confirmCardSetup.
    // For the prototype we simulate a successful save after a brief delay.
    await new Promise(r => setTimeout(r, 1200));

    setLoading(false);
    // Simulate getting back last4 from Stripe — replace with real payment method details in production
    onAdd({ id: Date.now(), last4: '****', brand: 'Card', name: 'My Card' });
    onClose();
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
          Card details secured by <span className="font-semibold">Stripe</span>. {brand.appName} never sees your card number.
        </p>
      </div>

      <motion.button
        type="submit"
        whileTap={cardComplete && !loading ? { scale: 0.97 } : {}}
        disabled={!cardComplete || loading || !stripe}
        className="w-full py-4 rounded-2xl text-white font-bold text-base"
        style={{
          background: cardComplete && !loading ? brand.gradient : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
          cursor: cardComplete && !loading ? 'pointer' : 'default',
        }}
      >
        {loading ? 'Saving card securely…' : 'Add Card'}
      </motion.button>
    </form>
  );
}

function AddCardSheet({ show, onClose, onAdd, brand }) {
  return (
    <Sheet show={show} onClose={onClose} title="Add a Card">
      <div className="px-6 py-4 pb-8">
        <Elements stripe={stripePromise}>
          <AddCardForm onAdd={onAdd} onClose={onClose} brand={brand} />
        </Elements>
      </div>
    </Sheet>
  );
}

function PrivacySheet({ show, onClose, brand }) {
  const [biometric, setBiometric] = useState(true);
  const [dataSharing, setDataSharing] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <Sheet show={show} onClose={onClose} title="Privacy & Security">
      <div className="px-5 py-4 pb-8 space-y-4">

        {/* Security */}
        <div className="bg-gray-50 rounded-3xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Security</p>
          </div>
          <SettingRow
            icon={<Fingerprint size={18} />}
            label="Face ID / Touch ID"
            sub="Require biometrics to open app"
            color={brand.primary}
            right={<Toggle value={biometric} onChange={setBiometric} color={brand.primary} />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<Lock size={18} />}
            label="Change PIN"
            sub="Update your 6-digit access PIN"
            color={brand.secondary}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<Shield size={18} />}
            label="Two-Factor Authentication"
            sub="SMS or authenticator app"
            color={brand.primary}
            right={
              <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ color: '#0D9488', background: '#f0fdfa' }}>On</span>
            }
          />
        </div>

        {/* Privacy */}
        <div className="bg-gray-50 rounded-3xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Privacy</p>
          </div>
          <SettingRow
            icon={<Eye size={18} />}
            label="Anonymous Analytics"
            sub="Help us improve the app (no personal data)"
            color={brand.primary}
            right={<Toggle value={dataSharing} onChange={setDataSharing} color={brand.primary} />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<Bell size={18} />}
            label="Marketing Emails"
            sub="Impact stories and app updates"
            color={brand.secondary}
            right={<Toggle value={marketingEmails} onChange={setMarketingEmails} color={brand.primary} />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<FileText size={18} />}
            label="Privacy Policy"
            sub="Read our full data practices"
            color="#6b7280"
            onPress={() => window.open('/legal/privacy/', '_blank')}
            right={<ExternalLink size={14} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<FileText size={18} />}
            label="Terms of Service"
            sub="Review your user agreement"
            color="#6b7280"
            onPress={() => window.open('/legal/terms/', '_blank')}
            right={<ExternalLink size={14} className="text-gray-300 shrink-0" />}
          />
        </div>

        {/* Data */}
        <div className="bg-gray-50 rounded-3xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Your Data</p>
          </div>
          <SettingRow
            icon={<FileText size={18} />}
            label="Download My Data"
            sub="Get a copy of everything we have"
            color={brand.primary}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<Trash2 size={18} />}
            label="Delete Account"
            sub="Permanently remove all data"
            color="#ef4444"
            onPress={() => setShowDeleteConfirm(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </div>

        {/* Delete confirm */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-red-50 border-2 border-red-100 rounded-3xl p-5"
            >
              <p className="font-bold text-red-700 mb-1">Delete your account?</p>
              <p className="text-red-500 text-sm mb-4">This will permanently remove all your data, donation history, and linked cards. This cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-red-200 text-red-500 font-semibold text-sm"
                >
                  Cancel
                </button>
                <button className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm">
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

function SwitchOrgSheet({ show, onClose, brand, onBind }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    const np = findNonprofitByCode(code);
    if (!np) {
      setError('Code not found. Ask your nonprofit for their PocketCache code.');
      return;
    }
    onBind(np);
    onClose();
    setCode('');
    setError(null);
  }

  return (
    <Sheet show={show} onClose={onClose} title="Switch Nonprofit">
      <div className="px-6 py-5 pb-8">
        <p className="text-gray-500 text-sm mb-5">Enter a new nonprofit code to re-bind to a different organization.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="text"
              placeholder="Enter code (e.g. BGCA)"
              value={code}
              onChange={e => { setCode(e.target.value); setError(null); }}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border-2 transition-colors font-mono uppercase"
              style={{ borderColor: error ? '#ef4444' : code ? brand.primary : '#e5e7eb' }}
            />
            {error && <p className="text-red-500 text-xs mt-1 px-1">{error}</p>}
            <p className="text-gray-400 text-xs mt-1 px-1">Demo code: BGCA</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: code ? brand.gradient : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              cursor: code ? 'pointer' : 'default',
            }}
          >
            Switch Nonprofit →
          </motion.button>
        </form>
      </div>
    </Sheet>
  );
}

function AppIconSheet({ show, onClose, brand }) {
  const [selectedIcon, setSelectedIcon] = useState('pocketcache');

  return (
    <Sheet show={show} onClose={onClose} title="App Icon">
      <div className="px-6 py-5 pb-8 space-y-4">
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: brand.accentLight }}>
          <span className="text-2xl">⚓</span>
          <div>
            <p className="font-bold text-sm" style={{ color: brand.primary }}>BGCA Anchor Partner</p>
            <p className="text-gray-500 text-xs">Custom icon available</p>
          </div>
        </div>

        <p className="text-gray-500 text-sm">Choose your app icon. Custom icons are available for anchor nonprofit partners.</p>

        <div className="space-y-3">
          {[
            { id: 'pocketcache', label: 'PocketCache Icon', sub: 'Default', emoji: '🪙', logoImg: null },
            { id: 'bgca', label: 'BGCA Custom Icon', sub: 'Anchor partner benefit', emoji: null, logoImg: bgcaLogoUrl },
          ].map(opt => (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedIcon(opt.id)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all"
              style={selectedIcon === opt.id
                ? { borderColor: brand.primary, background: brand.accentLight }
                : { borderColor: '#f3f4f6', background: '#f9fafb' }}
            >
              {opt.logoImg ? (
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm overflow-hidden"
                  style={{ background: '#fff', border: selectedIcon === opt.id ? `2px solid ${brand.primary}` : '2px solid #e5e7eb' }}>
                  <img src={opt.logoImg} alt={opt.label} className="w-full h-full object-contain p-1.5" style={{ display: 'block' }} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm"
                  style={{ background: selectedIcon === opt.id ? brand.gradient : '#e5e7eb' }}>
                  {opt.emoji}
                </div>
              )}
              <div className="text-left flex-1">
                <p className="font-semibold text-sm text-gray-900">{opt.label}</p>
                <p className="text-gray-400 text-xs">{opt.sub}</p>
              </div>
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                style={selectedIcon === opt.id
                  ? { borderColor: brand.primary, background: brand.primary }
                  : { borderColor: '#d1d5db', background: 'transparent' }}
              >
                {selectedIcon === opt.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </motion.button>
          ))}
        </div>

        <p className="text-gray-400 text-xs text-center px-2">
          Custom icons are available for anchor nonprofit partners. For iOS, icons are bundled at app build time. Non-anchor tenants use the PocketCache icon.
        </p>
      </div>
    </Sheet>
  );
}

function CancelSheet({ show, onClose, pendingRoundUps, brand }) {
  const [result, setResult] = useState(null); // 'donated' | 'cancelled'

  function handleDonate() {
    setTimeout(() => { setResult('donated'); }, 600);
  }

  function handleCancelOnly() {
    setTimeout(() => { setResult('cancelled'); }, 600);
  }

  const amount = typeof pendingRoundUps === 'number' ? pendingRoundUps.toFixed(2) : '0.00';

  return (
    <Sheet show={show} onClose={() => { onClose(); setResult(null); }} title="Before you go…">
      <div className="px-6 py-5 pb-8">
        {result === 'donated' ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">💚</div>
            <p className="font-bold text-gray-900 text-lg">Donated! Your subscription has been cancelled.</p>
            <p className="text-gray-500 text-sm mt-2">Thank you for your final donation to BGCA.</p>
          </div>
        ) : result === 'cancelled' ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">👋</div>
            <p className="font-bold text-gray-900 text-lg">Subscription Cancelled</p>
            <p className="text-gray-500 text-sm mt-2">This month's round-ups won't be charged — as if the month never happened.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-700 text-sm mb-6 leading-relaxed">
              You've rounded up <strong>${amount}</strong> for BGCA this month. Would you like to make this month's donation before cancelling?
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleDonate}
              className="w-full py-4 rounded-2xl text-white font-bold text-base mb-3"
              style={{ background: brand.gradient }}
            >
              Donate ${amount} &amp; cancel
            </motion.button>
            <button
              onClick={handleCancelOnly}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm text-gray-500 border border-gray-200 bg-gray-50 mb-3"
            >
              Cancel without donating
            </button>
            <p className="text-gray-400 text-xs text-center">This month's round-ups won't be charged — as if the month never happened.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

export default function Settings() {
  const { linkedCards, setLinkedCards, selectedNonprofit, roundUpMultiplier, setRoundUpMultiplier, totalDonated, setSelectedNonprofit, pendingRoundUps } = useApp();
  const brand = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [chargeReminder, setChargeReminder] = useState(true);
  const [autoDeposit, setAutoDeposit] = useState(true);
  const [showMultiplier, setShowMultiplier] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSwitchOrg, setShowSwitchOrg] = useState(false);
  const [showAppIcon, setShowAppIcon] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Settings</h1>
            <p className="text-white/70 text-sm mt-0.5">{brand.appName}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 space-y-4 pt-4">

        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 flex items-center gap-4 card-shadow"
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md"
            style={{ background: brand.gradient }}>
            A
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-lg">Alex Johnson</p>
            <p className="text-gray-400 text-sm">alex@example.com</p>
            <p className="text-xs font-semibold mt-1" style={{ color: brand.primary }}>Member since Jan 2026</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Donated</p>
            <p className="text-gray-900 font-bold text-lg">${totalDonated.toFixed(2)}</p>
          </div>
        </motion.div>

        {/* Round-up settings */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Round-Up Settings</p>
          </div>
          <SettingRow
            icon={<Zap size={18} />}
            label="Multiplier"
            sub={`${roundUpMultiplier}× — ${MULTIPLIER_OPTIONS.find(o => o.value === roundUpMultiplier)?.desc}`}
            color={brand.primary}
            onPress={() => setShowMultiplier(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<span className="text-base">🏦</span>}
            label="Auto-deposit"
            sub="Send round-ups automatically"
            color={brand.secondary}
            right={<Toggle value={autoDeposit} onChange={setAutoDeposit} color={brand.primary} />}
          />
        </motion.div>

        {/* Linked accounts */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Linked Cards</p>
          </div>
          {linkedCards.map((card) => (
            <SettingRow
              key={card.id}
              icon={<CreditCard size={18} />}
              label={card.name}
              sub={`•••• ${card.last4} · ${card.brand}`}
              color={brand.secondary}
              right={<span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ color: '#0D9488', background: '#f0fdfa' }}>Active</span>}
            />
          ))}
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<Plus size={18} />}
            label="Add a card"
            sub="Link another bank or credit card"
            color={brand.primary}
            onPress={() => setShowAddCard(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Billing policy */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="bg-amber-50 rounded-3xl px-4 py-3.5" style={{ border: '1px solid #fde68a' }}>
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Monthly Billing</p>
          <p className="text-xs text-amber-800 leading-relaxed">
            Your round-ups are charged once a month (minimum $10) directly on BGCA&apos;s Stripe — BGCA is the merchant of record. 100% of your round-up amount goes directly to BGCA. A flat <strong>$0.50/month</strong> processing fee is charged separately (you can opt to cover it at checkout, pre-checked). PocketCache takes no percentage of your donation — ever. If a payment fails, we&apos;ll retry once after 3 days. If it fails again, your account is paused and you&apos;ll be notified. Round-ups keep accumulating during a pause. When you cancel, we'll ask if you'd like to make this month's donation first — you can always donate and cancel, or cancel without donating.
          </p>
        </motion.div>

        {/* Current cause */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Your Cause</p>
          </div>
          <SettingRow
            icon={<OrgLogo nonprofit={selectedNonprofit} size={8} rounded="xl" />}
            label={selectedNonprofit.name}
            sub={selectedNonprofit.category}
            color={brand.primary}
            right={<span className="text-xs font-semibold shrink-0 px-2 py-1 rounded-full" style={{ color: '#0D9488', background: '#f0fdfa' }}>Active</span>}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<span className="text-base">🔄</span>}
            label="Switch Nonprofit"
            sub="Enter a new code to re-bind to a different nonprofit"
            color={brand.primary}
            onPress={() => setShowSwitchOrg(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Preferences */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Preferences</p>
          </div>
          <SettingRow
            icon={<Bell size={18} />}
            label="Push Notifications"
            sub="Round-up alerts and impact updates"
            color={brand.secondary}
            right={<Toggle value={notifications} onChange={setNotifications} color={brand.primary} />}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<Bell size={18} />}
            label="Charge Reminder"
            sub="Notify me before my monthly charge"
            color={brand.primary}
            right={<Toggle value={chargeReminder} onChange={setChargeReminder} color={brand.primary} />}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<Shield size={18} />}
            label="Privacy & Security"
            sub="Biometrics, data, and permissions"
            color={brand.secondary}
            onPress={() => setShowPrivacy(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<span className="text-base">🖼️</span>}
            label="App Icon"
            sub="BGCA is an anchor partner — custom icon available"
            color={brand.secondary}
            onPress={() => setShowAppIcon(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-2 py-4">
          {brand.brandLogoUrl ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
              <img src={brand.brandLogoUrl} alt={brand.appName} className="w-full h-full object-contain p-1.5" style={{ display: 'block' }} />
            </div>
          ) : brand.logoEmoji ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ background: brand.gradient }}>
              {brand.logoEmoji}
            </div>
          ) : <CoinMark size={32} />}
          <p className="font-bold text-sm" style={{ color: brand.primary }}>{brand.appName}</p>
          <p className="text-gray-300 text-xs flex items-center gap-1 justify-center"><CoinMark size={14} />PocketCache · v1.0.0</p>
        </motion.div>

        {/* Cancel subscription */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <button
            onClick={() => setShowCancel(true)}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold text-red-500 bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Cancel Subscription
          </button>
        </motion.div>

      </div>

      {/* Multiplier sheet */}
      <Sheet show={showMultiplier} onClose={() => setShowMultiplier(false)} title="Round-Up Multiplier">
        <div className="px-6 py-4 pb-8">
          <p className="text-gray-500 text-sm mb-5">Multiply your round-ups to give more with every purchase.</p>
          <div className="space-y-3">
            {MULTIPLIER_OPTIONS.map((opt) => (
              <motion.button
                key={opt.value}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setRoundUpMultiplier(opt.value); setShowMultiplier(false); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all"
                style={roundUpMultiplier === opt.value
                  ? { borderColor: brand.primary, background: brand.accentLight }
                  : { borderColor: '#f3f4f6', background: '#f9fafb' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
                  style={roundUpMultiplier === opt.value
                    ? { background: brand.primary, color: '#fff' }
                    : { background: '#fff', color: '#4b5563' }}>
                  {opt.label}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm" style={{ color: roundUpMultiplier === opt.value ? brand.primary : '#111827' }}>
                    {opt.label} Round-up
                  </p>
                  <p className="text-gray-400 text-xs">{opt.desc}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </Sheet>

      {/* Add Card sheet */}
      <AddCardSheet
        show={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAdd={(card) => setLinkedCards(c => [...c, card])}
        brand={brand}
      />

      {/* Privacy & Security sheet */}
      <PrivacySheet show={showPrivacy} onClose={() => setShowPrivacy(false)} brand={brand} />

      {/* Switch Org sheet */}
      <SwitchOrgSheet
        show={showSwitchOrg}
        onClose={() => setShowSwitchOrg(false)}
        brand={brand}
        onBind={(np) => { setSelectedNonprofit(np); setShowSwitchOrg(false); }}
      />

      {/* App Icon sheet */}
      <AppIconSheet
        show={showAppIcon}
        onClose={() => setShowAppIcon(false)}
        brand={brand}
      />

      {/* Cancel sheet */}
      <CancelSheet
        show={showCancel}
        onClose={() => setShowCancel(false)}
        pendingRoundUps={pendingRoundUps}
        brand={brand}
      />
    </div>
  );
}
