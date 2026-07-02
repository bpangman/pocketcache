import { createContext, useContext, useState, useMemo } from 'react';
import { CURRENT_MONTH_PENDING, PRIOR_MONTHS_SUM } from '../data/transactions';
import { findOrgByCode } from './orgStore';

// Keys cleared on ?reset=1, ?fresh=1, or explicit sign-out.
const RESET_KEYS = [
  'pc_page',
  'pc_cause_id',
  'pc_multiplier',
  'pc_cards',
  'pc_total_donated',
  'pc_seen_milestone',
  'pc_dismiss_countdown',
  'pc_prefs',
  'pc_account_status',
  'pc_has_account',
];

function clearDemoState() {
  RESET_KEYS.forEach(k => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
}

// Check for ?reset=1 or ?fresh=1 on load — clear state so demo starts at the gate
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1' || params.get('fresh') === '1') {
    clearDemoState();
  }
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v != null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

const AppContext = createContext(null);

// BASE_PENDING is derived from the current billing cycle's transaction round-ups.
const BASE_PENDING = CURRENT_MONTH_PENDING;

export function AppProvider({ children }) {
  const [page, setPageState] = useState(() => load('pc_page', 'onboarding'));
  const [tab, setTab] = useState('dashboard');
  const [selectedNonprofitId, setSelectedNonprofitIdState] = useState(() => load('pc_cause_id', null));
  const [roundUpMultiplier, setRoundUpMultiplierState] = useState(() => load('pc_multiplier', 1));
  const [linkedCards, setLinkedCardsState] = useState(() => load('pc_cards', [
    { id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' },
  ]));

  const [totalDonated, setTotalDonated] = useState(
    () => load('pc_total_donated', PRIOR_MONTHS_SUM),
  );

  // Account lifecycle state
  const [accountStatus, setAccountStatusState] = useState(() => load('pc_account_status', 'active'));
  const [hasAccount, setHasAccountState] = useState(() => load('pc_has_account', null));

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
    save('pc_page', p);
    setPageState(p);
  }

  function setSelectedNonprofit(np) {
    const id = np?.id ?? null;
    save('pc_cause_id', id);
    setSelectedNonprofitIdState(id);
  }

  function setRoundUpMultiplier(v) {
    save('pc_multiplier', v);
    setRoundUpMultiplierState(v);
  }

  function boostDonation(amount) {
    setTotalDonated(prev => {
      const next = parseFloat((prev + amount).toFixed(2));
      save('pc_total_donated', next);
      return next;
    });
  }

  function setLinkedCards(updater) {
    setLinkedCardsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      save('pc_cards', next);
      return next;
    });
  }

  function setAccountStatus(v) {
    save('pc_account_status', v);
    setAccountStatusState(v);
  }

  function setHasAccount(stub) {
    save('pc_has_account', stub);
    setHasAccountState(stub);
  }

  function showToast(msg, ms = 2200) {
    setToastState(msg);
    setTimeout(() => setToastState(null), ms);
  }

  function cancelAccount() {
    save('pc_account_status', 'cancelled');
    setAccountStatusState('cancelled');
    save('pc_page', 'onboarding');
    setPageState('onboarding');
  }

  function reactivateAccount() {
    save('pc_account_status', 'active');
    setAccountStatusState('active');
    showToast('Welcome back!');
  }

  function goToOnboardingStep(step) {
    setInitialOnboardingStepState(step);
    save('pc_page', 'onboarding');
    setPageState('onboarding');
  }

  function clearInitialOnboardingStep() {
    setInitialOnboardingStepState(null);
  }

  // signOut: clear all demo localStorage state and return to onboarding gate.
  function signOut() {
    clearDemoState();
    setSelectedNonprofitIdState(null);
    setRoundUpMultiplierState(1);
    setLinkedCardsState([{ id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' }]);
    setTotalDonated(PRIOR_MONTHS_SUM);
    setTab('dashboard');
    setAccountStatusState('active');
    setHasAccountState(null);
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
    }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
