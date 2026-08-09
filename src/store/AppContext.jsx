import { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import { PRIOR_MONTHS_SUM } from '../data/transactions';
import { findOrgByCode, resolveOrgByCode } from './orgStore';
import { IDENTITY_KEYS, migrate, loadKey, saveKey, removeKeys, clearIdentityKeys } from './identityStore';
import { monthKey, settleCycle } from '../lib/billing';
import { pcBeacon } from '../lib/beacon.js';
import { fetchRoundupsMe, pushDonorProfile } from '../lib/roundupsMe';
import { demoDataset } from '../lib/donorContent';
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
  'pc_demo_level', 'pc_name_prompt_done',
];
// Keys cleared on ?reset=1, ?fresh=1, or explicit sign-out.
const RESET_KEYS = [...DONOR_KEYS, 'pc_identity', 'pc_admin_role', 'pc_last_mode'];

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
    removeKeys(RESET_KEYS);
  }
  // A scanned QR or shared join link (?org=CODE) is explicit donor intent —
  // route straight into onboarding so the gate auto-binds the scanned org,
  // even if this device was mid-demo, bound to another org, or fully set up.
  // Account/identity survives; only the page + cause binding reset.
  // EXCEPTION: a returning donor tapping their OWN org's link (micro-site
  // "open my dashboard", re-scanned QR) goes straight back to wherever they
  // were — the link doubles as "open the app".
  if (params.get('org')) {
    const scanned = findOrgByCode(params.get('org'));
    const alreadyTheirs = scanned
      && loadKey('pc_cause_id') === scanned.id
      && loadKey(IDENTITY_KEYS.donorRole)
      && loadKey(IDENTITY_KEYS.identity);
    if (!alreadyTheirs) {
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
// sitting open across midnight on the 1st.
function settleStoredCycle() {
  const result = settleCycle({
    lastCycle: loadKey('pc_last_cycle', null),
    skipMonth: loadKey('pc_skip_month', null),
    feeMonths: loadKey('pc_fee_months', 1),
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
// the CURRENT cycle (the donor's intent was "skip my next charge"), then retire
// the old key. Idempotent — only fires while the legacy key is still present.
function migrateSkipKey() {
  const legacy = loadKey('pc_skip_next', null);
  if (legacy === null) return;
  if (legacy === true && !loadKey('pc_skip_month', null)) {
    saveKey('pc_skip_month', monthKey());
  }
  removeKeys(['pc_skip_next']);
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [page, setPageState] = useState(() => loadKey('pc_page', 'onboarding'));
  // Persisted so a reload (or reopening the app) lands back on the donor tab
  // they were viewing instead of always resetting to Dashboard.
  const [tab, setTabState] = useState(() => loadKey('pc_tab', 'dashboard'));
  const [selectedNonprofitId, setSelectedNonprofitIdState] = useState(() => loadKey('pc_cause_id', null));
  const [roundUpMultiplier, setRoundUpMultiplierState] = useState(() => loadKey('pc_multiplier', 1));
  const [linkedCards, setLinkedCardsState] = useState(() => loadKey('pc_cards', [
    { id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' },
  ]));

  const DEFAULT_TRACKED_CARD = { name: 'Chase Sapphire', last4: '4242', brand: 'Visa', institution: 'Chase' };
  const DEFAULT_PAYMENT_METHOD = { type: 'card', label: 'Credit or Debit Card', last4: '4242' };

  const [trackedCard, setTrackedCardState] = useState(() => {
    const saved = loadKey('pc_tracked_card', null);
    if (saved) return saved;
    // Migrate from legacy pc_cards — first card becomes trackedCard
    const cards = loadKey('pc_cards', []);
    if (cards.length > 0) return { name: cards[0].name, last4: cards[0].last4, brand: cards[0].brand, institution: cards[0].name };
    return DEFAULT_TRACKED_CARD;
  });

  const [paymentMethod, setPaymentMethodState] = useState(() =>
    loadKey('pc_payment_method', DEFAULT_PAYMENT_METHOD)
  );

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
  // when the calendar turns instead of skipping every month forever.
  const [skipMonth, setSkipMonthState] = useState(() => loadKey('pc_skip_month', null));
  const [chargeAdjustment, setChargeAdjustmentState] = useState(() => loadKey('pc_charge_adjustment', null));
  const [feeMonths, setFeeMonthsState] = useState(() => loadKey('pc_fee_months', 1));
  const skipNextCharge = skipMonth !== null && skipMonth === monthKey();

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
  //   - Shaking the phone - AppShell wires lib/shake.js to setDemoLevel.
  //
  // PROGRESSIVE LEVELS (round-3 item 8b). Demo is a LEVEL 0..3 now, not a
  // boolean: shake once for a small few-days dataset (1), again for a
  // few-weeks one (2), again for the original full rich dataset (3), and a
  // fourth shake returns to real data (0). The Settings toggle maps on=3 /
  // off=0 through setDemoMode, which is kept as the boolean-shaped setter so
  // existing callers do not change. `demoMode` (any level > 0) keeps every
  // existing demoActive gate working unchanged, and `demoData` below is the
  // level's dataset (see lib/donorContent.js demoDataset).
  //
  // HOW SCREENS SHOULD CONSUME IT
  //   Read `demoActive` (below), not demoMode directly: a visitor with NO real
  //   account is always on the demo dataset (that is the prototype experience),
  //   so demoActive = demoMode || !hasAccount. Screens label demo figures with
  //   a small "Demo n/3" pill whenever demoMode is on.
  const [demoLevel, setDemoLevelState] = useState(() => {
    const lvl = loadKey('pc_demo_level', null);
    if (lvl !== null) return Math.max(0, Math.min(3, lvl));
    // Migrate the retired boolean: demoMode true reads as the full dataset.
    return loadKey('pc_demo_mode', false) ? 3 : 0;
  });
  function setDemoLevel(l) {
    const v = Math.max(0, Math.min(3, Math.round(Number(l) || 0)));
    saveKey('pc_demo_level', v);
    // Kept in step for any storage reader that still knows only the boolean.
    saveKey('pc_demo_mode', v > 0);
    setDemoLevelState(v);
  }
  const demoMode = demoLevel > 0;
  function setDemoMode(v) {
    setDemoLevel(v ? 3 : 0);
  }
  // The active demo dataset. Level 0 / no account -> the full level-3 data,
  // so the no-account prototype experience is exactly what it always was.
  const demoData = useMemo(() => demoDataset(demoLevel), [demoLevel]);

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
  const [adminRole, setAdminRoleState] = useState(() => loadKey(IDENTITY_KEYS.adminRole));
  const [lastMode, setLastModeState] = useState(() => loadKey(IDENTITY_KEYS.lastMode));

  // Toast notification
  const [toast, setToastState] = useState(null);

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
  // The donor's server-side profile (display name + bound cause join code -
  // see supabase/donor_profiles.sql), carried on every roundups-me response.
  // null until the first response arrives; the name-prompt cards read it to
  // know whether a real name is stored server-side yet (item 7c).
  const [donorProfile, setDonorProfile] = useState(null);
  // Set for good on signOut/deleteAccount so the sign-in adoption effect
  // below cannot race the async Supabase signOut() and re-adopt the session
  // that is in the middle of being destroyed.
  const signedOutRef = useRef(false);

  // Fetch once on mount, and again whenever `hasAccount` changes - signing
  // in mid-session (donorAuth's verifyCode -> setHasAccount) is exactly the
  // moment a real Supabase session first becomes available to call with.
  // fetchRoundupsMe() itself is a no-op (resolves null fast) when there is
  // no session, so this is cheap for every demo-only visitor.
  //
  // CACHE INVALIDATION (round-3 item 8a): the previous response is DROPPED
  // the moment the account identity changes, before the fresh fetch resolves.
  // Without this, a sign-out left the old account's linked/pending figures in
  // state, and the next sign-in (same tab, different or freshly-wiped
  // account) showed the phantom round-ups of whoever was signed in before
  // until - unless - a fresh fetch happened to overwrite them. Both surfaces
  // read this one state, so clearing it here fixes both at once.
  useEffect(() => {
    let cancelled = false;
    setRealRoundups(null);
    setDonorProfile(null);
    fetchRoundupsMe().then(data => {
      if (cancelled) return;
      if (!data) return; // no session / network hiccup - leave demo numbers as-is
      setRealRoundups(data);
      // `donorProfile` null strictly means "no response yet"; a response with
      // no profile row stores an empty shape so the sync pass below can tell
      // "server says nothing stored" apart from "have not asked".
      setDonorProfile(data.profile ?? { display_name: null, org_join_code: null, org_bound_at: null });
    });
    return () => { cancelled = true; };
     
  }, [hasAccount]);

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
      setHasAccount(identity);
      setAccountStatusState('active');
      saveKey('pc_account_status', 'active');
      setRealRoundups(me);
      setDonorProfile(profile);
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

  const bankLinked = !!realRoundups?.linked;
  // Demo mode overrides even a real linked bank: the whole point of the
  // toggle is "swap EVERY figure to the rich fake dataset".
  const hasRealBankLinked = bankLinked && !demoMode;
  // The demo pending figure comes from the ACTIVE demo dataset (level 1/2/3
  // - see demoData above), so the shake levels scale every derived figure.
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
  const realRoundupsCount = hasRealBankLinked ? (realRoundups.txn_count ?? 0) : 0;
  // Computed once per realRoundups update (response arrival), NOT on a
  // ticking interval - see fmtFreshness's own doc comment.
  const realRoundupsFreshness = hasRealBankLinked
    ? (fmtFreshness(realRoundups.last_synced_at) ?? 'Live')
    : null;
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

  const selectedNonprofit = useMemo(
    () => findOrgByCode(selectedNonprofitId),
    [selectedNonprofitId],
  );

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
      if (data) setRealRoundups(data);
    });
  }

  // Re-pull the real roundups-me snapshot on demand - the real Give Extra
  // flow calls this right after a successful pledge so the dashboards' month
  // and lifetime figures include it without waiting for the next mount.
  // Best-effort like the mount fetch: a null response leaves state as-is.
  function refreshRealRoundups() {
    return fetchRoundupsMe().then(data => {
      if (data) setRealRoundups(data);
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
  }

  function setCoverProcessing(val) {
    saveKey('pc_cover_processing', val);
    setCoverProcessingState(val);
  }

  // Same name and signature as before: setSkipNextCharge(true|false). True marks
  // THIS cycle as skipped; false takes the mark off.
  function setSkipNextCharge(val) {
    const month = val ? monthKey() : null;
    if (month) saveKey('pc_skip_month', month);
    else removeKeys(['pc_skip_month']);
    setSkipMonthState(month);
  }

  function setChargeAdjustment(val) {
    saveKey('pc_charge_adjustment', val);
    setChargeAdjustmentState(val);
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
    saveKey(IDENTITY_KEYS.adminRole, role);
    setAdminRoleState(role);
  }

  function setLastMode(mode) {
    saveKey(IDENTITY_KEYS.lastMode, mode);
    setLastModeState(mode);
  }

  // Reset donor-mode React state to demo defaults (localStorage handled by caller).
  function resetDonorState() {
    setSelectedNonprofitIdState(null);
    setRoundUpMultiplierState(1);
    setLinkedCardsState([{ id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' }]);
    setTotalDonated(PRIOR_MONTHS_SUM);
    setTab('dashboard');
    setAccountStatusState('active');
    setHasAccountState(null);
    setTrackedCardState(DEFAULT_TRACKED_CARD);
    setPaymentMethodState(DEFAULT_PAYMENT_METHOD);
    setMonthlyCapState(null);
    setChargeAdjustmentState(null);
    setCoverProcessingState(true);
    setFeeMonthsState(1);
    // Billing cycle bookkeeping: no skip, no settled cycle — a true first open.
    // (The keys themselves are in DONOR_KEYS, which every caller wipes.)
    setSkipMonthState(null);
    removeKeys(['pc_skip_month', 'pc_last_cycle', 'pc_cover_processing', 'pc_skip_next']);
    // Server-truth cache: the outgoing account's round-ups and profile must
    // never survive into whoever signs in next on this tab (item 8a).
    setRealRoundups(null);
    setDonorProfile(null);
  }

  // deleteAccount: deletes the donor role only. If an admin role exists the
  // identity survives and we land in admin mode; otherwise the person is gone.
  function deleteAccount() {
    // Same guard as signOut: an explicitly deleted donor role must not be
    // silently re-adopted from the (still live, admin-side) session.
    signedOutRef.current = true;
    removeKeys(DONOR_KEYS);
    resetDonorState();
    if (adminRole) {
      setLastMode('admin');
      setPage('np-dashboard');
    } else {
      clearIdentityKeys();
      setLastModeState(null);
      setPageState('onboarding');
    }
  }

  function showToast(msg, ms = 2200) {
    setToastState(msg);
    setTimeout(() => setToastState(null), ms);
  }

  function cancelAccount() {
    saveKey('pc_account_status', 'cancelled');
    setAccountStatusState('cancelled');
    saveKey('pc_page', 'onboarding');
    setPageState('onboarding');
    // selectedNonprofit is the current org record (findOrgByCode above);
    // shortName is its donor-facing join code, same field Share.jsx/Grow.jsx
    // read for the same purpose.
    pcBeacon('donor cancelled', { org: selectedNonprofit?.shortName });
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
      demoLevel, setDemoLevel, demoData,
      donorProfile, saveDisplayName,
      hasRealBankLinked, realRoundupsRecent, realRoundupsFreshness, realRoundupsCount,
      giveExtraPending, giveExtraLifetime, refreshRealRoundups,
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
