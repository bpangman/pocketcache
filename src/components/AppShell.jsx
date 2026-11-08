import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Settings as SettingsIcon, HelpCircle, LogOut, ArrowLeftRight, Landmark, Pencil } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { useTheme } from '../store/ThemeContext';
import { DEMO_USER } from '../data/derived';
import { greetingNameFor } from '../lib/donorAuth';
import TabBar from './TabBar';
import AppVersion from './AppVersion';
import Button from './ui/Button';
import { Z } from '../lib/overlay';
import Sheet from './Sheet';
import CoinMark from './CoinMark';
import TransferNonprofitSheet from './sheets/TransferNonprofitSheet';
import Dashboard from '../pages/Dashboard';
import MyCause from '../pages/MyCause';
import Activity from '../pages/Activity';
import Share from '../pages/Share';
import Settings from '../pages/Settings';
import { useShakeDetector } from '../lib/shake';
import { DEMO_TOASTS } from '../lib/donorContent';

const SUPPORT_EMAIL = 'support@pocketcache.app';

// The "you signed up through an org link - finish picking that org" prompt
// belongs to state-core and may not be in the tree yet. import.meta.glob with
// no match is an empty object, so the shell renders nothing until the file
// exists and picks it up automatically once it does.
import PendingOrgPrompt from './PendingOrgPrompt';

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
  const { tab, setTab, signOut, adminRole, setPage, setLastMode, goToOnboardingStep, hasAccount, demoMode, setDemoMode, showToast, saveDisplayName } = useApp();
  const { resetNpContent } = useNp();
  const brand = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  // Inline "what should we call you" edit inside the account sheet - the
  // app-side home of the profile-name edit (item 7c). Web parity lives in
  // WebSettings' identity line.
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const Page = PAGES[tab] || Dashboard;

  // Shake-to-toggle demo mode, wired ONCE at the shell level so it works on
  // every donor tab. lib/shake.js owns detection and the iOS motion
  // permission dance (requested on the first tap, gracefully absent when
  // denied - the Settings toggle remains the fallback). A plain toggle
  // (round-4 item 2b): shake flips between real data and the full rich demo
  // dataset; the toast names the direction and the header pill says "Demo".
  useShakeDetector(() => {
    const next = !demoMode;
    setDemoMode(next);
    showToast(next ? DEMO_TOASTS.on : DEMO_TOASTS.off);
  });

  // Identity comes from the signed-in account, exactly as Settings.jsx reads
  // it; DEMO_USER is the fallback only, for a device with no account yet.
  // greetingNameFor returns null for a name that was only guessed from the
  // email local part, so a real account with no stored name is titled by its
  // email (and the avatar takes the email's first letter) rather than by a
  // mangled relay address pretending to be a name.
  const realName = hasAccount ? greetingNameFor(hasAccount) : null;
  const userName = realName ?? hasAccount?.email ?? DEMO_USER.name;
  const userEmail = hasAccount?.email ?? DEMO_USER.email;
  const avatarInitial = (userName?.trim?.()[0] ?? 'P').toUpperCase();

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

      {/* Global avatar button - fixed top-right inside the phone frame, visible
          on all donor tabs. The BUTTON is the 44x44 hit area (2px of padding
          around the circle, offset so the 40px circle sits exactly where it
          always has: 20px from the right edge, safe-top + 12px down). Page
          headers that can run long (My Cause's org name) reserve this strip
          (MyCause.jsx AVATAR_CLEARANCE) so the circle never paints over copy. */}
      <button
        onClick={() => setShowProfile(true)}
        className="absolute flex items-center justify-center active:scale-95 transition-transform"
        style={{ top: 'calc(var(--pc-safe-top) + 10px)', right: 18, width: 44, height: 44, zIndex: Z.chrome }}
        aria-label="Open account settings"
      >
        <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold border border-white/30">
          {avatarInitial}
        </span>
      </button>

      {/* Org-pick follow-up for an account that signed up through an org link
          (state-core). Renders nothing until that component exists. */}
      <PendingOrgPrompt surface="app" />

      {/* Profile / Account sheet - shared by all donor tabs */}
      <Sheet show={showProfile} onClose={() => setShowProfile(false)} title="Your Account">
        {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
        <div className="px-6 pt-2 space-y-1">
          {/* Avatar + name block. The name is EDITABLE here (item 7c): this
              sheet is the app's profile card, so "what should we call you"
              lives on it - saved server-side (donor_profiles.display_name)
              and into pc_identity in one motion via saveDisplayName. */}
          <div className="flex flex-col items-center py-6 gap-2">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: brand.gradient, boxShadow: 'var(--shadow-2)' }}
            >
              {avatarInitial}
            </div>
            {editingName ? (
              <form
                className="flex items-center gap-2 mt-1"
                onSubmit={e => {
                  e.preventDefault();
                  if (nameInput.trim()) saveDisplayName(nameInput);
                  setEditingName(false);
                }}
              >
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  maxLength={60}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="What should we call you?"
                  aria-label="Your name"
                  className="rounded-input px-3 outline-none text-ink min-w-0"
                  style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, height: 48 }}
                  data-testid="account-name-input"
                />
                <Button type="submit" size="md" fullWidth={false}>Save</Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => { setNameInput(realName ?? ''); setEditingName(true); }}
                className="flex items-center gap-1.5 mt-1 min-h-[44px] max-w-full"
                data-testid="account-name-edit"
                aria-label="Edit your name"
              >
                <span className="font-bold text-ink text-lg truncate">{userName}</span>
                <Pencil size={14} className="text-gray-400 shrink-0" />
              </button>
            )}
            {userName !== userEmail && <p className="text-slate text-sm">{userEmail}</p>}
          </div>

          {/* Mode switch */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setShowProfile(false);
              if (adminRole) { setLastMode('admin'); setPage('np-dashboard'); }
              else goToOnboardingStep('nonprofit-signup');
            }}
            className="w-full flex items-center gap-4 px-4 py-3 min-h-[52px] rounded-card text-left mb-1"
            style={adminRole
              ? { background: 'linear-gradient(135deg, var(--navy), var(--navy-deep))', color: '#fff' }
              : { background: 'var(--surface)', color: 'var(--ink-2)' }}
          >
            {/* Same fixed-size icon wrapper as the menu rows below (icon
                component at size={18} inside a span), so this row's icon
                lines up with theirs pixel-for-pixel instead of sitting a
                different size/baseline as the old emoji did. Color follows
                the row's own text color (white on the admin gradient, gray
                on the default row) rather than the menu rows' fixed
                text-gray-500, since this row alone switches background. */}
            <span style={{ color: adminRole ? 'rgba(255,255,255,0.7)' : 'var(--slate)' }}>
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
            <ChevronRight size={16} className={adminRole ? 'text-white/50' : 'text-gray-400'} />
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
              type="button"
              className="w-full flex items-center gap-4 px-4 py-3 min-h-[52px] rounded-card bg-surface active:bg-gray-100 transition-colors text-left"
            >
              <span className="text-slate">{icon}</span>
              <span className="flex-1 text-ink font-medium text-sm">{label}</span>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          ))}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => { setShowProfile(false); resetNpContent(); signOut(); }}
              className="w-full flex items-center gap-4 px-4 py-3 min-h-[52px] rounded-card bg-danger-wash active:bg-red-100 transition-colors text-left"
            >
              <span style={{ color: 'var(--danger)' }}><LogOut size={18} /></span>
              <span className="flex-1 font-medium text-sm" style={{ color: 'var(--danger)' }}>Sign Out</span>
            </button>
          </div>

          {/* Build-stamped by AppVersion - the hardcoded "v1.0.0" used to live here. */}
          <div className="pt-4 flex items-center gap-1 justify-center text-muted text-xs">
            <CoinMark size={14} /><AppVersion />
          </div>
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
