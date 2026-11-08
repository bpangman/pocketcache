import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Home, Heart, Activity, Settings, Share2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';

const TABS = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'mycause', label: 'My Cause', icon: Heart },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'share', label: 'Share', icon: Share2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Inactive tabs read in the shared slate token; the active tab keeps the
// tenant's text accent (navy for BGCA, gold for the default brand), so the
// bar never has to pick a tenant color of its own.
const INACTIVE = 'var(--slate)';

export default function TabBar() {
  const { tab, setTab } = useApp();
  const brand = useTheme();

  return (
    <nav aria-label="Main" className="tab-bar absolute bottom-0 left-0 right-0 flex items-center px-1 pt-1" style={{ paddingBottom: 'max(12px, calc(var(--pc-safe-bottom) - 6px))' }}>
      {TABS.map(({ id, label, icon: Icon }) => { // eslint-disable-line no-unused-vars
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={active ? 'page' : undefined}
            className="flex-1 flex flex-col items-center gap-1 py-2 relative min-h-[44px] rounded-chip"
          >
            {active && (
              <motion.div
                layoutId="tabIndicator"
                className="absolute top-0 inset-x-3 h-0.5 rounded-full"
                style={{ background: brand.textAccent }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon size={20} className="transition-colors duration-300"
              style={{ color: active ? brand.textAccent : INACTIVE }} />
            <span className="font-semibold transition-colors duration-300"
              style={{ color: active ? brand.textAccent : INACTIVE, fontSize: '0.625rem' }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
