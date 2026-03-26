import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Bell, Shield, ChevronRight, Plus, Zap, Lock, Eye, EyeOff, Trash2, Fingerprint, FileText, ExternalLink } from 'lucide-react';
import Sheet from '../components/Sheet';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import Logo from '../components/Logo';

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

function AddCardSheet({ show, onClose, onAdd, brand }) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [showCvv, setShowCvv] = useState(false);

  function formatCard(val) {
    return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  }
  function formatExpiry(val) {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
  }

  function detectCardBrand(num) {
    const n = num.replace(/\s/g, '');
    if (n.startsWith('4')) return 'Visa';
    if (n.startsWith('5')) return 'Mastercard';
    if (n.startsWith('3')) return 'Amex';
    if (n.startsWith('6')) return 'Discover';
    return 'Card';
  }

  function handleAdd() {
    if (cardNumber.replace(/\s/g, '').length < 16) return;
    const last4 = cardNumber.replace(/\s/g, '').slice(-4);
    const detectedBrand = detectCardBrand(cardNumber);
    onAdd({ id: Date.now(), last4, brand: detectedBrand, name: name || 'My Card' });
    onClose();
    setCardNumber(''); setExpiry(''); setCvv(''); setName('');
  }

  const InputField = ({ label, value, onChange, placeholder, type = 'text', right }) => (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="flex items-center gap-2 border-2 border-gray-100 rounded-2xl px-4 py-3 focus-within:border-orange-300 transition-colors"
        style={{ borderColor: 'transparent', background: '#f9fafb' }}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={type === 'tel' ? 'numeric' : 'text'}
          className="flex-1 bg-transparent text-gray-900 text-sm outline-none placeholder:text-gray-400"
        />
        {right}
      </div>
    </div>
  );

  return (
    <Sheet show={show} onClose={onClose} title="Add a Card">
      <div className="px-6 py-4 pb-8">
        {/* Mock card preview */}
        <div
          className="rounded-3xl p-5 mb-6 text-white relative overflow-hidden h-40"
          style={{ background: brand.gradient }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 h-full flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">{brand.appName}</span>
              <CreditCard size={20} className="text-white/60" />
            </div>
            <div>
              <p className="text-white/60 text-xs mb-1">Card Number</p>
              <p className="font-mono text-lg tracking-widest">
                {cardNumber || '•••• •••• •••• ••••'}
              </p>
            </div>
            <div className="flex justify-between">
              <div>
                <p className="text-white/60 text-xs">Cardholder</p>
                <p className="font-semibold text-sm">{name || 'Your Name'}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs">Expires</p>
                <p className="font-semibold text-sm">{expiry || 'MM/YY'}</p>
              </div>
            </div>
          </div>
        </div>

        <InputField
          label="Card Number"
          value={cardNumber}
          onChange={v => setCardNumber(formatCard(v))}
          placeholder="1234 5678 9012 3456"
          type="tel"
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <InputField
              label="Expiry"
              value={expiry}
              onChange={v => setExpiry(formatExpiry(v))}
              placeholder="MM/YY"
              type="tel"
            />
          </div>
          <div className="flex-1">
            <InputField
              label="CVV"
              value={cvv}
              onChange={v => setCvv(v.replace(/\D/g, '').slice(0, 4))}
              placeholder="•••"
              type={showCvv ? 'tel' : 'password'}
              right={
                <button onClick={() => setShowCvv(s => !s)}>
                  {showCvv ? <EyeOff size={16} className="text-gray-400" /> : <Eye size={16} className="text-gray-400" />}
                </button>
              }
            />
          </div>
        </div>
        <InputField
          label="Cardholder Name"
          value={name}
          onChange={setName}
          placeholder="Alex Johnson"
        />

        <p className="text-gray-400 text-xs text-center mb-4 flex items-center justify-center gap-1">
          <Lock size={11} /> 256-bit encrypted · PCI DSS compliant
        </p>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleAdd}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ background: brand.gradient, opacity: cardNumber.replace(/\s/g,'').length < 16 ? 0.5 : 1 }}
        >
          Add Card
        </motion.button>
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
            onPress={() => window.open('/pocketchange/legal/privacy/', '_blank')}
            right={<ExternalLink size={14} className="text-gray-300 shrink-0" />}
          />
          <div className="h-px bg-gray-100 mx-4" />
          <SettingRow
            icon={<FileText size={18} />}
            label="Terms of Service"
            sub="Review your user agreement"
            color="#6b7280"
            onPress={() => window.open('/pocketchange/legal/terms/', '_blank')}
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
  const { linkedCards, setLinkedCards, selectedNonprofit, roundUpMultiplier, setRoundUpMultiplier, setTab, totalDonated } = useApp();
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
        <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Settings</h1>
        <p className="text-white/70 text-sm mt-0.5">{brand.appName}</p>
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
            Charged once a month (minimum $5). If a payment fails, we'll retry once after 3 days. If it fails again, your account is paused and you'll be notified to update your payment method. Round-ups keep accumulating during a pause.
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
            onPress={() => setTab('nonprofits')}
            right={<span className="text-xs font-semibold shrink-0" style={{ color: brand.primary }}>Change</span>}
          />
          <div className="px-4 pb-3.5">
            <p className="text-gray-400 text-xs leading-relaxed">
              Cause changes take effect tomorrow. Today's round-ups stay with your current cause.
            </p>
          </div>
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
          ) : <Logo size={32} />}
          <p className="font-bold text-sm" style={{ color: brand.primary }}>{brand.appName}</p>
          <p className="text-gray-300 text-xs">PocketChange · v1.0.0</p>
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
