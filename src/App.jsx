import { Component, lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { NpProvider } from './store/NpContext';
import { ThemeProvider, useTheme } from './store/ThemeContext';
import CoinMark from './components/CoinMark';
import ScaleFit from './components/ScaleFit';
import DevicePicker, { DEVICES, loadDevice, saveDevice } from './components/DevicePicker';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import OrgLogo from './components/OrgLogo';
import AppleLogo from './components/AppleLogo';
import { findOrgByCode, resolveOrgByCode } from './store/orgStore';
import { useBiometricGate, useBiometricOffer, AppLockScreen, WebLockScreen, BiometricOfferCard } from './components/BiometricLock';
import ChargeReviewAlert from './components/ChargeReviewAlert';
import { WebPortalPrompt } from './components/WebPortalLinkModal';
import { AppDownloadPrompt } from './components/AppDownloadQRModal';
import { Z, scrim, centered, subscribeSheetOpen, isAnySheetOpen } from './lib/overlay';
import { safeBottom } from './lib/safeArea';

// ─── Route-level code splitting ───────────────────────────────────────────────
//
// Four audiences arrive at this one bundle: the native app (which remote-loads
// the site), mobile web, the desktop donor portal, and the desktop nonprofit
// admin. Shipping all four in one file made every donor download the admin
// dashboard and every admin download the donor app. Each top-level surface is
// therefore a lazy chunk, fetched only on the path that renders it.
//
// THE GATE IS LAZY TOO - CAREFULLY
// Onboarding is the first paint on the native app and on mobile web, so making
// it lazy is the one split that could cost a launch. It is worth it (it is the
// biggest file in the app, and on the phone it is the only importer of the
// Stripe SDK) and it is safe because the shell that paints while it arrives is
// the SAME navy as the splash it hands over to: ScaleFit's gradient, then
// ChunkLoading's, then SplashAnimation's overlay. The pre-JS paint is navy too
// (body background, and the native shell's backgroundColor), so a cold launch
// goes navy -> navy -> navy with no white frame anywhere. The entry chunk is
// now a third of its old size, so that first navy paint also arrives sooner
// than the gate used to.
//
// WHAT STAYS EAGER
// Everything the fallbacks and the shells need: ScaleFit, PhoneFrame, the three
// stores, CoinMark, the biometric gate, the toast/overlay chrome. None of it is
// big, and all of it is on every path.
//
// FAILED FETCHES
// These chunks travel over the network at runtime (the native app loads this
// site remotely), so an import() can genuinely fail on a flaky connection.
// lazyChunk() retries twice with backoff, and ChunkBoundary catches whatever
// still fails so a dropped chunk degrades to a branded "try again" card instead
// of a white screen.

/** import() with two retries - a transient network blip must not white-screen. */
function lazyChunk(load) {
  return lazy(() => load().catch(() => (
    new Promise(r => setTimeout(r, 400)).then(load).catch(() => (
      new Promise(r => setTimeout(r, 1500)).then(load)
    ))
  )));
}

const Onboarding = lazyChunk(() => import('./pages/Onboarding'));
const AppShell = lazyChunk(() => import('./components/AppShell'));
const NpShell = lazyChunk(() => import('./pages/nonprofit/NpShell'));
const NpWebShell = lazyChunk(() => import('./pages/nonprofit/NpWebShell'));
const NpWebSignup = lazyChunk(() => import('./pages/nonprofit/NpWebSignup'));
const WebDashboard = lazyChunk(() => import('./pages/WebDashboard'));
const WebOnboarding = lazyChunk(() => import('./pages/WebOnboarding'));
const WebReactivate = lazyChunk(() => import('./pages/WebReactivate'));
const OrgLandingPage = lazyChunk(() => import('./pages/OrgLandingPage'));
const PlatformAdmin = lazyChunk(() => import('./pages/PlatformAdmin'));
const WebAdminSignIn = lazyChunk(() => import('./pages/WebPortalPages').then(m => ({ default: m.WebAdminSignIn })));

// Warm a chunk the user is about to need, so the hop into it never waits on the
// network. Fire-and-forget: a failed warm-up is retried for real by lazyChunk.
function warm(load) {
  load().catch(() => { /* the real render retries */ });
}

// Exactly SplashAnimation's navy overlay, so the handoff from "chunk arriving"
// to "splash playing" is invisible - no white flash on a cold native launch.
const SPLASH_BG = 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)';

// One entry per surface: the background the arriving screen paints, so the
// fallback is the same colour the user is about to see. `page` surfaces are
// full webpages (100dvh); the rest fill the phone-sized box they live in.
const SURFACES = {
  // Onboarding / the join gate - splash plays on top of this the moment it lands
  splash: { bg: SPLASH_BG, dark: true },
  // AppShell - donor tabs (bg-gray-50)
  app: { bg: '#f9fafb' },
  // NpShell - phone admin shell
  npApp: { bg: '#f8fafc' },
  // WebDashboard / WebOnboarding / NpWebShell / NpWebSignup / WebAdminSignIn
  web: { bg: '#f6f8fb', page: true },
};

function surfaceStyle(surface) {
  const { bg, page } = SURFACES[surface];
  return page
    ? { minHeight: '100dvh', background: bg }
    : { width: '100%', height: '100%', background: bg };
}

// Suspense fallback: the destination's own background, plus a coin that only
// appears if the wait is long enough to notice. A chunk that arrives in one
// frame therefore shows a stable colour and nothing else (no logo flicker); a
// slow network gets a branded loader instead of a blank page.
function ChunkLoading({ surface }) {
  return (
    <div style={{ ...surfaceStyle(surface), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.25 }}
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <CoinMark size={34} />
        </motion.div>
      </motion.div>
    </div>
  );
}

// Shown when a chunk still will not load after lazyChunk's retries - offline
// mid-session, or a stale index pointing at a deployed-away filename. Reload is
// the only real cure (React.lazy caches the rejection), so that is the button.
function ChunkFailed({ surface }) {
  const dark = SURFACES[surface].dark;
  return (
    <div style={{ ...surfaceStyle(surface), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }}>
      <div
        style={{
          width: '100%', maxWidth: 340, background: '#fff', borderRadius: 20, padding: 24,
          textAlign: 'center', boxShadow: dark ? '0 20px 50px rgba(0,0,0,0.35)' : '0 16px 48px rgba(11,42,74,0.10)',
          border: dark ? 'none' : '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><CoinMark size={34} /></div>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#0f172a' }}>We could not load this screen</p>
        <p style={{ margin: '8px 0 18px', fontSize: 13.5, lineHeight: 1.6, color: '#64748b' }}>
          Looks like the connection dropped. Nothing was lost  -  give it another go.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            width: '100%', padding: '13px 16px', borderRadius: 16, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #0B2A4A, #003865)', color: '#fff', fontWeight: 700, fontSize: 15,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

class ChunkBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Not console.error: a dropped chunk is a network condition we handle, not
    // a bug to page on. Still recorded so it is visible when debugging.
    console.warn('[PocketCache] screen failed to load', error);
  }

  render() {
    if (this.state.failed) return <ChunkFailed surface={this.props.surface} />;
    return this.props.children;
  }
}

/** Lazy surface with a matched loading state and a no-white-screen guarantee. */
function LazySurface({ surface, children }) {
  return (
    <ChunkBoundary surface={surface}>
      <Suspense fallback={<ChunkLoading surface={surface} />}>
        {children}
      </Suspense>
    </ChunkBoundary>
  );
}

// Breakpoint below which the decorative PhoneFrame is replaced by ScaleFit
// (full-bleed, proportionally scaled to viewport width).
const MOBILE_BP = 600;

const PAYMENT_TYPE_ICON = { ach: '🏦', apple_pay: <AppleLogo size={16} />, card: '💳' };

function CancelledOverlay({ onReactivate, onBack }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Blocking gate: the closed-account screen must obscure the app behind it.
      style={{ ...scrim('blocking'), ...centered(24), zIndex: Z.blockingScrim }}
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
          Your donation history and settings are still here  -  just reactivate to pick up where you left off.
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
    // production: Plaid item was removed at cancellation  -  mandatory re-link via Plaid Link
    setTimeout(() => { setRelinking(false); setRelinked(true); }, 1200);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Blocking gate, same family as CancelledOverlay.
      style={{ ...scrim('blocking'), ...centered(24), zIndex: Z.blockingScrim }}
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
              <p className="text-xs text-amber-600 mt-0.5 leading-tight">We disconnected this when you left  -  give it a quick re-link</p>
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

// `nearSheet` repositions the toast to the top of the frame instead of its
// usual spot near the bottom, while any Sheet.jsx sheet is open - a
// bottom-pinned toast otherwise lands visually on top of rows inside that
// sheet's own scrollable body. See the "OPEN-SHEET TRACKING" note in
// lib/overlay.js. z-index is unchanged either way (globalToast already clears
// the sheet's own z-index).
function Toast({ message, nearSheet }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: nearSheet ? -16 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: nearSheet ? -16 : 20 }}
      className="absolute left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold shadow-lg whitespace-nowrap"
      // globalToast === modal (50) on purpose: DOM order keeps deciding. See lib/overlay.
      style={nearSheet
        ? { top: 'calc(var(--pc-safe-top) + 12px)', zIndex: Z.globalToast }
        : { bottom: safeBottom(80), zIndex: Z.globalToast }}
    >
      {message}
    </motion.div>
  );
}

function AppContent() {
  const { page, accountStatus, reactivateAccount, setPage, toast, trackedCard, paymentMethod, setTab, setPendingSettingsAction } = useApp();
  const [showReactivateCheckin, setShowReactivateCheckin] = useState(false);
  const bioGate = useBiometricGate();
  const bioOffer = useBiometricOffer();
  // Whether a Sheet.jsx sheet (Dashboard's / Settings' bottom sheets, the
  // account sheet, etc.) is currently open anywhere on this surface.
  const sheetOpen = useSyncExternalStore(subscribeSheetOpen, isAnySheetOpen);

  function handleReactivateTap() {
    setShowReactivateCheckin(true);
  }

  function handleRestartRoundups() {
    reactivateAccount('Welcome back  -  tracking restarted today. Your first new charge comes on the 11th.');
    setShowReactivateCheckin(false);
  }

  function handleChangePaymentFromCheckin() {
    // Reactivate first, then deep-link to Settings → payment method sheet
    reactivateAccount('Welcome back! Update your payment method in Settings.');
    setShowReactivateCheckin(false);
    setTab('settings');
    setPendingSettingsAction('change-payment');
  }

  if (page === 'onboarding') return <LazySurface surface="splash"><Onboarding /></LazySurface>;
  // Face ID / Touch ID gate  -  everything past sign-in is behind it once enrolled
  if (bioGate.locked) return <AppLockScreen gate={bioGate} />;
  if (page === 'np-dashboard') return (
    <div className="w-full h-full relative">
      <LazySurface surface="npApp"><NpShell /></LazySurface>
      <WebPortalPrompt />
      {/* Queued by the nonprofit signup wizard's license-accept step (see
          npSignup usage in Onboarding.jsx) - fires here, once the dashboard
          itself has mounted, instead of over the wizard's own Benevity /
          Team ID buttons. */}
      <AppDownloadPrompt />
    </div>
  );
  return (
    <div className="w-full h-full relative">
      <LazySurface surface="app"><AppShell /></LazySurface>
      <WebPortalPrompt />
      <AppDownloadPrompt />
      <BiometricOfferCard offer={bioOffer} surface="app" />
      <ChargeReviewAlert surface="app" />
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
        {toast && <Toast key="toast" message={toast} nearSheet={sheetOpen} />}
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
      {/* Ambient glow  -  follows brand color */}
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
        {/* Brand wordmark outside phone  -  animates when cause changes */}
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

        {/* Device chip picker  -  between wordmark and frame (desktop only) */}
        {!compact && <DevicePicker selected={deviceId} onChange={handleDeviceChange} />}

        {/* Sizer: layout box tracks the SCALED visual size so the flex column never
            reserves phantom space (transform: scale doesn't shrink layout). */}
        <motion.div
          animate={{ width: device.width * outerScale, height: device.height * outerScale }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          style={{ position: 'relative', flexShrink: 0 }}
        >
          {/* Phone frame  -  animates dimensions when device changes */}
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

// A real phone's user agent, even when the layout viewport lies. innerWidth
// alone was the whole check here for a long time, and it failed exactly once
// where it mattered most: a donor tapping "Continue with Google" gets bounced
// to iOS Safari for the OAuth hop (Capacitor's Browser plugin always does
// this - the app webview cannot host Google's own sign-in page), and iOS
// Safari remembers a per-site "Request Desktop Website" preference. If that
// preference is on for this domain - toggled once, on purpose or by
// accident, at any point in the past - Safari reports a desktop-width layout
// viewport (commonly 980px) on an otherwise perfectly normal iPhone. On that
// return trip innerWidth said "desktop" while the device was a phone the
// whole time, and the donor landed in the marketing PhoneFrame's desktop
// DevicePicker instead of their own app. A phone UA is not spoofed by that
// Safari setting, so it is the fallback that still tells the truth.
const MOBILE_UA_RE = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|IEMobile/i;

function isMobileUserAgent() {
  return MOBILE_UA_RE.test(window.navigator?.userAgent || '');
}

function computeIsMobile() {
  return window.innerWidth < MOBILE_BP || isMobileUserAgent();
}

function useIsMobile() {
  const [mobile, setMobile] = useState(computeIsMobile);
  useEffect(() => {
    const check = () => setMobile(computeIsMobile());
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

// A fresh Supabase auth return, recognized synchronously (before the SPA's
// own async supabase.auth.getSession() has had a chance to run), two ways:
//
//   1. The URL still carries the OAuth callback markers - donorAuth.js's own
//      ?authResume= marker, Supabase's PKCE ?code=, or an implicit-flow
//      #access_token= hash. This is the moment right after the redirect back
//      from Google/Apple, before supabase-js has written anything to storage.
//   2. A supabase-js session token is already sitting in localStorage - a
//      plain reload (bookmark, reopened tab, PWA icon) on a device that
//      signed in before, same rule `hasAccount`/`adminRole` already get below.
//
// Either one means "this is a signed-in donor or admin," which is the real
// app, never the marketing PhoneFrame demo shell - regardless of whether
// pc_identity has been written yet (it has not, on the very first render of a
// fresh OAuth return; useDonorAuth inside the real screen is what writes it).
function hasOAuthReturnMarkers() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('authResume')) return true;
  if (params.get('code')) return true; // Supabase PKCE callback
  if (window.location.hash.includes('access_token=')) return true; // implicit flow
  return false;
}

function hasStoredSupabaseSession() {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.access_token) return true;
    }
  } catch {
    // Malformed/blocked storage - fall through to "no session found", the
    // same as before this check existed.
  }
  return false;
}

// The phone-shaped desktop column (WebPortal) lived here and is gone.
// Every desktop journey is a real webpage now: donor join and signup
// (WebOnboarding), donor dashboard (WebDashboard), admin sign-in, admin signup
// (NpWebSignup), admin dashboard (NpWebShell) and closed accounts
// (WebReactivate). If a new route needs a shell, build the page - do not
// reintroduce a 440px app-in-a-box on a desktop screen.

function ThemedApp() {
  const isMobile = useIsMobile();
  const { goToOnboardingStep, page, setPage, hasAccount, adminRole, lastMode, accountStatus } = useApp();
  // Donors arriving through an org's join link (?org=CODE)  -  or admins signing
  // in from their micro-site (?npsignin=1) or listing their org (?npsignup=1)  -
  // get the real app experience: full-bleed on phones, a real webpage in a
  // desktop browser. ?app=1 forces it too. Everyone else gets the phone-mockup
  // demo shell EXCEPT a device that already has a session: `hasAccount` (an
  // identity with pc_donor_role) or `adminRole` (pc_admin_role) means someone
  // signed in here before, and a returning donor or admin lands on bare /demo/
  // constantly (bookmarked, re-opened tab, PWA icon) - showing them the
  // decorative phone-mockup instead of their own dashboard was the single root
  // cause behind this whole bug cluster. Captured ONCE  -  the pretty-URL
  // rewrite below strips the params, and re-renders must not flip the shell.
  // AppProvider's useState initializers have already read localStorage
  // synchronously by the time this runs, so `hasAccount`/`adminRole` here are
  // NOT stale.
  //
  // hasOAuthReturnMarkers() / hasStoredSupabaseSession() close the one gap
  // `hasAccount`/`adminRole` cannot: a donor who just finished a Google/Apple
  // sign-in (or already has a live Supabase session from one) but has not
  // reached the screen that writes pc_identity yet. Without this, that donor
  // hit this exact bug - landed back on bare /demo/ with a real session and
  // no pc_ keys, and got the marketing PhoneFrame instead of the app.
  const [appEntry] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return Boolean(
      params.get('org') ||
      params.get('npsignin') === '1' ||
      params.get('npsignup') === '1' ||
      params.get('app') === '1' ||
      window.Capacitor?.isNativePlatform?.() ||
      hasAccount ||
      adminRole ||
      hasOAuthReturnMarkers() ||
      hasStoredSupabaseSession()
    );
  });

  // ?npsignup=1  -  a direct link into the nonprofit signup wizard, for the
  // marketing site's "list your nonprofit" CTA. Drives Onboarding to its
  // nonprofit-signup step; WebExperience pairs it with the desktop container.
  // Guarded on `page` at mount: the URL param is never stripped (unlike ?org=,
  // which gets a pretty-URL rewrite below), so a RELOAD after the wizard
  // already finished still carries ?npsignup=1. Without this guard that reload
  // called goToOnboardingStep again, which forces `page` back to 'onboarding'
  // and drops the admin who just finished signing their nonprofit up back at
  // wizard step one instead of their new dashboard.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('npsignup') !== '1') return;
    if (page === 'np-dashboard') return;
    goToOnboardingStep('nonprofit-signup');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bare-entry resume: a device with a persisted session (no ?org= / ?npsignin=
  // / ?npsignup= / ?app=1 in the URL - those each drive their own routing) has
  // to land on the surface its role/lastMode actually points to, not just
  // whatever `pc_page` happens to hold. Same rule Onboarding's resumeSession()
  // uses for the explicit "Welcome back" tap: admin-only -> dashboard,
  // donor-only -> home, both -> last-used mode. `pc_page` is device-shared
  // (localStorage, no per-tab isolation), so it can go stale for THIS tab
  // without this tab doing anything wrong - e.g. a donor join link opened in a
  // second tab writes pc_page='onboarding' for the whole device (see the
  // ?org= reset block in store/AppContext.jsx), which used to survive into an
  // admin tab's next reload and knock it back to signup. Only corrects a
  // mismatch at this one mount-time read; it does not fight in-app navigation,
  // and a cancelled donor's deliberate page='onboarding' (cancelAccount) is
  // left alone so WebReactivate / the mobile cancel flow still take over.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasEntryParam = params.get('org') || params.get('npsignin') === '1' || params.get('npsignup') === '1' || params.get('app') === '1';
    if (hasEntryParam) return;
    if (!hasAccount && !adminRole) return;
    if (accountStatus === 'cancelled') return;
    const donorOnly = hasAccount && !adminRole;
    const adminOnly = adminRole && !hasAccount;
    const target = adminOnly ? 'np-dashboard' : donorOnly ? 'home' : (lastMode === 'admin' ? 'np-dashboard' : 'home');
    if (page !== target) setPage(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm the chunk this visitor is most likely to open NEXT, once the current
  // screen is on-screen and idle. Purely additive - nothing renders differently,
  // and a path that will never need a chunk never fetches it (an admin arriving
  // at ?npsignin=1 does not pull the donor dashboard). This is what keeps the
  // hop from the gate into the dashboard from ever waiting on the network.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adminEntry = params.get('npsignin') === '1' || params.get('npsignup') === '1';
    const t = setTimeout(() => {
      if (adminEntry) warm(() => import('./pages/nonprofit/NpWebShell'));
      else if (appEntry && !isMobile) warm(() => import('./pages/WebDashboard'));
      else warm(() => import('./components/AppShell'));
    }, 1500);
    return () => clearTimeout(t);
  }, [appEntry, isMobile]);

  // Org-scoped pretty URL: a join-link entry settles at pocketcache.app/CODE/give
  // (the 404 forwarder routes that path back to ?org=CODE, so refresh/bookmark
  // work). Delayed so the gate's auto-bind consumes ?org= first.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('org');
    if (!code) return;
    let cancelled = false;
    let cleanupTimer = null;
    resolveOrgByCode(code).then(org => {
      if (cancelled || !org) return;
      const slug = encodeURIComponent((org.shortName || org.id).toUpperCase());
      cleanupTimer = setTimeout(() => { if (!cancelled) window.history.replaceState(null, '', `/${slug}/give`); }, 2500);
    });
    return () => { cancelled = true; if (cleanupTimer) clearTimeout(cleanupTimer); };
  }, []);

  return (
    <ThemeProvider>
      {appEntry ? (
        isMobile ? (
          <ScaleFit>
            <AppContent />
          </ScaleFit>
        ) : (
          <WebExperience />
        )
      ) : (
        <PhoneFrame compact={isMobile}>
          <AppContent />
        </PhoneFrame>
      )}
    </ThemeProvider>
  );
}

// Desktop browser entry from a micro-site: a signed-in donor gets the real
// web-native dashboard (WebDashboard); a signed-in nonprofit admin gets the
// web-native admin portal (NpWebShell); a new donor gets the web-native signup
// wizard (WebOnboarding  -  which opens on its join step when no nonprofit is
// bound yet, so a donor arriving cold from the marketing site enters their code
// on a real webpage); a nonprofit listing itself gets the web-native admin
// signup wizard (NpWebSignup); an admin signing in gets WebAdminSignIn; and a
// donor whose account is CLOSED gets WebReactivate, the web-native closed
// account / reactivation page. Every desktop journey is a real webpage. The
// centered WebPortal column below is now only the router's dead end - see the
// note on the component for the one state that still leaks into it.
function WebExperience() {
  const { page, accountStatus, selectedNonprofit, initialOnboardingStep, returnFromOnboarding } = useApp();
  const bioGate = useBiometricGate();
  // Capture the entry context ONCE  -  the pretty-URL rewrite strips the params.
  const [entry, setEntry] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const npstripe = params.get('npstripe');
    // ?npstripe=return|refresh&org=<uuid> is Stripe's hosted-onboarding
    // redirect landing back (see src/lib/npSignup.js) - `org` there is a
    // server org id, not a donor join code, so it must NOT be run through
    // findOrgByCode (a localStorage-only, join-code lookup that would just
    // fail to resolve it, harmlessly, but the intent below is clearer this
    // way: this entry means "resume the nonprofit signup wizard", not "a
    // donor is joining an org").
    const code = npstripe ? null : params.get('org');
    return {
      // The raw ?org= string as well as the resolved org: a code this device
      // cannot resolve locally yet (see the resolveOrgByCode effect just below)
      // still has to reach the join step so it can be prefilled and explained,
      // exactly as the phone gate does, rather than vanishing.
      code,
      org: findOrgByCode(code),
      npsignin: params.get('npsignin') === '1',
      npsignup: params.get('npsignup') === '1' || npstripe === 'return' || npstripe === 'refresh',
    };
  });
  // A join code this device has never seen (a custom org created/joined on a
  // DIFFERENT device) is not in local cache, so the synchronous lookup above
  // (BGCA seed + localStorage only) comes back empty even though the org is
  // real. One follow-up try against the server - see resolveOrgByCode in
  // orgStore.js - resolves and caches it so the join step gets the real org
  // instead of treating a valid code as "not found".
  useEffect(() => {
    if (!entry.code || entry.org) return;
    let cancelled = false;
    resolveOrgByCode(entry.code).then(org => {
      if (!cancelled && org) setEntry(prev => ({ ...prev, org }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Desktop nonprofit signup is its OWN page (NpWebSignup), not Onboarding's
  // internal step, so this is where the route is decided. Latch every signal:
  // the ?npsignup=1 deep link, and goToOnboardingStep('nonprofit-signup') from
  // anywhere else  -  the donor dashboard's "list your nonprofit" action, the
  // desktop donor wizard's nonprofit CTA, and the join gate's "Create your
  // nonprofit page" button (a cold visitor in the WebPortal column).
  // Latched with the derived-state-during-render pattern: Onboarding clears
  // initialOnboardingStep as soon as it consumes it, so the signal is gone by
  // the next render and we must not let the route flip back out of the wizard.
  const [npSignup, setNpSignup] = useState(entry.npsignup);
  if (initialOnboardingStep === 'nonprofit-signup' && !npSignup) setNpSignup(true);
  // ...and released the moment the org is live, so an admin who later crosses
  // over to giving mode (goGiving → page 'onboarding') is not dropped back into
  // the signup wizard by a latch that outlived it.
  if (page === 'np-dashboard' && npSignup) setNpSignup(false);
  // Admin sign-in is a route, not just a URL: ?npsignin=1 opens it, and so does
  // the "Nonprofit admin? Sign in with your work email" link on the donor join
  // step (the phone gate carries the same link, GateSignInScreen ~912). State,
  // not the latched URL param, so that in-page link works without a reload.
  const [adminSignIn, setAdminSignIn] = useState(entry.npsignin);

  // ── Closed account, FIRST ──
  // cancelAccount() leaves `page` at 'onboarding', so a cancelled donor used to
  // fall through to the join step (page 'onboarding') or the phone column
  // (page 'home') depending on what else was in storage. Both shapes are the
  // same person and the same answer: the web-native closed-account page, which
  // owns both the closed state and the reactivation check-in. It is above every
  // donor branch because none of them can act for someone whose account is
  // shut, and below nothing, because there is nothing above it.
  // The nonprofit admin surface is unaffected: `accountStatus` is the DONOR
  // account's, and an admin whose donor side is closed still has page
  // 'np-dashboard'... which is why that branch is the one exception below.
  if (accountStatus === 'cancelled' && page !== 'np-dashboard') {
    return <LazySurface surface="web"><WebReactivate /></LazySurface>;
  }

  const signedInDonor =
    page !== 'onboarding' && page !== 'np-dashboard' &&
    accountStatus !== 'cancelled' && selectedNonprofit;
  if (signedInDonor && bioGate.locked) return <WebLockScreen gate={bioGate} />;
  if (signedInDonor) return (
    <>
      <LazySurface surface="web"><WebDashboard /></LazySurface>
      <AppDownloadPrompt fixed />
    </>
  );
  // Nonprofit admin dashboard  -  the web-native admin portal, not the phone
  // shell in a column. Face ID / Touch ID still gates it, same as the donor's.
  if (page === 'np-dashboard') {
    if (bioGate.locked) return <WebLockScreen gate={bioGate} />;
    return (
      <>
        <LazySurface surface="web"><NpWebShell /></LazySurface>
        {/* Queued by NpWebSignup's license-accept step - fires here, once the
            dashboard has mounted, instead of over the wizard's own Benevity /
            Team ID buttons. */}
        <AppDownloadPrompt fixed />
      </>
    );
  }
  // Donor signup wizard  -  including an admin crossing over via "Start giving"
  // (selectedNonprofit gets bound before the jump, so this wins over npsignin).
  //
  // NO NONPROFIT YET IS A DONOR, TOO. This used to demand a bound org or an
  // ?org=CODE link, so the one entry the marketing site actually sends donors to
  // (/demo/?app=1  -  no org, no code) fell through to the WebPortal column and
  // rendered the PHONE gate, 440px wide, floating in the middle of a desktop
  // page. That is the thing we have said repeatedly desktop must never do. The
  // wizard now owns the codeless donor: WebOnboarding opens on its web-native
  // join step, takes the code there, and continues into the same four steps.
  //
  // "No nonprofit bound" also outranks whatever `page` says: a donor with no org
  // has nothing to put on a dashboard, and the signed-in branch above declines
  // them for exactly that reason. Without this they fell through to the column
  // too. Sending them to the join step is the only answer that can actually
  // resolve the state, and once they pick one the wizard's own "welcome back"
  // row takes an existing account straight to the dashboard.
  const donorRoute =
    page !== 'np-dashboard' && accountStatus !== 'cancelled' && !npSignup &&
    (page === 'onboarding' || !selectedNonprofit);
  if (donorRoute && (selectedNonprofit || !adminSignIn)) {
    return (
      <LazySurface surface="web">
        <WebOnboarding
          entryOrg={entry.org}
          entryCode={entry.code}
          onAdminSignIn={() => setAdminSignIn(true)}
        />
      </LazySurface>
    );
  }
  // Micro-site "Nonprofit admin? Sign in"  -  webpage version of the
  // passwordless work-email protocol (never the app-style column).
  //
  // Deliberately NOT gated on page === 'onboarding' any more. `adminSignIn` is
  // an explicit intent latch (the ?npsignin=1 link, or the in-page link), and it
  // could be set while `page` was 'home' - an admin with no nonprofit bound on
  // this device who used "Switch to Giving", for instance. The donor branch
  // above declines them (they asked for admin sign-in), so the page guard sent
  // them to the phone column instead of the thing they asked for.
  if (adminSignIn && !npSignup) {
    return <LazySurface surface="web"><WebAdminSignIn /></LazySurface>;
  }
  // Nonprofit org onboarding  -  the web-native admin signup wizard. Not the
  // phone flow in a box: its own multi-column page, no ScaleFit, no 449px cap.
  // Completion routes to page 'np-dashboard', which lands on NpWebShell above.
  // Same reasoning as the admin sign-in branch above: npSignup is an explicit
  // intent latch, not a function of which page the donor side happens to be on.
  if (npSignup) {
    // A cold ?npsignup=1 visitor has nowhere to go "back" to, so the wizard
    // hides its exit control rather than offering a dead one.
    return (
      <LazySurface surface="web">
        <NpWebSignup
          onExit={entry.npsignup ? undefined : () => { setNpSignup(false); returnFromOnboarding(); }}
        />
      </LazySurface>
    );
  }
  // LAST RESORT IS A WEBPAGE, NOT A PHONE IN A BOX.
  // This used to render AppContent inside a 440px ScaleFit column, which is the
  // pattern desktop is not allowed to use. Everything that reached it was a
  // donor with no nonprofit bound, and the join step is the only screen that can
  // resolve that state - so it is the honest fallback as well as the safe one.
  // WebPortal itself is gone; if a future route needs a shell, build the page.
  return (
    <LazySurface surface="web">
      <WebOnboarding
        entryOrg={entry.org}
        entryCode={entry.code}
        onAdminSignIn={() => setAdminSignIn(true)}
      />
    </LazySurface>
  );
}

export default function App() {
  const orgPageCode = new URLSearchParams(window.location.search).get('orgpage');
  if (orgPageCode) {
    return <LazySurface surface="web"><OrgLandingPage code={orgPageCode} /></LazySurface>;
  }
  // Platform-owner-only console - ?padmin=1, never linked from anywhere in the
  // UI. Same pattern as ?orgpage= above: rendered outside AppProvider/NpProvider
  // since it does its own gate and reads localStorage directly.
  const isPlatformAdmin = new URLSearchParams(window.location.search).get('padmin') === '1';
  if (isPlatformAdmin) {
    return <LazySurface surface="web"><PlatformAdmin /></LazySurface>;
  }
  return (
    <AppProvider>
      <NpProvider>
        <ThemedApp />
      </NpProvider>
    </AppProvider>
  );
}
