import { AppProvider, useApp } from './store/AppContext';
import { NpProvider } from './store/NpContext';
import { ThemeProvider, useTheme } from './store/ThemeContext';
import Onboarding from './pages/Onboarding';
import AppShell from './components/AppShell';
import NpShell from './pages/nonprofit/NpShell';
import CoinMark from './components/CoinMark';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';

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
  const { page, accountStatus, reactivateAccount, setPage, toast } = useApp();
  if (page === 'onboarding') return <Onboarding />;
  if (page === 'np-dashboard') return <NpShell />;
  return (
    <div className="w-full h-full relative">
      <AppShell />
      <AnimatePresence>
        {accountStatus === 'cancelled' && (
          <CancelledOverlay
            key="cancelled"
            onReactivate={reactivateAccount}
            onBack={() => setPage('onboarding')}
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

function ThemedApp() {
  return (
    <ThemeProvider>
      <PhoneFrame>
        <AppContent />
      </PhoneFrame>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NpProvider>
        <ThemedApp />
      </NpProvider>
    </AppProvider>
  );
}
