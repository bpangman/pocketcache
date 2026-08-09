import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Settings as SettingsIcon, HelpCircle, LogOut, ArrowLeftRight, Landmark } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { useTheme } from '../store/ThemeContext';
import { DEMO_USER } from '../data/derived';
import TabBar from './TabBar';
import { Z } from '../lib/overlay';
import Sheet from './Sheet';
import CoinMark from './CoinMark';
import TransferNonprofitSheet from './sheets/TransferNonprofitSheet';
import Dashboard from '../pages/Dashboard';
import MyCause from '../pages/MyCause';
import Activity from '../pages/Activity';
import Share from '../pages/Share';
import Settings from '../pages/Settings';

const SUPPORT_EMAIL = 'support@pocketcache.app';

/**
 * Open the donor's mail app at support.
 *
 * NOT window.open(). Inside the Capacitor WKWebView, window.open() with a
 * mailto: URL is routinely blocked and fails silently - the donor taps
 * "Help & Support" and nothing at all happens, which is exactly what was
 * reported from the TestFlight build. Assigning window.location.href puts the
 * URL through the normal navigation path, which Capacitor hands to the OS, and
 * it is also what a desktop browser expects. The same call is duplicated in
 * pages/Settings.jsx's contact-support row; keep the two in step.
 */
function contactSupport() {
  window.location.href = `mailto:${SUPPORT_EMAIL}`;
}

const PAGES = {
  dashboard: Dashboard,
  mycause: MyCause,
  activity: Activity,
  share: Share,
  settings: Settings,
};

export default function AppShell() {
  const { tab, setTab, signOut, adminRole, setPage, setLastMode, goToOnboardingStep, hasAccount } = useApp();
  const { resetNpContent } = useNp();
  const brand = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const Page = PAGES[tab] || Dashboard;

  // Identity comes from the signed-in account, exactly as Settings.jsx reads
  // it; DEMO_USER is the fallback only, for a device with no account yet.
  const userName = hasAccount?.name ?? DEMO_USER.name;
  const userEmail = hasAccount?.email ?? DEMO_USER.email;

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
        className="absolute right-5 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold border border-white/30 active:scale-95 transition-transform"
        style={{ top: 'calc(var(--pc-safe-top) + 12px)', zIndex: Z.chrome }}
        aria-label="Open account settings"
      >
        {userName[0]}
        <span className="absolute inset-0 rounded-full border border-white/40 animate-ping opacity-30" style={{ animationDuration: '3s' }} />
      </button>

      {/* Profile / Account sheet — shared by all donor tabs */}
      <Sheet show={showProfile} onClose={() => setShowProfile(false)} title="Your Account">
        {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
        <div className="px-6 pt-2 space-y-1">
          {/* Avatar + name block */}
          <div className="flex flex-col items-center py-6 gap-2">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
              style={{ background: brand.gradient }}
            >
              {userName[0]}
            </div>
            <p className="font-bold text-gray-900 text-lg mt-1">{userName}</p>
            <p className="text-gray-400 text-sm">{userEmail}</p>
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
            {/* Same fixed-size icon wrapper as the menu rows below (icon
                component at size={18} inside a span), so this row's icon
                lines up with theirs pixel-for-pixel instead of sitting a
                different size/baseline as the old emoji did. Color follows
                the row's own text color (white on the admin gradient, gray
                on the default row) rather than the menu rows' fixed
                text-gray-500, since this row alone switches background. */}
            <span style={{ color: adminRole ? 'rgba(255,255,255,0.7)' : '#6b7280' }}>
              <Landmark size={18} />
            </span>
            {/* One line on a 320pt-class phone (iPhone SE), which the old
                "Run a nonprofit? Create your page" was not: at 32 characters it
                wrapped onto a second line inside this row's ~172px of text
                space. "Create a nonprofit page" is 23 characters, still names
                the audience and still reads as an action, and measures one line
                at 320px. Deliberately NOT truncate/nowrap: an ellipsis is still
                a broken row, so the copy has to fit honestly. */}
            <span className="flex-1 font-semibold text-sm">
              {adminRole ? `Switch to Admin · ${adminRole.joinCode}` : 'Create a nonprofit page'}
            </span>
            <ChevronRight size={16} className={adminRole ? 'text-white/50' : 'text-gray-300'} />
          </motion.button>

          {/* Menu rows. "Account Settings", "Payment Method" and
              "Notifications" were three labels for one destination - all three
              ran the same setTab('settings') and nothing else, so the donor
              picked between three doors into the same room. One row now. */}
          {[
            { icon: <SettingsIcon size={18} />, label: 'Account settings', action: () => { setShowProfile(false); setTab('settings'); } },
            // Only for someone who actually administers a nonprofit. One admin
            // email per org (store/orgStore.js) means that when the admin
            // leaves, without this the organization loses its page for good.
            ...(adminRole
              ? [{ icon: <ArrowLeftRight size={18} />, label: 'Transfer nonprofit page', action: () => setShowTransfer(true) }]
              : []),
            { icon: <HelpCircle size={18} />, label: 'Help & Support', action: contactSupport },
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

      {/* Rendered AFTER the account sheet so it paints above it (same z step),
          the way Settings stacks AddCardSheet over ChangePaymentSheet - closing
          it returns the admin to the account sheet they opened it from. */}
      <TransferNonprofitSheet
        show={showTransfer}
        onClose={() => setShowTransfer(false)}
        adminRole={adminRole}
        brand={brand}
      />
    </div>
  );
}
