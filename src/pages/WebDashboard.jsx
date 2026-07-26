import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import {
  DEMO_USER, avgPerMonth, momChange, sinceLabel, monthsGiving, totalRoundupsCount,
} from '../data/derived';
import { TRANSACTIONS, CURRENT_MONTH_PENDING } from '../data/transactions';
import { fmtMoney, fmtCount } from '../lib/format';
import { getMilestonesUpTo, matchProgress, monthlyHistory, taxYearSummary } from '../lib/donorContent';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import { WebMyCause, WebShare, WebSettings, GiveExtraModal, AdjustChargeModal } from './WebPortalPages';
import { useBiometricOffer, BiometricOfferCard } from '../components/BiometricLock';
import ChargeReviewAlert from '../components/ChargeReviewAlert';
import {
  chargeTotal, cycleDays, daysUntilNextCharge, effectiveCharge, nextChargeDate,
  nextChargeLabel, previousChargeDate,
} from '../lib/billing';
// Skipped-cycle copy comes from the app Dashboard so the two donor surfaces
// render byte-identical sentences and figures for a skip. See the block at the
// top of Dashboard.jsx for the rule these strings encode.
import {
  SKIP_COLLECT_AMOUNT, SKIP_COLLECT_LABEL, SKIP_RESUME_LINE, SKIP_TILE_SUB,
  SKIP_UNDO_LINE, skipAccruedLine, skipFeeLine, skipStatusLine,
} from './Dashboard';

// ─── The browser-native donor portal ─────────────────────────────────────────
// This is PocketCache as if it had been built as a web product: top nav, wide
// dashboard, real tables. Same data store and account as the mobile app  -  a
// different portal onto the same giving.
//
// The `data-testid` hooks in this file follow the web-<feature>-<element>
// convention documented in WebPortalPages.jsx (see the "data-testid convention"
// block there). Do not invent a second naming scheme here.

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const SERIES = '#0D9488';       // validated vs light surface (3:1+, chroma/lightness pass)
const METER = '#D97706';        // validated match-meter fill
const CARD = {
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 2px rgba(11,42,74,0.04)',
};

// Money formatting comes from lib/format. This file used to define its own
// byte-identical `fmtMoney`, which is how a second formatter (`.toFixed(2)`)
// survived elsewhere in the product: two implementations, no single place to fix.

// Billing schedule: the month's round-ups LOCK on the 1st (exact amount
// emailed to the donor) and the charge runs on the 11th  -  10 full days'
// review notice (classic Reg E timing; Nathan asked whether range-based
// consent lets us move back to the 5th).
//
// The dates and the amounts both come from lib/billing now. The old local
// helpers computed `new Date(y, m + 1, 1)` and always named NEXT month's 11th,
// which is wrong for days 1 to 10 of every month: during the review window the
// upcoming charge is THIS month's 11th, and the app said so while the web portal
// pointed a month further out. `lockLabel` is derived from the same charge date
// so the pair can never disagree again.
function lockLabel(now = new Date()) {
  const charge = nextChargeDate(now);
  return `${charge.toLocaleString('en-US', { month: 'short' })} 1`;
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
/**
 * `data` MUST come from `monthlyHistory(pendingRoundUps)`.
 *
 * This chart used to read `MONTHLY_DATA` directly, whose last entry is the RAW
 * sum of this month's round-ups, while every headline beside it printed the
 * multiplied `pendingRoundUps`. At 3x the portal drew a $4.63 bar under a
 * "$13.89 this month" figure for the same month. Taking the series as a prop is
 * what makes that impossible to reintroduce here.
 *
 * Bar, not area, deliberately: six discrete monthly totals that a donor compares
 * against each other. At desktop width the bars carry their own value labels and
 * a hover tooltip; an area chart at six points reads as a trend line and makes
 * the in-progress month look like a collapse rather than a partial total.
 */
function GivingChart({ data }) {
  const [hover, setHover] = useState(null);
  const W = 560, H = 210;
  const PAD = { top: 26, right: 12, bottom: 28, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.map(m => m.donated));
  const yMax = Math.max(5, Math.ceil((max * 1.15) / 5) * 5); // nice ceiling
  const n = data.length;
  const slot = plotW / n;
  const barW = Math.min(44, slot * 0.55);
  const peakIdx = data.findIndex(m => m.donated === max);

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

        {data.map((m, i) => {
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
                <text
                  x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK.secondary}
                  data-testid={inProgress ? 'web-chart-current-value' : undefined}
                >
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
          {data[hover].month} · ${fmtMoney(data[hover].donated)}
          {hover === n - 1 && <span style={{ fontWeight: 400, opacity: 0.75 }}> · in progress</span>}
        </div>
      )}
    </div>
  );
}

// ─── KPI tile ────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, hero = false, pill = null, testId }) {
  return (
    <div data-testid={testId} style={hero
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

// ─── Milestones ──────────────────────────────────────────────────────────────
// The portal had NO milestones feature at all while the app celebrated every
// tier, so the same donor was "$38.95 from the $100 club" on the phone and had
// never heard of a club in the browser.
//
// The tier formula lives in lib/donorContent.js and BOTH surfaces import it, so
// a badge can never light up on one and not the other.

/**
 * The portal's milestone card: the same badge row and the same
 * progress-to-next-tier bar the app's Home carries, in the portal's own card
 * language. Driven by lifetime `totalDonated`, exactly as the app is, so a badge
 * can never light up on one surface and not the other.
 */
function MilestonesCard({ total }) {
  const milestones = getMilestonesUpTo(total);
  const next = milestones.find(m => !m.achieved);
  const pct = next ? Math.min((total / next.amount) * 100, 100) : 100;
  return (
    <div style={{ ...CARD, padding: 20 }} data-testid="web-milestones">
      <SectionTitle
        action={next && (
          <span style={{ fontSize: 12.5, color: INK.muted }} data-testid="web-milestones-to-next">
            ${fmtMoney(next.amount - total)} to next
          </span>
        )}
      >
        Milestones
      </SectionTitle>
      <p style={{ margin: '2px 0 0', fontSize: 12.5, color: INK.muted }}>
        Unlocked by your lifetime giving
      </p>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '14px 2px 4px' }}>
        {milestones.map(m => (
          <div key={m.amount} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, lineHeight: 1,
              background: m.achieved ? 'linear-gradient(135deg, #003865 0%, #0B2A4A 100%)' : '#f1f5f9',
              boxShadow: m.achieved ? '0 2px 8px rgba(11,42,74,0.18)' : 'none',
              filter: m.achieved ? 'none' : 'grayscale(1)', opacity: m.achieved ? 1 : 0.45,
            }}>
              {m.emoji}
            </div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: m.achieved ? INK.secondary : INK.muted }}>
              {m.label}
            </p>
          </div>
        ))}
      </div>
      {next && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: INK.muted, marginBottom: 5 }}>
            <span>${fmtMoney(total)}</span>
            <span>${fmtCount(next.amount)}</span>
          </div>
          <div style={{ background: '#f1f5f9', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: SERIES, borderRadius: 999 }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: INK.secondary }}>
            {Math.round(pct)}% of the way to the {next.label}.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Activity table (the Activity view's ledger) ─────────────────────────────
// Overview used to render a 7-row copy of this table with the caption
// "Purchases on your tracked card…". Activity owns transactions and Settings owns
// the tracked card, so Overview now carries a link instead.
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
/**
 * Compact cause row - NAVIGATION ONLY.
 *
 * This was `CauseCard`, which carried a 3-line clamp of the nonprofit's mission.
 * My Cause owns the mission (in full, unclamped), so repeating a truncated copy
 * here was both a duplicate and the worse version of it. Logo, name and the two
 * ways into the cause are all that is left.
 */
function CauseRow({ org, onOpen }) {
  return (
    <div style={{ ...CARD, padding: 16 }} data-testid="web-cause-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <OrgLogo nonprofit={org} size={10} rounded="xl" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: INK.primary, lineHeight: 1.25 }}>{org.name}</p>
          <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>Your chosen cause</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <button
          onClick={onOpen}
          style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 13, fontWeight: 600, color: '#003865', cursor: 'pointer' }}
        >
          My Cause →
        </button>
        <a
          href={`/demo/?orgpage=${encodeURIComponent(org.shortName || org.id.toUpperCase())}`}
          target="_blank" rel="noopener"
          style={{ fontSize: 13, fontWeight: 600, color: INK.secondary, textDecoration: 'none' }}
        >
          Visit {org.shortName ?? 'their'} page ↗
        </a>
      </div>
    </div>
  );
}

/**
 * One quiet line pointing at the active corporate match, the twin of the app
 * Home's `MatchLine`.
 *
 * This was `MatchCard`: its own hand-written sentence ("X is matching round-ups
 * dollar-for-dollar, up to $50K"), its own percentage math and its own meter -
 * a THIRD wording of the fact My Cause already displays in full. Every string
 * here now comes from `matchProgress()`, and the card is a link into the tab
 * that owns the subject.
 */
function MatchLine({ match, onOpen }) {
  const mp = matchProgress(match);
  return (
    <button
      onClick={onOpen}
      data-testid="web-match-line"
      style={{
        ...CARD, padding: 16, width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      {match.logoUrl ? (
        <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={match.logoUrl} alt={match.companyShort ?? match.company} style={{ height: 22, objectFit: 'contain' }} />
        </span>
      ) : (
        <span style={{ width: 36, height: 36, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏢</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: INK.primary }}>{mp.headline}</span>
        <span style={{ display: 'block', fontSize: 12, color: METER, fontWeight: 600, marginTop: 2 }}>See the match on My Cause</span>
      </span>
      <span style={{ color: INK.muted, flexShrink: 0 }}>›</span>
    </button>
  );
}

/**
 * Overview's pointer at the ledger. Replaces the 7-row transaction table.
 * The two round-up COUNTS are Home's own facts (the app's third stat tile), so
 * they live here rather than on Activity, which owns the transactions themselves.
 */
function ActivityLinkCard({ onOpen }) {
  const figure = { margin: 0, fontSize: 20, fontWeight: 800, color: INK.primary, letterSpacing: '-0.3px' };
  const cap = { margin: '2px 0 0', fontSize: 11.5, color: INK.muted };
  return (
    <div style={{ ...CARD, padding: 20 }} data-testid="web-activity-link">
      <SectionTitle
        action={
          <button onClick={onOpen} style={{ border: 'none', background: 'transparent', color: '#003865', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            View activity →
          </button>
        }
      >
        Round-ups
      </SectionTitle>
      <div style={{ display: 'flex', gap: 32, marginTop: 12 }}>
        <div>
          <p style={figure}>{fmtCount(TRANSACTIONS.length)}</p>
          <p style={cap}>This cycle</p>
        </div>
        <div>
          <p style={figure}>{fmtCount(totalRoundupsCount)}</p>
          <p style={cap}>All time (est.)</p>
        </div>
      </div>
    </div>
  );
}

// The upcoming-charge card. Every figure here goes through lib/billing so the
// web portal and the app cannot disagree: before this, the web ignored
// `monthlyCap` and `chargeAdjustment` entirely, so a donor with a $10 cap and
// $22 of round-ups saw $10 in the app and $22 in the browser from the same
// stored state.
function EstimateCard({
  pending, feeMonths, npShort, onGiveExtra, skipped,
  monthlyCap, chargeAdjustment, onAdjust, monthlyMinimum,
}) {
  const fee = feeMonths;
  // Cycle countdown and progress, both from lib/billing. The portal had NEITHER
  // while the app showed a "17 days left" figure and a charge-day-to-charge-day
  // bar, so a donor could not tell from the browser how much of the cycle was
  // left. Measured charge day to charge day (28 to 31 days), never `daysLeft/30`.
  const daysLeft = daysUntilNextCharge();
  const cycleLength = cycleDays();
  const cyclePct = Math.max(0, Math.min(100, ((cycleLength - daysLeft) / cycleLength) * 100));
  const cycleStartLabel = previousChargeDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const roundUps = effectiveCharge({ pendingRoundUps: pending, monthlyCap, chargeAdjustment });
  const total = chargeTotal({ pendingRoundUps: pending, monthlyCap, chargeAdjustment, feeMonths });
  const capActive = monthlyCap !== null && monthlyCap !== undefined && pending > monthlyCap;
  const adjusted = chargeAdjustment !== null && chargeAdjustment !== undefined;
  // Same gate as the app Dashboard: under the nonprofit's monthly minimum the
  // month rolls FORWARD instead of charging, so there is nothing to adjust - and
  // nothing to bill. The web portal used to apply this gate to the "Adjust this
  // charge" button only and still print "One charge from BGCA ≈ $5.63" above it,
  // while the app said "$4.63 so far  -  rolls over at month-end" from the same
  // stored state. That is the demo's DEFAULT state ($4.63 pending vs BGCA's $5
  // minimum), so the two surfaces contradicted each other on first load.
  const belowMinimum = pending < monthlyMinimum;
  const rollingOver = belowMinimum && !skipped;
  const row = { display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0' };
  return (
    <div style={{ ...CARD, padding: 20 }}>
      <SectionTitle>Next charge · {skipped ? 'skipped this month' : nextChargeLabel()}</SectionTitle>
      {skipped && (
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' }} data-testid="web-estimate-skipped">
          {skipStatusLine()}{' '}{skipAccruedLine(pending)}{' '}{skipFeeLine(feeMonths)}{' '}{SKIP_RESUME_LINE}{' '}{SKIP_UNDO_LINE}
        </p>
      )}

      {/* ── Where this cycle is ── */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: INK.secondary }}>
            {cycleLength}-day cycle
          </p>
          <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#0B2A4A', letterSpacing: '-0.4px' }} data-testid="web-cycle-days-left">
              {daysLeft}
            </span>
            {/* The countdown measures the CYCLE, and on a skipped cycle its end is
                not a charge - "days left" beside "nothing is collected" would read
                as a countdown to money leaving. Same split as the app. */}
            <span style={{ fontSize: 12, color: INK.muted }}>{skipped ? 'days left in cycle' : 'days left'}</span>
          </p>
        </div>
        <div style={{ background: '#f1f5f9', borderRadius: 999, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${cyclePct}%`, height: '100%', background: SERIES, borderRadius: 999 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11.5, color: INK.muted }}>
          <span>Cycle start {cycleStartLabel}</span>
          <span>{skipped ? 'Skipped' : `Charge day ${nextChargeLabel()}`}</span>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
        <div style={row}>
          {/* Accrual line: on a skipped cycle this is the honest "you did round up
              this much", and the skip banner above says it is never charged. */}
          <span style={{ color: INK.secondary }}>Round-ups so far</span>
          <span style={{ color: INK.primary, fontWeight: 600 }} data-testid="web-estimate-roundups">
            {!skipped && roundUps !== pending
              ? <><s style={{ color: INK.muted, fontWeight: 400 }}>${fmtMoney(pending)}</s> ${fmtMoney(roundUps)}</>
              : `$${fmtMoney(pending)}`}
          </span>
        </div>
        {/* The $1 fee is NOT on a skipped charge - it rolls onto the next one, and
            the banner names which. Printing "+$1.00" here would contradict that. */}
        {!skipped && (
          <div style={row}><span style={{ color: INK.secondary }}>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''}</span><span style={{ color: INK.secondary }}>+${fmtMoney(fee)}</span></div>
        )}
        <div style={{ height: 1, background: '#e5e7eb', margin: '6px 0' }} />
        {skipped ? (
          /* Zero, not a total. This row used to read "One charge from BGCA
             ≈ $14.89" directly under copy saying the charge was skipped. */
          <div style={row}>
            <span style={{ color: INK.primary, fontWeight: 700 }}>{SKIP_COLLECT_LABEL}</span>
            <span style={{ color: '#b45309', fontWeight: 800, fontSize: 16 }} data-testid="web-estimate-total">{SKIP_COLLECT_AMOUNT}</span>
          </div>
        ) : rollingOver ? (
          <div style={row}>
            <span style={{ color: INK.primary, fontWeight: 700 }}>Nothing charged yet</span>
            <span style={{ color: '#b45309', fontWeight: 800, fontSize: 13.5 }} data-testid="web-estimate-rollover">
              ${fmtMoney(pending)} so far  -  rolls over at month-end
            </span>
          </div>
        ) : (
          <div style={row}><span style={{ color: INK.primary, fontWeight: 700 }}>One charge from {npShort}</span><span style={{ color: '#003865', fontWeight: 800, fontSize: 16 }} data-testid="web-estimate-total">≈ ${fmtMoney(total)}</span></div>
        )}
      </div>
      {/* Rollover explainer  -  the app Dashboard's below-minimum copy verbatim. */}
      {rollingOver && (
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.55, color: '#b45309' }}>
          Not quite ${monthlyMinimum} yet  -  your round-ups carry forward. We settle every 3 months at most, so nothing&apos;s ever left behind.
          {' '}&middot; $1/month fee rolls too  -  {feeMonths} month{feeMonths !== 1 ? 's' : ''} so far (${feeMonths})  -  itemized on your charge.
        </p>
      )}
      {/* Cap / adjustment notes  -  same precedence and wording as the app Dashboard.
          Suppressed while rolling over, exactly as the app suppresses them. */}
      {!skipped && !belowMinimum && capActive && !adjusted && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b45309' }} data-testid="web-estimate-capped">
          Capped at ${fmtMoney(monthlyCap)}  -  the rest won&apos;t be charged.
        </p>
      )}
      {!skipped && !belowMinimum && adjusted && (
        <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 600, color: '#059669' }} data-testid="web-estimate-adjusted">
          Adjusted to ${fmtMoney(chargeAdjustment)} for this month.
        </p>
      )}
      {/* The schedule explainer promises a charge on the 11th, which is exactly
          what a skipped cycle does NOT do. On a skip the resumed-timing sentence
          in the banner above (SKIP_RESUME_LINE, shared with the app) replaces it,
          so neither surface ever pairs a skip with "charged on the 11th". */}
      {!skipped && (
        /* The payment method used to be named right here ("charged to Credit or
           Debit Card ····4242 on the 11th"). Settings owns the payment method -
           it is the only screen that can change it - so this sentence keeps the
           schedule and drops the instrument. */
        <p style={{ margin: '8px 0 0', fontSize: 12, color: INK.muted }} data-testid="web-estimate-schedule">
          Round-ups accrue through the last day of the month; the exact amount is emailed to you
          on the 1st and charged on the 11th. Demo data  -  no real charge is made.
        </p>
      )}
      {/* Always available, exactly like the app's Dashboard button. The shared
          ChargeReviewAlert only offers this on days 1 to 10 and only until it is
          acknowledged, which left web donors with no way to adjust at all. */}
      {!skipped && !belowMinimum && (
        <button
          onClick={onAdjust}
          data-testid="web-adjust-charge-button"
          style={{ width: '100%', marginTop: 12, padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 700, color: '#003865', cursor: 'pointer' }}
        >
          Adjust this charge →
        </button>
      )}
      <button
        onClick={onGiveExtra}
        style={{ width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 700, color: '#003865', cursor: 'pointer' }}
      >
        💚 Give a little extra…
      </button>
    </div>
  );
}

// ─── Activity view ───────────────────────────────────────────────────────────
/**
 * The portal's ledger tab. It used to be three elements - a title, one caption
 * and the table - with no chart and no figures at all, while the app's Activity
 * tab carried this month's total, the MoM change, the monthly chart and the month
 * summary. This brings it to parity and adds the tax-year summary the app gained
 * in the same pass, so neither surface has a fact the other lacks.
 *
 * The lifetime total is deliberately NOT here: Overview's hero owns it. Neither is
 * a billing explainer - Settings owns that, and the one pointer this tab needs
 * (where to download the history) is a single line at the bottom of the tax card.
 */
function ActivityView({ pending, history, org, multiplier, onSettings }) {
  const current = history[history.length - 1];
  const currentMonthLabel = `${current.month} ${current.year}`;
  const taxYear = new Date().getFullYear();
  const tax = taxYearSummary(pending, taxYear);
  const taxMonthsLabel = tax.months === 1 ? '1 completed month' : `${tax.months} completed months`;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>Activity</h1>
        <p style={{ margin: '3px 0 0', fontSize: 13.5, color: INK.secondary }}>Your giving history  -  demo data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          {/* This month + the monthly chart, the two facts that belong together:
              the final bar IS this figure (both read monthlyHistory). */}
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
                  This month
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', color: INK.primary }} data-testid="web-activity-month-total">
                  ${fmtMoney(pending)}
                </p>
                {org && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <OrgLogo nonprofit={org} size={5} rounded="md" />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: INK.secondary }}>{org.name}</span>
                  </span>
                )}
              </div>
              {momChange != null && (
                <span
                  data-testid="web-activity-mom"
                  style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 11px', whiteSpace: 'nowrap',
                    color: momChange >= 0 ? '#047857' : '#b91c1c',
                    background: momChange >= 0 ? '#ecfdf5' : '#fef2f2',
                  }}
                >
                  {momChange >= 0 ? '↑' : '↓'} {Math.abs(momChange).toFixed(0)}% vs last month
                </span>
              )}
            </div>
            <div style={{ height: 1, background: '#f1f5f9', margin: '16px 0 12px' }} />
            <SectionTitle>Giving by month</SectionTitle>
            <p style={{ margin: '2px 0 10px', fontSize: 12.5, color: INK.muted }}>
              Monthly round-up totals · {currentMonthLabel} still in progress
            </p>
            <GivingChart data={history} />
          </div>

          {/* Month summary pill  -  raw round-ups and the boost shown separately so
              the multiplied headline above is traceable. */}
          <div style={{ ...CARD, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }} data-testid="web-activity-month-summary">
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ fontSize: 22 }}>🗓️</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK.primary }}>{currentMonthLabel}</span>
                <span style={{ display: 'block', fontSize: 12, color: INK.muted }}>
                  {fmtCount(TRANSACTIONS.length)} transactions · ${fmtMoney(CURRENT_MONTH_PENDING)} rounded up
                  {multiplier > 1 && ` × ${multiplier} boost`}
                </span>
              </span>
            </span>
            <span style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: '#047857' }}>${fmtMoney(pending)}</span>
              {multiplier > 1 && (
                <span style={{ display: 'block', fontSize: 11.5, color: INK.muted }}>
                  ${fmtMoney(CURRENT_MONTH_PENDING)} × {multiplier}
                </span>
              )}
            </span>
          </div>

          <div style={{ ...CARD, padding: 20 }}>
            <SectionTitle>All activity</SectionTitle>
            <p style={{ margin: '2px 0 10px', fontSize: 12.5, color: INK.muted }}>
              Every purchase this cycle and the spare change it set aside
            </p>
            <ActivityTable rows={TRANSACTIONS} />
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {/* Tax-year summary. Completed months only: the in-progress month has
              not been charged, so counting it would overstate what a donor could
              substantiate. Figures come from taxYearSummary(). */}
          <div style={{ ...CARD, padding: 20 }} data-testid="web-taxyear">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
                  {taxYear} tax year
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: INK.primary }} data-testid="web-taxyear-total">
                  ${fmtMoney(tax.donated)}
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                Demo data
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: INK.muted }} data-testid="web-taxyear-months">
              {tax.months === 0 ? 'No completed months yet this year' : `Donated across ${taxMonthsLabel}`}
              {' · '}{currentMonthLabel} still in progress
            </p>
            <p style={{ margin: '12px 0 0', paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 12.5, lineHeight: 1.6, color: INK.secondary }}>
              Your round-ups are tax-deductible. The $1 monthly app fee is not (${fmtMoney(tax.feeMonths)} so far
              this year). {npShort} issues your receipt.
            </p>
            <button
              onClick={onSettings}
              data-testid="web-taxyear-settings-link"
              style={{
                width: '100%', marginTop: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid #cbd5e1',
                background: '#fff', fontSize: 13, fontWeight: 700, color: '#003865', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left',
              }}
            >
              <span>Download my giving history in Settings</span>
              <span style={{ color: INK.muted, flexShrink: 0 }}>›</span>
            </button>
          </div>
        </div>
      </div>
    </>
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
    feeMonths, signOut, adminRole, setPage, setLastMode, hasAccount,
    monthlyCap, chargeAdjustment, setChargeAdjustment, roundUpMultiplier,
  } = useApp();
  const brand = useTheme();
  const [navTab, setNavTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [giveExtra, setGiveExtra] = useState(false);
  const [adjustCharge, setAdjustCharge] = useState(false);
  const bioOffer = useBiometricOffer();

  // One number for "what will actually be charged", from lib/billing.
  const upcomingCharge = chargeTotal({ pendingRoundUps, monthlyCap, chargeAdjustment, feeMonths });
  // Below the nonprofit's minimum nothing is collected, so this tile must not
  // quote a charge - the app's card says "rolls over at month-end" here.
  const monthlyMinimum = selectedNonprofit?.monthlyMinimum ?? 5;
  const rollingOver = pendingRoundUps < monthlyMinimum && !skipNextCharge;

  const org = selectedNonprofit;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';
  const userName = hasAccount?.name ?? DEMO_USER.name;
  const userEmail = hasAccount?.email ?? DEMO_USER.email;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  // The one series every chart on this surface plots: MONTHLY_DATA with the
  // in-progress month swapped for the live multiplied figure, so the final bar
  // always equals the headline "this month" number.
  const history = useMemo(() => monthlyHistory(pendingRoundUps), [pendingRoundUps]);

  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb' }} onClick={() => menuOpen && setMenuOpen(false)}>
      <GiveExtraModal show={giveExtra} onClose={() => setGiveExtra(false)} />
      <AdjustChargeModal
        show={adjustCharge}
        onClose={() => setAdjustCharge(false)}
        pendingRoundUps={pendingRoundUps}
        chargeAdjustment={chargeAdjustment}
        setChargeAdjustment={setChargeAdjustment}
        monthlyCap={monthlyCap}
      />
      <BiometricOfferCard offer={bioOffer} surface="web" />
      <ChargeReviewAlert surface="web" />
      {/* ── Top nav ──
          zIndex 30/40 here are PAGE CHROME (sticky header, account dropdown),
          not overlays: lib/overlay.js's Z scale starts at the sheet/modal layer
          and every scrim in this portal sits above both. Nothing to convert. */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {org ? <OrgLogo nonprofit={org} size={9} rounded="lg" /> : <CoinMark size={30} />}
            <div style={{ lineHeight: 1.15, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {brand.appName ?? `${npShort} Round-Up`}
              </p>
              {/* "powered by PocketCache" was here AND in the footer on every
                  single view. The footer keeps it (Settings owns the attribution
                  and the version string); the header carries the app name alone. */}
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
              {/* Accrual tile: raw round-ups are the honest figure, but on a
                  skipped cycle the sub-label has to say they are never collected
                  (same string the app's Pending tile uses). */}
              <Kpi
                testId="web-kpi-pending"
                label="Pending this month"
                value={`$${fmtMoney(pendingRoundUps)}`}
                sub={skipNextCharge ? SKIP_TILE_SUB : `${TRANSACTIONS.length} round-ups so far`}
              />
              <Kpi
                label="Average month"
                value={`$${fmtMoney(avgPerMonth)}`}
                sub={momChange != null ? `${momChange >= 0 ? '▲' : '▼'} ${Math.abs(momChange)}% vs. prior month` : 'across completed months'}
              />
              <Kpi
                testId="web-kpi-next-charge"
                label="Next charge"
                // The tile's headline figure on a skipped cycle is the amount, not
                // the word "Skipped": $0.00 is what leaves the account.
                value={skipNextCharge ? SKIP_COLLECT_AMOUNT : nextChargeLabel()}
                sub={skipNextCharge
                  ? `${skipStatusLine()} ${skipFeeLine(feeMonths)}`
                  : rollingOver
                    ? `$${fmtMoney(pendingRoundUps)} so far  -  rolls over at month-end (under ${npShort}'s $${monthlyMinimum} minimum)`
                    : `≈ $${fmtMoney(upcomingCharge)} incl. $1 fee · exact amount locks ${lockLabel()}`}
              />
            </div>

            {/* Main grid.
                LAYOUT: the chart moved to Activity and the 7-row table became a
                link, which emptied the wide left column. Rather than let Overview
                become a wall of one huge card, the freed width went to the two
                things the portal was missing - Milestones (a badge row genuinely
                wants horizontal room, and at desktop width every tier fits with no
                scrolling, which the phone cannot do) and the round-up counts - and
                the cause row and match line moved across with them, because both
                are wide horizontal rows that read badly squeezed into a rail.
                That leaves the rail with ONE subject, the upcoming charge, with the
                cycle countdown inside it so the number sits beside the date it
                counts to, exactly where the app puts it. It also stops the left
                column from ending 300px above the rail, which is what a naive
                "just delete the two cards" pass produced. */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ gap: 20, display: 'grid', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 20 }}>
                <MilestonesCard total={totalDonated} />
                {org && <CauseRow org={org} onOpen={() => setNavTab('mycause')} />}
                {org?.corporateMatch?.active && (
                  <MatchLine match={org.corporateMatch} onOpen={() => setNavTab('mycause')} />
                )}
                <ActivityLinkCard onOpen={() => setNavTab('activity')} />
              </div>

              <div style={{ display: 'grid', gap: 20 }}>
                <EstimateCard
                  pending={pendingRoundUps}
                  feeMonths={feeMonths}
                  npShort={npShort}
                  onGiveExtra={() => setGiveExtra(true)}
                  skipped={skipNextCharge}
                  monthlyCap={monthlyCap}
                  chargeAdjustment={chargeAdjustment}
                  onAdjust={() => setAdjustCharge(true)}
                  monthlyMinimum={org?.monthlyMinimum ?? 5}
                />
              </div>
            </div>
          </>
        )}

        {navTab === 'activity' && (
          <ActivityView
            pending={pendingRoundUps}
            history={history}
            org={org}
            multiplier={roundUpMultiplier}
            onSettings={() => setNavTab('settings')}
          />
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
