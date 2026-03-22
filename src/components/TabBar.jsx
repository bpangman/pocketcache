import { motion } from 'framer-motion';
import { Home, Search, Activity, Settings } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';

const TABS = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'nonprofits', label: 'Causes', icon: Search },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function TabBar() {
  const { tab, setTab } = useApp();
  const brand = useTheme();

  return (
    <div className="tab-bar absolute bottom-0 left-0 right-0 flex items-center px-2 pb-6 pt-2">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex flex-col items-center gap-1 py-2 relative"
          >
            {active && (
              <motion.div
                layoutId="tabIndicator"
                className="absolute top-0 inset-x-4 h-0.5 rounded-full"
                style={{ background: brand.primary }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon
              size={22}
              className="transition-colors duration-300"
              style={{ color: active ? brand.primary : '#9ca3af' }}
            />
            <span
              className="text-xs font-semibold transition-colors duration-300"
              style={{ color: active ? brand.primary : '#9ca3af' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
