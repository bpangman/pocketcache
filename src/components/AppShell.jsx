import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Settings as SettingsIcon, CreditCard, Bell, HelpCircle, LogOut } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { useTheme } from '../store/ThemeContext';
import { DEMO_USER } from '../data/derived';
import TabBar from './TabBar';
import Sheet from './Sheet';
import CoinMark from './CoinMark';
import Dashboard from '../pages/Dashboard';
import MyCause from '../pages/MyCause';
import Activity from '../pages/Activity';
import Share from '../pages/Share';
import Settings from '../pages/Settings';

const PAGES = {
  dashboard: Dashboard,
  mycause: MyCause,
  activity: Activity,
  share: Share,
  settings: Settings,
};

export default function AppShell() {
  const { tab, setTab, signOut, adminRole, setPage, setLastMode, goToOnboardingStep } = useApp();
  const { resetNpContent } = useNp();
  const brand = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const Page = PAGES[tab] || Dashboard;

  return (
    <div className="w-full h-full relative bg-gray-50 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0"
        >
          <Page />
        </motion.div>
      </AnimatePresence>
      <TabBar />

      {/* Global avatar button — fixed top-right inside the phone frame, visible on all donor tabs */}
      <button
        onClick={() => setShowProfile(true)}
        className="absolute top-14 right-5 z-20 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold border border-white/30 active:scale-95 transition-transform"
        aria-label="Open account settings"
      >
        {DEMO_USER.name[0]}
        <span className="absolute inset-0 rounded-full border border-white/40 animate-ping opacity-30" style={{ animationDuration: '3s' }} />
      </button>

      {/* Profile / Account sheet — shared by all donor tabs */}
      <Sheet show={showProfile} onClose={() => setShowProfile(false)} title="Your Account">
        <div className="px-6 pt-2 pb-8 space-y-1">
          {/* Avatar + name block */}
          <div className="flex flex-col items-center py-6 gap-2">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
              style={{ background: brand.gradient }}
            >
              {DEMO_USER.name[0]}
            </div>
            <p className="font-bold text-gray-900 text-lg mt-1">{DEMO_USER.name}</p>
            <p className="text-gray-400 text-sm">{DEMO_USER.email}</p>
          </div>

          {/* Mode switch */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setShowProfile(false);
              if (adminRole) { setLastMode('admin'); setPage('np-dashboard'); }
              else goToOnboardingStep('nonprofit-signup');
            }}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left mb-1"
            style={adminRole
              ? { background: 'linear-gradient(135deg,#0B2A4A,#003865)', color: '#fff' }
              : { background: '#f9fafb', color: '#374151' }}
          >
            <span className="text-lg">🏛️</span>
            <span className="flex-1 font-semibold text-sm">
              {adminRole ? `Switch to Admin · ${adminRole.joinCode}` : 'Run a nonprofit? Create your page'}
            </span>
            <ChevronRight size={16} className={adminRole ? 'text-white/50' : 'text-gray-300'} />
          </motion.button>

          {/* Menu rows */}
          {[
            { icon: <SettingsIcon size={18} />, label: 'Account Settings', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <CreditCard size={18} />, label: 'Payment Method', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <Bell size={18} />, label: 'Notifications', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <HelpCircle size={18} />, label: 'Help & Support', action: () => window.open('mailto:support@pocketcache.app') },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-50 active:bg-gray-100 transition-colors text-left"
            >
              <span className="text-gray-500">{icon}</span>
              <span className="flex-1 text-gray-800 font-medium text-sm">{label}</span>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          ))}

          <div className="pt-2">
            <button
              onClick={() => { setShowProfile(false); resetNpContent(); signOut(); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-red-50 active:bg-red-100 transition-colors text-left"
            >
              <span className="text-red-400"><LogOut size={18} /></span>
              <span className="flex-1 text-red-500 font-medium text-sm">Sign Out</span>
            </button>
          </div>

          <p className="text-center text-gray-300 text-xs pt-4 flex items-center gap-1 justify-center">
            <CoinMark size={14} />PocketCache · v1.0.0
          </p>
        </div>
      </Sheet>
    </div>
  );
}
