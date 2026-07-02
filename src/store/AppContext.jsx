import { createContext, useContext, useState, useMemo } from 'react';
import { NONPROFITS } from '../data/nonprofits';
import { CURRENT_MONTH_PENDING, PRIOR_MONTHS_SUM } from '../data/transactions';

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
// In production the server computes this from Plaid webhook events in real time.
// Note: the multiplier applies to future transactions server-side in production;
// here we apply it to BASE_PENDING for demo illustration purposes only.
const BASE_PENDING = CURRENT_MONTH_PENDING; // 4.63 — computed from transactions data

export function AppProvider({ children }) {
  const [page, setPageState] = useState(() => load('pc_page', 'onboarding'));
  const [tab, setTab] = useState('dashboard');
  const [selectedNonprofitId, setSelectedNonprofitIdState] = useState(() => load('pc_cause_id', null));
  const [roundUpMultiplier, setRoundUpMultiplierState] = useState(() => load('pc_multiplier', 1));
  const [linkedCards, setLinkedCardsState] = useState(() => load('pc_cards', [
    { id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' },
  ]));

  // Initial totalDonated = sum of PRIOR completed months only.
  // "Donated" means actually charged to the nonprofit's Stripe; the current
  // pending month is NOT included until it clears at month-end.
  const [totalDonated, setTotalDonated] = useState(
    () => load('pc_total_donated', PRIOR_MONTHS_SUM),
  );

  // pendingRoundUps is always derived from the multiplier
  const pendingRoundUps = parseFloat((BASE_PENDING * roundUpMultiplier).toFixed(2));

  // Derive the full nonprofit object from its stored id — switching cause never bleeds old state
  const selectedNonprofit = useMemo(
    () => NONPROFITS.find(n => n.id === selectedNonprofitId) ?? null,
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

  // signOut: clear all demo localStorage state and return to onboarding gate.
  function signOut() {
    clearDemoState();
    setSelectedNonprofitIdState(null);
    setRoundUpMultiplierState(1);
    setLinkedCardsState([{ id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' }]);
    setTotalDonated(PRIOR_MONTHS_SUM);
    setTab('dashboard');
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
    }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);
