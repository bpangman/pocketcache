import { useEffect, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { useNp } from '../../store/NpContext';
import CoinMark from '../../components/CoinMark';
import { NP_TABS, npTabDef } from './npTabs';
import { useNpAdminActions } from './useNpAdminActions';
import { NpLayoutProvider, NpOrgMark, NP_WEB_MAX_W } from './NpLayout';

// ─── The browser-native nonprofit-admin portal ───────────────────────────────
// The admin counterpart to WebDashboard: top nav, wide multi-column body, real
// page headings. It renders the SAME tab components as the phone shell
// (npTabs.js) - the tabs declare blocks via NpPage/NpBlock and this shell lays
// them out across the window instead of stacking them in a 390px column. No tab
// logic is duplicated here; the only thing this file owns is chrome.
//
// Design language deliberately matches src/pages/WebDashboard.jsx: same INK
// scale, same CARD, same 62px sticky nav, same footer. The one difference is
// content width - 1240 rather than the donor portal's 1100, because this surface
// carries donor lists and charge-run tables.

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';
const CARD = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 2px rgba(11,42,74,0.04)',
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
    <div style={{ minHeight: '100dvh', background: '#f6f8fb' }} onClick={() => menuOpen && setMenuOpen(false)}>
      {/* ── Top nav ── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: NP_WEB_MAX_W, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <NpOrgMark npOrg={npOrg} size={34} radius={10} on="light" />
            <div style={{ lineHeight: 1.15, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {orgName}
              </p>
              <p style={{ margin: 0, fontSize: 10.5, color: INK.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CoinMark size={11} />
                admin · powered by PocketCache
              </p>
            </div>
          </div>

          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {NP_TABS.map(t => {
              const active = npTab === t.id;
              const TabIcon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setNpTab(t.id)}
                  style={{
                    border: 'none', background: active ? '#eef4fa' : 'transparent', cursor: 'pointer',
                    padding: '8px 14px', borderRadius: 10, fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? NAVY : INK.secondary,
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}
                >
                  <TabIcon size={15} style={{ color: active ? accent : INK.muted }} />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Admin menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              style={{
                border: '1px solid #dbe3ec', background: '#fff', borderRadius: 999,
                padding: '7px 13px', fontSize: 13, fontWeight: 700, color: INK.primary, cursor: 'pointer',
              }}
            >
              Admin ▾
            </button>
            {menuOpen && (
              <div
                style={{ position: 'absolute', right: 0, top: 44, width: 260, ...CARD, boxShadow: '0 12px 32px rgba(11,42,74,0.16)', padding: 8, zIndex: 40 }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: INK.primary }}>{orgName}</p>
                  <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>{npOrg.adminEmail || 'admin'}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); goGiving(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 13, fontWeight: 600, color: INK.primary, cursor: 'pointer', borderRadius: 8 }}
                >
                  🪙 {givingLabel}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); handleSignOut(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 13, fontWeight: 600, color: '#b91c1c', cursor: 'pointer', borderRadius: 8 }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main style={{ maxWidth: NP_WEB_MAX_W, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>
            {tab.title}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: INK.secondary }}>{tab.blurb}</p>
        </div>

        <NpLayoutProvider web>
          <Page />
        </NpLayoutProvider>
      </main>

      <footer style={{ padding: '0 24px 28px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: INK.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
