import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Bell, Shield, ChevronRight, Plus, Zap, X } from 'lucide-react';
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
  return (
    <button onClick={onPress} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 text-sm font-semibold">{label}</p>
        {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
      </div>
      {right}
    </button>
  );
}

const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1×', desc: 'Standard round-up' },
  { value: 2, label: '2×', desc: 'Double your impact' },
  { value: 3, label: '3×', desc: 'Triple your impact' },
];

export default function Settings() {
  const { linkedCards, selectedNonprofit, roundUpMultiplier, setRoundUpMultiplier, setTab } = useApp();
  const brand = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [autoDeposit, setAutoDeposit] = useState(true);
  const [showMultiplier, setShowMultiplier] = useState(false);

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
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md"
            style={{ background: brand.gradient }}
          >
            A
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-lg">Alex Johnson</p>
            <p className="text-gray-400 text-sm">alex@example.com</p>
            <p className="text-xs font-semibold mt-1" style={{ color: brand.primary }}>Member since Jan 2026</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Donated</p>
            <p className="text-gray-900 font-bold text-lg">$60.58</p>
          </div>
        </motion.div>

        {/* Round-up settings */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow"
        >
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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow"
        >
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
              right={<span className="text-xs text-emerald-500 font-semibold bg-emerald-50 px-2 py-1 rounded-full">Active</span>}
            />
          ))}
          <div className="h-px bg-gray-50 mx-4" />
          <SettingRow
            icon={<Plus size={18} />}
            label="Add a card"
            sub="Link another bank or credit card"
            color="#9ca3af"
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Current cause */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow"
        >
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
        </motion.div>

        {/* Preferences */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow"
        >
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
            sub="Manage your data and permissions"
            color="#10b981"
            right={<ChevronRight size={16} className="text-gray-300 shrink-0" />}
          />
        </motion.div>

        {/* Brand footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-2 py-4"
        >
          {brand.logoEmoji ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ background: brand.gradient }}>
              {brand.logoEmoji}
            </div>
          ) : (
            <Logo size={32} />
          )}
          <p className="font-bold text-sm" style={{ color: brand.primary }}>{brand.appName}</p>
          <p className="text-gray-300 text-xs">Powered by SpareChange · v1.0.0</p>
        </motion.div>

      </div>

      {/* Multiplier sheet */}
      <AnimatePresence>
        {showMultiplier && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black z-10"
              onClick={() => setShowMultiplier(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-20 p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-gray-900 text-lg">Round-Up Multiplier</h3>
                <button onClick={() => setShowMultiplier(false)}>
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-5">Multiply your round-ups to give more with every purchase.</p>
              <div className="space-y-3 mb-6">
                {MULTIPLIER_OPTIONS.map((opt) => (
                  <motion.button
                    key={opt.value}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setRoundUpMultiplier(opt.value); setShowMultiplier(false); }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all"
                    style={roundUpMultiplier === opt.value
                      ? { borderColor: brand.primary, background: brand.accentLight }
                      : { borderColor: '#f3f4f6', background: '#f9fafb' }
                    }
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
                      style={roundUpMultiplier === opt.value
                        ? { background: brand.primary, color: '#fff' }
                        : { background: '#fff', color: '#4b5563' }
                      }
                    >
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
