import { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import { PRIOR_MONTHS_SUM } from '../data/transactions';
import { findOrgByCode, resolveOrgByCode, isOrgPending } from './orgStore';
import { IDENTITY_KEYS, migrate, loadKey, saveKey, removeKeys, clearIdentityKeys } from './identityStore';
import { settleCycle, skipTargetMonth } from '../lib/billing';
import { pcBeacon } from '../lib/beacon.js';
import { fetchRoundupsMe, pushDonorProfile, closeDonorAccount } from '../lib/roundupsMe';
import { DEMO_DATASET } from '../lib/donorContent';
import { buildIdentity, greetingNameFor } from '../lib/donorAuth';
import { fmtFreshness } from '../lib/format';
import { getSupabase } from '../lib/supa';

// Donor-scoped keys — cleared on donor-account deletion; identity/admin keys survive.
// 'pc_skip_next' is the retired forever-boolean: kept in the list so the wipe
// paths still clear it on devices that predate the per-cycle skip record.
const DONOR_KEYS = [
  'pc_page', 'pc_tab', 'pc_cause_id', 'pc_multiplier', 'pc_cards', 'pc_total_donated',
  'pc_seen_milestone', 'pc_prefs', 'pc_account_status',
  'pc_has_account', 'pc_donor_role', 'pc_tracked_card', 'pc_payment_method',
  'pc_comms_optin', 'pc_monthly_cap', 'pc_charge_adjustment', 'pc_fee_months',
  'pc_bio', 'pc_bio_prompt_dismissed', 'pc_skip_next', 'pc_review_ack',
  'pc_skip_month', 'pc_last_cycle', 'pc_cover_processing', 'pc_demo_mode',
  // pc_demo_level is the retired round-3 progressive-level key: kept in the
  // list so the wipe paths still clear it on devices that predate the plain
  // on/off demo toggle.
  'pc_demo_level', 'pc_name_prompt_done',
  // A join link for ANOTHER nonprofit, parked until the donor confirms the
  // switch (see PendingOrgPrompt) - donor-scoped like the binding it would replace.
  'pc_pending_org',
];
// Keys cleared on explicit sign-out. The admin side's persisted org record and
// tab go too - a sign-out that left pc_np_org behind kept the last admin's
// org and email on the device for whoever signed in next. pc_np_admin_email_hint
// is deliberately NOT here: it is the admin sign-in's "remember my email".
const RESET_KEYS = [...DONOR_KEYS, 'pc_identity', 'pc_admin_role', 'pc_last_mode', 'pc_np_org', 'pc_np_tab'];

// The 4242 placeholders every device used to be seeded with. They are DEMO
// data: a real account that never linked anything used to see them in Settings
// marked Watching / Active. They now exist only as a derived overlay while
// demoActive (see trackedCard / paymentMethod / linkedCards below) and are
// never written to storage.
const DEMO_CARDS = [{ id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' }];
const DEFAULT_TRACKED_CARD = { name: 'Chase Sapphire', last4: '4242', brand: 'Visa', institution: 'Chase' };
const DEFAULT_PAYMENT_METHOD = { type: 'card', label: 'Credit or Debit Card', last4: '4242' };
const isDemoSeedCard = (c) => !!c && c.last4 === '4242' && c.name === 'Chase Sapphire';

// The read-only role the gate's "preview the admin side" shows. Never
// persisted: it lives in React state (previewAdmin) and is derived into the
// exposed `adminRole` only while the preview is on.
const PREVIEW_ADMIN_ROLE = { orgId: 'bgca', joinCode: 'BGCA', preview: true };

// Capabilities the deployed server advertises. Both false until roundups-me
// returns `capabilities` - today's deployed function does not, so every
// consumer treats these as "the server cannot do this yet".
const NO_CAPS = { donorSettings: false, donorClose: false };

// ?reset=1 / ?fresh=1: wipe EVERY pc_* key (not a fixed list - the old list
// left BGCA admin edits, the platform console gate, the last admin's org
// record and the prompt flags behind on a "fresh" device) plus sessionStorage.
// sb-* keys are left alone on purpose: Supabase's own signOut() clears its
// token once the network round-trip settles, and deleting it synchronously
// underneath that call races it.
function wipeAllPcKeys() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pc_')) doomed.push(k);
    }
    removeKeys(doomed);
  } catch { /* storage unavailable */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
}

// Check for ?reset=1 or ?fresh=1 on load — clear state so demo starts at the gate
if (typeof window !== 'undefined') {
  migrate();
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1' || params.get('fresh') === '1') {
    // Sign out of Supabase FIRST - a reset that only wipes the pc_* keys
    // below left the sb-*-auth-token session sitting in localStorage, so the
    // "fresh start" a reset link promises was not actually fresh: the next
    // page load silently rehydrated the old donor/admin session. Fire-and-
    // forget, same best-effort pattern as the explicit sign-out below in this
    // file - GoTrue's signOut() clears its own storage key once the network
    // round-trip settles, which does not need to be awaited before the
    // synchronous pc_* wipe that follows.
    getSupabase().auth.signOut().catch(() => { /* best-effort */ });
    wipeAllPcKeys();
    // Take ONLY reset/fresh back out of the URL, so a pull-to-refresh on the
    // same tab does not wipe the progress made since. signin/join/org/app
    // stay: App.jsx's appEntry initializer reads them after this block runs.
    params.delete('reset');
    params.delete('fresh');
    const rest = params.toString();
    try {
      window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    } catch { /* ignore */ }
  }
  // A scanned QR or shared join link (?org=CODE) is explicit donor intent —
  // route straight into onboarding so the gate auto-binds the scanned org,
  // for a device that is mid-demo or has no binding yet.
  // EXCEPTIONS:
  //   - a returning donor tapping their OWN org's link (micro-site "open my
  //     dashboard", re-scanned QR) goes straight back to wherever they were —
  //     the link doubles as "open the app".
  //   - a SIGNED-IN donor bound to a DIFFERENT org is asked, never silently
  //     re-bound: the code is parked under pc_pending_org and PendingOrgPrompt
  //     offers the switch ("Round-ups already collected this month still go
  //     to X"). donor_profiles.org_join_code is the only persisted record of
  //     where a donor's next charge goes, so a forwarded link or a mis-tapped
  //     QR must not change it with zero prompt (EDGE-CASES D12/C12).
  //   - the Stripe Connect return URL (/demo/?npstripe=return&org=<uuid>) is
  //     an admin round trip, not a donor join link - App.jsx already excludes
  //     it from its own ?org= routing, and so does this block now.
  if (params.get('org') && !params.get('npstripe')) {
    const code = params.get('org');
    const scanned = findOrgByCode(code);
    const signedInDonor = !!(loadKey(IDENTITY_KEYS.donorRole) && loadKey(IDENTITY_KEYS.identity));
    const currentCause = loadKey('pc_cause_id');
    const alreadyTheirs = signedInDonor && !!currentCause
      && (scanned ? currentCause === scanned.id : currentCause === code.trim().toLowerCase());
    if (alreadyTheirs) {
      // Their own link: just open the app.
    } else if (signedInDonor && currentCause) {
      saveKey('pc_pending_org', code.trim());
    } else {
      saveKey('pc_page', 'onboarding');
      removeKeys(['pc_cause_id']);
    }
  }
  migrateSkipKey();
  // Settle the cycle BEFORE any state initializer reads storage, so first paint
  // already shows the rolled-over fee and the expired skip.
  settleStoredCycle();
}

// Close out the billing cycle that just ended: a skipped month rolls its $1 fee
// onto the next charge ($1 × 2), a normally charged month puts the fee back to
// one month, and the one-month skip is always cleared. All the rules live in
// billing.settleCycle; this only persists the answer. Re-running inside the same
// cycle is a no-op, which is why it is safe to call again when the tab has been
// sitting open across midnight on the 1st. `serverFeeMonths` (roundups-me's
// fee_months, when the deployed server returns it) wins over the local count.
function settleStoredCycle(serverFeeMonths = null) {
  const result = settleCycle({
    lastCycle: loadKey('pc_last_cycle', null),
    skipMonth: loadKey('pc_skip_month', null),
    feeMonths: loadKey('pc_fee_months', 1),
    serverFeeMonths,
  });
  if (result.changed) {
    saveKey('pc_last_cycle', result.lastCycle);
    if (result.skipMonth) saveKey('pc_skip_month', result.skipMonth);
    else removeKeys(['pc_skip_month']);
    saveKey('pc_fee_months', result.feeMonths);
  }
  return result;
}

// Legacy 'pc_skip_next' was a bare boolean that never cleared itself, so one tap
// silently skipped every month after it. Translate a live skip into a record for
// the cycle the donor's next charge covers (their intent was "skip my next
// charge"), then retire the old key. Idempotent — only fires while the legacy
// key is still present.
function migrateSkipKey() {
  const legacy = loadKey('pc_skip_next', null);
  if (legacy === null) return;
  if (legacy === true && !loadKey('pc_skip_month', null)) {
    saveKey('pc_skip_month', skipTargetMonth().monthKey);
  }
  removeKeys(['pc_skip_next']);
}

// Dollars from a cents field the server may or may not send yet.
const centsToDollars = (c) => (Number.isFinite(c) ? c / 100 : null);
const dollarsToCents = (d) => (d === null || d === undefined ? null : Math.round(Number(d) * 100));

// roundups-me's `capabilities` -> the client's serverCaps shape. Absent -> both false.
function capsFrom(data) {
  const c = data?.capabilities;
  if (!c || typeof c !== 'object') return NO_CAPS;
  return { donorSettings: !!c.donor_settings, donorClose: !!c.donor_close };
}

// roundups-me's projection fields -> realProjection. `null` until the deployed
// server returns at least one of them (today's does not), so consumers fall
// back to the local billing.js math exactly as before.
function projectionFrom(data) {
  if (!data) return null;
  const has = (k) => data[k] !== undefined && data[k] !== null;
  if (!has('projected_total_cents') && !has('locked_cycle') && !has('fee_months') && !has('rollover_in_cents')) return null;
  const lc = data.locked_cycle && typeof data.locked_cycle === 'object' ? data.locked_cycle : null;
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  return {
    projectedTotalCents: num(data.projected_total_cents, 0),
    rolloverInCents: num(data.rollover_in_cents, 0),
    baseTotalCents: num(data.base_total_cents, num(data.pending_total_cents, 0)),
    lockedCycle: lc ? {
      monthKey: lc.month_key ?? null,
      status: lc.status ?? null,
      totalCents: num(lc.total_cents, 0),
      adjustedTotalCents: num(lc.adjusted_total_cents, num(lc.total_cents, 0)),
      chargeDate: lc.charge_date ?? null,
    } : null,
    feeMonths: num(data.fee_months, null),
    willRollForward: !!data.will_roll_forward,
    coverCents: num(data.cover_cents, 0),
    lifetimeTxnCount: num(data.lifetime_txn_count, null),
  };
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [page, setPageState] = useState(() => loadKey('pc_page', 'onboarding'));
  // Persisted so a reload (or reopening the app) lands back on the donor tab
  // they were viewing instead of always resetting to Dashboard.
  const [tab, setTabState] = useState(() => loadKey('pc_tab', 'dashboard'));
  const [selectedNonprofitId, setSelectedNonprofitIdState] = useState(() => loadKey('pc_cause_id', null));
  const [roundUpMultiplier, setRoundUpMultiplierState] = useState(() => loadKey('pc_multiplier', 1));
  // STORED card state defaults to nothing. A device that saved the old 4242
  // seed under pc_cards is read as having nothing too - that seed was never
  // a card the donor linked.
  const [linkedCardsStored, setLinkedCardsState] = useState(() => {
    const saved = loadKey('pc_cards', []);
    return (Array.isArray(saved) ? saved : []).filter(c => !isDemoSeedCard(c));
  });

  const [trackedCardStored, setTrackedCardState] = useState(() => {
    const saved = loadKey('pc_tracked_card', null);
    if (saved && !isDemoSeedCard(saved)) return saved;
    // Migrate from legacy pc_cards — first REAL card becomes trackedCard
    const legacy = loadKey('pc_cards', []);
    const cards = (Array.isArray(legacy) ? legacy : []).filter(c => !isDemoSeedCard(c));
    if (cards.length > 0) return { name: cards[0].name, last4: cards[0].last4, brand: cards[0].brand, institution: cards[0].name };
    return null;
  });

  const [paymentMethodStored, setPaymentMethodState] = useState(() => {
    const saved = loadKey('pc_payment_method', null);
    return saved && !(saved.last4 === '4242' && saved.type === 'card' && saved.label === DEFAULT_PAYMENT_METHOD.label) ? saved : null;
  });

  const [monthlyCap, setMonthlyCapState] = useState(() => loadKey('pc_monthly_cap', null));
  // Whether the donor covers the nonprofit's card-processing cost on top of
  // their round-ups. The signup checkout pre-checks this and a donor can change
  // it in Settings. It MUST be persisted: it was previously local state on the
  // checkout screen, so the donor's consent was thrown away the moment
  // onboarding finished and no monthly charge ever included it.
  const [coverProcessing, setCoverProcessingState] = useState(() => loadKey('pc_cover_processing', true));
  // Giving is ALWAYS automatic (no manual-deposit mode) — but a donor can skip
  // their next monthly charge ONCE; giving resumes automatically after. The skip
  // is therefore stored as the month key it applies to ('2026-07'), not as a
  // boolean, and 'skipNextCharge' is derived from it — so it expires by itself
  // when the calendar turns instead of skipping every month forever. The month
  // it targets is billing.skipTargetMonth(): the LOCKED cycle during the 1st-10th
  // review window (that is the charge coming up on the 11th), the accruing
  // month afterwards.
  const [skipMonth, setSkipMonthState] = useState(() => loadKey('pc_skip_month', null));
  const [chargeAdjustment, setChargeAdjustmentState] = useState(() => loadKey('pc_charge_adjustment', null));
  const [feeMonthsLocal, setFeeMonthsState] = useState(() => loadKey('pc_fee_months', 1));
  const skipNextCharge = skipMonth !== null && skipMonth === skipTargetMonth().monthKey;

  // Non-persisted: triggers Settings to auto-open a sheet (e.g. from reactivation check-in)
  const [pendingSettingsAction, setPendingSettingsActionState] = useState(null);

  // ─── DEMO MODE ─────────────────────────────────────────────────────────────
  // The one switch that swaps every dashboard / activity / review figure to
  // the rich fake dataset (src/data/transactions.js) so the app can be shown
  // off, and back to the account's real data when off. Persisted under
  // pc_demo_mode so it survives reloads.
  //
  // HOW TO FLIP IT
  //   - setDemoMode(true|false) - the documented public setter. The Settings
  //     screen renders the visible toggle and calls this.
  //   - Shaking the phone - AppShell wires lib/shake.js to the same setter.
  //
  // A plain BOOLEAN again (round-4 item 2b): the round-3 progressive levels
  // (pc_demo_level 0..3) are retired by owner request - shake or toggle flips
  // straight between real data and THE full rich demo dataset. Any stored
  // pc_demo_level is migrated below (>0 reads as demo on) so no device loses
  // its state.
  //
  // HOW SCREENS SHOULD CONSUME IT
  //   Read `demoActive` (below), not demoMode directly: a visitor with NO real
  //   account is always on the demo dataset (that is the prototype experience),
  //   so demoActive = demoMode || !hasAccount. Screens label demo figures with
  //   a small "Demo" pill whenever demoMode is on.
  const [demoMode, setDemoModeState] = useState(() => {
    // Migrate the retired progressive level: any level > 0 was demo on.
    const lvl = loadKey('pc_demo_level', null);
    if (lvl !== null) return lvl > 0;
    return !!loadKey('pc_demo_mode', false);
  });
  function setDemoMode(v) {
    const on = !!v;
    saveKey('pc_demo_mode', on);
    // Retire the progressive-level key for good so the migration above can
    // never resurrect a stale level on a device that has moved on.
    removeKeys(['pc_demo_level']);
    setDemoModeState(on);
  }
  // The demo dataset - one rich dataset now, shared by demo mode and the
  // no-account prototype experience (see lib/donorContent.js DEMO_DATASET).
  const demoData = DEMO_DATASET;

  // A REAL account (a real Supabase identity - see `hasAccount` below) has no
  // real charge-history data source wired up yet (no billing-history sync
  // exists server-side for a signed-in donor - see PRELAUNCH.md). Showing it
  // the hardcoded demo total (PRIOR_MONTHS_SUM, ~$61 of fake "prior months",
  // built from src/data/transactions.js's sample data) would be a fabricated
  // number on a brand-new real account, so a real donor with no charge
  // history starts at an honest $0 instead - once real billing-history sync
  // exists, load the real total here rather than hardcoding 0. Demo mode (no
  // real account, just exploring the prototype) keeps the demo total exactly
  // as before, and every screen that shows it is responsible for labeling it
  // "Demo data" (see Dashboard.jsx, WebDashboard.jsx, Share.jsx, WebShare).
  //
  // The check below mirrors `hasAccount`'s own initializer just below it
  // (rather than depending on it directly) only because of state-declaration
  // order - both read the exact same two identity keys.
  const [totalDonated, setTotalDonated] = useState(() => {
    const startedSignedIn = loadKey(IDENTITY_KEYS.donorRole) ? loadKey(IDENTITY_KEYS.identity) : null;
    return loadKey('pc_total_donated', startedSignedIn ? 0 : PRIOR_MONTHS_SUM);
  });

  // Account lifecycle state
  const [accountStatus, setAccountStatusState] = useState(() => loadKey('pc_account_status', 'active'));
  const [hasAccount, setHasAccountState] = useState(() =>
    loadKey(IDENTITY_KEYS.donorRole) ? loadKey(IDENTITY_KEYS.identity) : null
  );
  const [adminRoleStored, setAdminRoleState] = useState(() => loadKey(IDENTITY_KEYS.adminRole));
  const [lastMode, setLastModeState] = useState(() => loadKey(IDENTITY_KEYS.lastMode));

  // ─── ADMIN PREVIEW (non-persisted) ──────────────────────────────────────────
  // The gate's "preview the admin side" used to call setAdminRole({bgca}),
  // which wrote pc_admin_role: from then on every bare visit routed the device
  // to the BGCA admin dashboard and its Settings could write pc_bgca_overrides.
  // The preview is now a React flag only. While it is on, `adminRole` reads as
  // the BGCA preview role so NpShell/NpWebShell render, NpContext refuses
  // writes (setNpOrg no-ops), and nothing touches pc_admin_role, pc_last_mode
  // or pc_page. Roles already stored on devices are left alone.
  const [previewAdmin, setPreviewAdmin] = useState(false);
  const previewReturnRef = useRef(null);
  const adminRole = adminRoleStored ?? (previewAdmin ? PREVIEW_ADMIN_ROLE : null);

  // Toast notification
  const [toast, setToastState] = useState(null);
  const toastTimerRef = useRef(null);

  // initialOnboardingStep: used to deep-link into a specific onboarding step
  const [initialOnboardingStep, setInitialOnboardingStepState] = useState(null);
  // Where an exit-level "back" should land after a cross-surface jump (or null).
  const [navReturn, setNavReturnState] = useState(null);

  // REAL round-up total, fetched on demand from roundups-me for a
  // signed-in donor with a real linked bank (see src/lib/roundupsMe.js).
  // `null` means "not checked yet or no real session" - the demo number
  // below is used untouched, so a demo-only donor sees zero change: no
  // loading flicker, no error banner, same figure as before this feature
  // existed. `{ linked: false }` means a real session exists but there is
  // no real bank to show numbers for (the common case for a donor who is
  // still demo-exploring after signing in) - same demo fallback applies.
  const [realRoundups, setRealRoundups] = useState(null);
  // What the deployed server says it can do (roundups-me `capabilities`).
  const [serverCaps, setServerCaps] = useState(NO_CAPS);
  // The donor's server-side profile (display name + bound cause join code -
  // see supabase/donor_profiles.sql), carried on every roundups-me response.
  // null until the first response arrives; the name-prompt cards read it to
  // know whether a real name is stored server-side yet (item 7c).
  const [donorProfile, setDonorProfile] = useState(null);
  // Set for good on signOut/deleteAccount so the sign-in adoption effect
  // below cannot race the async Supabase signOut() and re-adopt the session
  // that is in the middle of being destroyed.
  const signedOutRef = useRef(false);
  // Set by the adoption effect right before it calls setHasAccount, so the
  // fetch effect below can tell "the identity it is reacting to was adopted
  // from a response it already holds" from a genuine identity change.
  const adoptedEmailRef = useRef(null);

  // ─── PENDING ORG (join link for another nonprofit) ───────────────────────────
  const [pendingOrgCode, setPendingOrgCodeState] = useState(() => loadKey('pc_pending_org', null));
  const [pendingOrgRecord, setPendingOrgRecord] = useState(null);
  function clearPendingOrg() {
    removeKeys(['pc_pending_org']);
    setPendingOrgCodeState(null);
    setPendingOrgRecord(null);
  }
  // Park a join code for the confirm prompt right away (Onboarding.handleBind
  // uses this when a signed-in donor opens another nonprofit's link), instead
  // of writing pc_pending_org and waiting for the next load to pick it up.
  function setPendingOrgCode(code) {
    const next = typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : null;
    if (!next) { clearPendingOrg(); return; }
    saveKey('pc_pending_org', next);
    setPendingOrgRecord(null);
    setPendingOrgCodeState(next);
  }

  // Everything a roundups-me response teaches us, applied in one place so the
  // mount fetch, the adoption path and refreshRealRoundups cannot drift:
  // totals, server capabilities, and (when the server returns them) the
  // donor's billing settings and fee-month ledger. Settings are hydrated ONLY
  // from these snapshot paths, never from a setter's own echo, so two quick
  // taps cannot flip the UI back and forth while their requests race.
  function absorbSnapshot(data, { hydrate = false } = {}) {
    if (!data) return;
    setRealRoundups(data);
    setServerCaps(capsFrom(data));
    if (!hydrate) return;
    const s = data.settings;
    if (s && typeof s === 'object') {
      if ('skip_month_key' in s) {
        const m = typeof s.skip_month_key === 'string' ? s.skip_month_key : null;
        if (m) saveKey('pc_skip_month', m); else removeKeys(['pc_skip_month']);
        setSkipMonthState(m);
      }
      if ('monthly_cap_cents' in s) {
        const cap = centsToDollars(s.monthly_cap_cents);
        saveKey('pc_monthly_cap', cap);
        setMonthlyCapState(cap);
      }
      if ('charge_adjustment_cents' in s) {
        // A one-time adjustment only counts for the cycle it was made for.
        const forThisCycle = !s.adjustment_month_key || s.adjustment_month_key === skipTargetMonth().monthKey;
        const adj = forThisCycle ? centsToDollars(s.charge_adjustment_cents) : null;
        saveKey('pc_charge_adjustment', adj);
        setChargeAdjustmentState(adj);
      }
      if (typeof s.cover_processing === 'boolean') {
        saveKey('pc_cover_processing', s.cover_processing);
        setCoverProcessingState(s.cover_processing);
      }
    }
    if (Number.isFinite(data.fee_months)) {
      // The fee ledger belongs on the server; persist its answer so first
      // paint after a reload is right too.
      const result = settleStoredCycle(data.fee_months);
      if (result.changed) {
        setFeeMonthsState(result.feeMonths);
        setSkipMonthState(result.skipMonth);
      }
    }
  }

  // Fetch once on mount, and again whenever the account's EMAIL changes -
  // signing in mid-session (donorAuth's verifyCode -> setHasAccount) is
  // exactly the moment a real Supabase session first becomes available to
  // call with. fetchRoundupsMe() itself is a no-op (resolves null fast) when
  // there is no session, so this is cheap for every demo-only visitor.
  //
  // CACHE INVALIDATION (round-3 item 8a): the previous response is DROPPED
  // the moment the account identity changes, before the fresh fetch resolves.
  // Without this, a sign-out left the old account's linked/pending figures in
  // state, and the next sign-in (same tab, different or freshly-wiped
  // account) showed the phantom round-ups of whoever was signed in before
  // until - unless - a fresh fetch happened to overwrite them. Both surfaces
  // read this one state, so clearing it here fixes both at once.
  //
  // Keyed on the email, not the identity object: the profile-sync effect
  // below replaces the object (name fix-ups) without the person changing,
  // and that used to null the figures and refetch for nothing. The adoption
  // effect stores the response itself and marks the email it adopted, so
  // its setHasAccount does not trigger a third fetch and a flash to $0.
  const accountEmail = hasAccount?.email ?? null;
  useEffect(() => {
    if (accountEmail && accountEmail === adoptedEmailRef.current && realRoundups) {
      adoptedEmailRef.current = null;
      return undefined;
    }
    adoptedEmailRef.current = null;
    let cancelled = false;
    setRealRoundups(null);
    setDonorProfile(null);
    setServerCaps(NO_CAPS);
    fetchRoundupsMe().then(data => {
      if (cancelled) return;
      if (!data) return; // no session / network hiccup - leave demo numbers as-is
      absorbSnapshot(data, { hydrate: true });
      // `donorProfile` null strictly means "no response yet"; a response with
      // no profile row stores an empty shape so the sync pass below can tell
      // "server says nothing stored" apart from "have not asked".
      setDonorProfile(data.profile ?? { display_name: null, org_join_code: null, org_bound_at: null });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountEmail]);

  // ─── SERVER-SIDE PROFILE SYNC (round-3 items 4 + 7c) ──────────────────────
  //
  // The cause binding and display name live in donor_profiles on the server
  // now, not only in this device's localStorage. Two directions:
  //
  //   ADOPT  - a response that carries a server binding/name this device does
  //            not have applies it: a returning donor on a brand-new device
  //            lands on a populated dashboard (never the pick-a-nonprofit
  //            gate), greeted by their real name.
  //   BACKFILL - a device that has a binding/name the server does not know
  //            yet pushes it up, so accounts that bound a cause before this
  //            feature existed get their row written on next sign-in.
  useEffect(() => {
    if (!hasAccount || !donorProfile) return;
    let cancelled = false;
    (async () => {
      // Name: server wins over a guessed local name; a real local name the
      // server lacks gets pushed up.
      const serverName = donorProfile?.display_name ?? null;
      const localRealName = greetingNameFor(hasAccount);
      if (serverName && serverName !== hasAccount.name) {
        const next = { ...hasAccount, name: serverName, nameGuessed: false };
        saveKey(IDENTITY_KEYS.identity, next);
        if (!cancelled) setHasAccountState(next);
      } else if (serverName && hasAccount.nameGuessed !== false && hasAccount.name === serverName) {
        const next = { ...hasAccount, nameGuessed: false };
        saveKey(IDENTITY_KEYS.identity, next);
        if (!cancelled) setHasAccountState(next);
      } else if (!serverName && localRealName && donorProfile !== null) {
        pushDonorProfile({ display_name: localRealName });
      }

      // Cause binding: adopt the server's when this device has none...
      const serverCode = donorProfile?.org_join_code ?? null;
      if (serverCode && !loadKey('pc_cause_id')) {
        const np = await resolveOrgByCode(serverCode);
        if (np && !cancelled) {
          saveKey('pc_cause_id', np.id);
          setSelectedNonprofitIdState(np.id);
          // A signed-in donor whose only missing piece was the binding must
          // land on the dashboard, not the gate (item 4). Only correct the
          // page when it is sitting at the gate - never fight real
          // navigation, and never yank an admin off their dashboard.
          if (loadKey('pc_page', 'onboarding') === 'onboarding' && loadKey('pc_account_status', 'active') !== 'cancelled') {
            saveKey(IDENTITY_KEYS.lastMode, 'giving');
            setLastModeState('giving');
            saveKey('pc_page', 'home');
            setPageState('home');
          }
        }
      } else if (!serverCode && donorProfile !== null) {
        // ...and backfill the server when this device has one it lacks.
        const localId = loadKey('pc_cause_id');
        const localOrg = localId ? findOrgByCode(localId) : null;
        if (localOrg) pushDonorProfile({ org_join_code: localOrg.shortName || localOrg.id });
      }
    })();
    return () => { cancelled = true; };
    // Keyed on the profile RESPONSE, not on every identity/org render churn:
    // this is a reconciliation pass per server answer.

  }, [donorProfile, hasAccount]);

  // ─── SIGN-IN ADOPTION (item 4's fresh-device path) ────────────────────────
  //
  // A device with a live Supabase session but no pc_identity yet (fresh
  // browser right after an OAuth return, cleared storage, a second device)
  // used to sit at the gate offering "Continue as ..." and then ask for the
  // nonprofit code again. If the server profile says this identity is a
  // donor with a bound cause, adopt the whole thing silently: identity in,
  // cause bound, straight to a populated dashboard. An identity with NO
  // donor profile (a nonprofit admin's session, or a signup that never
  // finished) is left exactly as before - the gate still owns those.
  useEffect(() => {
    if (hasAccount || signedOutRef.current) return;
    if (loadKey('pc_account_status', 'active') === 'cancelled') return;
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase().auth.getSession().catch(() => ({ data: null }));
      const user = data?.session?.user;
      if (!user?.email || cancelled || signedOutRef.current) return;
      const me = await fetchRoundupsMe();
      const profile = me?.profile;
      if (!profile?.org_join_code || cancelled || signedOutRef.current) return;
      const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
      const identity = {
        ...buildIdentity({
          email: user.email,
          name: profile.display_name || metaName,
          provider: user.app_metadata?.provider || 'email',
          joinedAt: user.created_at,
        }),
      };
      const np = await resolveOrgByCode(profile.org_join_code);
      if (cancelled || signedOutRef.current) return;
      // This response IS the snapshot for the identity about to be set - mark
      // it so the fetch effect above does not null it and fetch a third time.
      adoptedEmailRef.current = identity.email ?? null;
      absorbSnapshot(me, { hydrate: true });
      setDonorProfile(profile);
      setHasAccount(identity);
      setAccountStatusState('active');
      saveKey('pc_account_status', 'active');
      if (np) {
        saveKey('pc_cause_id', np.id);
        setSelectedNonprofitIdState(np.id);
        // Route to the dashboard only from the gate, and never override an
        // admin's last-used mode - same guards as the sync effect above.
        if (loadKey('pc_page', 'onboarding') === 'onboarding' && loadKey(IDENTITY_KEYS.lastMode) !== 'admin') {
          saveKey(IDENTITY_KEYS.lastMode, 'giving');
          setLastModeState('giving');
          saveKey('pc_page', 'home');
          setPageState('home');
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccount]);

  // The donor's confirmed display name, saved server-side and locally in one
  // motion - the "What should we call you?" prompt and the profile-card edit
  // on both surfaces call this.
  function saveDisplayName(name) {
    const clean = (name ?? '').trim().slice(0, 60);
    if (!clean) return;
    if (hasAccount) {
      const next = { ...hasAccount, name: clean, nameGuessed: false };
      saveKey(IDENTITY_KEYS.identity, next);
      setHasAccountState(next);
    }
    setDonorProfile(prev => ({ ...(prev ?? { org_join_code: null, org_bound_at: null }), display_name: clean }));
    pushDonorProfile({ display_name: clean });
  }

  // demoActive: the flag every screen keys its real-vs-demo choice on.
  // A visitor with no real account is always the demo prototype experience;
  // a real account is on real data unless the donor flipped demo mode on.
  const demoActive = demoMode || !hasAccount;
  // A real account on real data: the only case that talks to the server
  // about settings or account closure.
  const isRealAccount = !!hasAccount && !demoMode;

  const bankLinked = !!realRoundups?.linked;
  // Demo mode overrides even a real linked bank: the whole point of the
  // toggle is "swap EVERY figure to the rich fake dataset".
  const hasRealBankLinked = bankLinked && !demoMode;
  // The demo pending figure comes from the demo dataset (see demoData above).
  const simulatedPendingRoundUps = parseFloat((demoData.currentMonthPending * roundUpMultiplier).toFixed(2));
  // The single substitution point for the pending figure, in priority order:
  //   1. demoActive          -> the simulated demo number (rich fake dataset).
  //   2. real linked bank    -> the REAL total from roundups-me.
  //   3. real account, no bank yet -> an honest $0.00. A fresh real account
  //      must never see the fake $4.63 - round-ups only count from account
  //      creation onward, and there is nothing yet.
  // Every screen that reads pendingRoundUps (both dashboards' stat tiles, the
  // Monthly Charge / EstimateCard math, milestones progress, etc.) therefore
  // stays internally consistent without threading a parallel value through
  // each one individually.
  const pendingRoundUps = demoActive
    ? simulatedPendingRoundUps
    : hasRealBankLinked ? (realRoundups.pending_total_cents ?? 0) / 100 : 0;
  const realRoundupsRecent = hasRealBankLinked ? (realRoundups.recent ?? []) : [];
  // Real round-up COUNT for the stat tiles - 0 for a fresh real account.
  // roundups-me's txn_count covers the CURRENT month only; the lifetime
  // count and the unmultiplied base total are newer server fields (null
  // until the deployed function returns them), so Activity's month pill and
  // the "Since you joined" tile can stop guessing from the 10 recent rows.
  const realRoundupsCount = hasRealBankLinked ? (realRoundups.txn_count ?? 0) : 0;
  const realRoundupsLifetimeCount = hasRealBankLinked && Number.isFinite(realRoundups.lifetime_txn_count)
    ? realRoundups.lifetime_txn_count : null;
  const realRoundupsBaseTotal = hasRealBankLinked ? centsToDollars(realRoundups.base_total_cents) : null;
  // Computed once per realRoundups update (response arrival), NOT on a
  // ticking interval - see fmtFreshness's own doc comment.
  const realRoundupsFreshness = hasRealBankLinked
    ? (fmtFreshness(realRoundups.last_synced_at) ?? 'Live')
    : null;
  // The server's own projection of the next charge (rollover, $5 floor,
  // locked cycle, fee ledger, cover gross-up) - null in demo mode and until
  // the deployed roundups-me returns those fields. Consumers fall back to the
  // local billing.js math when null.
  const realProjection = useMemo(
    () => (demoActive ? null : projectionFrom(realRoundups)),
    [demoActive, realRoundups],
  );
  // Fee months: the server's ledger wins for a real account; the browser's
  // own count is the demo / offline fallback.
  const feeMonths = (!demoActive && Number.isFinite(realRoundups?.fee_months))
    ? Math.max(0, Math.round(realRoundups.fee_months))
    : feeMonthsLocal;
  // REAL "Give Extra" pledge totals, carried on the same roundups-me response
  // (give_extras: { pending_cents, lifetime_cents } - present on every
  // donor-found branch, even linked:false, because a real donor can pledge
  // before ever linking a bank). Zero while demoActive: demo mode's flashy
  // simulated Give Extra flow tracks its own numbers through boostDonation,
  // and mixing a real pledge into demo figures (or vice versa) would make
  // both dishonest.
  //   giveExtraPending  - still-'pending' pledges, i.e. what joins the NEXT
  //     monthly charge; dashboards add it to their month figure.
  //   giveExtraLifetime - every pledge ever (pending + charged); folded into
  //     the lifetime total below.
  const giveExtraPending = !demoActive ? (realRoundups?.give_extras?.pending_cents ?? 0) / 100 : 0;
  const giveExtraLifetime = !demoActive ? (realRoundups?.give_extras?.lifetime_cents ?? 0) / 100 : 0;
  // What the dashboards display as the lifetime total: the demo dataset's
  // rich figure while demo mode is on for a REAL account (their honest total
  // is preserved untouched underneath), otherwise the account's own total
  // plus their real give-extra pledges (server-side truth, so the figure is
  // right across devices - the real Give Extra flow deliberately does NOT
  // call boostDonation, which would double-count against this).
  const displayTotalDonated = (demoMode && hasAccount)
    ? demoData.priorMonthsSum
    : parseFloat((totalDonated + giveExtraLifetime).toFixed(2));

  // Cards: the stored value wins; the 4242 placeholders appear ONLY as a
  // demo overlay. A real account that linked nothing reads null / [], and
  // Settings renders its "Link one" rows instead of a fake Active card.
  const trackedCard = trackedCardStored ?? (demoActive ? DEFAULT_TRACKED_CARD : null);
  const paymentMethod = paymentMethodStored ?? (demoActive ? DEFAULT_PAYMENT_METHOD : null);
  const linkedCards = linkedCardsStored.length > 0 ? linkedCardsStored : (demoActive ? DEMO_CARDS : []);

  const selectedNonprofit = useMemo(
    () => findOrgByCode(selectedNonprofitId),
    [selectedNonprofitId],
  );

  // Resolve the parked join code (server-first) once per code. Shown only
  // when it is an APPROVED org that differs from the current binding; anything
  // else (same org, still pending review, unknown code) drops the parked code
  // so the prompt cannot come back on the next load.
  useEffect(() => {
    if (!pendingOrgCode) return undefined;
    if (!hasAccount) return undefined; // the gate owns unbound devices
    let cancelled = false;
    resolveOrgByCode(pendingOrgCode).then(org => {
      if (cancelled) return;
      if (!org || isOrgPending(org) || org.id === selectedNonprofitId) {
        clearPendingOrg();
        return;
      }
      setPendingOrgRecord(org);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrgCode, hasAccount]);
  const pendingOrg = (pendingOrgRecord && hasAccount && pendingOrgRecord.id !== selectedNonprofit?.id)
    ? pendingOrgRecord : null;

  function confirmPendingOrg() {
    const org = pendingOrgRecord;
    clearPendingOrg();
    if (org) setSelectedNonprofit(org);
  }
  function dismissPendingOrg() {
    clearPendingOrg();
  }

  function setPage(p) {
    saveKey('pc_page', p);
    setPageState(p);
  }

  function setTab(t) {
    saveKey('pc_tab', t);
    setTabState(t);
  }

  function setSelectedNonprofit(np) {
    const id = np?.id ?? null;
    saveKey('pc_cause_id', id);
    setSelectedNonprofitIdState(id);
    // Mirror the binding server-side (donor_profiles.org_join_code) so a
    // sign-in on any other device can restore it - item 4. Fire-and-forget
    // and a fast no-op when there is no session yet (a gate bind before
    // signup); the post-sign-in sync effect backfills that case later.
    if (np) pushDonorProfile({ org_join_code: (np.shortName || np.id || '').toUpperCase() });
  }

  function setRoundUpMultiplier(v) {
    saveKey('pc_multiplier', v);
    setRoundUpMultiplierState(v);
    // ALSO persist server-side, in addition to (not instead of) the
    // localStorage write above - best-effort and silent for a demo-only
    // donor (fetchRoundupsMe resolves null fast with no session), and for a
    // signed-in donor it both saves the preference and refreshes the real
    // total under the new multiplier in one round trip. Not awaited: the
    // localStorage write already made the UI feel instant, same as before
    // this feature existed.
    fetchRoundupsMe({ multiplier: v }).then(data => {
      if (data) absorbSnapshot(data);
    });
  }

  // Persist one of the donor's billing settings server-side, same pattern as
  // the multiplier above: local write first (instant UI), then a best-effort
  // round trip that also refreshes the real totals. Real accounts only - a
  // demo-only visitor has no session, and a real account in demo mode is
  // playing with demo figures, not changing what cycle-lock will charge.
  // Today's deployed function ignores the fields; sending them early is
  // harmless and lets the client and server deploy independently.
  function syncDonorSetting(fields) {
    if (!isRealAccount) return;
    fetchRoundupsMe(fields).then(data => {
      if (data) absorbSnapshot(data);
    });
  }

  // Re-pull the real roundups-me snapshot on demand - the real Give Extra
  // flow calls this right after a successful pledge so the dashboards' month
  // and lifetime figures include it without waiting for the next mount.
  // Best-effort like the mount fetch: a null response leaves state as-is.
  function refreshRealRoundups() {
    return fetchRoundupsMe().then(data => {
      if (data) absorbSnapshot(data, { hydrate: true });
      return data;
    });
  }

  function boostDonation(amount) {
    setTotalDonated(prev => {
      const next = parseFloat((prev + amount).toFixed(2));
      saveKey('pc_total_donated', next);
      return next;
    });
  }

  function setLinkedCards(updater) {
    setLinkedCardsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKey('pc_cards', next);
      return next;
    });
  }

  function setTrackedCard(card) {
    saveKey('pc_tracked_card', card);
    setTrackedCardState(card);
  }

  function setPaymentMethod(method) {
    saveKey('pc_payment_method', method);
    setPaymentMethodState(method);
  }

  function setMonthlyCap(val) {
    saveKey('pc_monthly_cap', val);
    setMonthlyCapState(val);
    syncDonorSetting({ monthly_cap_cents: dollarsToCents(val) });
  }

  // Accepts a value or an updater (Settings calls setCoverProcessing(v => !v)).
  function setCoverProcessing(val) {
    const next = !!(typeof val === 'function' ? val(coverProcessing) : val);
    saveKey('pc_cover_processing', next);
    setCoverProcessingState(next);
    syncDonorSetting({ cover_processing: next });
  }

  // Same name and signature as before: setSkipNextCharge(true|false). True marks
  // the cycle the next charge covers (billing.skipTargetMonth) as skipped;
  // false takes the mark off. `null` is sent on purpose: that is how the
  // server clears a skip.
  function setSkipNextCharge(val) {
    const month = val ? skipTargetMonth().monthKey : null;
    if (month) saveKey('pc_skip_month', month);
    else removeKeys(['pc_skip_month']);
    setSkipMonthState(month);
    syncDonorSetting({ skip_month_key: month });
  }

  function setChargeAdjustment(val) {
    saveKey('pc_charge_adjustment', val);
    setChargeAdjustmentState(val);
    syncDonorSetting({
      charge_adjustment_cents: dollarsToCents(val),
      adjustment_month_key: skipTargetMonth().monthKey,
    });
  }

  function setFeeMonths(val) {
    saveKey('pc_fee_months', val);
    setFeeMonthsState(val);
  }

  // The load-time settlement above runs before this provider mounts. This only
  // covers the leave-it-open case: a phone that sat on the dashboard across
  // midnight on the 1st settles the moment the donor looks at it again.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      const result = settleStoredCycle();
      if (!result.changed) return;
      setSkipMonthState(result.skipMonth);
      setFeeMonthsState(result.feeMonths);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // The admin preview only exists on the np-dashboard page: navigating away
  // (goGiving, sign-out, the gate) ends it, so it can never outlive the view.
  useEffect(() => {
    if (previewAdmin && page !== 'np-dashboard') setPreviewAdmin(false);
  }, [previewAdmin, page]);

  function setPendingSettingsAction(action) {
    setPendingSettingsActionState(action);
  }

  function clearPendingSettingsAction() {
    setPendingSettingsActionState(null);
  }

  function setAccountStatus(v) {
    saveKey('pc_account_status', v);
    setAccountStatusState(v);
  }

  function setHasAccount(stub) {
    // A donor exploring in demo mode (accruing the fake PRIOR_MONTHS_SUM
    // total, or a "Give Extra" boost on top of it) who is now getting a real
    // identity for the first time this session must not carry that demo
    // total into their real account - the public Share card in particular
    // must never show it (see src/pages/Share.jsx). `!hasAccount` here is the
    // demo -> real edge specifically: a later call with the SAME real
    // identity (e.g. a returning-session re-adopt) leaves an already-real
    // donor's progress alone. Real charge-history sync does not exist yet
    // (see PRELAUNCH.md) - once it does, load the real total here instead of
    // hardcoding 0, same as the totalDonated initializer above.
    if (stub && !hasAccount) {
      setTotalDonated(0);
      saveKey('pc_total_donated', 0);
      removeKeys(['pc_seen_milestone']);
    }
    saveKey(IDENTITY_KEYS.identity, stub);
    saveKey(IDENTITY_KEYS.donorRole, stub ? { active: true } : null);
    setHasAccountState(stub);
  }

  function setAdminRole(role) {
    // A REAL admin sign-in while previewing ends the preview; the preview
    // itself never reaches this function (see startAdminPreview).
    if (previewAdmin) setPreviewAdmin(false);
    saveKey(IDENTITY_KEYS.adminRole, role);
    setAdminRoleState(role);
  }

  // Read-only look at the BGCA admin dashboard for a prospect at the gate.
  // Nothing is persisted: not the role, not the mode, not the page.
  function startAdminPreview() {
    previewReturnRef.current = { page, tab };
    setPreviewAdmin(true);
    setPageState('np-dashboard');
  }

  function endAdminPreview() {
    const back = previewReturnRef.current;
    previewReturnRef.current = null;
    setPreviewAdmin(false);
    setPageState(back?.page && back.page !== 'np-dashboard' ? back.page : 'onboarding');
    if (back?.tab) setTabState(back.tab);
  }

  function setLastMode(mode) {
    saveKey(IDENTITY_KEYS.lastMode, mode);
    setLastModeState(mode);
  }

  // Reset donor-mode React state to demo defaults (localStorage handled by caller).
  // State setters ONLY - the caller has just wiped storage, and setTab /
  // setDemoMode would write pc_tab / pc_demo_mode straight back.
  function resetDonorState() {
    setSelectedNonprofitIdState(null);
    setRoundUpMultiplierState(1);
    setLinkedCardsState([]);
    setTotalDonated(PRIOR_MONTHS_SUM);
    setTabState('dashboard');
    setAccountStatusState('active');
    setHasAccountState(null);
    setTrackedCardState(null);
    setPaymentMethodState(null);
    setMonthlyCapState(null);
    setChargeAdjustmentState(null);
    setCoverProcessingState(true);
    setFeeMonthsState(1);
    // Demo mode is a donor setting too: left on, the next sign-in in this tab
    // opened on the demo pill and demo figures while storage said off.
    setDemoModeState(false);
    // Billing cycle bookkeeping: no skip, no settled cycle — a true first open.
    // (The keys themselves are in DONOR_KEYS, which every caller wipes.)
    setSkipMonthState(null);
    removeKeys(['pc_skip_month', 'pc_last_cycle', 'pc_cover_processing', 'pc_skip_next']);
    // Server-truth cache: the outgoing account's round-ups and profile must
    // never survive into whoever signs in next on this tab (item 8a).
    setRealRoundups(null);
    setDonorProfile(null);
    setServerCaps(NO_CAPS);
    setPendingOrgCodeState(null);
    setPendingOrgRecord(null);
    setPreviewAdmin(false);
  }

  // deleteAccount: deletes the donor role only. If an admin role exists the
  // identity survives and we land in admin mode; otherwise the person is gone.
  //
  // For a REAL account the server goes first (donor-close: detaches the saved
  // card, removes the Plaid item, erases the donor's rows) and the local wipe
  // happens only on success - a wipe that ran regardless used to tell the
  // donor "your data has been removed" while cycle-lock kept charging them.
  // A failure, or a server that does not have the function yet ('unavailable'),
  // leaves everything in place and returns { ok: false, reason } so the UI can
  // say so. No account, or demo mode: today's local behaviour, { local: true }.
  async function deleteAccount() {
    const real = isRealAccount;
    if (real) {
      const res = await closeDonorAccount({ action: 'delete', final: 'waive' });
      if (!res.ok) return { ok: false, reason: res.reason, error: res.error };
    }
    // Same guard as signOut: an explicitly deleted donor role must not be
    // silently re-adopted from the (still live, admin-side) session.
    signedOutRef.current = true;
    removeKeys(DONOR_KEYS);
    resetDonorState();
    if (adminRoleStored) {
      setLastMode('admin');
      setPage('np-dashboard');
    } else {
      clearIdentityKeys();
      setLastModeState(null);
      setPageState('onboarding');
      // The donor WAS the whole identity: drop the Supabase session too.
      if (real) await getSupabase().auth.signOut().catch(() => { /* best-effort */ });
    }
    return real ? { ok: true } : { ok: true, local: true };
  }

  function showToast(msg, ms = 5000) {
    // One timer at a time: a second toast inside the first one's window used
    // to be cut short when the first timer fired.
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastState(msg);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastState(null);
    }, ms);
  }

  // cancelAccount: stop giving, keep the login. `final` says what happens to
  // the round-ups accrued so far - 'donate' sends them as a final gift (the
  // server allows this from $0.50), 'waive' lets them go. Same server-first
  // rule as deleteAccount: a real account is only marked cancelled locally
  // once donor-close confirmed it, so the "nothing further is charged" copy
  // is true when it shows.
  async function cancelAccount({ final = 'waive' } = {}) {
    const real = isRealAccount;
    if (real) {
      const res = await closeDonorAccount({ action: 'cancel', final });
      if (!res.ok) return { ok: false, reason: res.reason, error: res.error };
    }
    saveKey('pc_account_status', 'cancelled');
    setAccountStatusState('cancelled');
    saveKey('pc_page', 'onboarding');
    setPageState('onboarding');
    // selectedNonprofit is the current org record (findOrgByCode above);
    // shortName is its donor-facing join code, same field Share.jsx/Grow.jsx
    // read for the same purpose.
    pcBeacon('donor cancelled', { org: selectedNonprofit?.shortName });
    return real ? { ok: true } : { ok: true, local: true };
  }

  function reactivateAccount(msg = 'Welcome back!') {
    saveKey('pc_account_status', 'active');
    setAccountStatusState('active');
    showToast(msg);
  }

  function goToOnboardingStep(step) {
    // Remember where the user came from (page + tab) so exit-level back
    // buttons return them there instead of dumping them at the gate.
    setNavReturnState({ page, tab });
    setInitialOnboardingStepState(step);
    saveKey('pc_page', 'onboarding');
    setPageState('onboarding');
  }

  function clearInitialOnboardingStep() {
    setInitialOnboardingStepState(null);
  }

  // Cross-surface back memory: one-deep is all the demo's jumps need.
  function returnFromOnboarding() {
    if (!navReturn) return false;
    const { page: p, tab: t } = navReturn;
    setNavReturnState(null);
    if (t) setTab(t);
    saveKey('pc_page', p);
    setPageState(p);
    return true;
  }

  // signOut: signs out the PERSON — both modes — back to the gate.
  function signOut() {
    // Block the sign-in adoption effect for the rest of this page's life:
    // auth.signOut() below is async, and without this flag the effect could
    // find the not-yet-destroyed session and put the account straight back.
    signedOutRef.current = true;
    removeKeys(RESET_KEYS);
    clearIdentityKeys();
    resetDonorState();
    setAdminRoleState(null);
    setLastModeState(null);
    setPageState('onboarding');
    // Also drop the real Supabase session (email code / Apple / Google), not
    // just this app's local pc_ keys. Fire-and-forget: App.jsx's appEntry
    // check reads localStorage directly for a lingering sb-*-auth-token, so a
    // sign-out that left the token behind would send the very next page load
    // straight back into the app instead of the gate this function just set.
    // Not awaited - the local state above already reflects "signed out"
    // instantly, same as before this call existed.
    getSupabase().auth.signOut().catch(() => { /* best-effort */ });
  }

  return (
    <AppContext.Provider value={{
      page, setPage,
      tab, setTab,
      selectedNonprofit, setSelectedNonprofit,
      roundUpMultiplier, setRoundUpMultiplier,
      linkedCards, setLinkedCards,
      totalDonated: displayTotalDonated,
      boostDonation,
      pendingRoundUps,
      demoMode, setDemoMode, demoActive,
      demoData,
      donorProfile, saveDisplayName,
      hasRealBankLinked, realRoundupsRecent, realRoundupsFreshness, realRoundupsCount,
      realRoundupsLifetimeCount, realRoundupsBaseTotal, realProjection, serverCaps,
      giveExtraPending, giveExtraLifetime, refreshRealRoundups,
      pendingOrg, confirmPendingOrg, dismissPendingOrg, setPendingOrgCode,
      previewAdmin, startAdminPreview, endAdminPreview,
      signOut,
      accountStatus, setAccountStatus,
      hasAccount, setHasAccount,
      cancelAccount,
      reactivateAccount,
      toast, showToast,
      initialOnboardingStep,
      clearInitialOnboardingStep,
      goToOnboardingStep,
      returnFromOnboarding,
      adminRole, setAdminRole,
      lastMode, setLastMode,
      deleteAccount,
      trackedCard, setTrackedCard,
      paymentMethod, setPaymentMethod,
      pendingSettingsAction, setPendingSettingsAction, clearPendingSettingsAction,
      monthlyCap, setMonthlyCap,
      coverProcessing, setCoverProcessing,
      skipNextCharge, setSkipNextCharge,
      chargeAdjustment, setChargeAdjustment,
      feeMonths, setFeeMonths,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
