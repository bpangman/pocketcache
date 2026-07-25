/* eslint-disable react-refresh/only-export-components */
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Z, scrim, centered } from '../../lib/overlay';
import { safeBottomAtLeast } from '../../lib/safeArea';
import bgcaLogoUrl from '../../assets/bgca-logo.png';

/**
 * Layout primitives shared by the two nonprofit-admin shells.
 *
 * WHY THIS EXISTS
 * There is ONE copy of every admin tab (tabs/Overview, Donors, Charges, Grow,
 * NpSettings). It renders inside the phone shell (NpShell, bottom tab bar) and
 * inside the desktop shell (NpWebShell, top nav, wide grid). The tabs must
 * therefore not own their own page chrome: they declare *blocks* and let the
 * active shell decide whether those blocks stack in a 390px column or tile
 * across a 1240px grid.
 *
 *   NpLayoutProvider   the shell announces which surface it is
 *   NpPage             the tab's scroll/grid container
 *   NpBlock            one block within the page, with a desktop column span
 *   NpSheet            bottom sheet on phone, centred modal on desktop
 *   NpOrgMark          the org's logo tile (same fallback rules on both shells)
 *
 * On the phone surface every one of these renders exactly the markup the tabs
 * used to hand-write, so the native experience is byte-for-byte unchanged.
 */

/** Max content width of the desktop admin shell. Wider than the donor portal's
 *  1100 on purpose: this surface carries donor lists and charge-run tables. */
export const NP_WEB_MAX_W = 1240;

const NpLayoutContext = createContext({ web: false, winW: 1280 });

export function NpLayoutProvider({ web = false, children }) {
  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    if (!web) return;
    const update = () => setWinW(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [web]);
  return (
    <NpLayoutContext.Provider value={{ web, winW }}>
      {children}
    </NpLayoutContext.Provider>
  );
}

/** `{ web, winW }` - which admin shell the tab is rendering inside. */
export function useNpLayout() {
  return useContext(NpLayoutContext);
}

// Column count of the enclosing NpPage grid, so NpBlock can clamp its span.
const NpGridContext = createContext(1);

// Tailwind needs literal class names, so the phone gap is a lookup, not a
// template string.
const PHONE_GAP = { 4: 'space-y-4', 5: 'space-y-5' };

/**
 * A tab's page container.
 *
 * phone: the scroll area the tabs used to write by hand
 *        ("flex-1 scrollable pc-scrollbar px-4 pb-28 pt-4 space-y-N").
 * web:   a responsive grid. `cols` is the MOST columns this tab wants; the
 *        actual count drops as the window narrows so a block is never thinner
 *        than `colMin`.
 */
export function NpPage({ children, gap = 4, cols = 2, colMin = 340 }) {
  const { web, winW } = useNpLayout();
  if (!web) {
    return (
      <div className={`flex-1 scrollable pc-scrollbar px-4 pb-28 pt-4 ${PHONE_GAP[gap] ?? PHONE_GAP[4]}`}>
        {children}
      </div>
    );
  }
  const usable = Math.min(winW, NP_WEB_MAX_W) - 48; // body horizontal padding
  const n = Math.max(1, Math.min(cols, Math.floor(usable / colMin)));
  return (
    <NpGridContext.Provider value={n}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 20, alignItems: 'start' }}>
        {children}
      </div>
    </NpGridContext.Provider>
  );
}

/**
 * One block of a page. On phone it is transparent - it renders no DOM at all,
 * so the parent's space-y-N still applies to the block's own root element. On
 * web it becomes a grid item spanning `span` columns ('full' = all of them).
 */
export function NpBlock({ children, span = 1 }) {
  const { web } = useNpLayout();
  const n = useContext(NpGridContext);
  if (!web) return children;
  const cols = span === 'full' ? n : Math.min(span, n);
  return <div style={{ gridColumn: `span ${cols}`, minWidth: 0 }}>{children}</div>;
}

/**
 * Detail overlay. Bottom sheet on the phone (spring up from the bottom edge,
 * dim scrim, safe-area aware footer padding); centred modal on the desktop,
 * matching the donor web portal's Modal.
 */
export function NpSheet({ show, title, onClose, children, width = 560 }) {
  const { web } = useNpLayout();
  if (!show) return null;

  if (web) {
    return (
      <div
        onClick={onClose}
        style={{ ...scrim('dim', { fixed: true }), ...centered(16), zIndex: Z.modalScrim }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto',
            background: '#fff', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            position: 'relative', zIndex: Z.modal,
          }}
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
            <button onClick={onClose} aria-label="Close"><X size={20} className="text-gray-400" /></button>
          </div>
          <div className="px-6 py-5 space-y-4">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ ...scrim('dim'), zIndex: Z.sheetScrim }}
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[80%] flex flex-col"
        style={{ zIndex: Z.sheet }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
          <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onClose} aria-label="Close">
            <X size={20} className="text-gray-400" />
          </motion.button>
        </div>
        <div
          className="flex-1 overflow-y-auto pc-scrollbar px-6 pt-5 space-y-4"
          style={{ paddingBottom: safeBottomAtLeast(20) }}
        >
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * The org's logo tile. Same fallback chain on both shells: uploaded logo, then
 * the bundled BGCA mark for the demo tenant, then the org's initial.
 */
export function NpOrgMark({ npOrg, size = 40, radius = 12, on = 'dark' }) {
  const src = npOrg.logoPreview || (npOrg.joinCode === 'BGCA' ? bgcaLogoUrl : null);
  const box = {
    width: size, height: size, borderRadius: radius, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  };
  if (src) {
    return (
      <div style={{ ...box, background: '#fff', boxShadow: '0 4px 12px rgba(11,42,74,0.18)' }}>
        <img src={src} alt={npOrg.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: size * 0.1, display: 'block' }} />
      </div>
    );
  }
  // No logo yet: a tinted initial. On the phone header the backdrop is already
  // the brand gradient, so the tile is a white wash; on the white web nav it
  // takes the brand colour itself.
  return (
    <div style={{
      ...box,
      background: on === 'dark' ? 'rgba(255,255,255,0.25)' : (npOrg.color || '#003865'),
      color: '#fff', fontWeight: 900, fontSize: size * 0.45,
      boxShadow: on === 'dark' ? '0 4px 12px rgba(11,42,74,0.18)' : 'none',
    }}>
      {(npOrg.name || 'O')[0].toUpperCase()}
    </div>
  );
}
