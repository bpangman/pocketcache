import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import {
  CreditCard, Bell, Shield, ChevronRight, Zap, Trash2, Fingerprint, FileText, ExternalLink, Eye, Lock,
  CheckCircle, HelpCircle, SkipForward, Receipt, X, Mail, Sparkles, Target, Heart, RefreshCw,
  Image as ImageIcon, Landmark, KeyRound, Loader2,
} from 'lucide-react';
import Sheet from '../components/Sheet';
import StripeCardForm from '../components/StripeCardForm';
import ManualCardForm from '../components/ManualCardForm';
import PlaidBankConnect from '../components/PlaidBankConnect';
import ApplePaySheet from '../components/ApplePaySheet';
import AppleLogo from '../components/AppleLogo';
import AppVersion from '../components/AppVersion';
import Button from '../components/ui/Button';
import Toggle from '../components/ui/Toggle';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import CoinMark from '../components/CoinMark';
import OrgLogo from '../components/OrgLogo';
import { resolveOrgByCode, isOrgPending, ORG_PENDING_MESSAGE } from '../store/orgStore';
import { loadKey, saveKey } from '../store/identityStore';
import {
  APP_FEE_LIVE, CHARGE_DAY, LOCK_DAY, MONTHLY_FLOOR, REVIEW_WINDOW_LAST_DAY, chargeTotal,
  effectiveCharge, nextChargeLabel, processingCoverFor, skipTargetMonth,
} from '../lib/billing';
import { fmtMoney, joinedDateISO, memberSinceLabel } from '../lib/format';
import {
  MULTIPLIER_NOTE, PREVIEW_NOTE, PREVIEWS_NOTE, appFeePendingLine, billingExplainer,
  skipConfirmParagraphs, skipRowOfferSub, skipRowSub,
} from '../lib/donorContent';
import { useShowDemoAffordances } from '../lib/demo';
import { greetingNameFor } from '../lib/donorAuth';
import { Z, scrim } from '../lib/overlay';
import { safeBottomAtLeast } from '../lib/safeArea';
import { MONTHLY_DATA } from '../data/transactions';
import { DEMO_USER } from '../data/derived';
import { biometricEnrolled, biometricEnroll, biometricDisable, markSessionUnlocked } from '../lib/biometric';
import { requestEmailChange, pollConfirmed, syncServerEmail, hasRealSession, isValidEmail } from '../lib/emailChange';

const SUPPORT_EMAIL = 'support@pocketcache.app';

// What the donor reads when the server could not close or delete the account.
// The sheet stays open underneath it so they can try again.
const CLOSE_ERROR = "We couldn't close your account right now. Please try again, or email info@pocketcache.app and we'll close it for you.";

/**
 * Open the donor's mail app at support.
 *
 * NOT window.open(). Inside the Capacitor WKWebView, window.open() with a
 * mailto: URL is routinely blocked and fails silently - the donor taps
 * "Contact support" and nothing at all happens, which is exactly what was
 * reported from the TestFlight build. Assigning window.location.href puts the
 * URL through the normal navigation path, which Capacitor hands to the OS, and
 * it is also what a desktop browser expects. The same call is duplicated in
 * AppShell.jsx's account sheet; keep the two in step.
 */
function contactSupport() {
  window.location.href = `mailto:${SUPPORT_EMAIL}`;
}

// Day-of-month ordinals, derived from lib/billing rather than typed as "1st"
// and "11th" - Settings carries the canonical billing explainer, so a literal
// here would be the one place able to contradict it.
const ord = (n) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
const CHARGE_DAY_ORDINAL = ord(CHARGE_DAY);
const LOCK_DAY_ORDINAL = ord(LOCK_DAY);

// Persisted toggle preferences (pc_prefs). In production these live server-side.
// `productUpdates` (PocketCache product news) defaults OFF: PocketCache never
// asks donors for anything, so nobody is opted in to its mail by default. The
// old `marketingEmails: true` default is deliberately not migrated - it was
// on without anyone choosing it. `chargeReminder` is gone: the 1st-of-month
// charge notice is a service message and cannot be switched off.
function loadPrefs() {
  return {
    notifications: true,
    biometric: true, dataSharing: false, productUpdates: false,
    ...loadKey('pc_prefs', {}),
  };
}

/**
 * Run a close/delete action and normalize what comes back. state-core's
 * cancelAccount({ final }) / deleteAccount() resolve to
 * { ok, reason?, error?, local? }. Until that contract lands they return
 * nothing and only touch this device - which is exactly a local result, so
 * the sheet copy says so instead of claiming the server did anything. A
 * throw (sync or async) is a failure the sheet shows, never an unhandled
 * rejection.
 * @param {Function} action - returns the result, a promise of it, or nothing.
 */
async function closeResult(action) {
  try {
    const r = await action?.();
    return r === undefined ? { ok: true, local: true } : r;
  } catch (err) {
    return { ok: false, reason: 'error', error: err?.message };
  }
}

// Section caption inside a card: the 11px caps label from the type scale.
function SectionLabel({ children }) {
  return (
    <div className="px-4 pt-4 pb-2">
      <p className="font-semibold uppercase" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--slate)' }}>{children}</p>
    </div>
  );
}

// Non-tappable status badge at the right edge of a row ("Watching", "Active",
// "Preview", "Practice mode"). Teal for live state, amber for anything the
// donor should know is not real yet.
function StatusPill({ tone = 'teal', children }) {
  const colors = tone === 'warning'
    ? { color: 'var(--warning)', background: 'var(--warning-50)' }
    : { color: 'var(--teal-700)', background: 'var(--teal-50)' };
  return (
    <span className="font-semibold px-2.5 rounded-full shrink-0 inline-flex items-center" style={{ fontSize: 12, height: 24, ...colors }}>
      {children}
    </span>
  );
}

// Inline row action ("Skip October", "Undo"): 36px visual pill inside a 44px
// hit area, so the row keeps its density and the thumb still lands.
function PillButton({ children, onClick, filled, brand }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 flex items-center justify-center"
      style={{ minHeight: 44, padding: '4px 0', background: 'transparent', border: 0, cursor: 'pointer' }}
    >
      <span
        className="rounded-full px-4 font-semibold inline-flex items-center"
        style={{
          height: 36, fontSize: 13,
          background: filled ? brand.primary : '#fff',
          color: filled ? '#fff' : 'var(--ink-2)',
          border: filled ? '1px solid transparent' : '1px solid var(--line)',
        }}
      >
        {children}
      </span>
    </button>
  );
}

/**
 * One row in a settings list. The icon chip is one tint family for the whole
 * list (brand.primary on an 8% brand tint, 36px, radius 12); `tone="danger"`
 * is reserved for the destructive Delete Account row. Pass `toggle` for a
 * switch row: the WHOLE row flips the value and the Toggle (components/ui)
 * stops propagation so a tap on the switch itself does not flip it twice.
 * A toggle row renders as a div with role="button" because the Toggle is a
 * <button> and a button may not nest inside another button.
 */
function SettingRow({ icon, label, sub, right, onPress, tone = 'brand', toggle, note }) {
  const brand = useTheme();
  const chip = tone === 'danger'
    ? { background: 'var(--danger-50)', color: 'var(--danger)' }
    : { background: `${brand.primary}14`, color: brand.primary };
  const press = toggle ? () => toggle.onChange(!toggle.checked) : onPress;
  const inner = (
    <>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={chip} aria-hidden="true">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 font-semibold" style={{ fontSize: 14 }}>{label}</p>
        {sub && <p className="mt-0.5" style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--slate)' }}>{sub}</p>}
        {note && <p className="mt-1 font-semibold" style={{ fontSize: 12, color: 'var(--warning)' }}>{note}</p>}
      </div>
      {toggle
        ? <Toggle checked={toggle.checked} onChange={toggle.onChange} label={label} color={brand.primary} />
        : right}
    </>
  );
  const cls = 'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors';
  if (toggle) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={press}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); } }}
        className={`${cls} cursor-pointer active:bg-gray-50`}
        style={{ minHeight: 44 }}
      >
        {inner}
      </div>
    );
  }
  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={`${cls} active:bg-gray-50`} style={{ minHeight: 44 }}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} style={{ minHeight: 44 }}>
      {inner}
    </div>
  );
}

function SkipConfirmModal({ show, onClose, monthName, paragraphs, brand }) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ ...scrim('dim'), zIndex: Z.modalScrim }}
            onClick={onClose}
          />
          {/* Centering translate lives in framer-motion's x/y props, NOT style.transform:
              framer-motion owns the transform property during the scale animation and
              would overwrite a hand-written translate(-50%, -50%). */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="absolute left-1/2 top-1/2 bg-white p-6 text-center"
            style={{ width: 'min(320px, 88%)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-3)', zIndex: Z.modal }}
            role="dialog"
            aria-modal="true"
            aria-label={`${monthName} skipped`}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: `${brand.primary}14`, color: brand.primary }}
              aria-hidden="true"
            >
              <SkipForward size={22} />
            </div>
            <h3 className="font-bold text-gray-900 mb-2" style={{ fontSize: 18 }}>{monthName} skipped</h3>
            {/* The prose is NOT typed here: it is skipConfirmParagraphs() from
                lib/donorContent, so this sheet and the web portal's skip modal
                are string-identical. That module also owns the honesty rule -
                the "only charged in the months you give" sentence and the "$1 app
                fee is not waived" sentence always ship together - and it derives
                the multiplier from the REAL pending feeMonths rather than a
                hardcoded 2, so skipping two months running honestly reads $1 × 3. */}
            {paragraphs.map((para, i) => (
              <p
                key={i}
                className={`text-left ${i === paragraphs.length - 1 ? 'mb-5' : 'mb-2'}`}
                style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}
              >
                {para}
              </p>
            ))}
            <Button size="md" onClick={onClose}>Got it</Button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * THE billing explanation, as a popup.
 *
 * It used to render inline as a five-paragraph card, which is a wall of
 * reference text sitting permanently between two things a donor actually came
 * to change. It is now one row that opens this modal, so the text is one tap
 * away instead of always underfoot.
 *
 * The prose is NOT inlined here: it comes from billingExplainer() in
 * lib/donorContent, which stays the single source shared with every other
 * surface. This component only lays it out.
 *
 * Same centred-modal shape as SkipConfirmModal above, including the framer-motion
 * centring trap: the -50% translate lives in the x/y props, never in
 * style.transform, because framer-motion owns transform during the scale
 * animation (see AppDownloadQRModal.jsx for the full note).
 */
function BillingExplainerModal({ show, onClose, paragraphs, brand }) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ ...scrim('dim'), zIndex: Z.modalScrim }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="absolute left-1/2 top-1/2 bg-white flex flex-col"
            style={{ width: 'min(340px, 90%)', maxHeight: '78%', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-3)', zIndex: Z.modal }}
            role="dialog"
            aria-modal="true"
            aria-label="How billing works"
          >
            <div className="flex items-center justify-between pl-5 pr-3 pt-3 pb-2 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${brand.primary}14`, color: brand.primary }}
                  aria-hidden="true"
                >
                  <Receipt size={18} />
                </div>
                <h3 className="font-bold text-gray-900" style={{ fontSize: 18 }}>How billing works</h3>
              </div>
              {/* 44x44 hit area around a 32px visual circle. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-11 h-11 flex items-center justify-center shrink-0"
                style={{ background: 'transparent', border: 0 }}
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface)' }}>
                  <X size={16} style={{ color: 'var(--ink-2)' }} />
                </span>
              </button>
            </div>
            {/* Hairlines between paragraphs, exactly as the old card had them, so
                each fact can still be found on its own. */}
            <div className="px-5 pb-5 overflow-y-auto pc-scrollbar">
              {paragraphs.map((para, i) => (
                <div key={i}>
                  {i > 0 && <div className="h-px" style={{ background: 'var(--line)' }} />}
                  <p className="py-3" style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>{para}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1×', desc: 'Standard round-up' },
  { value: 2, label: '2×', desc: 'Double your impact' },
  { value: 3, label: '3×', desc: 'Triple your impact' },
];

// Bank debit (ACH) is demo-only until the real bank-debit authorization is
// built: ChangePaymentSheet filters it out unless demo affordances are on.
const PAYMENT_METHOD_OPTIONS = [
  { id: 'ach',       demoOnly: true, icon: <Landmark size={20} />, label: 'Bank Account',          sub: 'Direct bank transfer · Includes flat $1/month app fee' },
  { id: 'apple_pay', icon: <AppleLogo size={20} />, label: 'Apple Pay',              sub: 'Set up once, fully automatic · Includes flat $1/month app fee' },
  { id: 'card',      icon: <CreditCard size={20} />, label: 'Credit or Debit Card',   sub: 'Visa, Mastercard, Amex, or Discover · Includes flat $1/month app fee' },
];

const PAYMENT_TYPE_ICON = { ach: <Landmark size={18} />, apple_pay: <AppleLogo size={16} />, card: <CreditCard size={18} /> };

// The card form is the shared StripeCardForm: it loads Stripe.js lazily when
// the sheet mounts (never at import time) through lib/stripeSetup's one
// loader, so a flaky js.stripe.com no longer puts an unhandled "Failed to load
// Stripe.js" rejection in the console of every screen that imports Settings.
// Its onSuccess payload ({ id, last4, brand, name, simulated }) is exactly what
// handleCardAdded already consumes.
function AddCardSheet({ show, onClose, onAdd, brand }) {
  return (
    <Sheet show={show} onClose={onClose} title="Add a Payment Card">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-4">
        {show && (
          <StripeCardForm
            variant="app"
            brand={brand}
            appName={brand.appName}
            onSuccess={card => { onAdd(card); onClose(); }}
          />
        )}
      </div>
    </Sheet>
  );
}

function PrivacySheet({
  show, onClose,
  onDeleteAccount,
  adminOrgName,
  provider,
  onDownloadData,
  biometric, onBiometricChange,
  dataSharing, onDataSharingChange,
  productUpdates, onProductUpdatesChange,
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(null); // { local } once the delete succeeded
  const [error, setError] = useState(null);

  // The delete is awaited and the "deleted" copy only shows when it really
  // happened (result.ok). A failure keeps the sheet open with an error so the
  // donor can retry; a local-only result (demo / no account) says "(demo)".
  async function handleDelete() {
    setShowDeleteConfirm(false);
    setDeleting(true);
    setError(null);
    const r = await closeResult(() => onDeleteAccount?.());
    if (!r.ok) { setDeleting(false); setError(CLOSE_ERROR); return; }
    setDeleted({ local: !!r.local });
  }

  // 2FA is handled by the sign-in method, so the line has to say which one.
  const twoFactorSub = provider === 'apple' || provider === 'google'
    ? 'Managed by your sign-in provider (Apple / Google)'
    : 'Each sign-in uses a one-time code sent to your email';

  const group = { background: 'var(--surface)', borderRadius: 'var(--r-md)' };
  const hairline = <div className="h-px mx-4" style={{ background: 'var(--line)' }} />;

  return (
    <Sheet show={show} onClose={onClose} title="Privacy & Security">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-5 pt-4 space-y-4">

        {deleting && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 text-center"
            style={group}
            role="status"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: deleted ? 'var(--teal-50)' : 'var(--line)', color: deleted ? 'var(--teal-700)' : 'var(--ink-2)' }}
              aria-hidden="true"
            >
              {deleted ? <CheckCircle size={22} /> : <Loader2 size={22} className="animate-spin" />}
            </div>
            {deleted ? (
              <>
                <p className="font-bold text-gray-900">{adminOrgName ? 'Your giving account is deleted.' : 'Account Deleted'}</p>
                <p className="mt-1" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                  {adminOrgName ? `Your admin account for ${adminOrgName} is untouched.` : 'Your data has been removed.'}
                  {deleted.local ? ' (demo)' : ''}
                </p>
              </>
            ) : (
              <p className="font-bold text-gray-900">Deleting your account…</p>
            )}
          </motion.div>
        )}

        {!deleting && (
          <>
            {/* Security */}
            <div className="overflow-hidden" style={group}>
              <SectionLabel>Security</SectionLabel>
              <SettingRow
                icon={<Fingerprint size={18} />}
                label="Face ID / Touch ID"
                sub="Require biometrics to open app"
                toggle={{ checked: biometric, onChange: onBiometricChange }}
              />
              {hairline}
              {/* 2FA is managed by the sign-in method - no in-app toggle */}
              <SettingRow
                icon={<Shield size={18} />}
                label="Two-Factor Authentication"
                sub={twoFactorSub}
                right={null}
              />
            </div>

            {/* Privacy */}
            <div className="overflow-hidden" style={group}>
              <SectionLabel>Privacy</SectionLabel>
              <SettingRow
                icon={<Eye size={18} />}
                label="Anonymous Analytics"
                sub="Help us improve the app (no personal data)"
                toggle={{ checked: dataSharing, onChange: onDataSharingChange }}
              />
              {hairline}
              {/* PocketCache's OWN mail, separate from the nonprofit's updates
                  toggle on the main screen: two different senders. */}
              <SettingRow
                icon={<Bell size={18} />}
                label="PocketCache product updates"
                sub="Product news only - PocketCache never asks you for donations"
                toggle={{ checked: productUpdates, onChange: onProductUpdatesChange }}
              />
              {hairline}
              <SettingRow
                icon={<FileText size={18} />}
                label="Privacy Policy"
                sub="Read our full data practices"
                onPress={() => window.open('/legal/privacy/', '_blank')}
                right={<ExternalLink size={14} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />}
              />
              {hairline}
              <SettingRow
                icon={<FileText size={18} />}
                label="Terms of Service"
                sub="Review your user agreement"
                onPress={() => window.open('/legal/terms/', '_blank')}
                right={<ExternalLink size={14} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />}
              />
            </div>

            {/* Your Data */}
            <div className="overflow-hidden" style={group}>
              <SectionLabel>Your Data</SectionLabel>
              {/* Download My Data: generates a JSON export of the donor's record */}
              <SettingRow
                icon={<FileText size={18} />}
                label="Download My Data"
                sub="Get a copy of everything we have"
                onPress={onDownloadData}
                right={<ChevronRight size={16} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />}
              />
              {hairline}
              <SettingRow
                icon={<Trash2 size={18} />}
                label="Delete Account"
                sub="Permanently remove all data"
                tone="danger"
                onPress={() => setShowDeleteConfirm(true)}
                right={<ChevronRight size={16} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />}
              />
            </div>

            {error && (
              <p role="alert" className="px-3 py-2" style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-50)', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)' }}>
                {error}
              </p>
            )}

            {/* Delete confirm */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-5"
                  style={{ background: 'var(--danger-50)', border: '1px solid #FECACA', borderRadius: 'var(--r-md)' }}
                >
                  <p className="font-bold mb-1" style={{ color: '#991B1B' }}>Delete your account?</p>
                  <p className="mb-4" style={{ fontSize: 14, color: '#991B1B' }}>
                    This will permanently remove all your data, donation history, and linked cards. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="secondary" size="md" onClick={() => setShowDeleteConfirm(false)}>
                      Cancel
                    </Button>
                    {/* The one filled-red button: the final destructive confirm. */}
                    <Button tone="danger" size="md" onClick={handleDelete}>
                      Yes, Delete
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SwitchOrgSheet({ show, onClose, onBind, showDemo }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const np = await resolveOrgByCode(code);
    if (!np) {
      setError('Code not found. Ask your nonprofit for their PocketCache code.');
      return;
    }
    if (isOrgPending(np)) {
      // Still awaiting the platform owner's approval - held back from donors.
      setError(ORG_PENDING_MESSAGE);
      return;
    }
    onBind(np);
    onClose();
    setCode('');
    setError(null);
  }

  return (
    <Sheet show={show} onClose={onClose} title="Switch Nonprofit">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        <p className="mb-5" style={{ fontSize: 14, color: 'var(--ink-2)' }}>Enter a new nonprofit code to re-bind to a different organization.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="text"
              aria-label="Nonprofit code"
              placeholder="Enter code (e.g. BGCA)"
              value={code}
              onChange={e => { setCode(e.target.value); setError(null); }}
              className="w-full bg-white px-4 outline-none transition-colors font-mono uppercase"
              style={{ height: 48, fontSize: 16, borderRadius: 'var(--r-sm)', border: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}` }}
            />
            {error && <p className="mt-1 px-1" style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>}
            {/* The demo code is demo scaffolding: only when demo affordances are on. */}
            <p className="mt-1 px-1" style={{ fontSize: 13, color: 'var(--slate)' }}>
              Ask your nonprofit for their code.{showDemo ? ' · Demo code: BGCA' : ''}
            </p>
          </div>
          <Button type="submit" disabled={!code}>
            Switch Nonprofit →
          </Button>
        </form>
      </div>
    </Sheet>
  );
}

/**
 * App icon - PREVIEW ONLY, and it says so.
 *
 * This sheet used to offer a radio choice between the PocketCache icon and a
 * BGCA one. Tapping it moved a radio dot and nothing else: iOS can only swap a
 * home-screen icon through UIApplication.setAlternateIconName, with every
 * alternate icon compiled into the app bundle and declared in Info.plist. The
 * iOS project has neither, and the app remote-loads its web bundle, so no
 * amount of JavaScript shipped from here can change the icon on a phone. The
 * control was therefore a lie: the donor picked BGCA, the home screen never
 * changed.
 *
 * It is kept rather than deleted because it is a real anchor-partner selling
 * point for nonprofit partners, and losing it loses the pitch. So it is now
 * plainly a preview of what arrives with the App Store build: nothing is
 * selectable, nothing claims to have changed, and the current icon is labelled
 * as the current icon. See PRELAUNCH.md for what shipping it for real needs.
 */
function AppIconSheet({ show, onClose, brand, nonprofit }) {
  // The anchor-partner icon is the donor's OWN bound nonprofit, not a hardcoded
  // BGCA - "Preview the BGCA icon" is wrong for a donor bound to any other org.
  const orgName = nonprofit?.shortName ?? nonprofit?.name ?? 'your nonprofit';
  return (
    <Sheet show={show} onClose={onClose} title="App Icon">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5 space-y-4">
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A', borderRadius: 'var(--r-md)' }}>
          <Lock size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} aria-hidden="true" />
          <div>
            <p className="font-bold" style={{ fontSize: 14, color: 'var(--warning)' }}>Not available yet</p>
            <p className="mt-0.5" style={{ fontSize: 13, color: 'var(--warning)' }}>
              You can&apos;t change your icon from here. This is a preview of an anchor-partner perk that arrives with the App Store version.
            </p>
          </div>
        </div>

        <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
          Swapping the icon on your home screen is something iOS only lets an app do from a full app update, so it ships with a new App Store build rather than a change we can send to your phone today.
        </p>

        <div className="space-y-3">
          {[
            { id: 'pocketcache', label: 'PocketCache icon', sub: 'Your icon today', partner: false, badge: 'Current', tone: 'teal' },
            { id: 'partner', label: `${orgName} icon`, sub: 'Anchor partner perk', partner: true, badge: 'Coming soon', tone: 'warning' },
          ].map(opt => (
            <div
              key={opt.id}
              className="w-full flex items-center gap-4 p-4"
              style={opt.id === 'pocketcache'
                ? { borderRadius: 'var(--r-md)', border: `1px solid ${brand.primary}`, background: brand.accentLight }
                : { borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface)' }}
            >
              {opt.partner && nonprofit ? (
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden"
                  style={{ background: '#fff', border: '1px solid var(--line)', opacity: 0.55, boxShadow: 'var(--shadow-1)' }}>
                  <OrgLogo nonprofit={nonprofit} size={12} rounded="2xl" />
                </div>
              ) : (
                // The real app icon: navy tile with the official coin (gold + teal block arrow)
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--navy)', border: `1px solid ${brand.primary}`, boxShadow: 'var(--shadow-1)' }}>
                  <CoinMark size={30} />
                </div>
              )}
              <div className="text-left flex-1 min-w-0">
                <p className="font-semibold text-gray-900" style={{ fontSize: 14 }}>{opt.label}</p>
                <p style={{ fontSize: 13, color: 'var(--slate)' }}>{opt.sub}</p>
              </div>
              <StatusPill tone={opt.tone}>{opt.badge}</StatusPill>
            </div>
          ))}
        </div>

        <p className="text-center px-2" style={{ fontSize: 13, color: 'var(--slate)' }}>
          Custom icons are an anchor nonprofit partner benefit. Everyone else keeps the PocketCache icon.
        </p>
      </div>
    </Sheet>
  );
}

/**
 * Close my account.
 *
 * MONEY RULES (business-model defaults adopted 2026-11-07):
 *   - Chargeable round-ups under $0.50: nothing to send. No final charge is
 *     offered, no cover toggle, no breakdown - closing costs nothing. A
 *     fee-only charge is never offered.
 *   - $0.50 or more (even under the $5 floor): the donor may send their
 *     round-ups as a final gift. The amount is round-ups + processing cover.
 *     The $1 app fee is NOT collected anywhere yet (billing.APP_FEE_LIVE), so
 *     a real account sees it as a line outside the total
 *     (appFeePendingLine); demo mode itemizes it and adds it in.
 *   - Closing without donating never charges the accrued amount.
 *
 * The close itself is awaited (onConfirm -> AppContext.cancelAccount). The
 * success copy renders only when the result is ok; a failure keeps the sheet
 * open with CLOSE_ERROR; a local-only result (demo / no account) adds "(demo)".
 */
function CancelSheet({ show, onClose, pendingRoundUps, nonprofit, onDonate, onConfirm, onDone }) {
  const { feeMonths, monthlyCap, chargeAdjustment, coverProcessing: coverPref, demoActive } = useApp();
  const [result, setResult] = useState(null); // 'donated' | 'cancelled'
  const [local, setLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Seeded from the donor's STANDING preference, not a hardcoded true: someone
  // who turned the cover off in Settings should not find it silently re-ticked
  // on the way out. It stays local from there - this is a one-off final gift,
  // so changing it here must not rewrite the standing preference of an account
  // the donor is about to close.
  const [coverProcessing, setCoverProcessing] = useState(coverPref);

  useEffect(() => {
    if (result) {
      const t = setTimeout(() => { onDone?.(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [result, onDone]);

  const orgShort = nonprofit?.shortName ?? 'your cause';
  // A real account is one that is signed in and not showing demo numbers.
  const realAcct = !demoActive;

  // The final gift is a CHARGE, so it obeys the same precedence every other
  // charge does - via lib/billing, not local math, so the app and the web portal
  // cannot drift. It used to bill the raw round-ups, which broke the cap's whole
  // promise ("we only charge up to your cap") on the way out the door.
  const rawAmount = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  const chargeable = effectiveCharge({ pendingRoundUps: rawAmount, monthlyCap, chargeAdjustment });
  const trimmed = chargeable < rawAmount;
  const nothingToSend = chargeable < 0.5;
  const includeFee = APP_FEE_LIVE || !realAcct;
  // Rate lives in lib/billing (processingCoverFor, a true gross-up), never as
  // local arithmetic: this figure has to match what Settings quotes.
  const processingCover = processingCoverFor(chargeable);
  const finalTotal = chargeTotal({
    pendingRoundUps: rawAmount, monthlyCap, chargeAdjustment, feeMonths, includeFee,
    processingCover: coverProcessing ? processingCover : 0,
  });

  async function finish(final) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await closeResult(() => onConfirm?.({ final }));
    setBusy(false);
    if (!r.ok) { setError(CLOSE_ERROR); return; }
    // Local-only (demo) close: bump the demo lifetime total the way it always
    // did. A real close is recorded by the server, not here.
    if (final === 'donate' && r.local) onDonate?.(chargeable);
    setLocal(!!r.local);
    setResult(final === 'donate' ? 'donated' : 'cancelled');
  }

  const demoSuffix = local ? ' (demo)' : '';
  const helper = { fontSize: 13, lineHeight: 1.5, color: 'var(--slate)' };

  return (
    <Sheet show={show} onClose={() => { onClose(); setResult(null); setError(null); }} title="Before you go…">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        {result === 'donated' ? (
          <div className="text-center py-8" role="status">
            <div className="text-5xl mb-4">💚</div>
            <p className="font-bold text-gray-900" style={{ fontSize: 18 }}>Donated! Your account is closed.</p>
            <p className="mt-2" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              Thank you for your final donation to {orgShort}. Round-ups have stopped and your linked card is removed - nothing further is charged.{demoSuffix}
            </p>
          </div>
        ) : result === 'cancelled' ? (
          <div className="text-center py-8" role="status">
            <div className="text-5xl mb-4">👋</div>
            <p className="font-bold text-gray-900" style={{ fontSize: 18 }}>Account closed</p>
            <p className="mt-2" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              This month&apos;s round-ups won&apos;t be charged  -  as if the month never happened. Your linked card is removed and nothing further is charged.{demoSuffix}
            </p>
          </div>
        ) : (
          <>
            {nothingToSend ? (
              <p className="mb-4" style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                You have no round-ups to send - closing costs nothing.
              </p>
            ) : (
              <>
                <p className="mb-3" style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                  You&apos;ve rounded up <strong className="text-gray-900">${fmtMoney(rawAmount)}</strong> for {orgShort} this month.
                  Would you like to make this month&apos;s donation before closing your account?
                </p>
                {/* Final gift breakdown */}
                <div className="p-4 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
                  <p className="font-semibold uppercase mb-2" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--slate)' }}>Final donation</p>
                  <div className="flex justify-between items-center mb-1.5">
                    <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Round-ups</span>
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {trimmed
                        ? <><s className="font-normal" style={{ color: 'var(--muted)' }}>${fmtMoney(rawAmount)}</s> ${fmtMoney(chargeable)}</>
                        : `$${fmtMoney(rawAmount)}`}
                    </span>
                  </div>
                  {trimmed && (
                    <p className="mb-1.5" style={{ fontSize: 12, color: 'var(--warning)' }}>
                      {chargeAdjustment !== null && chargeAdjustment !== undefined
                        ? `Adjusted to $${fmtMoney(chargeable)} for this month  -  the rest is never charged.`
                        : `Capped at $${fmtMoney(monthlyCap)}/month  -  the rest is never charged.`}
                    </p>
                  )}
                  {coverProcessing && (
                    <div className="flex justify-between items-center mb-1.5">
                      <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>Processing cover</span>
                      <span className="tabular-nums" style={{ fontSize: 14, color: 'var(--ink-2)' }}>+${fmtMoney(processingCover)}</span>
                    </div>
                  )}
                  {includeFee ? (
                    <div className="flex justify-between items-center mb-1.5">
                      <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>App fee  -  $1 x {feeMonths} month{feeMonths !== 1 ? 's' : ''} (not tax-deductible)</span>
                      <span className="tabular-nums" style={{ fontSize: 14, color: 'var(--ink-2)' }}>+${fmtMoney(feeMonths)}</span>
                    </div>
                  ) : (
                    <p className="mb-1.5" style={{ fontSize: 12, color: 'var(--slate)' }}>{appFeePendingLine(feeMonths)}</p>
                  )}
                  <div className="h-px my-2" style={{ background: 'var(--line)' }} />
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-bold tabular-nums" style={{ color: 'var(--navy-deep)' }}>${fmtMoney(finalTotal)}</span>
                  </div>
                </div>
                <p className="mb-3 px-1" style={helper}>
                  If you close without donating, this amount is never charged.
                </p>
                {/* Custom checkbox: a visually hidden native input inside the label. */}
                <label
                  className="flex items-start gap-3 cursor-pointer p-3 mb-3"
                  style={{
                    minHeight: 44,
                    borderRadius: 'var(--r-md)',
                    background: coverProcessing ? 'var(--green-50)' : 'var(--surface)',
                    border: `1px solid ${coverProcessing ? '#A7F3D0' : 'var(--line)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={coverProcessing}
                    onChange={e => setCoverProcessing(e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all"
                    style={{ border: `2px solid ${coverProcessing ? 'var(--green)' : 'var(--muted)'}`, background: coverProcessing ? 'var(--green)' : '#fff' }}
                    aria-hidden="true"
                  >
                    {coverProcessing && <CheckCircle size={12} className="text-white" />}
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                    Cover {orgShort}&apos;s card-processing costs too  -  about ${fmtMoney(processingCover)} goes directly to them.
                    {!coverProcessing && ` Unchecked: ${orgShort} nets your round-ups minus standard card costs.`}
                  </span>
                </label>
                <Button onClick={() => finish('donate')} disabled={busy} loading={busy} className="mb-3">
                  {busy ? 'Closing…' : `Send $${fmtMoney(finalTotal)} & close account`}
                </Button>
                <p className="text-center mb-3" style={helper}>
                  One last charge (your round-ups{includeFee ? ' + the $1 app fee' : ''}), then nothing ever again. Closing stops round-ups and removes your linked card. There&apos;s never a fee for leaving.
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="px-3 py-2 mb-3" style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-50)', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)' }}>
                {error}
              </p>
            )}
            <Button variant="secondary" size="md" onClick={() => finish('waive')} disabled={busy} className="mb-3">
              {nothingToSend ? 'Close account' : 'Close without donating'}
            </Button>
            {/* CANCELLING, not skip-a-month. Cancelling really does waive the
                unpaid app fee (Terms section 12); skipping a month does not
                (Terms section 7). The old wording opened with "Skip it", which
                borrowed the skip feature's verb for the one flow where the fee
                genuinely disappears - so it read as confirmation that a skipped
                month is free. Named the flow instead, and said "unpaid app fees"
                rather than "all fees this month", because a rolled-forward fee
                from an earlier month is waived here too. */}
            <p className="text-center" style={helper}>
              {nothingToSend
                ? 'Closing stops round-ups, removes your linked card and waives any unpaid app fees. There is never a fee for leaving.'
                : 'Close without donating and your round-ups and any unpaid app fees are simply waived  -  like the month never happened. Your linked card is removed and never a fee for leaving.'}
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Normalize whatever card object a connect flow hands back into the shape
 * AppContext.trackedCard stores. Real Plaid gives { name, last4, brand,
 * institution, source: 'plaid', accountType, accountSubtype }; the practice
 * fallback gives the same minus the account fields with source 'practice';
 * the demo-only ManualCardForm (app variant) gives { id, name, emoji, last4,
 * source: 'manual' }. `source` is kept so the Settings row can carry a lasting
 * "Practice mode" label for anything that was not a real connection.
 */
function normalizeTrackedCard(card) {
  return {
    name: card.name,
    last4: card.last4,
    brand: card.brand ?? card.name,
    institution: card.institution ?? card.name,
    source: card.source ?? 'plaid',
    accountType: card.accountType,
    accountSubtype: card.accountSubtype,
  };
}

// Short label for a tracked/payment source that is not a real connection.
function sourceLabel(source) {
  if (source === 'practice') return 'Practice mode';
  if (source === 'manual') return 'Demo card';
  return null;
}

/**
 * Track a different card. The bank choice is the REAL Plaid Link flow
 * (components/PlaidBankConnect, the same one onboarding uses): the donor
 * picks their bank in Plaid's own window and trackedCard is set only from
 * what comes back. Nothing here invents a last4 any more. The typed-in card
 * form is demo scaffolding and only appears when demo affordances are on.
 */
function TrackCardSheet({ show, onClose, currentCard, onConnected, showDemo }) {
  const [connected, setConnected] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);

  function reset() {
    setConnected(null);
    setShowManualForm(false);
  }

  function handleDone() {
    onConnected(connected);
    onClose();
    reset();
  }

  const connectedTag = connected ? sourceLabel(connected.source) : null;

  // padBottom={false}: this sheet PINS its CTA footer to the bottom edge, so it
  // owns the home-indicator inset itself (on the footer, in the footer's tint).
  // Left to Sheet, the inset padding would land below the footer and render as
  // the sheet card's white, putting a white band under a tinted footer.
  return (
    <Sheet padBottom={false} show={show} onClose={() => { onClose(); reset(); }} title="Track a Different Card (Never Charged)">
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--teal-50)' }}>
        <div className="flex-1 px-4 pt-5 pb-2 space-y-3 overflow-y-auto">
          <p className="font-semibold uppercase px-1" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--slate)' }}>
            {currentCard ? `Currently tracking: ${currentCard.name} ···· ${currentCard.last4}` : 'No card linked yet'}
          </p>
          <p className="px-1" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>Pick the card you want us to watch. Read-only access  -  we never touch your money, just count round-ups. This card is never charged.</p>

          {connected ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-4 flex items-center gap-3 bg-white"
              style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--teal-100)' }}
              role="status"
            >
              <CheckCircle size={22} className="shrink-0" style={{ color: 'var(--teal-ui)' }} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ fontSize: 14, color: 'var(--teal-700)' }}>{connected.name} ····{connected.last4} connected</p>
                <p className="mt-0.5" style={{ fontSize: 13, color: 'var(--ink-2)' }}>We&apos;ll watch purchases and calculate round-ups as they happen</p>
              </div>
              {connectedTag && <StatusPill tone="warning">{connectedTag}</StatusPill>}
            </motion.div>
          ) : showManualForm ? (
            /* Shared with Onboarding and the web portal - see ManualCardForm.
               Demo-only (showDemo gate below): the card number is theatre and
               the form says so itself. */
            <ManualCardForm
              variant="app"
              onCancel={() => setShowManualForm(false)}
              onConnect={card => { setConnected(normalizeTrackedCard(card)); setShowManualForm(false); }}
            />
          ) : (
            <>
              <PlaidBankConnect
                variant="app"
                onConnected={card => setConnected(normalizeTrackedCard(card))}
              />
              {showDemo && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowManualForm(true)}
                  className="w-full flex items-center gap-3 p-4 text-left bg-white"
                  style={{ borderRadius: 'var(--r-md)', border: '1px dashed var(--teal-100)', minHeight: 44 }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--teal-50)' }} aria-hidden="true">
                    <CreditCard size={18} style={{ color: 'var(--teal-700)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900" style={{ fontSize: 14 }}>Enter a card manually</p>
                    <p style={{ fontSize: 13, color: 'var(--slate)' }}>Demo only  -  we keep just the last 4 digits</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />
                </motion.button>
              )}
            </>
          )}

          <div className="flex items-center gap-2 px-1 pt-1">
            <Lock size={12} className="shrink-0" style={{ color: 'var(--slate)' }} aria-hidden="true" />
            <p style={{ fontSize: 13, color: 'var(--slate)' }}>Read-only access via Plaid · Your bank credentials are never stored by PocketCache</p>
          </div>
        </div>

        {/* Pinned footer: the CTA has to clear the home indicator, so the old
            static pb-10 becomes the inset plus breathing room (see lib/safeArea).
            Because Sheet is called with padBottom={false}, this padding IS the
            sheet's whole bottom inset - and it carries the tint, so the tint
            runs through the safe-area strip instead of leaving white under
            the footer. Matches Sheet's own floor of 32 + 12 above the inset. */}
        <div
          className="px-4 pt-3"
          style={{ background: 'var(--teal-50)', borderTop: '1px solid var(--teal-100)', paddingBottom: safeBottomAtLeast(32, 12) }}
        >
          <Button onClick={handleDone} disabled={!connected}>
            {connected ? `Use ${connected.name} ····${connected.last4} →` : 'Connect a card to continue'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function ChangePaymentSheet({ show, onClose, brand, onMethodChanged, nonprofit, showDemo }) {
  const [selected, setSelected] = useState(null);
  const [setting, setSetting] = useState(false);
  const [done, setDone] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showApplePay, setShowApplePay] = useState(false);

  // Bank debit stays demo-only until a real bank-debit authorization exists.
  const options = PAYMENT_METHOD_OPTIONS.filter(o => !o.demoOnly || showDemo);

  function handleSelect(optId) {
    if (optId === 'card') {
      setShowAddCard(true);
      return;
    }
    if (optId === 'apple_pay') {
      setShowApplePay(true);
      return;
    }
    // 'ach' (demo only): simulated set-up, saved with simulated: true so the
    // Settings row keeps a lasting "Practice mode" label.
    setSelected(optId);
    setSetting(true);
    setTimeout(() => {
      setSetting(false);
      setDone(true);
    }, 1200);
  }

  function handleApplePaySuccess() {
    setSelected('apple_pay');
    setDone(true);
    setShowApplePay(false);
  }

  function handleCardAdded(card) {
    const method = { type: 'card', label: 'Credit or Debit Card', last4: card.last4, simulated: !!card.simulated };
    onMethodChanged(method);
    setShowAddCard(false);
    onClose();
    setSelected(null);
    setDone(false);
  }

  function handleConfirm() {
    const opt = PAYMENT_METHOD_OPTIONS.find(o => o.id === selected);
    const method = { type: selected, label: opt?.label ?? selected, last4: null, simulated: !!opt?.demoOnly };
    onMethodChanged(method);
    onClose();
    setSelected(null);
    setDone(false);
  }

  return (
    <>
      <Sheet show={show} onClose={() => { onClose(); setSelected(null); setDone(false); setSetting(false); }} title="Change Payment Method">
        {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
        <div className="px-4 pt-5 space-y-3">
          <p className="font-semibold uppercase px-1" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--slate)' }}>Choose your payment method</p>
          <p className="px-1 pb-1" style={{ fontSize: 14, color: 'var(--ink-2)' }}>Charged once a month for your round-ups total.</p>

          {options.map(opt => (
            <motion.button
              key={opt.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => !done && handleSelect(opt.id)}
              aria-busy={selected === opt.id && setting ? 'true' : undefined}
              className="w-full flex items-center gap-3 p-4 text-left transition-all"
              style={selected === opt.id
                ? { borderRadius: 'var(--r-md)', background: 'var(--gold-50)', border: '1px solid var(--gold)' }
                : { borderRadius: 'var(--r-md)', background: '#fff', border: '1px solid var(--line)' }
              }
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${brand.primary}14`, color: brand.primary }} aria-hidden="true">
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900" style={{ fontSize: 14 }}>{opt.label}</p>
                <p className="mt-0.5" style={{ fontSize: 13, color: 'var(--slate)' }}>{opt.sub}</p>
              </div>
              {selected === opt.id && setting && <span className="font-semibold shrink-0" style={{ fontSize: 12, color: 'var(--warning)' }}>Setting up…</span>}
              {selected === opt.id && done && <CheckCircle size={18} className="shrink-0" style={{ color: 'var(--teal-ui)' }} aria-hidden="true" />}
            </motion.button>
          ))}

          {done && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
              <Button onClick={handleConfirm}>Confirm →</Button>
            </motion.div>
          )}

          <p className="text-center px-2 pt-1" style={{ fontSize: 13, color: 'var(--slate)' }}>
            Payments are processed by Stripe  -  not us. Change this anytime.
          </p>
        </div>
      </Sheet>

      <AddCardSheet
        show={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAdd={handleCardAdded}
        brand={brand}
      />

      <ApplePaySheet
        show={showApplePay}
        payee={nonprofit?.name}
        onCancel={() => setShowApplePay(false)}
        onSuccess={handleApplePaySuccess}
      />
    </>
  );
}

/**
 * Change the donor's sign-in email - a REAL Supabase auth email change, not a
 * cosmetic field edit. See src/lib/emailChange.js for exactly what Supabase
 * does: updateUser({ email }) emails a confirmation LINK (this project has
 * secure/double email change on, so a link goes to BOTH the new and the
 * current address) and the change only lands once the link is opened. So this
 * sheet is honest about it: enter the new address, we send the link, and we
 * poll getUser() until the address actually flips - there is no fake "code
 * accepted" screen for a step the donor completes in their own inbox. On
 * confirmation we update pc_identity (via onChanged -> setHasAccount) and the
 * email-keyed server row (stripe_donors) via the update-donor-email function.
 */
function ChangeEmailSheet({ show, onClose, brand, currentEmail, onChanged }) {
  const [stage, setStage] = useState('enter'); // 'enter' | 'nosession' | 'sent' | 'done'
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setStage('enter'); setNewEmail(''); setError(null); setSending(false); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  // Poll for confirmation while the "check your inbox" state is showing. When
  // getUser()'s email flips to the new address the donor has clicked the link.
  useEffect(() => {
    if (stage !== 'sent') return;
    let cancelled = false;
    const id = setInterval(async () => {
      const { email } = await pollConfirmed();
      if (cancelled) return;
      if (email && email.toLowerCase() === newEmail.trim().toLowerCase()) {
        clearInterval(id);
        await syncServerEmail({ role: 'donor', oldEmail: currentEmail });
        if (cancelled) return;
        onChanged?.(newEmail.trim());
        setStage('done');
      }
    }, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [stage, newEmail, currentEmail, onChanged]);

  async function handleSend(e) {
    e?.preventDefault?.();
    const addr = newEmail.trim();
    if (!isValidEmail(addr)) { setError('Enter a valid email address.'); return; }
    if (addr.toLowerCase() === (currentEmail || '').toLowerCase()) { setError('That is already your email address.'); return; }
    setSending(true); setError(null);
    if (!(await hasRealSession())) { setSending(false); setStage('nosession'); return; }
    const res = await requestEmailChange(addr);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    setStage('sent');
  }

  const body = { fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' };

  return (
    <Sheet show={show} onClose={onClose} title="Change email address">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-4">
        {stage === 'done' ? (
          <div className="text-center py-8" role="status">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }} aria-hidden="true">
              <CheckCircle size={24} />
            </div>
            <p className="font-bold text-gray-900" style={{ fontSize: 18 }}>Email updated</p>
            <p className="mt-2" style={body}>You now sign in with <strong>{newEmail.trim()}</strong>.</p>
            <Button size="md" onClick={onClose} className="mt-5">Done</Button>
          </div>
        ) : stage === 'nosession' ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--warning-50)', color: 'var(--warning)' }} aria-hidden="true">
              <KeyRound size={22} />
            </div>
            <p className="font-bold text-gray-900">Sign in first</p>
            <p className="mt-2" style={body}>You need to sign in again before changing your email. Sign out and back in, then try again.</p>
            <Button variant="secondary" size="md" onClick={onClose} className="mt-5">Got it</Button>
          </div>
        ) : stage === 'sent' ? (
          <div className="py-4" data-testid="change-email-sent">
            <div className="px-4 py-4 mb-4" style={{ background: brand.accentLight, border: `1px solid ${brand.primary}33`, borderRadius: 'var(--r-md)' }}>
              <p className="font-bold text-gray-900 mb-1" style={{ fontSize: 14 }}>Check your inbox</p>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                We sent a confirmation link to <strong>{newEmail.trim()}</strong> and to your current address ({currentEmail}). Open the link in each email, then come back here - we&apos;ll update automatically.
              </p>
            </div>
            <div className="flex items-center gap-2 justify-center mb-4" style={{ fontSize: 13, color: 'var(--slate)' }} role="status">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Waiting for you to confirm…
            </div>
            <Button variant="secondary" size="md" onClick={onClose}>Close - I&apos;ll finish later</Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-3">
            <p className="mb-1" style={body}>Your sign-in email is <strong>{currentEmail}</strong>. Enter the new address you want to use.</p>
            <input
              type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
              aria-label="New email address"
              value={newEmail}
              onChange={e => { setNewEmail(e.target.value); setError(null); }}
              className="w-full bg-white px-4 outline-none transition-colors"
              style={{ height: 48, fontSize: 16, borderRadius: 'var(--r-sm)', border: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}` }}
            />
            {error && <p className="px-1" style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" disabled={!newEmail || sending} loading={sending}>
              {sending ? 'Sending…' : 'Send confirmation link'}
            </Button>
            <p className="text-center px-2" style={{ fontSize: 13, color: 'var(--slate)' }}>We&apos;ll email a link to confirm it&apos;s really you. Nothing changes until you open it.</p>
          </form>
        )}
      </div>
    </Sheet>
  );
}

// Edit name: the phone counterpart of the web portal's inline "Edit name"
// form. One field, saved through the same saveDisplayName the web uses.
function EditNameSheet({ show, onClose, currentName, onSave }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setName(currentName ?? ''), 0);
    return () => clearTimeout(id);
  }, [show, currentName]);

  const clean = name.trim();

  function handleSubmit(e) {
    e?.preventDefault?.();
    if (!clean) return;
    onSave(clean);
    onClose();
  }

  return (
    <Sheet show={show} onClose={onClose} title="Edit name">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="mb-1" style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            This is the name we greet you by. Your nonprofit sees it on your giving record.
          </p>
          <input
            type="text" autoComplete="name" placeholder="What should we call you?"
            aria-label="Your name" maxLength={60}
            data-testid="settings-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-white px-4 outline-none transition-colors"
            style={{ height: 48, fontSize: 16, borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}
          />
          <Button type="submit" disabled={!clean}>Save name</Button>
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        </form>
      </div>
    </Sheet>
  );
}

const CHEVRON = <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />;
const HAIRLINE = <div className="h-px mx-4" style={{ background: 'var(--line)' }} />;
const CARD_CLASS = 'bg-white overflow-hidden card-shadow';
const CARD_STYLE = { borderRadius: 'var(--r-md)' };

export default function Settings() {
  const {
    linkedCards, selectedNonprofit, roundUpMultiplier,
    setRoundUpMultiplier, totalDonated, setSelectedNonprofit, pendingRoundUps,
    boostDonation, cancelAccount, adminRole, deleteAccount,
    trackedCard, setTrackedCard, paymentMethod, setPaymentMethod,
    pendingSettingsAction, clearPendingSettingsAction, showToast,
    monthlyCap, setMonthlyCap, chargeAdjustment,
    coverProcessing, setCoverProcessing,
    skipNextCharge, setSkipNextCharge, feeMonths, hasAccount, setHasAccount,
    demoMode, setDemoMode, demoActive, serverCaps, saveDisplayName,
  } = useApp();
  const brand = useTheme();

  // realAcct: a signed-in donor looking at real numbers. demo: the flag every
  // screen keys its real-vs-demo choice on (AppContext.demoActive, with the
  // same derivation as a fallback). showDemo: should demo scaffolding (demo
  // code hint, typed-in card, bank debit) render on this surface at all.
  const realAcct = !!hasAccount && !demoMode;
  const demo = demoActive ?? (demoMode || !hasAccount);
  const showDemo = useShowDemoAffordances(demoMode);
  // Skip / cap / cover reach the server only once it advertises donor_settings.
  // Until then a real account sees PREVIEW_NOTE beside those controls instead
  // of a promise the charge will not keep.
  const previewNote = realAcct && !serverCaps?.donorSettings ? PREVIEW_NOTE : null;

  // All toggle preferences persisted to pc_prefs in localStorage
  const [prefs, setPrefsState] = useState(loadPrefs);
  function updatePref(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefsState(next);
    saveKey('pc_prefs', next);
  }

  const [commsOptin, setCommsOptinState] = useState(() => loadKey('pc_comms_optin', true));
  function updateCommsOptin(v) {
    setCommsOptinState(v);
    saveKey('pc_comms_optin', v);
  }

  // Face ID / Touch ID unlock  -  REAL WebAuthn enrollment, not a cosmetic pref.
  // Enabling triggers the OS biometric prompt; disabling removes the credential.
  // Enrolled under the signed-in identity; DEMO_USER only when there is none.
  const [bioEnrolled, setBioEnrolled] = useState(biometricEnrolled);
  async function handleBiometricChange(v) {
    if (v) {
      const ok = await biometricEnroll({ name: hasAccount?.name ?? DEMO_USER.name, email: hasAccount?.email ?? DEMO_USER.email });
      if (ok) { markSessionUnlocked(); setBioEnrolled(true); showToast('Face ID unlock is on 🙂'); }
      else showToast("Couldn't set up Face ID on this device.");
    } else {
      biometricDisable();
      setBioEnrolled(false);
      showToast('Face ID unlock turned off.');
    }
  }

  const [showMultiplier, setShowMultiplier] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSwitchOrg, setShowSwitchOrg] = useState(false);
  const [showAppIcon, setShowAppIcon] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showTrackCard, setShowTrackCard] = useState(false);
  const [showChangePayment, setShowChangePayment] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showEditName, setShowEditName] = useState(false);

  // Dates come from lib/billing, never from local math. skipTargetMonth() names
  // the cycle a skip can still stop: during the review window (days 1-10) that
  // is LAST month's locked cycle, the one charging on the 11th; from the 11th
  // on it is the month accruing now. The row, the modal, the export and the
  // server request (AppContext.setSkipNextCharge) all use this one answer.
  const skipTarget = skipTargetMonth();
  const skipMonthName = skipTarget.label;
  const chargeLabel = nextChargeLabel();
  // The charge AFTER the upcoming one (where a skipped cycle's $1 fee lands) and
  // the multiplier it lands as are derived inside lib/donorContent's skip copy,
  // from the same lib/billing helpers, so they are not recomputed here.

  useEffect(() => {
    if (pendingSettingsAction === 'change-payment') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowChangePayment(true);
      clearPendingSettingsAction();
    } else if (pendingSettingsAction === 'link-bank' || pendingSettingsAction === 'track-card') {
      // Dashboard's "Link a bank" button lands here: open the Plaid sheet.
      setShowTrackCard(true);
      clearPendingSettingsAction();
    } else if (pendingSettingsAction === 'how-billing') {
      // Home's 'How billing works' link lands here: open the explainer.
      setShowBilling(true);
      clearPendingSettingsAction();
    }
  }, [pendingSettingsAction, clearPendingSettingsAction]);

  // "Member since" from the real identity's joinedAt; the demo user's date only
  // in demo mode or with no account (lib/format owns the rule).
  const memberSince = memberSinceLabel(hasAccount, demo);

  // Identity comes from the signed-in account, exactly as the web portal reads
  // it; DEMO_USER is the fallback only. A name that is only a guess from the
  // email (nameGuessed) is never shown - Home refuses it too - so the title
  // falls back to the email and the avatar takes the email's first letter.
  const displayName = greetingNameFor(hasAccount) ?? hasAccount?.email ?? DEMO_USER.name;
  const userEmail = hasAccount?.email ?? DEMO_USER.email;
  const avatarInitial = ((hasAccount?.nameGuessed ? hasAccount.email : displayName) || '?')[0].toUpperCase();

  // THE billing explanation, from lib/donorContent - Settings is its only home
  // in the product now. Dates and window length come from lib/billing, never
  // from literals here. The floor is the fixed MONTHLY_FLOOR for everyone.
  const orgShort = selectedNonprofit?.shortName ?? 'your cause';
  const billingParagraphs = billingExplainer({
    orgShort,
    chargeDay: CHARGE_DAY,
    reviewDays: REVIEW_WINDOW_LAST_DAY,
  });

  // What the processing cover actually costs at today's numbers, quoted against
  // the amount that will really be charged (cap and one-time adjustment
  // applied), not the raw accrual - the processor takes its cut of the charge,
  // so quoting the accrual would overstate it whenever a cap is on. The figure
  // is lib/billing's gross-up, never local math.
  const chargeableThisMonth = effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment });
  const coverAmount = processingCoverFor(chargeableThisMonth);

  // ===== CANONICAL EXPORT SHAPE ==============================================
  // "Download My Data" is the donor's copy of their own record, and this object
  // is the canonical shape for BOTH surfaces: the app (here) and the web portal.
  // Keep them identical - if a field is added on one, add it on the other.
  //
  // RULE: donor-meaningful facts only. Never dump raw localStorage keys
  // (pc_page, pc_last_cycle, pc_seen_milestone, pc_review_ack and friends are
  // internal plumbing). A privacy feature that hands someone our storage schema
  // tells them nothing about themselves and everything about our internals.
  // Card numbers are never in here either - only brand and last4 ever exist
  // client-side, by design (see lib/manualCard.js).
  //
  // Identity is the signed-in account (DEMO_USER only when there is none) and
  // the monthly series is the demo dataset only while demo numbers are showing;
  // a real account gets an empty list and a note until the server export lands.
  function handleDownloadData() {
    const data = {
      exportedAt: new Date().toISOString(),
      user: {
        name: hasAccount?.name ?? DEMO_USER.name,
        email: hasAccount?.email ?? DEMO_USER.email,
        memberSince: joinedDateISO(hasAccount, demo),
      },
      cause: selectedNonprofit
        ? { id: selectedNonprofit.id, name: selectedNonprofit.name, ein: selectedNonprofit.ein }
        : null,
      giving: {
        totalDonated,
        pendingThisMonth: pendingRoundUps,
        roundUpMultiplier,
        monthlyCap,
        skippingCurrentMonth: skipNextCharge,
        skippedMonth: skipNextCharge ? skipMonthName : null,
        appFeeMonthsPending: feeMonths,
        nextChargeDate: chargeLabel,
      },
      monthlyHistory: demo ? MONTHLY_DATA.map(m => ({ month: m.month, year: m.year, donated: m.donated })) : [],
      ...(demo ? {} : { monthlyHistoryNote: 'History export from the server is coming soon' }),
      trackedCard: trackedCard
        ? { name: trackedCard.name, brand: trackedCard.brand, last4: trackedCard.last4, institution: trackedCard.institution }
        : null,
      paymentMethod: paymentMethod
        ? { type: paymentMethod.type, label: paymentMethod.label, last4: paymentMethod.last4 ?? null }
        : null,
      linkedCards: (linkedCards ?? []).map(c => ({ brand: c.brand, last4: c.last4 })),
      preferences: { ...prefs, accountEmailsAndNonprofitUpdates: commsOptin },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pocketcache-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!selectedNonprofit) return null;

  const trackedTag = trackedCard ? sourceLabel(trackedCard.source) : null;
  const paymentTag = paymentMethod?.simulated ? 'Practice mode' : null;

  return (
    <div className="flex flex-col h-full relative" style={{ background: 'var(--surface)' }}>
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pb-5"
        style={{ paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.3px' }}>Settings</h1>
            <p className="text-white/70 mt-0.5" style={{ fontSize: 14 }}>{brand.appName}</p>
          </div>
        </div>
      </motion.div>

      {/* pb-28 (112px) cleared the tab bar before the tab bar consumed
          --pc-safe-bottom. It now grows with the home-indicator inset, so this
          padding has to grow with it (see lib/safeArea). */}
      <div
        className="flex-1 scrollable pc-scrollbar px-4 space-y-4 pt-4"
        style={{ paddingBottom: safeBottomAtLeast(112, 106) }}
      >

        {/* Profile card  -  name/email from the signed-in account; joinedAt from
            the identity (demo user's date only in demo). No lifetime total here:
            Home's hero owns that figure, and repeating it was the whole reason
            the two disagreed. "Member since" moved into the right-hand column
            the total vacated, so the card keeps its two-column balance without
            duplicating a number. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-4 flex items-center gap-4 card-shadow"
          style={CARD_STYLE}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold"
            style={{ background: brand.gradient, fontSize: 22, boxShadow: 'var(--shadow-1)' }} aria-hidden="true">
            {avatarInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate" style={{ fontSize: 18 }}>{displayName}</p>
            {/* Ellipsis, not break-words: a long address used to split mid-word
                ("pocketcache.a / pp") beside the Member-since column. The full
                address is on the Change-email row just below. */}
            <p className="truncate" title={userEmail} style={{ fontSize: 14, color: 'var(--slate)' }}>{userEmail}</p>
            {/* Same affordance the web portal's identity line has; signed-in
                accounts only (the demo user has no name to save). */}
            {hasAccount && (
              <button
                type="button"
                onClick={() => setShowEditName(true)}
                data-testid="settings-name-edit"
                className="font-bold -ml-1"
                style={{ minHeight: 44, padding: '0 4px', fontSize: 13, color: 'var(--navy-deep)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline', borderRadius: 'var(--r-xs)' }}
              >
                Edit name
              </button>
            )}
          </div>
          {/* Quiet stat, same treatment the lifetime total used to get: a label
              over an ink value. Brand accent here read as an alert. */}
          <div className="text-right shrink-0">
            <p style={{ fontSize: 11, color: 'var(--slate)' }}>Member since</p>
            <p className="text-gray-900 font-bold" style={{ fontSize: 14 }}>{memberSince}</p>
          </div>
        </motion.div>

        {/* Account - sign-in email + demo mode. "Change email address" is a REAL
            Supabase auth email change (ChangeEmailSheet); "Demo mode" flips the
            app to sample numbers for a demo without touching real data. */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>Account</SectionLabel>
          <SettingRow
            icon={<Mail size={18} />}
            label="Change email address"
            sub={`Sign in with a different email · ${userEmail}`}
            onPress={() => setShowChangeEmail(true)}
            right={CHEVRON}
          />
          {HAIRLINE}
          {/* Demo mode: wired to the AppContext demoMode contract (setDemoMode).
              Optional-chained so it stays a safe no-op until that contract
              merges from the other agent's work. */}
          <SettingRow
            icon={<Sparkles size={18} />}
            label="Demo mode"
            sub="Show sample numbers for demos. Your real account data is untouched. Shaking the phone also toggles it."
            toggle={{ checked: !!demoMode, onChange: v => setDemoMode?.(v) }}
          />
        </motion.div>

        {/* Round-up settings */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>Round-Up Settings</SectionLabel>
          {previewNote && (
            <p className="text-[13px] text-slate px-4 -mt-1 mb-2" data-testid="preview-note">{PREVIEWS_NOTE}</p>
          )}
          <SettingRow
            icon={<Zap size={18} />}
            label="Multiplier"
            sub={`${roundUpMultiplier}×  -  ${MULTIPLIER_OPTIONS.find(o => o.value === roundUpMultiplier)?.desc}`}
            onPress={() => setShowMultiplier(true)}
            right={CHEVRON}
          />
          {HAIRLINE}
          <SettingRow
            icon={<SkipForward size={18} />}
            label="Skip a month"
            // Both states come from lib/donorContent so the row reads the same
            // here and in the web portal. The un-skipped state carries the fee
            // caveat too: this row is the decision point, and "Skip July's
            // charge" on its own was the one place a donor could opt in
            // believing the month was free.
            sub={skipNextCharge
              ? skipRowSub({ monthName: skipMonthName, feeMonths })
              : skipRowOfferSub(skipMonthName)}
            right={skipNextCharge ? (
              <PillButton brand={brand} onClick={() => setSkipNextCharge(false)}>
                Undo
              </PillButton>
            ) : (
              <PillButton brand={brand} filled onClick={() => { setSkipNextCharge(true); setShowSkipConfirm(true); }}>
                Skip {skipMonthName}
              </PillButton>
            )}
          />
        </motion.div>

        {/* Monthly Giving Cap */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>Monthly Giving Cap</SectionLabel>
          <SettingRow
            icon={<Target size={18} />}
            label="Monthly Cap"
            sub={monthlyCap === null ? 'No cap set' : `Capped at $${fmtMoney(monthlyCap)}/month`}
            toggle={{ checked: monthlyCap !== null, onChange: v => setMonthlyCap(v ? 20 : null) }}
          />
          <div className="px-4 pb-4">
            {monthlyCap !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-2 mt-1"
              >
                <div className="text-center py-1">
                  <span className="font-bold text-gray-900 tabular-nums" style={{ fontSize: 34 }}>${fmtMoney(monthlyCap)}</span>
                  <span className="ml-1" style={{ fontSize: 14, color: 'var(--slate)' }}>/month</span>
                </div>
                <input
                  type="range"
                  aria-label="Monthly cap"
                  min={MONTHLY_FLOOR}
                  max={200}
                  step={5}
                  value={monthlyCap}
                  onChange={e => setMonthlyCap(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: brand.primary, height: 44 }}
                />
                <div className="flex justify-between tabular-nums" style={{ fontSize: 12, color: 'var(--slate)' }}>
                  <span>${MONTHLY_FLOOR}</span>
                  <span>$200</span>
                </div>
              </motion.div>
            )}
            <p className="mt-2" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--slate)' }}>
              Cap what you give each month. If your round-ups go over, we only charge up to your cap  -  the rest is simply never charged.
            </p>
          </div>
        </motion.div>

        {/* Card We Track. No invented card: when nothing is linked the row says
            so and opens the Plaid flow. A practice/demo card keeps its label. */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>Card We Track  -  Never Charged</SectionLabel>
          {trackedCard ? (
            <SettingRow
              icon={<CreditCard size={18} />}
              label={trackedCard.name}
              sub={`•••• ${trackedCard.last4} · ${trackedTag ? 'Simulated card, nothing is connected' : 'Read-only via Plaid'}`}
              right={trackedTag ? <StatusPill tone="warning">{trackedTag}</StatusPill> : <StatusPill>Watching</StatusPill>}
            />
          ) : (
            <SettingRow
              icon={<CreditCard size={18} />}
              label="No card linked"
              sub="Link one and round-ups start counting from your next purchase"
              onPress={() => setShowTrackCard(true)}
              right={<span className="flex items-center gap-1 shrink-0 font-semibold" style={{ fontSize: 13, color: 'var(--navy-deep)' }}>Link one{CHEVRON}</span>}
            />
          )}
          {HAIRLINE}
          <SettingRow
            icon={<RefreshCw size={18} />}
            label="Track a different card"
            sub="Switch which card we watch for round-ups"
            onPress={() => setShowTrackCard(true)}
            right={CHEVRON}
          />
        </motion.div>

        {/* How You Pay */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>How You Pay  -  Your Payment Card</SectionLabel>
          {paymentMethod ? (
            <SettingRow
              icon={PAYMENT_TYPE_ICON[paymentMethod.type] ?? <CreditCard size={18} />}
              label={paymentMethod.label ?? 'Credit or Debit Card'}
              sub={paymentMethod.last4 ? `•••• ${paymentMethod.last4} · One monthly charge from ${orgShort}` : `One monthly charge from ${orgShort}`}
              right={paymentTag ? <StatusPill tone="warning">{paymentTag}</StatusPill> : <StatusPill>Active</StatusPill>}
            />
          ) : (
            <SettingRow
              icon={<CreditCard size={18} />}
              label="No payment method"
              sub={`Add one so ${orgShort} can receive your monthly round-ups`}
              onPress={() => setShowChangePayment(true)}
              right={<span className="flex items-center gap-1 shrink-0 font-semibold" style={{ fontSize: 13, color: 'var(--navy-deep)' }}>Add one{CHEVRON}</span>}
            />
          )}
          {HAIRLINE}
          <SettingRow
            icon={<RefreshCw size={18} />}
            label="Change payment method"
            sub={showDemo ? 'Bank account, Apple Pay, or card' : 'Apple Pay or card'}
            onPress={() => setShowChangePayment(true)}
            right={CHEVRON}
          />
          {HAIRLINE}
          {/* The STANDING processing-cover preference. It was previously a
              checkbox on the signup screen held in local state and thrown away
              at the end of onboarding, plus two more local copies inside the
              Give Extra and Cancel sheets - so a donor who agreed to cover the
              cost had no way to see it, no way to change it, and it never
              reached a monthly charge. It lives in AppContext now
              (pc_cover_processing) and this is where a donor changes their
              mind. The figure is quoted from lib/billing, not typed. */}
          <SettingRow
            icon={<Heart size={18} />}
            label="Cover processing costs"
            sub={coverAmount > 0
              ? `Adds about $${fmtMoney(coverAmount)} to your ${chargeLabel} charge so ${orgShort} keeps your full round-ups. Every cent of it goes to ${orgShort}, never to PocketCache.`
              : `Adds the card cost to your monthly charge so ${orgShort} keeps your full round-ups. Every cent of it goes to ${orgShort}, never to PocketCache.`}
            toggle={{ checked: coverProcessing, onChange: setCoverProcessing }}
          />
          {HAIRLINE}
          {/* THE billing explainer, now one row instead of five paragraphs of
              permanent wall text between two controls. The prose still comes
              from lib/donorContent (billingExplainer) - the modal only lays it
              out. This is the product's ONLY billing explanation; the Activity
              tab's competing banner is gone. */}
          <SettingRow
            icon={<Receipt size={18} />}
            label="How billing works"
            sub="When you're charged, who charges you, and what the $1 app fee is"
            onPress={() => setShowBilling(true)}
            right={CHEVRON}
          />
        </motion.div>

        {/* Current cause */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>Your Cause</SectionLabel>
          <SettingRow
            icon={<OrgLogo nonprofit={selectedNonprofit} size={8} rounded="xl" />}
            label={selectedNonprofit.name}
            sub={selectedNonprofit.category}
            right={<StatusPill>Active</StatusPill>}
          />
          {HAIRLINE}
          <SettingRow
            icon={<RefreshCw size={18} />}
            label="Switch Nonprofit"
            sub="Enter a new code to re-bind to a different nonprofit"
            onPress={() => setShowSwitchOrg(true)}
            right={CHEVRON}
          />
        </motion.div>

        {/* Preferences  -  persisted to localStorage */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>Preferences</SectionLabel>
          <SettingRow
            icon={<Bell size={18} />}
            label="Push Notifications"
            sub="Round-up alerts and impact updates - iPhone only"
            toggle={{ checked: prefs.notifications, onChange: v => updatePref('notifications', v) }}
          />
          {HAIRLINE}
          {/* The 1st-of-month charge notice is the 10-day review notice the
              whole billing model rests on, so it is a service message, not a
              preference: no toggle, "Always on" like the service emails below. */}
          <SettingRow
            icon={<Bell size={18} />}
            label="Charge notice"
            sub={`Exact amount emailed on the ${LOCK_DAY_ORDINAL}, charge runs the ${CHARGE_DAY_ORDINAL}`}
            right={<span className="font-semibold shrink-0" style={{ fontSize: 12, color: 'var(--slate)' }}>Always on</span>}
          />
          {HAIRLINE}
          {/* Split from a single "Account emails & nonprofit updates" toggle
              (Terms §4a): charge confirmations and account/security notices
              are mandatory service messages while the account is active and
              cannot be turned off. Tax receipts are NOT on this list - the
              nonprofit issues those, never PocketCache. Only the nonprofit's
              optional updates are a real toggle - pc_comms_optin keeps its
              existing storage key and semantics for that one. */}
          <SettingRow
            icon={<Bell size={18} />}
            label="Service emails"
            sub="Charge confirmations and account & security notices - required while your account is active (your tax receipt comes from your nonprofit)"
            right={<span className="font-semibold shrink-0" style={{ fontSize: 12, color: 'var(--slate)' }}>Always on</span>}
          />
          {HAIRLINE}
          <SettingRow
            icon={<Bell size={18} />}
            label="Nonprofit updates"
            sub="Optional giving updates and news from your nonprofit"
            toggle={{ checked: commsOptin, onChange: updateCommsOptin }}
          />
          {HAIRLINE}
          <SettingRow
            icon={<Shield size={18} />}
            label="Privacy & Security"
            sub="Biometrics, data, and permissions"
            onPress={() => setShowPrivacy(true)}
            right={CHEVRON}
          />
          {HAIRLINE}
          {/* App icon: a PREVIEW, and the row says so before the donor taps it.
              The sheet cannot change the icon and no longer pretends to - see
              AppIconSheet above for why iOS makes this a native-build feature. */}
          <SettingRow
            icon={<ImageIcon size={18} />}
            label="App Icon"
            sub={`iPhone only - preview the ${orgShort} anchor-partner icon, coming with the App Store version`}
            onPress={() => setShowAppIcon(true)}
            right={<StatusPill tone="warning">Preview</StatusPill>}
          />
        </motion.div>

        {/* Help & Support */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
          className={CARD_CLASS} style={CARD_STYLE}>
          <SectionLabel>Help &amp; Support</SectionLabel>
          <SettingRow
            icon={<HelpCircle size={18} />}
            label="Contact support"
            sub={SUPPORT_EMAIL}
            onPress={contactSupport}
            right={<ExternalLink size={14} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />}
          />
        </motion.div>

        {/* Footer. The app name keeps the tenant's text accent; the version
            line is one shared component (AppVersion) so a donor can quote a
            real build in a bug report. */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-2 py-4">
          {brand.brandLogoUrl ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden"
              style={{ background: '#fff', border: '1px solid var(--line)' }}>
              <img src={brand.brandLogoUrl} alt={brand.appName} className="w-full h-full object-contain p-1.5" style={{ display: 'block' }} />
            </div>
          ) : brand.logoEmoji ? (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
              style={{ background: brand.gradient }}>
              {brand.logoEmoji}
            </div>
          ) : <CoinMark size={32} />}
          <p className="font-bold" style={{ fontSize: 14, color: brand.textAccent }}>{brand.appName}</p>
          <p className="text-gray-500 flex items-center gap-1 justify-center" style={{ fontSize: 12 }}>
            <CoinMark size={14} /><AppVersion className="text-gray-500" />
          </p>
        </motion.div>

        {/* Close account (NOT a subscription - PocketCache is an account, not a
            recurring plan). Closing stops round-ups and removes the linked card;
            nothing further is charged. A quiet white row with the danger label,
            not a gray block that reads as a disabled primary button. */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <Button variant="secondary" size="md" onClick={() => setShowCancel(true)} style={{ color: 'var(--danger)' }}>
            Close my account
          </Button>
        </motion.div>

      </div>

      {/* Multiplier sheet */}
      <Sheet show={showMultiplier} onClose={() => setShowMultiplier(false)} title="Round-Up Multiplier">
        {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
        <div className="px-6 pt-4">
          <p className="mb-5" style={{ fontSize: 14, color: 'var(--ink-2)' }}>Multiply your round-ups to give more with every purchase.</p>
          <div className="space-y-3">
            {MULTIPLIER_OPTIONS.map((opt) => {
              const active = roundUpMultiplier === opt.value;
              return (
                <motion.button
                  key={opt.value}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setRoundUpMultiplier(opt.value); setShowMultiplier(false); }}
                  aria-pressed={active}
                  className="w-full flex items-center gap-4 p-4 text-left transition-all"
                  style={active
                    ? { borderRadius: 'var(--r-md)', border: `1px solid ${brand.primary}`, background: brand.accentLight }
                    : { borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                    style={active
                      ? { background: brand.primary, color: '#fff', fontSize: 18 }
                      : { background: '#fff', color: 'var(--ink-2)', fontSize: 18 }}
                    aria-hidden="true">
                    {opt.label}
                  </div>
                  <div>
                    <p className="font-semibold" style={{ fontSize: 14, color: active ? brand.textAccent : 'var(--ink)' }}>
                      {opt.label} Round-up
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--slate)' }}>{opt.desc}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>
          {/* When the multiplier takes effect, from lib/donorContent so the
              Terms and the web portal say the same thing. */}
          <p className="mt-4 px-1" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--slate)' }}>{MULTIPLIER_NOTE}</p>
        </div>
      </Sheet>

      {/* Track Card sheet - trackedCard is set only from what the connect flow
          returned; a practice/demo card is labelled as such, here and on the row. */}
      <TrackCardSheet
        show={showTrackCard}
        onClose={() => setShowTrackCard(false)}
        currentCard={trackedCard}
        showDemo={showDemo}
        onConnected={(card) => {
          setTrackedCard(card);
          showToast(card.source === 'plaid'
            ? `Now tracking ${card.name} ····${card.last4}. New purchases on this card count from now on.`
            : `Practice mode - ${card.name} ····${card.last4} is a sample card, nothing was connected.`);
        }}
      />

      {/* Change Payment sheet */}
      <ChangePaymentSheet
        show={showChangePayment}
        onClose={() => setShowChangePayment(false)}
        brand={brand}
        nonprofit={selectedNonprofit}
        showDemo={showDemo}
        onMethodChanged={(method) => {
          setPaymentMethod(method);
          showToast(method.simulated ? 'Practice mode - payment method saved as a sample.' : 'Payment method updated.');
        }}
      />

      {/* Privacy & Security sheet. The delete is awaited inside the sheet so
          its "deleted" copy only shows once the account really is. */}
      <PrivacySheet
        show={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        onDeleteAccount={() => deleteAccount()}
        adminOrgName={adminRole?.joinCode ?? null}
        provider={hasAccount?.provider}
        onDownloadData={handleDownloadData}
        biometric={bioEnrolled}
        onBiometricChange={handleBiometricChange}
        dataSharing={prefs.dataSharing}
        onDataSharingChange={v => updatePref('dataSharing', v)}
        productUpdates={!!prefs.productUpdates}
        onProductUpdatesChange={v => updatePref('productUpdates', v)}
      />

      {/* Switch Org sheet */}
      <SwitchOrgSheet
        show={showSwitchOrg}
        onClose={() => setShowSwitchOrg(false)}
        showDemo={showDemo}
        onBind={(np) => { setSelectedNonprofit(np); setShowSwitchOrg(false); }}
      />

      {/* App Icon sheet */}
      <AppIconSheet
        show={showAppIcon}
        onClose={() => setShowAppIcon(false)}
        brand={brand}
        nonprofit={selectedNonprofit}
      />

      {/* Cancel sheet. onConfirm hands the close to AppContext.cancelAccount
          and the sheet waits for its result before saying anything happened. */}
      <CancelSheet
        show={showCancel}
        onClose={() => setShowCancel(false)}
        pendingRoundUps={pendingRoundUps}
        nonprofit={selectedNonprofit}
        onDonate={(amount) => boostDonation(amount)}
        onConfirm={({ final }) => cancelAccount({ final })}
        onDone={() => setShowCancel(false)}
      />

      {/* How billing works - popup, text from lib/donorContent */}
      <BillingExplainerModal
        show={showBilling}
        onClose={() => setShowBilling(false)}
        paragraphs={billingParagraphs}
        brand={brand}
      />

      {/* Skip a month confirmation */}
      <SkipConfirmModal
        show={showSkipConfirm}
        onClose={() => setShowSkipConfirm(false)}
        monthName={skipMonthName}
        paragraphs={skipConfirmParagraphs({ monthName: skipMonthName, feeMonths })}
        brand={brand}
      />

      {/* Edit name - saveDisplayName writes it locally and to the server in
          one motion, the same call the web portal's Edit name uses. */}
      <EditNameSheet
        show={showEditName}
        onClose={() => setShowEditName(false)}
        currentName={hasAccount?.nameGuessed ? '' : (hasAccount?.name ?? '')}
        onSave={name => {
          if (typeof saveDisplayName === 'function') saveDisplayName(name);
          else if (hasAccount) setHasAccount({ ...hasAccount, name, nameGuessed: false });
          showToast('Name updated.');
        }}
      />

      {/* Change email address - real Supabase auth email change */}
      <ChangeEmailSheet
        show={showChangeEmail}
        onClose={() => setShowChangeEmail(false)}
        brand={brand}
        currentEmail={userEmail}
        onChanged={(email) => {
          // Update the local identity so every screen reads the new address.
          // setHasAccount with an already-real identity does NOT reset progress
          // (its reset branch is `stub && !hasAccount` only).
          if (hasAccount) setHasAccount({ ...hasAccount, email });
          showToast('Email updated.');
        }}
      />
    </div>
  );
}
