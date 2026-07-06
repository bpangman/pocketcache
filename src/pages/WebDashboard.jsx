import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { DEMO_USER, avgPerMonth, momChange, sinceLabel, monthsGiving } from '../data/derived';
import { TRANSACTIONS, MONTHLY_DATA } from '../data/transactions';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import { WebMyCause, WebShare, WebSettings, GiveExtraModal } from './WebPortalPages';
import { useBiometricOffer, BiometricOfferCard } from '../components/BiometricLock';
import ChargeReviewAlert from '../components/ChargeReviewAlert';

// ─── The browser-native donor portal ─────────────────────────────────────────
// This is PocketCache as if it had been built as a web product: top nav, wide
// dashboard, real tables. Same data store and account as the mobile app — a
// different portal onto the same giving.

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const SERIES = '#0D9488';       // validated vs light surface (3:1+, chroma/lightness pass)
const METER = '#D97706';        // validated match-meter fill
const CARD = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 2px rgba(11,42,74,0.04)',
};

function fmtMoney(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Billing schedule: the month's round-ups LOCK on the 1st (exact amount
// emailed to the donor) and the charge runs on the 11th — 10 full days'
// review notice (classic Reg E timing; Nathan asked whether range-based
// consent lets us move back to the 5th).
function nextChargeLabel() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.toLocaleString('en-US', { month: 'short' })} 11`;
}
function lockLabel() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.toLocaleString('en-US', { month: 'short' })} 1`;
}

function fmtDay(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (iso === today.toISOString().slice(0, 10)) return 'Today';
  if (iso === yest.toISOString().slice(0, 10)) return 'Yesterday';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

// Top-rounded bar path (4px rounded data end, square baseline)
function barPath(x, y, w, h, r = 4) {
  if (h <= r) return `M${x},${y + h} L${x},${y + h} L${x + w},${y + h} Z M${x},${y + h} L${x},${y} L${x + w},${y} L${x + w},${y + h} Z`;
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

// ─── Giving-by-month bar chart (single series, hover tooltip) ────────────────
function GivingChart() {
  const [hover, setHover] = useState(null);
  const W = 560, H = 210;
  const PAD = { top: 26, right: 12, bottom: 28, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...MONTHLY_DATA.map(m => m.donated));
  const yMax = Math.ceil((max * 1.15) / 5) * 5; // nice ceiling
  const n = MONTHLY_DATA.length;
  const slot = plotW / n;
  const barW = Math.min(44, slot * 0.55);
  const peakIdx = MONTHLY_DATA.findIndex(m => m.donated === max);

  const ticks = [0, yMax / 2, yMax];

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Monthly giving totals">
        {/* Recessive gridlines + y labels */}
        {ticks.map(t => {
          const y = PAD.top + plotH - (t / yMax) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#eef2f7" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill={INK.muted}>${t}</text>
            </g>
          );
        })}
        {/* Baseline */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#e2e8f0" strokeWidth="1" />

        {MONTHLY_DATA.map((m, i) => {
          const inProgress = i === n - 1;
          const h = (m.donated / yMax) * plotH;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const y = PAD.top + plotH - h;
          const labeled = i === peakIdx || inProgress; // selective direct labels only
          return (
            <g key={`${m.month}${m.year}`}>
              {inProgress ? (
                <path d={barPath(x, y, barW, h)} fill="#ccfbf1" stroke={SERIES} strokeWidth="1.5" />
              ) : (
                <path d={barPath(x, y, barW, h)} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.55} />
              )}
              {labeled && (
                <text x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK.secondary}>
                  ${fmtMoney(m.donated)}
                </text>
              )}
              <text x={x + barW / 2} y={PAD.top + plotH + 17} textAnchor="middle" fontSize="10.5" fill={INK.muted}>
                {m.month}
              </text>
              {/* Full-column hover hit target */}
              <rect
                x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          style={{
            position: 'absolute',
            left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%`,
            top: 0,
            transform: 'translateX(-50%)',
            background: '#0f172a', color: '#fff', borderRadius: 8,
            padding: '5px 9px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none',
          }}
        >
          {MONTHLY_DATA[hover].month} · ${fmtMoney(MONTHLY_DATA[hover].donated)}
          {hover === n - 1 && <span style={{ fontWeight: 400, opacity: 0.75 }}> · in progress</span>}
        </div>
      )}
    </div>
  );
}

// ─── KPI tile ────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, hero = false, pill = null }) {
  return (
    <div style={hero
      ? { ...CARD, border: 'none', background: 'linear-gradient(135deg, #003865 0%, #0B2A4A 100%)', padding: '18px 20px' }
      : { ...CARD, padding: '18px 20px' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: hero ? 'rgba(255,255,255,0.65)' : INK.muted }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 2px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', color: hero ? '#fff' : INK.primary }}>
        {value}
      </p>
      <p style={{ margin: 0, fontSize: 12.5, color: hero ? 'rgba(255,255,255,0.75)' : INK.secondary }}>{sub}</p>
      {pill && (
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999, padding: '3px 10px' }}>
          {pill}
        </span>
      )}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK.primary }}>{children}</h2>
      {action}
    </div>
  );
}

// ─── Activity table (shared by Overview + Activity tab) ─────────────────────
function ActivityTable({ rows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            {['Date', 'Merchant', 'Category', 'Purchase', 'Round-up'].map((h, i) => (
              <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK.muted, borderBottom: '1px solid #e5e7eb' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.id}>
              <td style={{ padding: '9px 10px', color: INK.secondary, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{fmtDay(t.date)}</td>
              <td style={{ padding: '9px 10px', color: INK.primary, fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{t.merchant}</td>
              <td style={{ padding: '9px 10px', color: INK.secondary, borderBottom: '1px solid #f1f5f9' }}>{t.category}</td>
              <td style={{ padding: '9px 10px', color: INK.secondary, textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>${fmtMoney(t.amount)}</td>
              <td style={{ padding: '9px 10px', color: SERIES, fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>+${fmtMoney(t.roundUp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Right-rail cards ────────────────────────────────────────────────────────
function CauseCard({ org }) {
  const story = org.description || org.mission || '';
  return (
    <div style={{ ...CARD, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <OrgLogo nonprofit={org} size={11} rounded="xl" />
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14.5, color: INK.primary, lineHeight: 1.25 }}>{org.name}</p>
          <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>Your chosen cause</p>
        </div>
      </div>
      {story && (
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6, color: INK.secondary, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {story}
        </p>
      )}
      <a
        href={`/demo/?orgpage=${encodeURIComponent(org.shortName || org.id.toUpperCase())}`}
        target="_blank" rel="noopener"
        style={{ fontSize: 13, fontWeight: 600, color: '#003865', textDecoration: 'none' }}
      >
        Visit {org.shortName ?? 'their'} page →
      </a>
    </div>
  );
}

function MatchCard({ match }) {
  const pct = Math.min(100, Math.round((match.matched / match.maxAmount) * 100));
  return (
    <div style={{ ...CARD, padding: 20 }}>
      <SectionTitle>Corporate match</SectionTitle>
      <p style={{ margin: '6px 0 10px', fontSize: 13, lineHeight: 1.55, color: INK.secondary }}>
        <strong style={{ color: INK.primary }}>{match.companyShort ?? match.company}</strong> is matching round-ups
        dollar-for-dollar, up to ${(match.maxAmount / 1000).toFixed(0)}K.
      </p>
      {/* Meter: labeled, never color-alone */}
      <div style={{ background: '#f1f5f9', borderRadius: 999, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: METER, borderRadius: 999 }} />
      </div>
      <p style={{ margin: '7px 0 0', fontSize: 12.5, color: INK.secondary }}>
        ${match.matched.toLocaleString()} matched · {pct}% of pool used
      </p>
      {match.sample && (
        <span style={{ display: 'inline-block', marginTop: 10, fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>
          Example partnership
        </span>
      )}
    </div>
  );
}

function EstimateCard({ pending, feeMonths, paymentMethod, npShort, onGiveExtra, skipped }) {
  const fee = feeMonths;
  const total = pending + fee;
  const row = { display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0' };
  return (
    <div style={{ ...CARD, padding: 20 }}>
      <SectionTitle>Next charge · {skipped ? 'skipped this month' : nextChargeLabel()}</SectionTitle>
      {skipped && (
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' }}>
          You&apos;re skipping this month — these round-ups are simply never charged.
          Only the $1 app fee rolls into next month&apos;s charge (it will show
          &ldquo;App fee — $1 × 2 months&rdquo;). Un-skip anytime in Settings.
        </p>
      )}
      <div style={{ marginTop: 8 }}>
        <div style={row}><span style={{ color: INK.secondary }}>Round-ups so far</span><span style={{ color: INK.primary, fontWeight: 600 }}>${fmtMoney(pending)}</span></div>
        <div style={row}><span style={{ color: INK.secondary }}>App fee — $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''}</span><span style={{ color: INK.secondary }}>+${fmtMoney(fee)}</span></div>
        <div style={{ height: 1, background: '#e5e7eb', margin: '6px 0' }} />
        <div style={row}><span style={{ color: INK.primary, fontWeight: 700 }}>One charge from {npShort}</span><span style={{ color: '#003865', fontWeight: 800, fontSize: 16 }}>≈ ${fmtMoney(total)}</span></div>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: INK.muted }}>
        Round-ups accrue through the last day of the month; the exact amount is emailed to you
        on the 1st and charged to {paymentMethod?.label ?? 'your payment method'}{paymentMethod?.last4 ? ` ····${paymentMethod.last4}` : ''} on the 11th. Demo data — no real charge is made.
      </p>
      <button
        onClick={onGiveExtra}
        style={{ width: '100%', marginTop: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 700, color: '#003865', cursor: 'pointer' }}
      >
        💚 Give a little extra…
      </button>
    </div>
  );
}

// ─── The portal ──────────────────────────────────────────────────────────────
const NAV_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'mycause', label: 'My Cause' },
  { id: 'share', label: 'Share' },
  { id: 'settings', label: 'Settings' },
];

export default function WebDashboard() {
  const {
    selectedNonprofit, totalDonated, pendingRoundUps, skipNextCharge,
    feeMonths, paymentMethod, signOut, adminRole, setPage, setLastMode, hasAccount,
  } = useApp();
  const brand = useTheme();
  const [navTab, setNavTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [giveExtra, setGiveExtra] = useState(false);
  const bioOffer = useBiometricOffer();

  const org = selectedNonprofit;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';
  const userName = hasAccount?.name ?? DEMO_USER.name;
  const userEmail = hasAccount?.email ?? DEMO_USER.email;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb' }} onClick={() => menuOpen && setMenuOpen(false)}>
      <GiveExtraModal show={giveExtra} onClose={() => setGiveExtra(false)} />
      <BiometricOfferCard offer={bioOffer} surface="web" />
      <ChargeReviewAlert surface="web" />
      {/* ── Top nav ── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {org ? <OrgLogo nonprofit={org} size={9} rounded="lg" /> : <CoinMark size={30} />}
            <div style={{ lineHeight: 1.15, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {brand.appName ?? `${npShort} Round-Up`}
              </p>
              <p style={{ margin: 0, fontSize: 10.5, color: INK.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                powered by PocketCache
              </p>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {NAV_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setNavTab(t.id)}
                style={{
                  border: 'none', background: navTab === t.id ? '#eef4fa' : 'transparent', cursor: 'pointer',
                  padding: '8px 14px', borderRadius: 10, fontSize: 13.5,
                  fontWeight: navTab === t.id ? 700 : 500,
                  color: navTab === t.id ? '#003865' : INK.secondary,
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {/* Account menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              aria-label="Account menu"
              style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid #dbe3ec', background: 'linear-gradient(135deg, #003865, #0B2A4A)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              {userName[0]}
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', right: 0, top: 46, width: 240, ...CARD, boxShadow: '0 12px 32px rgba(11,42,74,0.16)', padding: 8, zIndex: 40 }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: INK.primary }}>{userName}</p>
                  <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>{userEmail}</p>
                </div>
                {adminRole && (
                  <button
                    onClick={() => { setLastMode('admin'); setPage('np-dashboard'); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 13, fontWeight: 600, color: INK.primary, cursor: 'pointer', borderRadius: 8 }}
                  >
                    Switch to admin dashboard
                  </button>
                )}
                <button
                  onClick={() => signOut()}
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
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 40px' }}>
        {navTab === 'overview' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>
                {greeting}, {userName} 👋
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: INK.secondary }}>
                Here&apos;s your giving with {org?.name ?? 'your nonprofit'}.
              </p>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16, display: 'grid', marginBottom: 20 }}>
              <Kpi hero label="Total donated" value={`$${fmtMoney(totalDonated)}`} sub={`${sinceLabel} · all time`} pill={`🔥 ${monthsGiving}-month giving streak`} />
              <Kpi label="Pending this month" value={`$${fmtMoney(pendingRoundUps)}`} sub={`${TRANSACTIONS.length} round-ups so far`} />
              <Kpi
                label="Average month"
                value={`$${fmtMoney(avgPerMonth)}`}
                sub={momChange != null ? `${momChange >= 0 ? '▲' : '▼'} ${Math.abs(momChange)}% vs. prior month` : 'across completed months'}
              />
              <Kpi
                label="Next charge"
                value={skipNextCharge ? 'Skipped' : nextChargeLabel()}
                sub={skipNextCharge
                  ? "Skipped — round-ups won't be charged; only the $1 fee rolls to next month ($1 × 2)"
                  : `≈ $${fmtMoney(pendingRoundUps + feeMonths)} incl. $1 fee · exact amount locks ${lockLabel()}`}
              />
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ gap: 20, display: 'grid', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 20 }}>
                <div style={{ ...CARD, padding: 20 }}>
                  <SectionTitle>Giving by month</SectionTitle>
                  <p style={{ margin: '2px 0 10px', fontSize: 12.5, color: INK.muted }}>
                    Monthly round-up totals · current month still in progress
                  </p>
                  <GivingChart />
                </div>
                <div style={{ ...CARD, padding: 20 }}>
                  <SectionTitle
                    action={
                      <button onClick={() => setNavTab('activity')} style={{ border: 'none', background: 'transparent', color: '#003865', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        View all →
                      </button>
                    }
                  >
                    Recent activity
                  </SectionTitle>
                  <p style={{ margin: '2px 0 8px', fontSize: 12.5, color: INK.muted }}>
                    Purchases on your tracked card and the spare change they set aside
                  </p>
                  <ActivityTable rows={TRANSACTIONS.slice(0, 7)} />
                </div>
              </div>

              <div style={{ display: 'grid', gap: 20 }}>
                {org && <CauseCard org={org} />}
                {org?.corporateMatch?.active && <MatchCard match={org.corporateMatch} />}
                <EstimateCard
                  pending={pendingRoundUps}
                  feeMonths={feeMonths}
                  paymentMethod={paymentMethod}
                  npShort={npShort}
                  onGiveExtra={() => setGiveExtra(true)}
                  skipped={skipNextCharge}
                />
              </div>
            </div>
          </>
        )}

        {navTab === 'activity' && (
          <div style={{ ...CARD, padding: 20 }}>
            <SectionTitle>All activity</SectionTitle>
            <p style={{ margin: '2px 0 10px', fontSize: 12.5, color: INK.muted }}>
              ${fmtMoney(pendingRoundUps)} in round-ups so far this cycle · demo data
            </p>
            <ActivityTable rows={TRANSACTIONS} />
          </div>
        )}

        {navTab === 'mycause' && <WebMyCause />}
        {navTab === 'share' && <WebShare />}
        {navTab === 'settings' && <WebSettings />}
      </main>

      <footer style={{ padding: '0 24px 28px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: INK.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
