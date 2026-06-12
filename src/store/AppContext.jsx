import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { NONPROFITS } from '../data/nonprofits';

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


const BASE_PENDING = 4.63;

export function AppProvider({ children }) {
  const [page, setPageState] = useState(() => load('pc_page', 'onboarding'));
  const [tab, setTab] = useState('dashboard');
  const [selectedNonprofitId, setSelectedNonprofitIdState] = useState(() => load('pc_cause_id', 'bgca'));
  const [roundUpMultiplier, setRoundUpMultiplierState] = useState(() => load('pc_multiplier', 1));
  const [linkedCards, setLinkedCardsState] = useState(() => load('pc_cards', [
    { id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' },
  ]));
  const [totalDonated, setTotalDonated] = useState(() => load('pc_total_donated', 60.58));

  // pendingRoundUps is always derived from the multiplier — changing it in Settings now has effect
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
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
