import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { DEMO_USER, FIRST_MONTH_LABEL } from '../data/derived';
import { fmtMoney, fmtCount } from '../lib/format';
import { getMilestonesUpTo, matchProgress, monthlyHistoryFor, taxYearSummary } from '../lib/donorContent';
import { greetingNameFor } from '../lib/donorAuth';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import PocketCacheWordmark, { PoweredByWordmark } from '../components/PocketCacheWordmark';
import NamePromptCard from '../components/NamePromptCard';
import {
  WebMyCause, WebShare, WebSettings, GiveExtraModal, AdjustChargeModal, TransferNonprofitModal,
} from './WebPortalPages';
import ChargeReviewAlert from '../components/ChargeReviewAlert';
import {
  chargeTotal, cycleDays, daysUntilNextCharge, effectiveCharge, nextChargeDate,
  nextChargeLabel, previousChargeDate, processingCoverFor,
} from '../lib/billing';
// Skipped-cycle copy comes from lib/donorContent, the same module the app
// Dashboard reads, so the two donor surfaces render byte-identical sentences and
// figures for a skip. The honesty rule these strings encode - the "only charged
// in the months you give" framing never appears without the $1-rolls-forward
// sentence beside it - is documented at the top of that section.
import {
  SKIP_COLLECT_AMOUNT, SKIP_COLLECT_LABEL, SKIP_TILE_SUB,
  skipExplainer, skipSummaryLine,
} from '../lib/donorContent';

// ─── The browser-native donor portal ─────────────────────────────────────────
// This is PocketCache as if it had been built as a web product: top nav, wide
// dashboard, real tables. Same data store and account as the mobile app  -  a
// different portal onto the same giving.
//
// The `data-testid` hooks in this file follow the web-<feature>-<element>
// convention documented in WebPortalPages.jsx (see the "data-testid convention"
// block there). Do not invent a second naming scheme here.

import { INK, CARD, SHADOW, RADIUS, HERO_TEXTURE, NUMS } from '../lib/webTheme';

const SERIES = '#0D9488';       // validated vs light surface (3:1+, chroma/lightness pass)
const METER = '#D97706';        // validated match-meter fill

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
        <defs>
          {/* Editorial bar treatment: a soft vertical ramp instead of a flat
              default-chart fill (same move as the marketing fee chart). */}
          <linearGradient id="webGivingBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14B8A6" />
            <stop offset="1" stopColor={SERIES} />
          </linearGradient>
        </defs>
        {/* Recessive dashed gridlines + y labels */}
        {ticks.map(t => {
          const y = PAD.top + plotH - (t / yMax) * plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#E6EBF2" strokeWidth="1" strokeDasharray="3 5" />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill={INK.muted}>${t}</text>
            </g>
          );
        })}
        {/* Baseline */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#DDE4EC" strokeWidth="1.5" />

        {data.map((m, i) => {
          const inProgress = i === n - 1;
          const h = (m.donated / yMax) * plotH;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const y = PAD.top + plotH - h;
          const labeled = i === peakIdx || inProgress; // selective direct labels only
          return (
            <g key={`${m.month}${m.year}`}>
              {inProgress ? (
                <path d={barPath(x, y, barW, h)} fill="#ccfbf1" stroke={SERIES} strokeWidth="1.5" strokeDasharray="4 3" />
              ) : (
                <path d={barPath(x, y, barW, h)} fill="url(#webGivingBar)" opacity={hover === null || hover === i ? 1 : 0.55} />
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
            background: '#0f172a', color: '#fff', borderRadius: 10,
            padding: '5px 10px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: SHADOW.md,
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
function Kpi({ label, value, sub, hero = false, pill = null, testId, heroBackground }) {
  return (
    <div data-testid={testId} style={hero
      // Hero tile follows the bound org's brand gradient, same as the app's
      // hero donation card (item B: org theme parity on web). The faint dot
      // grid + oversized coin-arrow watermark are the same micro-detail
      // language the marketing site's dark bands carry.
      ? { ...CARD, border: 'none', background: heroBackground ?? 'linear-gradient(135deg, #003865 0%, #0B2A4A 100%)', boxShadow: SHADOW.md, padding: '18px 20px', position: 'relative', overflow: 'hidden' }
      : { ...CARD, padding: '18px 20px' }}>
      {hero && (
        <>
          <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: HERO_TEXTURE, pointerEvents: 'none' }} />
          <svg aria-hidden viewBox="0 0 100 100" style={{ position: 'absolute', right: -18, bottom: -26, width: 110, height: 110, opacity: 0.10, pointerEvents: 'none' }}>
            <polygon points="50,6 12,44 32,44 32,94 68,94 68,44 88,44" fill="#fff" />
          </svg>
        </>
      )}
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: hero ? 'rgba(255,255,255,0.65)' : INK.muted, position: 'relative' }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 2px', fontSize: 33, fontWeight: 800, letterSpacing: '-0.02em', ...NUMS, color: hero ? '#fff' : INK.primary, position: 'relative' }}>
        {value}
      </p>
      <p style={{ margin: 0, fontSize: 14.5, color: hero ? 'rgba(255,255,255,0.75)' : INK.secondary, position: 'relative' }}>{sub}</p>
      {pill && (
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: RADIUS.pill, padding: '3px 10px', position: 'relative' }}>
          {pill}
        </span>
      )}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: INK.primary }}>{children}</h2>
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
 *
 * `demo` labels the card when `total` is the fake demo total (no real
 * account) - the same reason Activity.jsx labels the tax-year card. A real
 * account's honest total (often $0 with no achieved tiers yet) needs no label.
 */
function MilestonesCard({ total, demo }) {
  const milestones = getMilestonesUpTo(total);
  const next = milestones.find(m => !m.achieved);
  const pct = next ? Math.min((total / next.amount) * 100, 100) : 100;
  return (
    <div style={{ ...CARD, padding: 20 }} data-testid="web-milestones">
      <SectionTitle
        action={next && (
          <span style={{ fontSize: 14.5, color: INK.muted }} data-testid="web-milestones-to-next">
            ${fmtMoney(next.amount - total)} to next
          </span>
        )}
      >
        Milestones
        {demo && (
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '2px 8px' }}>
            Demo data
          </span>
        )}
      </SectionTitle>
      <p style={{ margin: '2px 0 0', fontSize: 14.5, color: INK.muted }}>
        Unlocked by your lifetime giving
      </p>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '14px 2px 4px' }}>
        {milestones.map(m => (
          <div key={m.amount} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, lineHeight: 1,
              background: m.achieved ? 'linear-gradient(135deg, #003865 0%, #0B2A4A 100%)' : '#f1f5f9',
              boxShadow: m.achieved ? '0 2px 8px rgba(11,42,74,0.18)' : 'none',
              filter: m.achieved ? 'none' : 'grayscale(1)', opacity: m.achieved ? 1 : 0.45,
            }}>
              {m.emoji}
            </div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: m.achieved ? INK.secondary : INK.muted }}>
              {m.label}
            </p>
          </div>
        ))}
      </div>
      {next && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: INK.muted, marginBottom: 5 }}>
            <span>${fmtMoney(total)}</span>
            <span>${fmtCount(next.amount)}</span>
          </div>
          <div style={{ background: '#f1f5f9', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: SERIES, borderRadius: 999 }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 14.5, color: INK.secondary }}>
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
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15.5 }}>
        <thead>
          <tr>
            {['Date', 'Merchant', 'Category', 'Purchase', 'Round-up'].map((h, i) => (
              <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '8px 10px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK.muted, borderBottom: '1px solid #e5e7eb' }}>
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
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: INK.primary, lineHeight: 1.25 }}>{org.name}</p>
          <p style={{ margin: 0, fontSize: 14, color: INK.muted }}>Your chosen cause</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <button
          onClick={onOpen}
          style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 15, fontWeight: 600, color: '#003865', cursor: 'pointer' }}
        >
          My Cause →
        </button>
        <a
          href={`/demo/?orgpage=${encodeURIComponent(org.shortName || org.id.toUpperCase())}`}
          target="_blank" rel="noopener"
          style={{ fontSize: 15, fontWeight: 600, color: INK.secondary, textDecoration: 'none' }}
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
        <span style={{ width: 36, height: 36, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏢</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: INK.primary }}>{mp.headline}</span>
        <span style={{ display: 'block', fontSize: 14, color: METER, fontWeight: 600, marginTop: 2 }}>See the match on My Cause</span>
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
function ActivityLinkCard({ onOpen, demoActive, realCount = 0, demoData }) {
  const figure = { margin: 0, fontSize: 22, fontWeight: 800, color: INK.primary, letterSpacing: '-0.3px' };
  const cap = { margin: '2px 0 0', fontSize: 13.5, color: INK.muted };
  return (
    <div style={{ ...CARD, padding: 20 }} data-testid="web-activity-link">
      <SectionTitle
        action={
          <button onClick={onOpen} style={{ border: 'none', background: 'transparent', color: '#003865', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
            View activity →
          </button>
        }
      >
        Round-ups
      </SectionTitle>
      {/* Real accounts read the server's real count (0 until the card starts
          purchasing - item 12); the estimates are demo-dataset-only. */}
      <div style={{ display: 'flex', gap: 32, marginTop: 12 }}>
        <div>
          <p style={figure}>{demoActive ? fmtCount(demoData.transactions.length) : fmtCount(realCount)}</p>
          <p style={cap}>This cycle</p>
        </div>
        <div>
          <p style={figure}>{demoActive ? fmtCount(demoData.totalRoundupsCount) : fmtCount(realCount)}</p>
          <p style={cap}>{demoActive ? 'All time (est.)' : 'Since you joined'}</p>
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
  monthlyCap, chargeAdjustment, onAdjust, monthlyMinimum, processingCover,
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
  const total = chargeTotal({ pendingRoundUps: pending, monthlyCap, chargeAdjustment, feeMonths, processingCover });
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
  const row = { display: 'flex', justifyContent: 'space-between', fontSize: 15.5, padding: '5px 0' };
  return (
    <div style={{ ...CARD, padding: 20 }}>
      <SectionTitle>Next charge · {skipped ? 'skipped this month' : nextChargeLabel()}</SectionTitle>
      {skipped && (
        <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' }} data-testid="web-estimate-skipped">
          {skipExplainer({ pendingRoundUps: pending, feeMonths })}
        </p>
      )}

      {/* ── Where this cycle is ── */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 14.5, color: INK.secondary }}>
            {cycleLength}-day cycle
          </p>
          <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#0B2A4A', letterSpacing: '-0.4px' }} data-testid="web-cycle-days-left">
              {daysLeft}
            </span>
            {/* The countdown measures the CYCLE, and on a skipped cycle its end is
                not a charge - "days left" beside "nothing is collected" would read
                as a countdown to money leaving. Same split as the app. */}
            <span style={{ fontSize: 14, color: INK.muted }}>{skipped ? 'days left in cycle' : 'days left'}</span>
          </p>
        </div>
        <div style={{ background: '#f1f5f9', borderRadius: 999, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${cyclePct}%`, height: '100%', background: SERIES, borderRadius: 999 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 13.5, color: INK.muted }}>
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
        {/* The donor's standing processing-cover consent, itemised as its own
            line rather than folded into the total, because it is real money the
            donor agreed to at signup and it goes somewhere different from the
            rest (to the nonprofit, not to PocketCache). Rendered only when the
            cover is actually on - a permanent "+$0.00" row is noise, and the
            total is still right without it because `processingCover` is 0.
            Suppressed on a skipped or rolling-over cycle for the same reason the
            fee-bearing total is: nothing is collected, so nothing is processed
            and there is no cost to cover. Same rule as the app Dashboard's
            itemisation line (Dashboard.jsx `coverLabel`). */}
        {!skipped && !rollingOver && processingCover > 0 && (
          <div style={row} data-testid="web-estimate-cover">
            <span style={{ color: INK.secondary }}>Processing cover (goes to {npShort})</span>
            <span style={{ color: INK.secondary }}>+${fmtMoney(processingCover)}</span>
          </div>
        )}
        <div style={{ height: 1, background: '#e5e7eb', margin: '6px 0' }} />
        {skipped ? (
          /* Zero, not a total. This row used to read "One charge from BGCA
             ≈ $14.89" directly under copy saying the charge was skipped. */
          <div style={row}>
            <span style={{ color: INK.primary, fontWeight: 700 }}>{SKIP_COLLECT_LABEL}</span>
            <span style={{ color: '#b45309', fontWeight: 800, fontSize: 18 }} data-testid="web-estimate-total">{SKIP_COLLECT_AMOUNT}</span>
          </div>
        ) : rollingOver ? (
          <div style={row}>
            <span style={{ color: INK.primary, fontWeight: 700 }}>Nothing charged yet</span>
            <span style={{ color: '#b45309', fontWeight: 800, fontSize: 15.5 }} data-testid="web-estimate-rollover">
              ${fmtMoney(pending)} so far  -  rolls over at month-end
            </span>
          </div>
        ) : (
          <div style={row}><span style={{ color: INK.primary, fontWeight: 700 }}>One charge from {npShort}</span><span style={{ color: '#003865', fontWeight: 800, fontSize: 18 }} data-testid="web-estimate-total">≈ ${fmtMoney(total)}</span></div>
        )}
      </div>
      {/* Says where the extra money lands. The cover is a donation to the
          nonprofit, not a PocketCache charge, and the donor pre-agreed to it at
          signup - so the one place the total names it should also say so, and
          point at the control that changes it. Sentence for sentence the same as
          the shared ChargeReviewAlert's `charge-cover-note`. */}
      {!skipped && !rollingOver && processingCover > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: INK.muted }} data-testid="web-estimate-cover-note">
          The ${fmtMoney(processingCover)} processing cover goes to {npShort}, not to PocketCache, so 100% of your round-ups reach them. Change it in Settings.
        </p>
      )}
      {/* Rollover explainer  -  the app Dashboard's below-minimum copy verbatim. */}
      {rollingOver && (
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: '#b45309' }}>
          Not quite ${monthlyMinimum} yet  -  your round-ups carry forward. We settle every 3 months at most, so nothing&apos;s ever left behind.
          {' '}&middot; $1/month fee rolls too  -  {feeMonths} month{feeMonths !== 1 ? 's' : ''} so far (${feeMonths})  -  itemized on your charge.
        </p>
      )}
      {/* Cap / adjustment notes  -  same precedence and wording as the app Dashboard.
          Suppressed while rolling over, exactly as the app suppresses them. */}
      {!skipped && !belowMinimum && capActive && !adjusted && (
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#b45309' }} data-testid="web-estimate-capped">
          Capped at ${fmtMoney(monthlyCap)}  -  the rest won&apos;t be charged.
        </p>
      )}
      {!skipped && !belowMinimum && adjusted && (
        <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 600, color: '#059669' }} data-testid="web-estimate-adjusted">
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
        <p style={{ margin: '8px 0 0', fontSize: 14, color: INK.muted }} data-testid="web-estimate-schedule">
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
          style={{ width: '100%', marginTop: 12, padding: '10px 14px', borderRadius: RADIUS.pill, border: '1px solid #CBD8E4', background: '#fff', fontSize: 15, fontWeight: 700, color: '#003865', cursor: 'pointer' }}
        >
          Adjust this charge →
        </button>
      )}
      <button
        onClick={onGiveExtra}
        style={{ width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: RADIUS.pill, border: '1px solid #CBD8E4', background: '#fff', fontSize: 15, fontWeight: 700, color: '#003865', cursor: 'pointer' }}
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
function ActivityView({ pending, history, org, multiplier, onSettings, hasRealBankLinked, realRecent, freshness, demoActive, demoData, momChange }) {
  const current = history[history.length - 1];
  const currentMonthLabel = `${current.month} ${current.year}`;
  // Tax-year summary: honest zeros for a real account - it has ZERO completed
  // months of charge history. The demo dataset's totals only appear while
  // demoActive (item 12), against the ACTIVE demo level's series (item 8b).
  const taxYear = new Date().getFullYear();
  const tax = demoActive
    ? taxYearSummary(pending, taxYear, demoData.monthlyData)
    : { donated: 0, months: 0, feeMonths: 0 };
  const taxMonthsLabel = tax.months === 1 ? '1 completed month' : `${tax.months} completed months`;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';

  // Real round-up rows (mapped into ActivityTable's row shape). For a real
  // account (demo mode off) the ledger is ALWAYS real data (item 12): the
  // server's rows when a bank is linked, and the friendly empty state below
  // when there is nothing yet. The prefilled demo TRANSACTIONS feed renders
  // only while demoActive.
  const realRows = (realRecent ?? []).map((r, i) => ({
    id: `real-${r.date}-${i}`,
    date: r.date,
    merchant: r.merchant || 'Purchase',
    category: 'Bank purchase',
    amount: (r.amount_cents ?? 0) / 100,
    roundUp: (r.roundup_cents ?? 0) / 100,
  }));
  const showRealLedger = hasRealBankLinked && realRows.length > 0;
  const activityRows = demoActive ? demoData.transactions : realRows;
  // BASE (pre-multiplier) figures for the month summary pill below - same
  // "raw round-ups, multiplier shown separately" semantics the demo pill
  // already used, fed from whichever dataset is actually showing.
  const monthTxnCount = activityRows.length;
  const monthBaseAmount = demoActive
    ? demoData.currentMonthPending
    : realRows.reduce((sum, r) => sum + r.roundUp, 0);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>Activity</h1>
        <p style={{ margin: '3px 0 0', fontSize: 15.5, color: INK.secondary }}>
          {demoActive
            ? 'Your giving history  -  demo data.'
            : showRealLedger
              ? `Your giving history  -  this month is live (${freshness}).`
              : 'Your giving history  -  building from your first purchase.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ display: 'grid', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          {/* This month + the monthly chart, the two facts that belong together:
              the final bar IS this figure (both read monthlyHistory). */}
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
                  This month
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px', color: INK.primary }} data-testid="web-activity-month-total">
                  ${fmtMoney(pending)}
                </p>
                {org && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <OrgLogo nonprofit={org} size={5} rounded="md" />
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: INK.secondary }}>{org.name}</span>
                  </span>
                )}
              </div>
              {momChange != null && (
                <span
                  data-testid="web-activity-mom"
                  style={{
                    fontSize: 14, fontWeight: 700, borderRadius: 999, padding: '4px 11px', whiteSpace: 'nowrap',
                    color: momChange >= 0 ? '#047857' : '#b91c1c',
                    background: momChange >= 0 ? '#ecfdf5' : '#fef2f2',
                  }}
                >
                  {momChange >= 0 ? '↑' : '↓'} {Math.abs(momChange).toFixed(0)}% vs last month
                </span>
              )}
            </div>
            {/* Monthly chart: demo dataset only. A real account has no
                multi-month history to chart yet (item 12). */}
            {demoActive ? (
              <>
                <div style={{ height: 1, background: '#f1f5f9', margin: '16px 0 12px' }} />
                <SectionTitle>Giving by month</SectionTitle>
                <p style={{ margin: '2px 0 10px', fontSize: 14.5, color: INK.muted }}>
                  Monthly round-up totals · {currentMonthLabel} still in progress
                </p>
                <GivingChart data={history} />
              </>
            ) : (
              <p style={{ margin: '14px 0 0', paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 14.5, color: INK.muted }}>
                Your monthly chart builds as months complete  -  round-ups only count from the day you joined.
              </p>
            )}
          </div>

          {/* Month summary pill  -  raw round-ups and the boost shown separately so
              the multiplied headline above is traceable. */}
          <div style={{ ...CARD, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }} data-testid="web-activity-month-summary">
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ fontSize: 26 }}>🗓️</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: INK.primary }}>{currentMonthLabel}</span>
                <span style={{ display: 'block', fontSize: 14, color: INK.muted }}>
                  {fmtCount(monthTxnCount)} transactions · ${fmtMoney(monthBaseAmount)} rounded up
                  {multiplier > 1 && ` × ${multiplier} boost`}
                </span>
              </span>
            </span>
            <span style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ display: 'block', fontSize: 18, fontWeight: 800, color: '#047857' }}>${fmtMoney(pending)}</span>
              {multiplier > 1 && (
                <span style={{ display: 'block', fontSize: 13.5, color: INK.muted }}>
                  ${fmtMoney(monthBaseAmount)} × {multiplier}
                </span>
              )}
            </span>
          </div>

          <div style={{ ...CARD, padding: 20 }}>
            <SectionTitle>All activity</SectionTitle>
            <p style={{ margin: '2px 0 10px', fontSize: 14.5, color: INK.muted }}>
              {showRealLedger
                // freshness already reads "as of X ago" (see fmtFreshness) - no
                // second "as of" prefix here.
                ? `Every purchase this cycle and the spare change it set aside  -  ${freshness}`
                : 'Every purchase this cycle and the spare change it set aside'}
            </p>
            {activityRows.length > 0 ? (
              <ActivityTable rows={activityRows} />
            ) : (
              /* Friendly empty state - a brand-new real account has no
                 activity yet, and that is the honest story (item 12). */
              <div style={{ textAlign: 'center', padding: '28px 16px' }} data-testid="web-activity-empty-state">
                <div style={{ fontSize: 34, marginBottom: 8 }}>🪙</div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: INK.primary }}>No round-ups yet</p>
                <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.6, color: INK.secondary }}>
                  Your round-ups will appear here once your card starts making purchases. Every purchase rounds up to the next dollar  -  the spare change lands on this page.
                </p>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {/* Tax-year summary. Completed months only: the in-progress month has
              not been charged, so counting it would overstate what a donor could
              substantiate. Figures come from taxYearSummary(). */}
          <div style={{ ...CARD, padding: 20 }} data-testid="web-taxyear">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
                  {taxYear} tax year
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', color: INK.primary }} data-testid="web-taxyear-total">
                  ${fmtMoney(tax.donated)}
                </p>
              </div>
              {demoActive && (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                  Demo data
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 14.5, color: INK.muted }} data-testid="web-taxyear-months">
              {tax.months === 0 ? 'No completed months yet this year' : `Donated across ${taxMonthsLabel}`}
              {' · '}{currentMonthLabel} still in progress
            </p>
            <p style={{ margin: '12px 0 0', paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 14.5, lineHeight: 1.6, color: INK.secondary }}>
              Your round-ups are tax-deductible. The $1 monthly app fee is not (${fmtMoney(tax.feeMonths)} so far
              this year). {npShort} issues your receipt.
            </p>
            <button
              onClick={onSettings}
              data-testid="web-taxyear-settings-link"
              style={{
                width: '100%', marginTop: 14, padding: '10px 14px', borderRadius: RADIUS.pill, border: '1px solid #CBD8E4',
                background: '#fff', fontSize: 15, fontWeight: 700, color: '#003865', cursor: 'pointer',
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
    goToOnboardingStep,
    monthlyCap, chargeAdjustment, setChargeAdjustment, roundUpMultiplier,
    coverProcessing,
    hasRealBankLinked, realRoundupsRecent, realRoundupsFreshness, realRoundupsCount,
    demoActive, demoMode, demoData,
    giveExtraPending,
  } = useApp();
  const brand = useTheme();
  const [navTab, setNavTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [giveExtra, setGiveExtra] = useState(false);
  const [adjustCharge, setAdjustCharge] = useState(false);
  const [transferOrg, setTransferOrg] = useState(false);
  // Demo stats - byte-identical to the retired data/derived constants.
  const { avgPerMonth, momChange, sinceLabel, monthsGiving } = demoData;

  // The donor's standing "cover the card-processing costs" consent, pre-checked
  // at signup and persisted in AppContext. It is real money on every charge, so
  // it belongs in the upcoming-charge figure - it was missing from BOTH surfaces,
  // which is how a consent the donor gave at checkout came to bill nothing.
  // Two rules, identical to the app Dashboard (Dashboard.jsx ~279-282):
  //   - computed on the EFFECTIVE round-ups (after cap or one-time adjustment),
  //     because the processor only takes its cut of what is actually collected;
  //     the raw accrual would overcharge a capped donor.
  //   - a skipped cycle collects nothing, so there is nothing to process and no
  //     cover, which is why the skipped state still reads $0.00.
  // Computed once here and handed down, so the KPI tile and the estimate card
  // cannot arrive at two different numbers.
  const processingCover = coverProcessing && !skipNextCharge
    ? processingCoverFor(effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment }))
    : 0;
  // One number for "what will actually be charged", from lib/billing.
  const upcomingCharge = chargeTotal({ pendingRoundUps, monthlyCap, chargeAdjustment, feeMonths, processingCover });
  // Below the nonprofit's minimum nothing is collected, so this tile must not
  // quote a charge - the app's card says "rolls over at month-end" here.
  const monthlyMinimum = selectedNonprofit?.monthlyMinimum ?? 5;
  const rollingOver = pendingRoundUps < monthlyMinimum && !skipNextCharge;

  const org = selectedNonprofit;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';
  const userName = hasAccount?.name ?? DEMO_USER.name;
  const userEmail = hasAccount?.email ?? DEMO_USER.email;
  // The name a greeting may use: a stored real name only, NEVER the email
  // local part ("Hello safjbdwkfbd" - item 7c). No trustworthy name yet ->
  // greet without one; the demo visitor keeps DEMO_USER's.
  const greetName = hasAccount ? greetingNameFor(hasAccount) : DEMO_USER.name;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  // The one series every chart on this surface plots: the active demo level's
  // month series with the in-progress month swapped for the live multiplied
  // figure, so the final bar always equals the headline "this month" number.
  const history = useMemo(() => monthlyHistoryFor(demoData.monthlyData, pendingRoundUps), [demoData, pendingRoundUps]);

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #EDF2F8 0%, #F6F8FB 260px)' }} onClick={() => menuOpen && setMenuOpen(false)}>
      <GiveExtraModal show={giveExtra} onClose={() => setGiveExtra(false)} />
      <AdjustChargeModal
        show={adjustCharge}
        onClose={() => setAdjustCharge(false)}
        pendingRoundUps={pendingRoundUps}
        chargeAdjustment={chargeAdjustment}
        setChargeAdjustment={setChargeAdjustment}
        monthlyCap={monthlyCap}
      />
      <TransferNonprofitModal
        show={transferOrg}
        onClose={() => setTransferOrg(false)}
        adminRole={adminRole}
      />
      {/* Face ID / biometric enrollment deliberately has NO prompt on the web
          portal (round-3 item 6): the offer belongs on the phone, where the
          app surface shows it after sign-in (App.jsx's BiometricOfferCard).
          A donor who wants a browser passkey can still enroll from Settings'
          Privacy & Security controls; the WebLockScreen keeps honoring an
          existing enrollment. */}
      <ChargeReviewAlert surface="web" />
      {/* ── Top nav ──
          zIndex 30/40 here are PAGE CHROME (sticky header, account dropdown),
          not overlays: lib/overlay.js's Z scale starts at the sheet/modal layer
          and every scrim in this portal sits above both. Nothing to convert. */}
      <header style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)', borderBottom: '1px solid rgba(11,42,74,0.06)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px', height: 76, display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {/* Brand-kit top bar (round-3 item 3a). Org bound: the nonprofit
                is the primary brand, so its logo + app name lead and the
                PocketCache attribution renders as the coin-arrow WORDMARK
                ("powered by P(coin)cketCache") - never a plain-text caption.
                No org: the PocketCache wordmark alone carries the bar, with
                no redundant "powered by" text beside its own logo. */}
            {org ? <OrgLogo nonprofit={org} size={11} rounded="lg" /> : null}
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              {org ? (
                <>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 16.5, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {brand.appName ?? `${npShort} Round-Up`}
                    {/* The subtle demo marker (Settings toggle / phone shake). */}
                    {demoMode && (
                      <span data-testid="web-demo-mode-pill" style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400e', background: '#fde68a', borderRadius: 999, padding: '2px 8px', verticalAlign: 'middle' }}>
                        Demo
                      </span>
                    )}
                  </p>
                  <PoweredByWordmark size={13} />
                </>
              ) : (
                <>
                  <PocketCacheWordmark size={24} />
                  {demoMode && (
                    <span data-testid="web-demo-mode-pill" style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400e', background: '#fde68a', borderRadius: 999, padding: '2px 8px', verticalAlign: 'middle' }}>
                      Demo
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {NAV_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setNavTab(t.id)}
                // Active tab follows the bound org's brand palette, exactly
                // like the app's chrome does (item B: org theme parity).
                style={{
                  border: 'none', background: navTab === t.id ? (brand.accentLight ?? '#eef4fa') : 'transparent', cursor: 'pointer',
                  padding: '10px 18px', borderRadius: RADIUS.pill, fontSize: 15.5,
                  fontWeight: navTab === t.id ? 700 : 500,
                  color: navTab === t.id ? (brand.primary ?? '#003865') : INK.secondary,
                  transition: 'background 0.2s, color 0.2s',
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
              style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid #dbe3ec', background: brand.gradient ?? 'linear-gradient(135deg, #003865, #0B2A4A)', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer' }}
            >
              {userName[0]}
            </button>
            {/* Dropdown (item A): the panel must CONTAIN its content - a long
                Apple-relay email or name truncates with an ellipsis instead
                of spilling past the card edge, and the panel itself never
                exceeds the viewport. */}
            {menuOpen && (
              <div
                data-testid="web-account-dropdown"
                style={{ position: 'absolute', right: 0, top: 54, width: 280, maxWidth: 'min(320px, calc(100vw - 32px))', ...CARD, boxShadow: '0 12px 32px rgba(11,42,74,0.16)', padding: 8, zIndex: 40, overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', marginBottom: 4, minWidth: 0 }}>
                  <p title={userName} style={{ margin: 0, fontWeight: 700, fontSize: 15.5, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</p>
                  <p title={userEmail} style={{ margin: 0, fontSize: 14, color: INK.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</p>
                </div>
                {adminRole && (
                  <button
                    onClick={() => { setLastMode('admin'); setPage('np-dashboard'); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 15, fontWeight: 600, color: INK.primary, cursor: 'pointer', borderRadius: 8 }}
                  >
                    Switch to admin dashboard
                  </button>
                )}
                {/* Donor-side parity with the app's account sheet (AppShell.jsx):
                    a donor with no admin role yet gets the entry into the
                    nonprofit signup wizard instead of the admin actions above.
                    Same call the app row makes - goToOnboardingStep sets
                    initialOnboardingStep to 'nonprofit-signup', which
                    WebExperience (App.jsx) latches onto to route into
                    NpWebSignup, the web-native version of the same wizard. */}
                {!adminRole && (
                  <button
                    onClick={() => { setMenuOpen(false); goToOnboardingStep('nonprofit-signup'); }}
                    data-testid="web-create-nonprofit-page"
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 15, fontWeight: 600, color: INK.primary, cursor: 'pointer', borderRadius: 8 }}
                  >
                    Create a nonprofit page
                  </button>
                )}
                {/* Admins only, and it belongs in the account menu rather than in
                    Settings: Settings is the DONOR's account, and this is an
                    action about the nonprofit's page, taken by the one person who
                    holds it. One admin email per nonprofit means that when this
                    person leaves, the org is locked out unless they hand the page
                    on first - so the way out has to be somewhere they will
                    stumble across it, next to "switch to admin". */}
                {adminRole && (
                  <button
                    onClick={() => { setMenuOpen(false); setTransferOrg(true); }}
                    data-testid="web-transfer-nonprofit"
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 15, fontWeight: 600, color: INK.primary, cursor: 'pointer', borderRadius: 8 }}
                  >
                    Transfer nonprofit page
                  </button>
                )}
                <button
                  onClick={() => signOut()}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', fontSize: 15, fontWeight: 600, color: '#b91c1c', cursor: 'pointer', borderRadius: 8 }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 32px 56px' }}>
        {navTab === 'overview' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>
                {greeting}{greetName ? `, ${greetName}` : ''} 👋
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 15.5, color: INK.secondary }}>
                Here&apos;s your giving with {org?.name ?? 'your nonprofit'}.
              </p>
            </div>

            {/* One-time name capture for accounts without a stored display
                name (item 7c) - renders null for everyone else. */}
            <NamePromptCard variant="web" />

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16, display: 'grid', marginBottom: 20 }}>
              {/* A real account with no charge history yet reads the honest
                  "first month" framing (see AppContext's totalDonated
                  initializer) and gets no streak pill, which would otherwise
                  read as a fake multi-month streak on a brand-new account.
                  Demo mode keeps both, the pill labeled so the fake streak is
                  never mistaken for a real one. */}
              <Kpi
                hero
                heroBackground={brand.gradient}
                label="Total donated"
                value={`$${fmtMoney(totalDonated)}`}
                sub={demoActive ? `${sinceLabel} · all time` : `${FIRST_MONTH_LABEL} · all time`}
                pill={demoActive ? `🔥 ${monthsGiving}-month giving streak · Demo data` : null}
              />
              {/* Accrual tile: raw round-ups are the honest figure, but on a
                  skipped cycle the sub-label has to say they are never collected
                  (same string the app's Pending tile uses). Real accounts
                  (item 12) read the REAL count - 0 for a fresh account - or
                  the live freshness caption once a bank is linked. */}
              <Kpi
                testId="web-kpi-pending"
                label="Pending this month"
                // Round-ups accrued PLUS any real "Give Extra" pledges still
                // pending - they join the same monthly charge. Zero while
                // demoActive (see AppContext), so the demo figure is
                // untouched; the sub names the pledge portion when there is
                // one, exactly as the app's Pending tile does.
                value={`$${fmtMoney(pendingRoundUps + giveExtraPending)}`}
                sub={skipNextCharge
                  ? SKIP_TILE_SUB
                  : giveExtraPending > 0
                    ? `Incl. $${fmtMoney(giveExtraPending)} extra gift`
                    : hasRealBankLinked
                      ? realRoundupsFreshness
                      : demoActive
                        ? `${demoData.transactions.length} round-ups so far`
                        : `${realRoundupsCount} round-ups so far`}
              />
              <Kpi
                label="Average month"
                value={demoActive ? `$${fmtMoney(avgPerMonth)}` : '--'}
                sub={demoActive
                  ? (momChange != null ? `${momChange >= 0 ? '▲' : '▼'} ${Math.abs(momChange)}% vs. prior month` : 'across completed months')
                  : 'no completed months yet'}
              />
              <Kpi
                testId="web-kpi-next-charge"
                label="Next charge"
                // The tile's headline figure on a skipped cycle is the amount, not
                // the word "Skipped": $0.00 is what leaves the account.
                value={skipNextCharge ? SKIP_COLLECT_AMOUNT : nextChargeLabel()}
                sub={skipNextCharge
                  ? skipSummaryLine(feeMonths)
                  : rollingOver
                    ? `$${fmtMoney(pendingRoundUps)} so far  -  rolls over at month-end (under ${npShort}'s $${monthlyMinimum} minimum)`
                    // Names the cover in the tile too, so the KPI figure is
                    // traceable without opening the estimate card.
                    : `≈ $${fmtMoney(upcomingCharge)} incl. $1 fee${processingCover > 0 ? ` + $${fmtMoney(processingCover)} processing cover` : ''} · exact amount locks ${lockLabel()}`}
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
                <MilestonesCard total={totalDonated} demo={demoActive} />
                {org && <CauseRow org={org} onOpen={() => setNavTab('mycause')} />}
                {org?.corporateMatch?.active && (
                  <MatchLine match={org.corporateMatch} onOpen={() => setNavTab('mycause')} />
                )}
                <ActivityLinkCard onOpen={() => setNavTab('activity')} demoActive={demoActive} realCount={realRoundupsCount} demoData={demoData} />
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
                  processingCover={processingCover}
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
            hasRealBankLinked={hasRealBankLinked}
            realRecent={realRoundupsRecent}
            freshness={realRoundupsFreshness}
            demoActive={demoActive}
            demoData={demoData}
            momChange={momChange}
          />
        )}

        {navTab === 'mycause' && <WebMyCause />}
        {navTab === 'share' && <WebShare />}
        {navTab === 'settings' && <WebSettings />}
      </main>

      <footer style={{ padding: '0 24px 28px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: INK.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
