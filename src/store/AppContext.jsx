import { createContext, useContext, useState, useMemo } from 'react';
import { CURRENT_MONTH_PENDING, PRIOR_MONTHS_SUM } from '../data/transactions';
import { findOrgByCode } from './orgStore';
import { IDENTITY_KEYS, migrate, loadKey, saveKey, removeKeys, clearIdentityKeys } from './identityStore';

// Donor-scoped keys — cleared on donor-account deletion; identity/admin keys survive.
const DONOR_KEYS = [
  'pc_page', 'pc_cause_id', 'pc_multiplier', 'pc_cards', 'pc_total_donated',
  'pc_seen_milestone', 'pc_dismiss_countdown', 'pc_prefs', 'pc_account_status',
  'pc_has_account', 'pc_donor_role',
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
}

const AppContext = createContext(null);

// BASE_PENDING is derived from the current billing cycle's transaction round-ups.
const BASE_PENDING = CURRENT_MONTH_PENDING;

export function AppProvider({ children }) {
  const [page, setPageState] = useState(() => loadKey('pc_page', 'onboarding'));
  const [tab, setTab] = useState('dashboard');
  const [selectedNonprofitId, setSelectedNonprofitIdState] = useState(() => loadKey('pc_cause_id', null));
  const [roundUpMultiplier, setRoundUpMultiplierState] = useState(() => loadKey('pc_multiplier', 1));
  const [linkedCards, setLinkedCardsState] = useState(() => loadKey('pc_cards', [
    { id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' },
  ]));

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

  const pendingRoundUps = parseFloat((BASE_PENDING * roundUpMultiplier).toFixed(2));

  const selectedNonprofit = useMemo(
    () => findOrgByCode(selectedNonprofitId),
    [selectedNonprofitId],
  );

  function setPage(p) {
    saveKey('pc_page', p);
    setPageState(p);
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
  }

  function reactivateAccount() {
    saveKey('pc_account_status', 'active');
    setAccountStatusState('active');
    showToast('Welcome back!');
  }

  function goToOnboardingStep(step) {
    setInitialOnboardingStepState(step);
    saveKey('pc_page', 'onboarding');
    setPageState('onboarding');
  }

  function clearInitialOnboardingStep() {
    setInitialOnboardingStepState(null);
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
      adminRole, setAdminRole,
      lastMode, setLastMode,
      deleteAccount,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
