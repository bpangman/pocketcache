import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { CreditCard, Bell, Shield, ChevronRight, Zap, Trash2, Fingerprint, FileText, ExternalLink, Eye, Lock, CheckCircle, HelpCircle } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Sheet from '../components/Sheet';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import CoinLogo from '../components/CoinLogo';
import CoinMark from '../components/CoinMark';
import CoinAccent from '../components/CoinAccent';
import OrgLogo from '../components/OrgLogo';
import { findOrgByCode } from '../store/orgStore';
import { loadKey, saveKey } from '../store/identityStore';
import { fmtMoney } from '../lib/format';
import { MONTHLY_DATA } from '../data/transactions';
import { DEMO_USER } from '../data/derived';
import { biometricEnrolled, biometricEnroll, biometricDisable, markSessionUnlocked } from '../lib/biometric';
import bgcaLogoUrl from '../assets/bgca-logo.png';

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

const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Discover'];

// Persisted toggle preferences (pc_prefs). In production these live server-side.
function loadPrefs() {
  return {
    notifications: true, chargeReminder: true,
    biometric: true, dataSharing: false, marketingEmails: true,
    ...loadKey('pc_prefs', {}),
  };
}

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

const TRACKED_CARD_BANKS = [
  { id: 'chase',   name: 'Chase',            sub: 'Sapphire, Freedom, Ink',          color: '#1a56db', emoji: '🏦' },
  { id: 'capital', name: 'Capital One',       sub: 'Venture, Quicksilver',             color: '#c0392b', emoji: '💳' },
  { id: 'amex',    name: 'American Express',  sub: 'Gold, Platinum, Blue Cash',        color: '#007bc1', emoji: '💳' },
  { id: 'bofa',    name: 'Bank of America',   sub: 'Customized Cash, Travel',          color: '#e31837', emoji: '🏦' },
];

const PAYMENT_METHOD_OPTIONS = [
  { id: 'ach',       icon: '🏦', label: 'Bank Account',          sub: 'Direct bank transfer · Includes flat $1/month app fee' },
  { id: 'apple_pay', icon: '🍎', label: 'Apple Pay',              sub: 'Set up once, fully automatic · Includes flat $1/month app fee' },
  { id: 'card',      icon: '💳', label: 'Credit or Debit Card',   sub: 'Visa, Mastercard, Amex, or Discover · Includes flat $1/month app fee' },
];

const PAYMENT_TYPE_ICON = { ach: '🏦', apple_pay: '🍎', card: '💳' };

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
    // For the demo we simulate a successful save and generate a plausible last4.
    await new Promise(r => setTimeout(r, 1200));

    setLoading(false);
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const cardBrand = CARD_BRANDS[Math.floor(Math.random() * CARD_BRANDS.length)];
    onAdd({ id: Date.now(), last4, brand: cardBrand, name: `My ${cardBrand}` });
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

function PrivacySheet({
  show, onClose, brand,
  onDeleteAccount,
  adminOrgName,
  onDownloadData,
  biometric, onBiometricChange,
  dataSharing, onDataSharingChange,
  marketingEmails, onMarketingEmailsChange,
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    setShowDeleteConfirm(false);
    setDeleting(true);
    // Show "Account deleted" state briefly before navigating away
    setTimeout(() => {
      onDeleteAccount?.();
    }, 1200);
  }

  return (
    <Sheet show={show} onClose={onClose} title="Privacy & Security">
      <div className="px-5 py-4 pb-8 space-y-4">

        {deleting && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-50 rounded-3xl p-6 text-center"
          >
            <div className="text-4xl mb-3">{adminOrgName ? '🪙' : '🗑️'}</div>
            <p className="font-bold text-gray-900">{adminOrgName ? 'Your giving account is deleted.' : 'Account Deleted'}</p>
            <p className="text-gray-400 text-sm mt-1">
              {adminOrgName ? `Your admin account for ${adminOrgName} is untouched.` : 'Your data has been removed.'}
            </p>
          </motion.div>
        )}

        {!deleting && (
          <>
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
                right={<Toggle value={biometric} onChange={onBiometricChange} color={brand.primary} />}
              />
              <div className="h-px bg-gray-100 mx-4" />
              {/* 2FA is managed by the sign-in provider (Apple / Google)  -  no in-app toggle */}
              <SettingRow
                icon={<Shield size={18} />}
                label="Two-Factor Authentication"
                sub="Managed by your sign-in provider (Apple / Google)"
                color={brand.primary}
                right={null}
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
                right={<Toggle value={dataSharing} onChange={onDataSharingChange} color={brand.primary} />}
              />
              <div className="h-px bg-gray-100 mx-4" />
              <SettingRow
                icon={<Bell size={18} />}
                label="Marketing Emails"
                sub="Impact stories and app updates"
                color={brand.secondary}
                right={<Toggle value={marketingEmails} onChange={onMarketingEmailsChange} color={brand.primary} />}
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

            {/* Your Data */}
            <div className="bg-gray-50 rounded-3xl overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Your Data</p>
              </div>
              {/* Download My Data: generates a JSON export of the user's local state */}
              <SettingRow
                icon={<FileText size={18} />}
                label="Download My Data"
                sub="Get a copy of everything we have"
                color={brand.primary}
                onPress={onDownloadData}
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
                  <p className="text-red-500 text-sm mb-4">
                    This will permanently remove all your data, donation history, and linked cards. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-3 rounded-2xl bg-white border border-red-200 text-red-500 font-semibold text-sm"
                    >
                      Cancel
                    </button>
                    {/* "Yes, Delete" is now wired  -  clears all state and returns to onboarding */}
                    <button
                      onClick={handleDelete}
                      className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm"
                    >
                      Yes, Delete
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SwitchOrgSheet({ show, onClose, brand, onBind }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    const np = findOrgByCode(code);
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
            <p className="font-bold text-sm" style={{ color: brand.textAccent }}>BGCA Anchor Partner</p>
            <p className="text-gray-500 text-xs">Custom icon available</p>
          </div>
        </div>

        <p className="text-gray-500 text-sm">Choose your app icon. Custom icons are available for anchor nonprofit partners.</p>

        <div className="space-y-3">
          {[
            { id: 'pocketcache', label: 'PocketCache Icon', sub: 'Default', coin: true, logoImg: null },
            { id: 'bgca', label: 'BGCA Custom Icon', sub: 'Anchor partner benefit', coin: false, logoImg: bgcaLogoUrl },
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
                // The real app icon: navy tile with the official coin (gold + teal block arrow)
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ background: '#0B2A4A', border: selectedIcon === opt.id ? `2px solid ${brand.primary}` : '2px solid transparent' }}>
                  <CoinMark size={30} />
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

function CancelSheet({ show, onClose, pendingRoundUps, brand, nonprofit, onDonate, onCancelled }) {
  const { feeMonths } = useApp();
  const [result, setResult] = useState(null); // 'donated' | 'cancelled'
  const [coverProcessing, setCoverProcessing] = useState(true);

  useEffect(() => {
    if (result) {
      const t = setTimeout(() => { onCancelled?.(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [result, onCancelled]);

  function handleDonate() {
    const amount = pendingRoundUps;
    setTimeout(() => {
      onDonate?.(amount);
      setResult('donated');
    }, 600);
  }

  function handleCancelOnly() {
    setTimeout(() => { setResult('cancelled'); }, 600);
  }

  const rawAmount = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  const amountStr = rawAmount.toFixed(2);
  const appFee = feeMonths;
  const processingCover = parseFloat((rawAmount * 0.022 + 0.30).toFixed(2));
  const finalTotal = (appFee + rawAmount + (coverProcessing ? processingCover : 0)).toFixed(2);
  const belowMin = rawAmount < (nonprofit?.monthlyMinimum ?? 5);

  return (
    <Sheet show={show} onClose={() => { onClose(); setResult(null); }} title="Before you go…">
      <div className="px-6 py-5 pb-8">
        {result === 'donated' ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">💚</div>
            <p className="font-bold text-gray-900 text-lg">Donated! Your subscription has been cancelled.</p>
            <p className="text-gray-500 text-sm mt-2">
              Thank you for your final donation to {nonprofit?.shortName ?? 'your cause'}.
            </p>
          </div>
        ) : result === 'cancelled' ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">👋</div>
            <p className="font-bold text-gray-900 text-lg">Subscription Cancelled</p>
            <p className="text-gray-500 text-sm mt-2">
              This month&apos;s round-ups won&apos;t be charged  -  as if the month never happened.
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-700 text-sm mb-2 leading-relaxed">
              You&apos;ve rounded up <strong>${amountStr}</strong> for {nonprofit?.shortName ?? 'your cause'} this month.
              Would you like to make this month&apos;s donation before cancelling?
            </p>
            {/* Settle-up estimate */}
            <div className="rounded-2xl p-4 mb-3" style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5' }}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Final Settle-Up</p>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-gray-700">Round-ups</span>
                <span className="font-bold text-gray-900">${amountStr}</span>
              </div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-gray-500">App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span>
                <span className="text-sm text-gray-500">+${appFee.toFixed(2)}</span>
              </div>
              {coverProcessing && (
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm text-gray-500">Processing cover</span>
                  <span className="text-sm text-gray-500">+${processingCover.toFixed(2)}</span>
                </div>
              )}
              <div className="h-px bg-slate-200 my-2" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-bold" style={{ color: '#003865' }}>${finalTotal}</span>
              </div>
            </div>
            {belowMin && (
              <p className="text-amber-600 text-xs mb-4 leading-relaxed bg-amber-50 rounded-xl px-3 py-2">
                Note: ${amountStr} is below the ${nonprofit?.monthlyMinimum ?? 5} minimum  -  in a live account this would roll over rather than charge. Cancelling now forfeits this amount.
              </p>
            )}
            <label
              className="flex items-start gap-3 cursor-pointer p-3 rounded-2xl mb-3"
              onClick={() => setCoverProcessing(v => !v)}
              style={{ background: coverProcessing ? '#d1fae5' : '#f9fafb', border: coverProcessing ? '1.5px solid #6ee7b7' : '1.5px solid #e5e7eb' }}
            >
              <div
                className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                style={{ borderColor: coverProcessing ? '#059669' : '#d1d5db', background: coverProcessing ? '#059669' : '#fff' }}
              >
                {coverProcessing && <CheckCircle size={12} className="text-white" />}
              </div>
              <span className="text-xs text-gray-600 leading-relaxed">
                Cover {nonprofit?.shortName ?? 'your cause'}&apos;s card-processing costs too (pre-selected)  -  ~${processingCover.toFixed(2)} goes directly to them.
                {!coverProcessing && ` Unchecked: ${nonprofit?.shortName ?? 'your cause'} nets your round-ups minus standard card costs.`}
              </span>
            </label>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleDonate}
              className="w-full py-4 rounded-2xl text-white font-bold text-base mb-3"
              style={{ background: brand.gradient }}
            >
              Send ${finalTotal} &amp; cancel
            </motion.button>
            <p className="text-gray-400 text-xs text-center mb-3">
              One last charge (your round-ups + flat $1 app fee), then nothing ever again. There&apos;s never a fee for leaving.
            </p>
            <button
              onClick={handleCancelOnly}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm text-gray-500 border border-gray-200 bg-gray-50 mb-3"
            >
              Cancel without donating
            </button>
            <p className="text-gray-400 text-xs text-center">
              Skip it and your round-ups and all fees this month are simply waived  -  like the month never happened. Never a fee for leaving.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function formatManualCardNumber(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function TrackCardSheet({ show, onClose, currentCard, onConnected }) {
  const [connecting, setConnecting] = useState(null);
  const [connected, setConnected] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualCardNumber, setManualCardNumber] = useState('');
  const [manualConnecting, setManualConnecting] = useState(false);

  function handleSelect(bank) {
    if (connected) return;
    setConnecting(bank.id);
    setTimeout(() => {
      const last4 = String(Math.floor(1000 + Math.random() * 9000));
      setConnecting(null);
      setConnected({ ...bank, last4 });
    }, 1200);
  }

  function handleManualConnect() {
    const digits = manualCardNumber.replace(/\D/g, '');
    if (digits.length < 13) return;
    setManualConnecting(true);
    setTimeout(() => {
      const last4 = digits.slice(-4);
      setManualConnecting(false);
      setConnected({ id: 'manual', name: manualName.trim() || 'My Card', emoji: '💳', last4 });
      setShowManualForm(false);
    }, 1000);
  }

  function handleDone() {
    onConnected(connected);
    onClose();
    setConnected(null);
    setConnecting(null);
    setShowManualForm(false);
    setManualName('');
    setManualCardNumber('');
  }

  return (
    <Sheet show={show} onClose={() => { onClose(); setConnected(null); setConnecting(null); setShowManualForm(false); setManualName(''); setManualCardNumber(''); }} title="Track a Different Card">
      <div className="flex flex-col h-full overflow-hidden" style={{ background: '#f0fdfb' }}>
        <div className="flex-1 px-4 pt-5 pb-2 space-y-2.5 overflow-y-auto">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest px-1 pb-1">
            Currently tracking: {currentCard?.name ?? 'Chase Sapphire'} ···· {currentCard?.last4 ?? '4242'}
          </p>
          <p className="text-gray-500 text-xs px-1 pb-1">Select the card you want us to watch. Read-only access  -  we never touch your money, just count round-ups.</p>

          {connected ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: '#f0fdfa', border: '1px solid #99f6e4' }}
            >
              <CheckCircle size={22} className="shrink-0" style={{ color: '#0D9488' }} />
              <div className="flex-1">
                <p className="font-bold text-sm" style={{ color: '#134e4a' }}>{connected.name} connected</p>
                <p className="text-xs mt-0.5" style={{ color: '#0f766e' }}>We&apos;ll watch purchases and calculate round-ups as they happen</p>
              </div>
            </motion.div>
          ) : showManualForm ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: '#fff', border: '1.5px solid #99f6e4' }}
            >
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Enter card details</p>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Cardholder name</label>
                <input
                  type="text"
                  placeholder="Name on card"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200 focus:border-teal-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Card number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="XXXX XXXX XXXX XXXX"
                  value={manualCardNumber}
                  onChange={e => setManualCardNumber(formatManualCardNumber(e.target.value))}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200 focus:border-teal-400 font-mono tracking-wider"
                />
              </div>
              <div className="flex items-center gap-2">
                <Lock size={12} className="text-gray-400 shrink-0" />
                <p className="text-gray-400 text-xs">Encrypted via Plaid  -  PocketCache never stores your full card number</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowManualForm(false); setManualName(''); setManualCardNumber(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200"
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={manualCardNumber.replace(/\D/g,'').length >= 13 && !manualConnecting ? { scale: 0.97 } : {}}
                  onClick={handleManualConnect}
                  disabled={manualCardNumber.replace(/\D/g,'').length < 13 || manualConnecting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{
                    background: manualCardNumber.replace(/\D/g,'').length >= 13 && !manualConnecting
                      ? 'linear-gradient(135deg, #0d9488, #003865)'
                      : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
                  }}
                >
                  {manualConnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white" />
                      Connecting…
                    </span>
                  ) : 'Connect'}
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <>
              {TRACKED_CARD_BANKS.map(bank => (
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
                    : <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  }
                </motion.button>
              ))}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowManualForm(true)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl text-left"
                style={{ background: '#fff', border: '1.5px dashed #99f6e4' }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-teal-50">
                  <Lock size={18} className="text-teal-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-700 text-sm">Enter your card manually</p>
                  <p className="text-gray-400 text-xs">Type your card number  -  encrypted via Plaid</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </motion.button>
            </>
          )}

          <div className="flex items-center gap-2 px-1 pt-1">
            <Lock size={12} className="text-gray-400 shrink-0" />
            <p className="text-gray-400 text-xs">Read-only access via Plaid · Your credentials are never stored by PocketCache</p>
          </div>
        </div>

        <div className="px-4 pb-10 pt-3 border-t border-teal-100" style={{ background: '#f0fdfb' }}>
          <motion.button
            whileTap={connected ? { scale: 0.97 } : {}}
            onClick={() => connected && handleDone()}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: connected ? 'linear-gradient(135deg, #0d9488, #003865)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              cursor: connected ? 'pointer' : 'default',
            }}
          >
            {connected ? `Use ${connected.name} →` : 'Select a card to continue'}
          </motion.button>
        </div>
      </div>
    </Sheet>
  );
}

function ChangePaymentSheet({ show, onClose, brand, onMethodChanged }) {
  const [selected, setSelected] = useState(null);
  const [setting, setSetting] = useState(false);
  const [done, setDone] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);

  function handleSelect(optId) {
    if (optId === 'card') {
      setShowAddCard(true);
      return;
    }
    setSelected(optId);
    setSetting(true);
    setTimeout(() => {
      setSetting(false);
      setDone(true);
    }, 1200);
  }

  function handleCardAdded(card) {
    const method = { type: 'card', label: 'Credit or Debit Card', last4: card.last4 };
    onMethodChanged(method);
    setShowAddCard(false);
    onClose();
    setSelected(null);
    setDone(false);
  }

  function handleConfirm() {
    const opt = PAYMENT_METHOD_OPTIONS.find(o => o.id === selected);
    const method = { type: selected, label: opt?.label ?? selected, last4: null };
    onMethodChanged(method);
    onClose();
    setSelected(null);
    setDone(false);
  }

  return (
    <>
      <Sheet show={show} onClose={() => { onClose(); setSelected(null); setDone(false); setSetting(false); }} title="Change Payment Method">
        <div className="px-4 pt-5 pb-10 space-y-3">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest px-1 pb-1">Choose your payment method</p>
          <p className="text-gray-500 text-sm px-1 pb-1">Charged once a month for your round-ups total.</p>

          {PAYMENT_METHOD_OPTIONS.map(opt => (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => !done && handleSelect(opt.id)}
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
                <p className="font-bold text-gray-900 text-sm">{opt.label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{opt.sub}</p>
              </div>
              {selected === opt.id && setting && <span className="text-xs text-amber-600 font-semibold shrink-0">Setting up…</span>}
              {selected === opt.id && done && <CheckCircle size={18} className="shrink-0" style={{ color: '#0D9488' }} />}
            </motion.button>
          ))}

          {done && (
            <motion.button
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleConfirm}
              className="w-full py-4 rounded-2xl text-white font-bold text-base mt-2"
              style={{ background: brand.gradient }}
            >
              Confirm →
            </motion.button>
          )}

          <p className="text-gray-400 text-xs text-center px-2 pt-1">
            Payments are processed by Stripe  -  not us. Change this anytime.
          </p>
        </div>
      </Sheet>

      <AddCardSheet
        show={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAdd={handleCardAdded}
        brand={brand}
      />
    </>
  );
}

export default function Settings() {
  const {
    linkedCards, selectedNonprofit, roundUpMultiplier,
    setRoundUpMultiplier, totalDonated, setSelectedNonprofit, pendingRoundUps,
    boostDonation, cancelAccount, adminRole, deleteAccount,
    trackedCard, setTrackedCard, paymentMethod, setPaymentMethod,
    pendingSettingsAction, clearPendingSettingsAction, showToast,
    monthlyCap, setMonthlyCap,
    skipNextCharge, setSkipNextCharge,
  } = useApp();
  const brand = useTheme();

  // All toggle preferences persisted to pc_prefs in localStorage
  const [prefs, setPrefsState] = useState(loadPrefs);
  function updatePref(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefsState(next);
    saveKey('pc_prefs', next);
  }

  const [commsOptin, setCommsOptinState] = useState(() => loadKey('pc_comms_optin', true));
  function updateCommsOptin(v) {
    setCommsOptinState(v);
    saveKey('pc_comms_optin', v);
  }

  // Face ID / Touch ID unlock  -  REAL WebAuthn enrollment, not a cosmetic pref.
  // Enabling triggers the OS biometric prompt; disabling removes the credential.
  const [bioEnrolled, setBioEnrolled] = useState(biometricEnrolled);
  async function handleBiometricChange(v) {
    if (v) {
      const ok = await biometricEnroll({ name: DEMO_USER.name, email: DEMO_USER.email });
      if (ok) { markSessionUnlocked(); setBioEnrolled(true); showToast('Face ID unlock is on 🙂'); }
      else showToast("Couldn't set up Face ID on this device.");
    } else {
      biometricDisable();
      setBioEnrolled(false);
      showToast('Face ID unlock turned off.');
    }
  }

  const [showMultiplier, setShowMultiplier] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSwitchOrg, setShowSwitchOrg] = useState(false);
  const [showAppIcon, setShowAppIcon] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showTrackCard, setShowTrackCard] = useState(false);
  const [showChangePayment, setShowChangePayment] = useState(false);

  useEffect(() => {
    if (pendingSettingsAction === 'change-payment') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowChangePayment(true);
      clearPendingSettingsAction();
    }
  }, [pendingSettingsAction, clearPendingSettingsAction]);

  // "Member since" derived from DEMO_USER.joinedAt which is consistent with MONTHLY_DATA start
  const memberSince = DEMO_USER.joinedAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // Download My Data: generates a JSON snapshot of the user's local state
  function handleDownloadData() {
    const data = {
      user: {
        name: DEMO_USER.name,
        email: DEMO_USER.email,
        memberSince: DEMO_USER.joinedAt.toISOString().slice(0, 10),
      },
      cause: selectedNonprofit
        ? { id: selectedNonprofit.id, name: selectedNonprofit.name, ein: selectedNonprofit.ein }
        : null,
      totalDonated,
      monthlyHistory: MONTHLY_DATA.map(m => ({ month: m.month, year: m.year, donated: m.donated })),
      linkedCards: linkedCards.map(c => ({ brand: c.brand, last4: c.last4 })),
      preferences: prefs,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pocketcache-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!selectedNonprofit) return null;

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pb-5"
        style={{ paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Settings</h1>
            <p className="text-white/70 text-sm mt-0.5">{brand.appName}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 scrollable pc-scrollbar px-4 pb-28 space-y-4 pt-4">

        {/* Profile card  -  name/email from DEMO_USER; joinedAt from MONTHLY_DATA start */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 flex items-center gap-4 card-shadow"
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md"
            style={{ background: brand.gradient }}>
            {DEMO_USER.name[0]}
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-lg">{DEMO_USER.name} Johnson</p>
            <p className="text-gray-400 text-sm">{DEMO_USER.email}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: brand.textAccent }}>
              Member since {memberSince}
            </p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Donated</p>
            <p className="text-gray-900 font-bold text-lg">${fmtMoney(totalDonated)}</p>
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
            sub={`${roundUpMultiplier}×  -  ${MULTIPLIER_OPTIONS.find(o => o.value === roundUpMultiplier)?.desc}`}
            color={brand.primary}
            onPress={() => setShowMultiplier(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<span className="text-base">⏭️</span>}
            label="Skip a month"
            sub={skipNextCharge
              ? "Skipping  -  this month's round-ups are simply never charged; only the $1 fee rolls to next month ($1 × 2)"
              : "Need a breather? That month's round-ups are simply never charged  -  only the $1 fee rolls over"}
            color={brand.secondary}
            right={<Toggle value={skipNextCharge} onChange={setSkipNextCharge} color={brand.primary} />}
          />
        </motion.div>

        {/* Monthly Giving Cap */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Monthly Giving Cap</p>
          </div>
          <div className="px-4 pb-4 pt-1">
            <div className="flex items-center gap-3 py-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: brand.primary + '18' }}>
                <span style={{ color: brand.primary }}>🎯</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 text-sm font-semibold">Monthly Cap</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {monthlyCap === null ? 'No cap set' : `Capped at $${monthlyCap}/month`}
                </p>
              </div>
              <Toggle value={monthlyCap !== null} onChange={v => setMonthlyCap(v ? 20 : null)} color={brand.primary} />
            </div>
            {monthlyCap !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-2 mt-2"
              >
                <div className="text-center py-1">
                  <span className="text-3xl font-bold text-gray-900">${monthlyCap}</span>
                  <span className="text-gray-400 text-sm ml-1">/month</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={200}
                  step={5}
                  value={monthlyCap}
                  onChange={e => setMonthlyCap(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>$5</span>
                  <span>$200</span>
                </div>
              </motion.div>
            )}
            <p className="text-xs text-gray-400 mt-3 leading-relaxed">
              Cap what you give each month. If your round-ups go over, we only charge up to your cap  -  the rest is simply never charged.
            </p>
          </div>
        </motion.div>

        {/* Card We Track */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Card We Track</p>
          </div>
          <SettingRow
            icon={<CreditCard size={18} />}
            label={trackedCard?.name ?? 'Chase Sapphire'}
            sub={`•••• ${trackedCard?.last4 ?? '4242'} · Read-only via Plaid`}
            color="#0D9488"
            right={<span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ color: '#0D9488', background: '#f0fdfa' }}>Watching</span>}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<span className="text-base">🔄</span>}
            label="Track a different card"
            sub="Switch which card we watch for round-ups"
            color={brand.primary}
            onPress={() => setShowTrackCard(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* How You Pay */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">How You Pay</p>
          </div>
          <SettingRow
            icon={<span className="text-base">{PAYMENT_TYPE_ICON[paymentMethod?.type] ?? '💳'}</span>}
            label={paymentMethod?.label ?? 'Credit or Debit Card'}
            sub={`${paymentMethod?.last4 ? `•••• ${paymentMethod.last4} · ` : ''}Charged once a month`}
            color={brand.primary}
            right={<span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ color: '#0D9488', background: '#f0fdfa' }}>Active</span>}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<span className="text-base">🔄</span>}
            label="Change payment method"
            sub="Bank account, Apple Pay, or card"
            color={brand.primary}
            onPress={() => setShowChangePayment(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Billing policy  -  dynamic nonprofit name + tax receipt disclosure */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="bg-amber-50 rounded-3xl px-4 py-3.5" style={{ border: '1px solid #fde68a' }}>
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Monthly Billing</p>
          <p className="text-xs text-amber-800 leading-relaxed">
            One monthly charge on {selectedNonprofit.shortName}&apos;s Stripe  -  minimum ${selectedNonprofit.monthlyMinimum}.
            A flat <strong>$1/month</strong> app fee  -  only for months you&apos;re actively rounding up. If a month rolls over, the fee rolls with it and collects in the same single charge.
            Your toggle covers {selectedNonprofit.shortName}&apos;s card-processing costs: on means a small amount (~2.2% + 30¢) is added and passes directly to them  -  PocketCache never keeps it. Off means {selectedNonprofit.shortName} nets your round-ups minus standard card costs.
            They never pay PocketCache anything  -  the platform is always free for them.
            Months under ${selectedNonprofit.monthlyMinimum} roll over; we settle every 3 months at most.{' '}
            If months roll over, each active month adds $1  -  your charge breakdown itemizes it (e.g. &lsquo;App fee  -  $1 × 2 months&rsquo;).{' '}
            {selectedNonprofit.shortName} sends your tax receipt  -  your round-ups are deductible, the $1 fee is not.
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

        {/* Preferences  -  persisted to localStorage */}
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
            right={<Toggle value={prefs.notifications} onChange={v => updatePref('notifications', v)} color={brand.primary} />}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<Bell size={18} />}
            label="Charge Reminder"
            sub="Your exact amount on the 1st  -  charge runs the 11th"
            color={brand.primary}
            right={<Toggle value={prefs.chargeReminder} onChange={v => updatePref('chargeReminder', v)} color={brand.primary} />}
          />
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<Bell size={18} />}
            label="Account emails & nonprofit updates"
            sub="Charges, receipts, and updates from PocketCache and your nonprofit"
            color={brand.secondary}
            right={<Toggle value={commsOptin} onChange={updateCommsOptin} color={brand.primary} />}
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
            sub="BGCA is an anchor partner  -  custom icon available"
            color={brand.secondary}
            onPress={() => setShowAppIcon(true)}
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Help & Support */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow">
          <div className="px-4 pt-4 pb-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Help &amp; Support</p>
          </div>
          <SettingRow
            icon={<HelpCircle size={18} />}
            label="Contact support"
            sub="support@pocketcache.app"
            color={brand.primary}
            onPress={() => window.open('mailto:support@pocketcache.app')}
            right={<ExternalLink size={14} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-2 py-4">
          {brand.brandLogoUrl ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden"
              style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
              <img src={brand.brandLogoUrl} alt={brand.appName} className="w-full h-full object-contain p-1.5" style={{ display: 'block' }} />
            </div>
          ) : brand.logoEmoji ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
              style={{ background: brand.gradient }}>
              {brand.logoEmoji}
            </div>
          ) : <CoinMark size={32} />}
          <p className="font-bold text-sm" style={{ color: brand.textAccent }}>{brand.appName}</p>
          <p className="text-gray-300 text-xs flex items-center gap-1 justify-center">
            <CoinMark size={14} />PocketCache · v1.0.0
          </p>
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
                  <p className="font-semibold text-sm"
                    style={{ color: roundUpMultiplier === opt.value ? brand.textAccent : '#111827' }}>
                    {opt.label} Round-up
                  </p>
                  <p className="text-gray-400 text-xs">{opt.desc}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </Sheet>

      {/* Track Card sheet */}
      <TrackCardSheet
        show={showTrackCard}
        onClose={() => setShowTrackCard(false)}
        currentCard={trackedCard}
        onConnected={(bank) => {
          setTrackedCard({ name: bank.name, last4: bank.last4, brand: bank.name, institution: bank.name });
          showToast(`Now tracking ${bank.name}. Round-ups from your old card stop today; new purchases on this card count from now on.`);
        }}
      />

      {/* Change Payment sheet */}
      <ChangePaymentSheet
        show={showChangePayment}
        onClose={() => setShowChangePayment(false)}
        brand={brand}
        onMethodChanged={(method) => {
          setPaymentMethod(method);
          showToast('Payment method updated.');
        }}
      />

      {/* Privacy & Security sheet */}
      <PrivacySheet
        show={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        brand={brand}
        onDeleteAccount={() => { setShowPrivacy(false); deleteAccount(); }}
        adminOrgName={adminRole?.joinCode ?? null}
        onDownloadData={handleDownloadData}
        biometric={bioEnrolled}
        onBiometricChange={handleBiometricChange}
        dataSharing={prefs.dataSharing}
        onDataSharingChange={v => updatePref('dataSharing', v)}
        marketingEmails={prefs.marketingEmails}
        onMarketingEmailsChange={v => updatePref('marketingEmails', v)}
      />

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
        nonprofit={selectedNonprofit}
        onDonate={(amount) => boostDonation(amount)}
        onCancelled={() => { setShowCancel(false); cancelAccount(); }}
      />
    </div>
  );
}
