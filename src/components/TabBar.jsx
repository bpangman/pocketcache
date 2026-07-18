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

export default function TabBar() {
  const { tab, setTab } = useApp();
  const brand = useTheme();

  return (
    <div className="tab-bar absolute bottom-0 left-0 right-0 flex items-center px-1 pt-2" style={{ paddingBottom: 'calc(var(--pc-safe-bottom) + 8px)' }}>
      {TABS.map(({ id, label, icon: Icon }) => { // eslint-disable-line no-unused-vars
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
                className="absolute top-0 inset-x-3 h-0.5 rounded-full"
                style={{ background: brand.textAccent }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon size={20} className="transition-colors duration-300"
              style={{ color: active ? brand.textAccent : '#9ca3af' }} />
            <span className="text-xs font-semibold transition-colors duration-300"
              style={{ color: active ? brand.textAccent : '#9ca3af', fontSize: '10px' }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
