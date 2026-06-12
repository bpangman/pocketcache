import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Bell, Shield, ChevronRight, Plus, Zap, Lock, Trash2, Fingerprint, FileText, ExternalLink, Eye } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Sheet from '../components/Sheet';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import CoinLogo from '../components/CoinLogo';
import CoinAccent from '../components/CoinAccent';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder');

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
            color="#10b981"
            right={
              <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-1 rounded-full shrink-0">On</span>
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
            onPress={() => window.open('/cache/legal/privacy/', '_blank')}
            right={<ExternalLink size={14} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<FileText size={18} />}
            label="Terms of Service"
            sub="Review your user agreement"
            color="#6b7280"
            onPress={() => window.open('/cache/legal/terms/', '_blank')}
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
            color="#6366f1"
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

export default function Settings() {
  const { linkedCards, setLinkedCards, selectedNonprofit, roundUpMultiplier, setRoundUpMultiplier, totalDonated } = useApp();
  const brand = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [autoDeposit, setAutoDeposit] = useState(true);
  const [showMultiplier, setShowMultiplier] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

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
            color="#10b981"
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
              right={<span className="text-xs text-emerald-500 font-semibold bg-emerald-50 px-2 py-1 rounded-full shrink-0">Active</span>}
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
            Your round-ups are charged once a month (minimum $5). <strong>100% of your round-up amount goes directly to your chosen cause.</strong> A separate platform service fee is also charged each month: <strong>10%</strong> for card or Apple Pay, or <strong>5%</strong> for bank account (ACH) — with a $2 minimum and $5 maximum. If a payment fails, we'll retry once after 3 days. If it fails again, your account is paused and you'll be notified to update your payment method. Round-ups keep accumulating during a pause.
          </p>
          <p className="text-xs text-amber-700 mt-2 font-medium">
            Tip: Connect a bank account to pay a lower 5% service fee.
          </p>
        </motion.div>

        {/* Current cause */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Your Cause</p>
          </div>
          <SettingRow
            icon={<span className="text-xl">{selectedNonprofit.logo}</span>}
            label={selectedNonprofit.name}
            sub={selectedNonprofit.category}
            color={brand.primary}
            right={<span className="text-xs font-semibold shrink-0 bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full">Active</span>}
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
            icon={<Shield size={18} />}
            label="Privacy & Security"
            sub="Biometrics, data, and permissions"
            color="#10b981"
            onPress={() => setShowPrivacy(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-2 py-4">
          {brand.logoEmoji ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ background: brand.gradient }}>
              {brand.logoEmoji}
            </div>
          ) : <CoinLogo size={32} animate={false} showName={false} />}
          <p className="font-bold text-sm" style={{ color: brand.primary }}>{brand.appName}</p>
          <p className="text-gray-300 text-xs">Cache · v1.0.0</p>
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
    </div>
  );
}
