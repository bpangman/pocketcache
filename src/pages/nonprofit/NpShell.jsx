// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
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
  const accent    = npOrg.color || '#003865';
  const isBGCA    = npOrg.joinCode === 'BGCA';
  const logoSrc   = npOrg.logoPreview || (isBGCA ? bgcaLogoUrl : null);

  return (
    <motion.div
      animate={{ background: `linear-gradient(135deg, ${accent} 0%, #001a33 100%)` }}
      transition={{ duration: 0.5 }}
      className="flex items-center gap-3 px-5 pt-12 pb-4 shrink-0"
    >
      {/* Logo */}
      {logoSrc ? (
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
          <img src={logoSrc} alt={npOrg.name} className="w-full h-full object-contain p-1" style={{ display: 'block' }} />
        </div>
      ) : (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow-lg"
          style={{ background: 'rgba(255,255,255,0.25)' }}
        >
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

      {/* Admin badge */}
      <div
        className="px-2.5 py-1 rounded-full text-xs font-bold"
        style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
      >
        Admin
      </div>
    </motion.div>
  );
}

export default function NpShell() {
  const { npTab, npOrg } = useNp();
  const Page = NP_PAGES[npTab] || Overview;

  return (
    <div className="w-full h-full relative flex flex-col overflow-hidden" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <NpHeader npOrg={npOrg} />

      {/* Page content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={npTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <Page />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Tab bar */}
      <NpTabBar />
    </div>
  );
}
