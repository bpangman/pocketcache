import { useEffect, useState } from 'react';
import { ChevronDown, Coins } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { useNp } from '../../store/NpContext';
import CoinMark from '../../components/CoinMark';
import { INK, NAVY, CARD, SHADOW } from '../../lib/webTheme';
import { NP_TABS, npTabDef } from './npTabs';
import { useNpAdminActions } from './useNpAdminActions';
import PendingReviewBanner, { PreviewAdminBanner } from './PendingReviewBanner';
import { NpLayoutProvider, NpOrgMark, NP_WEB_MAX_W } from './NpLayout';

// ─── The browser-native nonprofit-admin portal ───────────────────────────────
// The admin counterpart to WebDashboard: top nav, wide multi-column body, real
// page headings. It renders the SAME tab components as the phone shell
// (npTabs.js) - the tabs declare blocks via NpPage/NpBlock and this shell lays
// them out across the window instead of stacking them in a 390px column. No tab
// logic is duplicated here; the only thing this file owns is chrome.
//
// Design language deliberately matches src/pages/WebDashboard.jsx: same INK
// scale, same CARD, same 62px sticky nav, same footer (all from lib/webTheme).
// The one difference is content width - 1240 rather than the donor portal's
// 1100, because this surface carries donor lists and charge-run tables.

const MENU_ITEM = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none',
  background: 'transparent', padding: '0 10px', minHeight: 44, fontSize: 14, fontWeight: 600,
  color: INK.primary, cursor: 'pointer', borderRadius: 8,
};

export default function NpWebShell() {
  const { npTab, setNpTab, npOrg } = useNp();
  const [menuOpen, setMenuOpen] = useState(false);
  const { goGiving, handleSignOut, givingLabel } = useNpAdminActions(npOrg);
  const { adminRole, setPage } = useApp();

  // Defense-in-depth: WebExperience renders this shell purely off `page ===
  // 'np-dashboard'', with no role check of its own. Real auth is a backend
  // concern this demo doesn't have, but hand-setting pc_page in localStorage
  // without pc_admin_role should not be enough to see someone else's admin
  // dashboard - bounce to the join step, one click from the real admin sign-in
  // link (WebOnboarding's "Nonprofit admin? Sign in with your work email").
  useEffect(() => {
    if (!adminRole) setPage('onboarding');
  }, [adminRole, setPage]);
  if (!adminRole) return null;

  const tab = npTabDef(npTab);
  const Page = tab.component;
  const orgName = npOrg.name || 'Your Nonprofit';
  const accent = npOrg.color || NAVY;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface)' }} onClick={() => menuOpen && setMenuOpen(false)}>
      {/* ── Top nav ── */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: NP_WEB_MAX_W, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <NpOrgMark npOrg={npOrg} size={34} radius={10} on="light" />
            <div style={{ lineHeight: 1.15, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {orgName}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: INK.subtle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CoinMark size={11} />
                admin · powered by PocketCache
              </p>
            </div>
          </div>

          <nav aria-label="Admin sections" style={{ display: 'flex', gap: 4, flex: 1 }}>
            {NP_TABS.map(t => {
              const active = npTab === t.id;
              const TabIcon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNpTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    border: 'none', background: active ? `${accent}14` : 'transparent', cursor: 'pointer',
                    padding: '0 14px', minHeight: 44, borderRadius: 12, fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    color: active ? NAVY : INK.secondary,
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}
                >
                  <TabIcon size={15} style={{ color: active ? accent : INK.subtle }} aria-hidden />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Admin menu */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={{
                border: '1px solid var(--line)', background: '#fff', borderRadius: 999,
                padding: '0 16px', minHeight: 44, fontSize: 13, fontWeight: 700, color: INK.primary, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              Admin <ChevronDown size={14} aria-hidden />
            </button>
            {menuOpen && (
              <div
                role="menu"
                style={{ position: 'absolute', right: 0, top: 52, width: 260, ...CARD, boxShadow: SHADOW.lg, padding: 8, zIndex: 40 }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: INK.primary }}>{orgName}</p>
                  <p style={{ margin: 0, fontSize: 12, color: INK.subtle }}>{npOrg.adminEmail || 'admin'}</p>
                </div>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); goGiving(); }} style={MENU_ITEM}>
                  <Coins size={15} style={{ color: 'var(--gold-700)', flexShrink: 0 }} aria-hidden /> {givingLabel}
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); handleSignOut(); }} style={{ ...MENU_ITEM, color: 'var(--danger)' }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <PreviewAdminBanner web />
      <PendingReviewBanner web />

      {/* ── Body ── */}
      <main style={{ maxWidth: NP_WEB_MAX_W, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>
            {tab.title}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: INK.secondary }}>{tab.blurb}</p>
        </div>

        <NpLayoutProvider web>
          <Page />
        </NpLayoutProvider>
      </main>

      <footer style={{ padding: '0 24px 28px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: INK.subtle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/nonprofit-license/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>License</a>{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
