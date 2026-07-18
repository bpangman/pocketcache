// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { LogOut } from 'lucide-react';
import { findOrgByCode } from '../../store/orgStore';
import { useNp } from '../../store/NpContext';
import NpTabBar from './NpTabBar';
import Overview   from './tabs/Overview';
import Donors     from './tabs/Donors';
import Charges    from './tabs/Charges';
import Grow       from './tabs/Grow';
import NpSettings from './tabs/NpSettings';
import CoinMark from '../../components/CoinMark';
import bgcaLogoUrl from '../../assets/bgca-logo.png';

const NP_PAGES = {
  overview: Overview,
  donors:   Donors,
  charges:  Charges,
  grow:     Grow,
  settings: NpSettings,
};

function NpHeader({ npOrg }) {
  const { hasAccount, setPage, signOut, setLastMode, setSelectedNonprofit, goToOnboardingStep } = useApp();
  const { resetNpContent } = useNp();
  const [menuOpen, setMenuOpen] = useState(false);
  const accent  = npOrg.color || '#003865';
  const logoSrc = npOrg.logoPreview || (npOrg.joinCode === 'BGCA' ? bgcaLogoUrl : null);

  function handleSignOut() { setMenuOpen(false); resetNpContent(); signOut(); }

  // One tap to giving mode  -  dashboard if they're a donor, else STRAIGHT to
  // donor account creation pre-bound to their org (they run the org  -  skip
  // the gate AND the intro pitch). Their personal donor identity is still a
  // separate SSO sign-in by design: the admin login belongs to the org and
  // may be shared/rotated among staff; personal giving stays personal.
  function goGiving() {
    setMenuOpen(false);
    setLastMode('giving');
    if (hasAccount) { setPage('home'); return; }
    const org = findOrgByCode(npOrg.joinCode);
    if (org) setSelectedNonprofit(org);
    goToOnboardingStep('signup');
  }

  return (
    <motion.div animate={{ background: `linear-gradient(135deg, ${accent} 0%, #001a33 100%)` }}
      transition={{ duration: 0.5 }} className="flex items-center gap-3 shrink-0"
      style={{ paddingTop: 'calc(var(--pc-safe-top) + 16px)', paddingLeft: '20px', paddingRight: '20px', paddingBottom: '16px' }}>
      {/* Logo */}
      {logoSrc ? (
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
          <img src={logoSrc} alt={npOrg.name} className="w-full h-full object-contain p-1" style={{ display: 'block' }} />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow-lg"
          style={{ background: 'rgba(255,255,255,0.25)' }}>
          {(npOrg.name || 'O')[0].toUpperCase()}
        </div>
      )}

      {/* Name + powered-by */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-base leading-tight truncate">{npOrg.name || 'Your Nonprofit'}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <CoinMark size={11} />
          <span className="text-white/50 text-xs font-medium">powered by PocketCache</span>
        </div>
      </div>

      {/* Admin button + menu */}
      <div className="relative">
        <button onClick={() => setMenuOpen(v => !v)} className="px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
          Admin ▾
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity: 0, y: -6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }} transition={{ duration: 0.15 }}
              className="absolute right-0 top-9 w-56 bg-white rounded-2xl shadow-xl overflow-hidden z-20 border border-gray-100">
              <button onClick={goGiving} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50">
                <span className="text-base">🪙</span>
                <span className="flex-1 text-gray-800 font-medium text-sm leading-snug">
                  {hasAccount ? 'Switch to Giving' : `Start giving  -  join ${npOrg.shortName ?? 'your org'} as a donor`}
                </span>
              </button>
              <div className="h-px bg-gray-100 mx-3" />
              <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-red-50">
                <LogOut size={16} className="text-red-400 shrink-0" />
                <span className="text-red-500 font-medium text-sm">Sign out</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function NpShell() {
  const { npTab, npOrg } = useNp();
  const Page = NP_PAGES[npTab] || Overview;

  return (
    <div className="w-full h-full relative flex flex-col overflow-hidden" style={{ background: '#f8fafc' }}>
      <NpHeader npOrg={npOrg} />

      {/* Page content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={npTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="absolute inset-0 overflow-y-auto">
            <Page />
          </motion.div>
        </AnimatePresence>
      </div>

      <NpTabBar />
    </div>
  );
}
