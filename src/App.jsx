import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { NpProvider } from './store/NpContext';
import { ThemeProvider, useTheme } from './store/ThemeContext';
import Onboarding from './pages/Onboarding';
import AppShell from './components/AppShell';
import NpShell from './pages/nonprofit/NpShell';
import CoinMark from './components/CoinMark';
import ScaleFit from './components/ScaleFit';
import DevicePicker, { DEVICES, loadDevice, saveDevice } from './components/DevicePicker';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import OrgLandingPage from './pages/OrgLandingPage';
import { findOrgByCode } from './store/orgStore';

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

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

function PhoneFrame({ children, compact = false }) {
  const brand = useTheme();
  const [deviceId, setDeviceId] = useState(loadDevice);
  const { w: windowW, h: windowH } = useWindowSize();

  const device = DEVICES.find(d => d.id === deviceId) ?? DEVICES[2];
  // Reserve vertical space for wordmark, chip bar (desktop only), caption, gaps,
  // and page padding. Compact mode (real phones) drops the device picker.
  const chromeV = compact ? 150 : 240;
  const BEZEL = 28; // 14px decorative ring on each side (box-shadow)
  const pagePad = compact ? 16 : 32;
  // Fit by height AND width so the frame never overflows a narrow screen.
  const outerScale = Math.min(
    1,
    (windowH - chromeV) / (device.height + BEZEL),
    (windowW - 2 * pagePad - BEZEL) / device.width,
  );

  function handleDeviceChange(id) {
    setDeviceId(id);
    saveDevice(id);
  }

  return (
    <div
      className={`flex items-center justify-center relative overflow-hidden ${compact ? 'p-4' : 'p-8'}`}
      style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 50%, #0B2A4A 100%)', minHeight: '100dvh' }}
    >
      {/* Ambient glow — follows brand color */}
      <motion.div
        animate={{ background: `radial-gradient(circle, ${brand.primary}55 0%, transparent 70%)` }}
        transition={{ duration: 0.8 }}
        className="absolute w-96 h-96 rounded-full opacity-40 blur-3xl pointer-events-none"
      />
      <div
        className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${brand.secondary}88 0%, transparent 70%)` }}
      />

      <div className="flex flex-col items-center gap-6 relative z-10">
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
              <img
                src={brand.brandLogoUrl}
                alt={brand.appName}
                className="w-full h-full object-contain p-1.5"
                style={{ display: 'block' }}
              />
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
            <h1 className="text-white font-bold text-2xl" style={{ letterSpacing: '-0.5px' }}>
              {brand.appName}
            </h1>
            <p className="text-slate-400 text-xs font-medium">{brand.tagline}</p>
          </div>
        </motion.div>

        {/* Device chip picker — between wordmark and frame (desktop only) */}
        {!compact && <DevicePicker selected={deviceId} onChange={handleDeviceChange} />}

        {/* Sizer: layout box tracks the SCALED visual size so the flex column never
            reserves phantom space (transform: scale doesn't shrink layout). */}
        <motion.div
          animate={{ width: device.width * outerScale, height: device.height * outerScale }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          style={{ position: 'relative', flexShrink: 0 }}
        >
          {/* Phone frame — animates dimensions when device changes */}
          <motion.div
            animate={{ width: device.width, height: device.height, scale: outerScale }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{
              transformOrigin: 'top left',
              background: '#fff',
              borderRadius: 50,
              overflow: 'hidden',
              position: 'absolute',
              top: 0,
              left: 0,
              boxShadow: '0 0 0 12px #1a1a2e, 0 0 0 14px #2a2a4e, 0 50px 100px rgba(0,0,0,0.8)',
            }}
          >
            {/* Notch */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-3xl z-50"
            />
            {/* Status bar */}
            <div
              className="absolute top-2 left-6 z-50 text-xs font-semibold text-white mix-blend-difference pointer-events-none"
            >
              9:41
            </div>
            {/* App content scaled to device viewport */}
            <div className="w-full h-full relative">
              <ScaleFit viewport={device}>
                {children}
              </ScaleFit>
            </div>
          </motion.div>
        </motion.div>

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

// WebPortal — the browser-native giving portal reached from an org micro-site.
// No phone chrome: a clean page with the flow in a centered, elevated column
// (the Acorns-web pattern). Same screens, same account, different presentation.
function WebPortal({ children }) {
  const { w, h } = useWindowSize();
  const colW = Math.min(440, w - 24);
  const colH = Math.min(920, h - 56);
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #f6f8fb 0%, #e9eef5 100%)', padding: 12 }}
    >
      <div
        style={{
          width: colW,
          height: colH,
          background: '#fff',
          borderRadius: 24,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 24px 64px rgba(11,42,74,0.16), 0 2px 8px rgba(11,42,74,0.08)',
        }}
      >
        <ScaleFit viewport={{ width: colW, height: colH }}>
          {children}
        </ScaleFit>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <CoinMark size={14} />
        Powered by PocketCache ·{' '}
        <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: '#64748b' }}>Terms</a>{' '}
        <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: '#64748b' }}>Privacy</a>
      </p>
    </div>
  );
}

function ThemedApp() {
  const isMobile = useIsMobile();
  // Donors arriving through an org's join link (?org=CODE) — or admins signing
  // in from their micro-site (?npsignin=1) — get the real app experience:
  // full-bleed on phones, the WebPortal column in a desktop browser. ?app=1
  // forces it too. Everyone else gets the phone-mockup demo shell. Captured
  // ONCE — the pretty-URL rewrite below strips the params, and re-renders
  // must not flip the shell.
  const [appEntry] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('org') || params.get('npsignin') === '1' || params.get('app') === '1');
  });

  // Org-scoped pretty URL: a join-link entry settles at pocketcache.app/CODE/give
  // (the 404 forwarder routes that path back to ?org=CODE, so refresh/bookmark
  // work). Delayed so the gate's auto-bind consumes ?org= first.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('org');
    if (!code) return;
    const org = findOrgByCode(code);
    if (!org) return;
    const slug = encodeURIComponent((org.shortName || org.id).toUpperCase());
    const t = setTimeout(() => window.history.replaceState(null, '', `/${slug}/give`), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeProvider>
      {appEntry ? (
        isMobile ? (
          <ScaleFit>
            <AppContent />
          </ScaleFit>
        ) : (
          <WebPortal>
            <AppContent />
          </WebPortal>
        )
      ) : (
        <PhoneFrame compact={isMobile}>
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
