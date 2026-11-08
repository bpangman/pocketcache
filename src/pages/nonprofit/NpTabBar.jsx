import { useNp } from '../../store/NpContext';
import { NP_TABS } from './npTabs';

export default function NpTabBar() {
  const { npTab, setNpTab, npOrg } = useNp();
  const accent = npOrg.color || '#0D9488';

  return (
    <nav aria-label="Admin sections" className="tab-bar absolute bottom-0 left-0 right-0 flex items-center px-1 pt-1" style={{ paddingBottom: 'max(12px, calc(var(--pc-safe-bottom) - 6px))' }}>
      {NP_TABS.map((tabDef) => {
        const { id, label } = tabDef;
        const TabIcon = tabDef.icon;
        const active = npTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setNpTab(id)}
            aria-current={active ? 'page' : undefined}
            className="flex-1 flex flex-col items-center gap-1 py-2 relative"
            style={{ minHeight: 44 }}
          >
            {active && (
              <div
                className="absolute top-0 inset-x-3 h-0.5 rounded-pill"
                style={{ background: accent }}
              />
            )}
            <TabIcon
              size={20}
              className="transition-colors duration-200"
              style={{ color: active ? accent : 'var(--muted)' }}
              aria-hidden
            />
            <span
              className="font-semibold transition-colors duration-200"
              style={{ color: active ? accent : 'var(--slate)', fontSize: '0.625rem' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
