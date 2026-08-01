import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { CURRENT_MONTH_PENDING, PRIOR_MONTHS_SUM } from '../data/transactions';
import { findOrgByCode } from './orgStore';
import { IDENTITY_KEYS, migrate, loadKey, saveKey, removeKeys, clearIdentityKeys } from './identityStore';
import { monthKey, settleCycle } from '../lib/billing';
import { pcBeacon } from '../lib/beacon.js';

// Donor-scoped keys — cleared on donor-account deletion; identity/admin keys survive.
// 'pc_skip_next' is the retired forever-boolean: kept in the list so the wipe
// paths still clear it on devices that predate the per-cycle skip record.
const DONOR_KEYS = [
  'pc_page', 'pc_tab', 'pc_cause_id', 'pc_multiplier', 'pc_cards', 'pc_total_donated',
  'pc_seen_milestone', 'pc_prefs', 'pc_account_status',
  'pc_has_account', 'pc_donor_role', 'pc_tracked_card', 'pc_payment_method',
  'pc_comms_optin', 'pc_monthly_cap', 'pc_charge_adjustment', 'pc_fee_months',
  'pc_bio', 'pc_bio_prompt_dismissed', 'pc_skip_next', 'pc_review_ack',
  'pc_skip_month', 'pc_last_cycle', 'pc_cover_processing',
];
// Keys cleared on ?reset=1, ?fresh=1, or explicit sign-out.
const RESET_KEYS = [...DONOR_KEYS, 'pc_identity', 'pc_admin_role', 'pc_last_mode'];

// Check for ?reset=1 or ?fresh=1 on load — clear state so demo starts at the gate
if (typeof window !== 'undefined') {
  migrate();
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1' || params.get('fresh') === '1') {
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

// BASE_PENDING is derived from the current billing cycle's transaction round-ups.
const BASE_PENDING = CURRENT_MONTH_PENDING;

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

  const [totalDonated, setTotalDonated] = useState(
    () => loadKey('pc_total_donated', PRIOR_MONTHS_SUM),
  );

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

  const pendingRoundUps = parseFloat((BASE_PENDING * roundUpMultiplier).toFixed(2));

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
  }

  function setRoundUpMultiplier(v) {
    saveKey('pc_multiplier', v);
    setRoundUpMultiplierState(v);
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
  }

  // deleteAccount: deletes the donor role only. If an admin role exists the
  // identity survives and we land in admin mode; otherwise the person is gone.
  function deleteAccount() {
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
    removeKeys(RESET_KEYS);
    clearIdentityKeys();
    resetDonorState();
    setAdminRoleState(null);
    setLastModeState(null);
    setPageState('onboarding');
  }

  return (
    <AppContext.Provider value={{
      page, setPage,
      tab, setTab,
      selectedNonprofit, setSelectedNonprofit,
      roundUpMultiplier, setRoundUpMultiplier,
      linkedCards, setLinkedCards,
      totalDonated,
      boostDonation,
      pendingRoundUps,
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
