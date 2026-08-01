// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { useNp } from '../../store/NpContext';
import NpTabBar from './NpTabBar';
import { npTabDef } from './npTabs';
import { useNpAdminActions } from './useNpAdminActions';
import { NpLayoutProvider, NpOrgMark } from './NpLayout';
import CoinMark from '../../components/CoinMark';

// ─── The phone / native nonprofit-admin shell ────────────────────────────────
// Brand header, one tab at a time, bottom tab bar. The desktop counterpart is
// NpWebShell; both render the SAME tab components from npTabs.js and differ only
// in chrome and layout (see NpLayout.jsx).

function NpHeader({ npOrg }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { goGiving, handleSignOut, givingLabel } = useNpAdminActions(npOrg);
  const accent = npOrg.color || '#003865';

  return (
    <motion.div animate={{ background: `linear-gradient(135deg, ${accent} 0%, #001a33 100%)` }}
      transition={{ duration: 0.5 }} className="flex items-center gap-3 shrink-0"
      style={{ paddingTop: 'calc(var(--pc-safe-top) + 16px)', paddingLeft: '20px', paddingRight: '20px', paddingBottom: '16px' }}>
      {/* Logo */}
      <NpOrgMark npOrg={npOrg} size={40} radius={12} />

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
              <button onClick={() => { setMenuOpen(false); goGiving(); }} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50">
                <span className="text-base">🪙</span>
                <span className="flex-1 text-gray-800 font-medium text-sm leading-snug">
                  {givingLabel}
                </span>
              </button>
              <div className="h-px bg-gray-100 mx-3" />
              <button onClick={() => { setMenuOpen(false); handleSignOut(); }} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-red-50">
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
  const { adminRole, setPage } = useApp();

  // Defense-in-depth: App.jsx renders this shell purely off `page ===
  // 'np-dashboard'', with no role check of its own (that's the point of a
  // lazy-loaded surface component - App.jsx shouldn't need to know what's
  // inside it). Real auth is a backend concern this demo doesn't have, but
  // hand-setting pc_page in localStorage without pc_admin_role should not be
  // enough to see someone else's admin dashboard - bounce back to the gate,
  // where the real (if demo-simple) admin sign-in lives.
  useEffect(() => {
    if (!adminRole) setPage('onboarding');
  }, [adminRole, setPage]);
  if (!adminRole) return null;

  const Page = npTabDef(npTab).component;

  return (
    <NpLayoutProvider web={false}>
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
    </NpLayoutProvider>
  );
}
