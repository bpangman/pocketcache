import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { NpProvider } from './store/NpContext';
import { ThemeProvider, useTheme } from './store/ThemeContext';
import Onboarding from './pages/Onboarding';
import AppShell from './components/AppShell';
import NpShell from './pages/nonprofit/NpShell';
import CoinMark from './components/CoinMark';
import ScaleFit from './components/ScaleFit';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import OrgLandingPage from './pages/OrgLandingPage';

// Breakpoint below which the decorative PhoneFrame is replaced by ScaleFit
// (full-bleed, proportionally scaled to viewport width).
const MOBILE_BP = 600;

const PAYMENT_TYPE_ICON = { ach: '🏦', apple_pay: '🍎', card: '💳' };

function CancelledOverlay({ onReactivate, onBack }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(11, 42, 74, 0.55)', backdropFilter: 'blur(8px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center"
      >
        <div className="text-4xl mb-3">🔒</div>
        <p className="font-bold text-gray-900 text-lg mb-2">Your account is closed</p>
        <p className="text-gray-500 text-sm mb-5 leading-relaxed">
          Your donation history and settings are still here — just reactivate to pick up where you left off.
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onReactivate}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-base mb-3"
          style={{ background: 'linear-gradient(135deg, #0B2A4A, #003865)' }}
        >
          Reactivate my account
        </motion.button>
        <button
          onClick={onBack}
          className="w-full py-3 rounded-2xl text-gray-500 font-semibold text-sm bg-gray-50"
        >
          Back to start
        </button>
      </motion.div>
    </motion.div>
  );
}

function ReactivateCheckinCard({ trackedCard, paymentMethod, onRestart, onBack, onChangePayment }) {
  const [relinking, setRelinking] = useState(false);
  const [relinked, setRelinked] = useState(false);

  function handleRelink() {
    setRelinking(true);
    // production: Plaid item was removed at cancellation — mandatory re-link via Plaid Link
    setTimeout(() => { setRelinking(false); setRelinked(true); }, 1200);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(11, 42, 74, 0.55)', backdropFilter: 'blur(8px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
      >
        <div className="text-2xl mb-2">👋</div>
        <p className="font-bold text-gray-900 text-lg mb-1">Welcome back!</p>
        <p className="text-gray-500 text-sm mb-4 leading-relaxed">
          Quick check before we restart:
        </p>

        {/* Card we track */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Card we track</p>
          <div className="flex items-center gap-3">
            <span className="text-xl">🏦</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{trackedCard?.name ?? 'Chase Sapphire'}</p>
              <p className="text-gray-400 text-xs">•••• {trackedCard?.last4 ?? '4242'}</p>
              <p className="text-xs text-amber-600 mt-0.5 leading-tight">We disconnected this when you left — give it a quick re-link</p>
            </div>
            {relinked ? (
              <span className="text-xs font-semibold text-teal-600 shrink-0">Connected ✓</span>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleRelink}
                disabled={relinking}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: relinking ? '#9ca3af' : 'linear-gradient(135deg, #0d9488, #003865)', cursor: relinking ? 'default' : 'pointer' }}
              >
                {relinking ? 'Linking…' : 'Re-link'}
              </motion.button>
            )}
          </div>
        </div>

        {/* How you pay */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">How you pay</p>
          <div className="flex items-center gap-3">
            <span className="text-xl">{PAYMENT_TYPE_ICON[paymentMethod?.type] ?? '💳'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{paymentMethod?.label ?? 'Credit or Debit Card'}</p>
              {paymentMethod?.last4 && <p className="text-gray-400 text-xs">•••• {paymentMethod.last4}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-teal-600">Keep</span>
              <span className="text-gray-300 text-xs">·</span>
              <button onClick={onChangePayment} className="text-xs font-semibold" style={{ color: '#003865' }}>Change</button>
            </div>
          </div>
        </div>

        {/* production: Plaid item was removed at cancellation; re-link is mandatory before round-ups resume */}
        <motion.button
          whileTap={relinked ? { scale: 0.97 } : {}}
          onClick={relinked ? onRestart : undefined}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-base mb-3"
          style={{
            background: relinked ? 'linear-gradient(135deg, #0B2A4A, #003865)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
            cursor: relinked ? 'pointer' : 'default',
          }}
        >
          Restart my round-ups
        </motion.button>
        <button onClick={onBack} className="w-full py-3 rounded-2xl text-gray-500 font-semibold text-sm bg-gray-50">
          Back to start
        </button>
      </motion.div>
    </motion.div>
  );
}

function Toast({ message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold shadow-lg whitespace-nowrap"
    >
      {message}
    </motion.div>
  );
}

function AppContent() {
  const { page, accountStatus, reactivateAccount, setPage, toast, trackedCard, paymentMethod, setTab, setPendingSettingsAction } = useApp();
  const [showReactivateCheckin, setShowReactivateCheckin] = useState(false);

  function handleReactivateTap() {
    setShowReactivateCheckin(true);
  }

  function handleRestartRoundups() {
    reactivateAccount('Welcome back — tracking restarted today. Your first new charge comes on the 1st.');
    setShowReactivateCheckin(false);
  }

  function handleChangePaymentFromCheckin() {
    // Reactivate first, then deep-link to Settings → payment method sheet
    reactivateAccount('Welcome back! Update your payment method in Settings.');
    setShowReactivateCheckin(false);
    setTab('settings');
    setPendingSettingsAction('change-payment');
  }

  if (page === 'onboarding') return <Onboarding />;
  if (page === 'np-dashboard') return <NpShell />;
  return (
    <div className="w-full h-full relative">
      <AppShell />
      <AnimatePresence>
        {accountStatus === 'cancelled' && (
          <CancelledOverlay
            key="cancelled"
            onReactivate={handleReactivateTap}
            onBack={() => setPage('onboarding')}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showReactivateCheckin && (
          <ReactivateCheckinCard
            key="reactivate-checkin"
            trackedCard={trackedCard}
            paymentMethod={paymentMethod}
            onRestart={handleRestartRoundups}
            onBack={() => { setShowReactivateCheckin(false); setPage('onboarding'); }}
            onChangePayment={handleChangePaymentFromCheckin}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && <Toast key="toast" message={toast} />}
      </AnimatePresence>
    </div>
  );
}

function PhoneFrame({ children }) {
  const brand = useTheme();

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 50%, #0B2A4A 100%)' }}
    >
      {/* Ambient glow — follows brand color */}
      <motion.div
        animate={{ background: `radial-gradient(circle, ${brand.primary}55 0%, transparent 70%)` }}
        transition={{ duration: 0.8 }}
        className="absolute w-96 h-96 rounded-full opacity-40 blur-3xl pointer-events-none"
      />
      <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${brand.secondary}88 0%, transparent 70%)` }} />

      <div className="flex flex-col items-center gap-8 relative z-10">
        {/* Brand wordmark outside phone — animates when cause changes */}
        <motion.div
          key={brand.appName}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3"
        >
          {brand.brandLogoUrl ? (
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden"
              style={{ background: '#fff' }}
            >
              <img src={brand.brandLogoUrl} alt={brand.appName} className="w-full h-full object-contain p-1.5" style={{ display: 'block' }} />
            </div>
          ) : brand.logoEmoji ? (
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-lg"
              style={{ background: brand.gradient }}
            >
              {brand.logoEmoji}
            </div>
          ) : (
            <CoinMark size={40} />
          )}
          <div>
            <h1 className="text-white font-bold text-2xl" style={{ letterSpacing: '-0.5px' }}>{brand.appName}</h1>
            <p className="text-slate-400 text-xs font-medium">{brand.tagline}</p>
          </div>
        </motion.div>

        {/* Phone device */}
        <div className="phone-frame">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-3xl z-50" />
          <div className="absolute top-2 left-6 z-50 text-xs font-semibold text-white mix-blend-difference pointer-events-none">
            9:41
          </div>
          <div className="w-full h-full relative">
            {children}
          </div>
        </div>

        <p className="text-slate-500 text-xs text-center max-w-xs">
          Interactive prototype · BGCA tenant demo
        </p>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < MOBILE_BP);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < MOBILE_BP);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

function ThemedApp() {
  const isMobile = useIsMobile();
  return (
    <ThemeProvider>
      {isMobile ? (
        <ScaleFit>
          <AppContent />
        </ScaleFit>
      ) : (
        <PhoneFrame>
          <AppContent />
        </PhoneFrame>
      )}
    </ThemeProvider>
  );
}

export default function App() {
  const orgPageCode = new URLSearchParams(window.location.search).get('orgpage');
  if (orgPageCode) {
    return <OrgLandingPage code={orgPageCode} />;
  }
  return (
    <AppProvider>
      <NpProvider>
        <ThemedApp />
      </NpProvider>
    </AppProvider>
  );
}
