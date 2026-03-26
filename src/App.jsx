import { useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { ThemeProvider, useTheme } from './store/ThemeContext';
import Onboarding from './pages/Onboarding';
import AppShell from './components/AppShell';
import Splash from './pages/Splash';
import CoinLogo from './components/CoinLogo';
import { motion } from 'framer-motion';

function AppContent() {
  const { page } = useApp();
  return page === 'onboarding' ? <Onboarding /> : <AppShell />;
}

function PhoneFrame({ children, splashDone, onSplashDone }) {
  const brand = useTheme();

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}
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
          animate={{ opacity: splashDone ? 1 : 0, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3"
        >
          {brand.logoEmoji ? (
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-lg"
              style={{ background: brand.gradient }}
            >
              {brand.logoEmoji}
            </div>
          ) : (
            <CoinLogo size={40} animate={false} showName={false} />
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
            {/* Splash rendered inside the phone */}
            {!splashDone && <Splash onDone={onSplashDone} />}
            {splashDone && children}
          </div>
        </div>

        {splashDone && (
          <p className="text-slate-500 text-xs text-center max-w-xs">
            Interactive prototype · Select any cause to rebrand the app
          </p>
        )}
      </div>
    </div>
  );
}

function ThemedApp() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <ThemeProvider>
      <PhoneFrame splashDone={splashDone} onSplashDone={() => setSplashDone(true)}>
        <AppContent />
      </PhoneFrame>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ThemedApp />
    </AppProvider>
  );
}
