// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { LogOut, ChevronDown, Coins } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { useNp } from '../../store/NpContext';
import NpTabBar from './NpTabBar';
import { npTabDef } from './npTabs';
import { useNpAdminActions } from './useNpAdminActions';
import { NpLayoutProvider, NpOrgMark } from './NpLayout';
import PendingReviewBanner, { PreviewAdminBanner } from './PendingReviewBanner';
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
      transition={{ duration: 0.5 }} className="flex items-center gap-3 shrink-0 pc-on-dark"
      style={{ paddingTop: 'calc(var(--pc-safe-top) + 16px)', paddingLeft: '20px', paddingRight: '20px', paddingBottom: '16px' }}>
      {/* Logo */}
      <NpOrgMark npOrg={npOrg} size={40} radius={12} />

      {/* Name + powered-by. The short name fits the header; a long legal name
          wraps to two lines rather than being cut off mid-word. */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-base line-clamp-2" style={{ lineHeight: 1.15 }}>{npOrg.shortName || npOrg.name || 'Your Nonprofit'}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <CoinMark size={11} />
          <span className="text-white/70 text-xs font-medium">powered by PocketCache</span>
        </div>
      </div>

      {/* Admin button + menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-1 px-4 rounded-pill text-xs font-bold"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', minHeight: 44 }}
        >
          Admin <ChevronDown size={14} aria-hidden />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity: 0, y: -6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }} transition={{ duration: 0.15 }}
              role="menu"
              className="absolute right-0 top-13 w-60 bg-white rounded-card overflow-hidden z-20"
              style={{ boxShadow: 'var(--shadow-3)', border: '1px solid var(--line)' }}>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); goGiving(); }} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-surface" style={{ minHeight: 48 }}>
                <Coins size={16} className="shrink-0" style={{ color: 'var(--gold-700)' }} aria-hidden />
                <span className="flex-1 text-ink font-medium text-sm leading-snug">
                  {givingLabel}
                </span>
              </button>
              <div className="h-px bg-line mx-3" />
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); handleSignOut(); }} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ minHeight: 48 }}>
                <LogOut size={16} className="shrink-0" style={{ color: 'var(--danger)' }} aria-hidden />
                <span className="font-medium text-sm" style={{ color: 'var(--danger)' }}>Sign out</span>
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
      <div className="w-full h-full relative flex flex-col overflow-hidden" style={{ background: 'var(--surface)' }}>
        <NpHeader npOrg={npOrg} />
        <PreviewAdminBanner />
        <PendingReviewBanner />

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
