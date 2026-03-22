import { createContext, useContext, useEffect } from 'react';
import { useApp } from './AppContext';
import { DEFAULT_BRAND } from '../data/nonprofits';

const ThemeContext = createContext(DEFAULT_BRAND);

export function ThemeProvider({ children }) {
  const { selectedNonprofit } = useApp();
  const brand = selectedNonprofit?.brand ?? DEFAULT_BRAND;

  // Inject CSS custom properties onto :root so any component can use var(--brand-primary) etc.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', brand.primary);
    root.style.setProperty('--brand-secondary', brand.secondary);
    root.style.setProperty('--brand-accent-light', brand.accentLight);
    root.style.setProperty('--brand-text-accent', brand.textAccent);
  }, [brand]);

  return (
    <ThemeContext.Provider value={brand}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
