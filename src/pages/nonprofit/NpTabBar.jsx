import { LayoutDashboard, Users, CreditCard, Megaphone, Settings } from 'lucide-react';
import { useNp } from '../../store/NpContext';

const NP_TABS = [
  { id: 'overview',  label: 'Overview', icon: LayoutDashboard },
  { id: 'donors',    label: 'Donors',   icon: Users },
  { id: 'charges',   label: 'Charges',  icon: CreditCard },
  { id: 'grow',      label: 'Grow',     icon: Megaphone },
  { id: 'settings',  label: 'Settings', icon: Settings },
];

export default function NpTabBar() {
  const { npTab, setNpTab, npOrg } = useNp();
  const accent = npOrg.color || '#0D9488';

  return (
    <div className="tab-bar absolute bottom-0 left-0 right-0 flex items-center px-1 pt-1" style={{ paddingBottom: 'max(12px, calc(var(--pc-safe-bottom) - 6px))' }}>
      {NP_TABS.map((tabDef) => {
        const { id, label } = tabDef;
        const TabIcon = tabDef.icon;
        const active = npTab === id;
        return (
          <button
            key={id}
            onClick={() => setNpTab(id)}
            className="flex-1 flex flex-col items-center gap-1 py-2 relative"
          >
            {active && (
              <div
                className="absolute top-0 inset-x-3 h-0.5 rounded-full"
                style={{ background: accent }}
              />
            )}
            <TabIcon
              size={20}
              className="transition-colors duration-200"
              style={{ color: active ? accent : '#9ca3af' }}
            />
            <span
              className="font-semibold transition-colors duration-200"
              style={{ color: active ? accent : '#9ca3af', fontSize: '10px' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
