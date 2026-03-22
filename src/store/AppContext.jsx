import { createContext, useContext, useState } from 'react';
import { NONPROFITS } from '../data/nonprofits';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [page, setPage] = useState('onboarding'); // onboarding | home
  const [tab, setTab] = useState('dashboard');
  const [selectedNonprofit, setSelectedNonprofit] = useState(NONPROFITS[0]); // BGCA default
  const [roundUpMultiplier, setRoundUpMultiplier] = useState(1);
  const [linkedCards, setLinkedCards] = useState([
    { id: 1, last4: '4242', brand: 'Visa', name: 'Chase Sapphire' },
  ]);
  const [totalDonated] = useState(60.58);
  const [pendingRoundUps] = useState(4.63);

  return (
    <AppContext.Provider value={{
      page, setPage,
      tab, setTab,
      selectedNonprofit, setSelectedNonprofit,
      roundUpMultiplier, setRoundUpMultiplier,
      linkedCards, setLinkedCards,
      totalDonated,
      pendingRoundUps,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
