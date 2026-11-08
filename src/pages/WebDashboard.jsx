import { useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, Heart, X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { useNp } from '../store/NpContext';
import { loadKey, saveKey } from '../store/identityStore';
import { DEMO_USER, FIRST_MONTH_LABEL } from '../data/derived';
import { fmtMoney, fmtCount } from '../lib/format';
import {
  ROLL_FORWARD_NOTE, appFeePendingLine, getMilestonesUpTo, isMatchVisible, matchProgress,
  monthlyHistoryFor, taxYearSummary,
} from '../lib/donorContent';
import { greetingNameFor } from '../lib/donorAuth';
import { Z } from '../lib/overlay';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import PocketCacheWordmark, { PoweredByWordmark } from '../components/PocketCacheWordmark';
import NamePromptCard from '../components/NamePromptCard';
import Button from '../components/ui/Button';
import {
  WebMyCause, WebShare, WebSettings, GiveExtraModal, AdjustChargeModal, TransferNonprofitModal,
} from './WebPortalPages';
import ChargeReviewAlert from '../components/ChargeReviewAlert';
import {
  APP_FEE_LIVE, CHARGE_DAY, LOCK_DAY, MONTHLY_FLOOR,
  chargeAfterNextLabel, chargeTotal, currentMonthName, effectiveCharge, firstEligibleChargeDate,
  isBelowFloor, nextChargeDate, processingCoverFor,
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

import { INK, CARD, SHADOW, RADIUS, NAVY, HERO_TEXTURE, NUMS } from '../lib/webTheme';

const SERIES = '#0D9488';       // validated vs light surface (3:1+, chroma/lightness pass)
const METER = '#D97706';        // validated match-meter fill
// PocketCache's own house gradient (navy-deep to navy), the same pair the
// marketing site and the onboarding slides use. Tenant surfaces pass
// brand.gradient instead; this is the fallback and the chrome.
const NAVY_GRADIENT = 'linear-gradient(135deg, var(--navy-deep) 0%, var(--navy) 100%)';
const DAY_MS = 86400000;

// The "switch your giving to Y?" confirm that state-core ships as
// src/components/PendingOrgPrompt.jsx. Resolved through import.meta.glob so this
// page builds both before and after that file lands: with no match it renders
// nothing, and the moment the component exists it is mounted once below.
import PendingOrgPrompt from '../components/PendingOrgPrompt';

// Money formatting comes from lib/format. This file used to define its own
// byte-identical `fmtMoney`, which is how a second formatter (`.toFixed(2)`)
// survived elsewhere in the product: two implementations, no single place to fix.

// Billing schedule: the month's round-ups LOCK on the 1st (exact amount
// emailed to the donor) and the charge runs on the 11th  -  10 full days'
// review notice (classic Reg E timing; Nathan asked whether range-based
// consent lets us move back to the 5th).
//
// The dates and the amounts both come from lib/billing. `cycleView` below
// turns them into the one description of "where am I in the cycle" that the
// Next-charge tile and the EstimateCard both read, so the pair can never
// disagree: before this the card measured an 11th-to-11th cycle and paired the
// Nov 11 charge (October's locked amount) with November's still-accruing
// round-ups.
const shortDay = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Where the donor is in the billing cycle, computed once per render.
 *
 *   chargeDate   the charge the donor is counting down to. For a real account
 *                this is firstEligibleChargeDate(): a donor who joined after
 *                the most recent lock cannot be in the charge on the 11th.
 *   firstPartial true in that first partial window (joined after the lock).
 *   lockedMode   days 1 to 11: the upcoming charge is LAST month's locked
 *                amount, and this month is accruing separately.
 *   monthName    the month whose round-ups chargeDate collects.
 *   cycleStart   the 1st of that month - the bar is measured from the 1st,
 *                not from the previous charge day.
 *   accruing     the month accruing right now (lockedMode's second section).
 */
function cycleView({ realAcct, joinedAt, now = new Date() }) {
  const upcoming = nextChargeDate(now);
  const chargeDate = realAcct ? firstEligibleChargeDate(joinedAt, now) : upcoming;
  const firstPartial = chargeDate.getTime() !== upcoming.getTime();
  // Local calendar day, the same clock nextChargeDate() reads: on the 11th
  // itself the locked amount is what runs today, so it stays in lockedMode.
  const lockedMode = now.getDate() <= CHARGE_DAY && !firstPartial;
  const cycleStart = new Date(chargeDate.getFullYear(), chargeDate.getMonth() - 1, LOCK_DAY);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cycleLength = Math.max(1, Math.round((chargeDate - cycleStart) / DAY_MS));
  const daysLeft = Math.max(0, Math.round((chargeDate - today) / DAY_MS));
  const cyclePct = Math.max(0, Math.min(100, ((cycleLength - daysLeft) / cycleLength) * 100));
  const lockDate = new Date(chargeDate.getFullYear(), chargeDate.getMonth(), LOCK_DAY);
  const accruingLock = new Date(now.getFullYear(), now.getMonth() + 1, LOCK_DAY);
  return {
    chargeDate,
    chargeLabel: shortDay(chargeDate),
    firstPartial,
    lockedMode,
    monthName: cycleStart.toLocaleDateString('en-US', { month: 'long' }),
    cycleStartLabel: shortDay(cycleStart),
    cycleLength,
    daysLeft,
    cyclePct,
    lockLabel: shortDay(lockDate),
    accruing: {
      monthName: currentMonthName(now),
      lockLabel: shortDay(accruingLock),
      chargeLabel: chargeAfterNextLabel(now),
    },
  };
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
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize="11" fill={INK.subtle}>${t}</text>
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
                  x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK.secondary}
                  data-testid={inProgress ? 'web-chart-current-value' : undefined}
                >
                  ${fmtMoney(m.donated)}
                </text>
              )}
              <text x={x + barW / 2} y={PAD.top + plotH + 17} textAnchor="middle" fontSize="11" fill={INK.subtle}>
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
            background: INK.primary, color: '#fff', borderRadius: RADIUS.sm,
            padding: '6px 12px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none',
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
      ? { ...CARD, border: 'none', background: heroBackground ?? NAVY_GRADIENT, boxShadow: SHADOW.md, padding: '20px 24px', position: 'relative', overflow: 'hidden' }
      : { ...CARD, padding: '20px 24px' }}>
      {hero && (
        <>
          <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: HERO_TEXTURE, pointerEvents: 'none' }} />
          <svg aria-hidden viewBox="0 0 100 100" style={{ position: 'absolute', right: -18, bottom: -26, width: 110, height: 110, opacity: 0.10, pointerEvents: 'none' }}>
            <polygon points="50,6 12,44 32,44 32,94 68,94 68,44 88,44" fill="#fff" />
          </svg>
        </>
      )}
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: hero ? 'rgba(255,255,255,0.75)' : INK.subtle, position: 'relative' }}>
        {label}
      </p>
      <p style={{ margin: '8px 0 4px', fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, ...NUMS, color: hero ? '#fff' : INK.primary, position: 'relative' }}>
        {value}
      </p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: hero ? 'rgba(255,255,255,0.8)' : INK.subtle, position: 'relative' }}>{sub}</p>
      {pill && (
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: RADIUS.pill, padding: '4px 12px', position: 'relative' }}>
          {pill}
        </span>
      )}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: INK.primary }}>{children}</h2>
      {action}
    </div>
  );
}

/**
 * The inline "My Cause →" / "View activity →" text actions. A tertiary Button
 * for the 44px hit area; the negative margin keeps the visual footprint of the
 * old bare text button so nothing around it moves.
 */
function InlineLink({ onClick, children, testId }) {
  return (
    <Button
      variant="tertiary" size="md" surface="web" fullWidth={false}
      onClick={onClick}
      data-testid={testId}
      style={{ margin: '-12px -12px', fontSize: 15, color: NAVY, whiteSpace: 'nowrap' }}
    >
      {children}
    </Button>
  );
}

// One sample-data label per section outside demo mode: amber-50 on amber-700,
// the same pair the Milestones "Demo data" chip and the header pill use.
const SAMPLE_PILL = {
  display: 'inline-block', fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: 'var(--warning)',
  background: 'var(--warning-50)', borderRadius: RADIUS.pill, padding: '3px 10px', whiteSpace: 'nowrap',
};

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
    <div style={{ ...CARD, padding: 24 }} data-testid="web-milestones">
      <SectionTitle
        action={next && (
          <span style={{ fontSize: 14, color: INK.subtle, ...NUMS }} data-testid="web-milestones-to-next">
            ${fmtMoney(next.amount - total)} to next
          </span>
        )}
      >
        Milestones
        {demo && (
          <span style={{ ...SAMPLE_PILL, marginLeft: 8, verticalAlign: 'middle' }}>
            Demo data
          </span>
        )}
      </SectionTitle>
      <p style={{ margin: '2px 0 0', fontSize: 14, color: INK.subtle }}>
        Unlocked by your lifetime giving
      </p>
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '16px 2px 4px' }}>
        {milestones.map(m => (
          <div key={m.amount} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* lib/donorContent hands each tier a lucide `Icon` (the emoji
                ladder is gone); white on the achieved disc, subtle ink on
                the rest. */}
            <div style={{
              width: 48, height: 48, borderRadius: RADIUS.md, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: m.achieved ? NAVY_GRADIENT : 'var(--surface)',
              color: m.achieved ? '#fff' : INK.subtle,
              boxShadow: m.achieved ? SHADOW.sm : 'none',
              opacity: m.achieved ? 1 : 0.45,
            }}>
              <m.Icon size={22} aria-hidden="true" />
            </div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: m.achieved ? INK.secondary : INK.subtle }}>
              {m.label}
            </p>
          </div>
        ))}
      </div>
      {next && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: INK.subtle, marginBottom: 6, ...NUMS }}>
            <span>${fmtMoney(total)}</span>
            <span>${fmtCount(next.amount)}</span>
          </div>
          <div style={{ background: 'var(--line)', borderRadius: RADIUS.pill, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: SERIES, borderRadius: RADIUS.pill }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: INK.secondary }}>
            {Math.round(pct)}% of the way to the {next.label}.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The web twin of the app's MilestoneToast: a real account that has just
 * crossed a club gets the same celebration in the browser. Dark pill, bottom
 * centre, the portal's own toast language; auto-dismisses at about 5s and the
 * X is a 44x44 Dismiss button. Mounted by WebDashboard, real accounts only.
 */
function MilestoneToast({ milestone, onClose }) {
  return (
    <div
      role="status" data-testid="web-milestone-toast"
      className="pc-on-dark"
      style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: Z.globalToast,
        maxWidth: 'min(520px, calc(100vw - 32px))', background: INK.primary, color: '#fff', borderRadius: RADIUS.md,
        padding: '8px 8px 8px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: SHADOW.lg,
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', lineHeight: 1 }}><milestone.Icon size={24} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>Milestone Unlocked!</span>
        <span style={{ display: 'block', fontSize: 14, lineHeight: 1.4, opacity: 0.8 }}>{milestone.label} donated 🎉</span>
      </span>
      <button
        type="button" onClick={onClose} aria-label="Dismiss"
        style={{ width: 44, height: 44, flexShrink: 0, border: 'none', background: 'transparent', color: '#fff', borderRadius: RADIUS.sm, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Activity table (the Activity view's ledger) ─────────────────────────────
// Overview used to render a 7-row copy of this table with the caption
// "Purchases on your tracked card…". Activity owns transactions and Settings owns
// the tracked card, so Overview now carries a link instead.
function ActivityTable({ rows }) {
  const cell = { padding: '10px 12px', borderBottom: '1px solid var(--line)' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
        <thead>
          <tr>
            {['Date', 'Merchant', 'Category', 'Purchase', 'Round-up'].map((h, i) => (
              <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK.subtle, borderBottom: '1px solid var(--line)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.id}>
              <td style={{ ...cell, color: INK.secondary, whiteSpace: 'nowrap' }}>{fmtDay(t.date)}</td>
              <td style={{ ...cell, color: INK.primary, fontWeight: 600 }}>{t.merchant}</td>
              <td style={{ ...cell, color: INK.secondary }}>{t.category}</td>
              {/* Debits stay slate; the round-up is the positive amount, so green. */}
              <td style={{ ...cell, color: INK.subtle, textAlign: 'right', ...NUMS }}>${fmtMoney(t.amount)}</td>
              <td style={{ ...cell, color: 'var(--green)', fontWeight: 700, textAlign: 'right', ...NUMS }}>+${fmtMoney(t.roundUp)}</td>
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
    <div style={{ ...CARD, padding: 24 }} data-testid="web-cause-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <OrgLogo nonprofit={org} size={10} rounded="xl" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: INK.primary, lineHeight: 1.25 }}>{org.name}</p>
          <p style={{ margin: 0, fontSize: 14, color: INK.subtle }}>Your chosen cause</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
        <InlineLink onClick={onOpen}>My Cause →</InlineLink>
        <a
          href={`/demo/?orgpage=${encodeURIComponent(org.shortName || org.id.toUpperCase())}`}
          target="_blank" rel="noopener"
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 15, fontWeight: 600, color: INK.secondary, textDecoration: 'none' }}
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
 *
 * A SAMPLE match (the BGCA seed's GM example) only renders while demo data is
 * on - the caller gates on isMatchVisible() - and carries its own label so the
 * example is never read as a live sponsor.
 */
function MatchLine({ match, onOpen }) {
  const mp = matchProgress(match);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="web-match-line"
      className="pc-btn"
      style={{
        ...CARD, padding: '16px 24px', width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit',
      }}
    >
      {match.logoUrl ? (
        <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={match.logoUrl} alt={match.companyShort ?? match.company} style={{ height: 22, objectFit: 'contain' }} />
        </span>
      ) : (
        <span style={{ width: 36, height: 36, borderRadius: RADIUS.sm, background: 'var(--gold-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={18} color="var(--gold-700)" aria-hidden="true" />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: INK.primary }}>{mp.headline}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <span style={{ fontSize: 14, color: METER, fontWeight: 600 }}>See the match on My Cause</span>
          {match.sample && <span style={SAMPLE_PILL} data-testid="web-match-sample">Example partnership - demo</span>}
        </span>
      </span>
      <span aria-hidden style={{ color: INK.muted, flexShrink: 0 }}>›</span>
    </button>
  );
}

/**
 * Overview's pointer at the ledger. Replaces the 7-row transaction table.
 * The two round-up COUNTS are Home's own facts (the app's third stat tile), so
 * they live here rather than on Activity, which owns the transactions themselves.
 *
 * For a real account the server's txn_count covers the CURRENT cycle only, so
 * it is labelled "This cycle" and the lifetime figure appears only when the
 * server actually returns one (realLifetimeCount) - never the same number twice.
 */
function ActivityLinkCard({ onOpen, demoActive, realCount = 0, realLifetimeCount, demoData }) {
  const figure = { margin: 0, fontSize: 22, fontWeight: 800, color: INK.primary, letterSpacing: '-0.3px', lineHeight: 1.2, ...NUMS };
  const cap = { margin: '2px 0 0', fontSize: 13, color: INK.subtle };
  const showLifetime = demoActive || typeof realLifetimeCount === 'number';
  return (
    <div style={{ ...CARD, padding: 24 }} data-testid="web-activity-link">
      <SectionTitle action={<InlineLink onClick={onOpen}>View activity →</InlineLink>}>
        Round-ups
      </SectionTitle>
      {/* Real accounts read the server's real count (0 until the card starts
          purchasing - item 12); the estimates are demo-dataset-only. */}
      <div style={{ display: 'flex', gap: 32, marginTop: 12 }}>
        <div>
          <p style={figure}>{demoActive ? fmtCount(demoData.transactions.length) : fmtCount(realCount)}</p>
          <p style={cap}>This cycle</p>
        </div>
        {showLifetime && (
          <div>
            <p style={figure}>{demoActive ? fmtCount(demoData.totalRoundupsCount) : fmtCount(realLifetimeCount)}</p>
            <p style={cap}>{demoActive ? 'All time (est.)' : 'Since you joined'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// The upcoming-charge card. Every figure here goes through lib/billing so the
// web portal and the app cannot disagree: before this, the web ignored
// `monthlyCap` and `chargeAdjustment` entirely, so a donor with a $10 cap and
// $22 of round-ups saw $10 in the app and $22 in the browser from the same
// stored state.
//
// Three states, decided by `cycle` (see cycleView) and the account:
//   lockedMode  days 1 to 11 - the card is LAST month's locked amount (the
//               server's locked_cycle for a real account, the demo dataset's
//               completed month in demo), and this month's accrual is a
//               separate line underneath.
//   accruing    days 12 onward, or a new donor's first partial window - the
//               itemised accrual that locks on the 1st.
//   no bank     a real account that has not linked a bank yet has nothing to
//               round up, so the card asks for the link instead of explaining
//               rollovers and fees on a $0 balance.
function EstimateCard({
  pending, extras = 0, feeMonths, npShort, onGiveExtra, skipped,
  monthlyCap, chargeAdjustment, onAdjust, processingCover,
  demoActive, realAcct, includeFee, cycle, locked, total, rollingOver, rolloverIn = 0,
  noBank, onLinkBank,
}) {
  const roundUps = effectiveCharge({ pendingRoundUps: pending, monthlyCap, chargeAdjustment });
  const capActive = monthlyCap !== null && monthlyCap !== undefined && pending > monthlyCap;
  const adjusted = chargeAdjustment !== null && chargeAdjustment !== undefined;
  const lockedMode = cycle.lockedMode && !skipped && !noBank;
  const lockedCharges = !!locked && !isBelowFloor(locked.total);
  // What the Adjust button can act on: the locked amount in the review window,
  // the accruing total otherwise. Under the floor there is nothing to adjust.
  const canAdjust = !skipped && !noBank && (lockedMode ? lockedCharges : !rollingOver);
  const title = skipped
    ? 'Next charge · skipped this month'
    : cycle.firstPartial
      ? `First charge: ${cycle.chargeLabel} (if $${MONTHLY_FLOOR}+)`
      : lockedMode
        ? `${cycle.monthName}'s charge · ${cycle.chargeLabel}`
        : `Next charge · ${cycle.chargeLabel}`;
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15, padding: '6px 0' };
  const amount = { color: INK.primary, fontWeight: 600, ...NUMS };
  const totalStyle = { color: NAVY, fontWeight: 800, fontSize: 18, ...NUMS };
  // Neutral explanations (rollover, fee rolls) are slate helper text, never a
  // warning. Amber is kept for the skip and cap states only.
  const helper = { margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: INK.subtle };
  const divider = { height: 1, background: 'var(--line)', margin: '6px 0' };
  const feeLabel = `App fee  -  $1 × ${feeMonths} month${feeMonths !== 1 ? 's' : ''}`;
  return (
    <div style={{ ...CARD, padding: 24 }}>
      <SectionTitle>{title}</SectionTitle>
      {skipped && (
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid #fde68a', borderRadius: RADIUS.sm, padding: '8px 12px' }} data-testid="web-estimate-skipped">
          {skipExplainer({ pendingRoundUps: pending, feeMonths })}
        </p>
      )}

      {/* ── Where this cycle is ── measured from the 1st of the month whose
          round-ups the charge collects, to the charge day. */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: INK.secondary }}>
            {cycle.monthName} round-ups
          </p>
          <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.4px', ...NUMS }} data-testid="web-cycle-days-left">
              {cycle.daysLeft}
            </span>
            {/* The countdown measures the CYCLE, and on a skipped cycle its end is
                not a charge - "days left" beside "nothing is collected" would read
                as a countdown to money leaving. Same split as the app. */}
            <span style={{ fontSize: 14, color: INK.subtle }}>{skipped ? 'days left in cycle' : 'days left'}</span>
          </p>
        </div>
        <div style={{ background: 'var(--line)', borderRadius: RADIUS.pill, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${cycle.cyclePct}%`, height: '100%', background: SERIES, borderRadius: RADIUS.pill }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: INK.subtle }}>
          <span>Cycle start {cycle.cycleStartLabel}</span>
          <span>{skipped ? 'Skipped' : `Charge day ${cycle.chargeLabel}`}</span>
        </div>
      </div>

      {noBank ? (
        /* A real account with no bank yet: nothing accrues, so the rollover
           and fee explanations would describe a balance that cannot exist.
           Ask for the one thing that starts round-ups instead. */
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }} data-testid="web-estimate-link-bank">
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK.primary }}>Link your bank to start rounding up</p>
          <p style={{ ...helper, margin: '4px 0 0' }}>Round-ups count from the day you link a card.</p>
          <Button variant="secondary" size="md" surface="web" onClick={onLinkBank} style={{ marginTop: 12 }} data-testid="web-estimate-link-bank-button">
            Link your bank
          </Button>
        </div>
      ) : lockedMode ? (
        /* ── Days 1 to 11: last month's LOCKED amount ── */
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          {lockedCharges ? (
            <>
              <div style={row}>
                <span style={{ color: INK.secondary }}>{cycle.monthName} round-ups, locked {cycle.lockLabel}</span>
                <span style={amount} data-testid="web-estimate-roundups">${fmtMoney(locked.roundUps)}</span>
              </div>
              {locked.fee > 0 && (
                <div style={row}><span style={{ color: INK.secondary }}>{feeLabel}</span><span style={{ color: INK.secondary, ...NUMS }}>+${fmtMoney(locked.fee)}</span></div>
              )}
              <div style={divider} />
              <div style={row}>
                <span style={{ color: INK.primary, fontWeight: 700 }}>One charge from {npShort}</span>
                <span style={totalStyle} data-testid="web-estimate-total">${fmtMoney(locked.total)}</span>
              </div>
            </>
          ) : (
            <>
              <div style={row}>
                <span style={{ color: INK.primary, fontWeight: 700 }}>Nothing to charge this time</span>
                <span style={{ color: INK.subtle, fontWeight: 600, ...NUMS }} data-testid="web-estimate-total">$0.00</span>
              </div>
              <p style={helper} data-testid="web-estimate-rollover">
                {locked && locked.total > 0
                  ? `${cycle.monthName}'s $${fmtMoney(locked.total)} was under $${MONTHLY_FLOOR}, so it rolls forward. ${ROLL_FORWARD_NOTE}`
                  : ROLL_FORWARD_NOTE}
              </p>
            </>
          )}
          {/* The month accruing right now, kept apart from the locked charge so
              the two can never be read as one number. */}
          <p style={{ ...helper, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }} data-testid="web-estimate-accruing">
            {cycle.accruing.monthName} so far: <strong style={{ color: INK.primary, fontWeight: 600, ...NUMS }}>${fmtMoney(pending)}</strong>
            {' '}-  locks {cycle.accruing.lockLabel}, charged {cycle.accruing.chargeLabel}.
          </p>
          {realAcct && !includeFee && (
            <p style={helper} data-testid="web-estimate-fee-pending">{appFeePendingLine(feeMonths)}</p>
          )}
        </div>
      ) : (
        /* ── The accruing month (and the skipped state) ── */
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div style={row}>
            {/* Accrual line: on a skipped cycle this is the honest "you did round up
                this much", and the skip banner above says it is never charged. */}
            <span style={{ color: INK.secondary }}>Round-ups so far</span>
            <span style={amount} data-testid="web-estimate-roundups">
              {!skipped && roundUps !== pending
                ? <><s style={{ color: INK.muted, fontWeight: 400 }}>${fmtMoney(pending)}</s> ${fmtMoney(roundUps)}</>
                : `$${fmtMoney(pending)}`}
            </span>
          </div>
          {/* Real Give Extra pledges join the same charge (and count toward the
              floor), so they are itemised beside the round-ups. */}
          {!skipped && extras > 0 && (
            <div style={row} data-testid="web-estimate-extra">
              <span style={{ color: INK.secondary }}>Extra gift</span>
              <span style={{ color: INK.secondary, ...NUMS }}>+${fmtMoney(extras)}</span>
            </div>
          )}
          {!skipped && rolloverIn > 0 && (
            <div style={row} data-testid="web-estimate-rollover-in">
              <span style={{ color: INK.secondary }}>Rolled in from earlier months</span>
              <span style={{ color: INK.secondary, ...NUMS }}>+${fmtMoney(rolloverIn)}</span>
            </div>
          )}
          {/* The $1 fee is NOT on a skipped charge - it rolls onto the next one, and
              the banner names which. Printing "+$1.00" here would contradict that.
              For a real account the fee is not collected yet (APP_FEE_LIVE), so it
              is named OUTSIDE the total below instead of inside it. */}
          {!skipped && includeFee && (
            <div style={row}><span style={{ color: INK.secondary }}>{feeLabel}</span><span style={{ color: INK.secondary, ...NUMS }}>+${fmtMoney(feeMonths)}</span></div>
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
              <span style={{ color: INK.secondary, ...NUMS }}>+${fmtMoney(processingCover)}</span>
            </div>
          )}
          <div style={divider} />
          {skipped ? (
            /* Zero, not a total. This row used to read "One charge from BGCA
               ≈ $14.89" directly under copy saying the charge was skipped. */
            <div style={row}>
              <span style={{ color: INK.primary, fontWeight: 700 }}>{SKIP_COLLECT_LABEL}</span>
              <span style={{ color: 'var(--warning)', fontWeight: 800, fontSize: 18, ...NUMS }} data-testid="web-estimate-total">{SKIP_COLLECT_AMOUNT}</span>
            </div>
          ) : rollingOver ? (
            <div style={row}>
              <span style={{ color: INK.primary, fontWeight: 700 }}>Nothing charged yet</span>
              <span style={{ color: INK.subtle, fontSize: 14, textAlign: 'right' }} data-testid="web-estimate-rollover">
                <strong style={{ color: INK.primary, fontWeight: 600, ...NUMS }}>${fmtMoney(pending)}</strong> so far  -  rolls over at month-end
              </span>
            </div>
          ) : (
            <div style={row}><span style={{ color: INK.primary, fontWeight: 700 }}>One charge from {npShort}</span><span style={totalStyle} data-testid="web-estimate-total">≈ ${fmtMoney(total)}</span></div>
          )}
          {/* Says where the extra money lands. The cover is a donation to the
              nonprofit, not a PocketCache charge, and the donor pre-agreed to it at
              signup - so the one place the total names it should also say so, and
              point at the control that changes it. Sentence for sentence the same as
              the shared ChargeReviewAlert's `charge-cover-note`. */}
          {!skipped && !rollingOver && processingCover > 0 && (
            <p style={helper} data-testid="web-estimate-cover-note">
              The ${fmtMoney(processingCover)} processing cover goes to {npShort}, not to PocketCache, so 100% of your round-ups reach them. Change it in Settings.
            </p>
          )}
          {/* Rollover explainer - the shared ROLL_FORWARD_NOTE (there is no forced
              settle-up), plus the fee-rollover disclosure while the fee is itemised. */}
          {rollingOver && (
            <p style={helper} data-testid="web-estimate-rollover-note">
              {ROLL_FORWARD_NOTE}
              {includeFee && <>{' '}$1/month fee rolls too  -  {feeMonths} month{feeMonths !== 1 ? 's' : ''} so far (${feeMonths})  -  itemized on your charge.</>}
            </p>
          )}
          {/* Real accounts: the fee is named, outside the total, until it is live. */}
          {!skipped && realAcct && !includeFee && (
            <p style={helper} data-testid="web-estimate-fee-pending">{appFeePendingLine(feeMonths)}</p>
          )}
          {/* Cap / adjustment notes  -  same precedence and wording as the app Dashboard.
              Suppressed while rolling over, exactly as the app suppresses them. */}
          {!skipped && !rollingOver && capActive && !adjusted && (
            <p style={{ ...helper, color: 'var(--warning)' }} data-testid="web-estimate-capped">
              Capped at ${fmtMoney(monthlyCap)}  -  the rest won&apos;t be charged.
            </p>
          )}
          {!skipped && !rollingOver && adjusted && (
            <p style={{ ...helper, fontWeight: 600, color: 'var(--green)' }} data-testid="web-estimate-adjusted">
              Adjusted to ${fmtMoney(chargeAdjustment)} for this month.
            </p>
          )}
        </div>
      )}
      {/* The schedule explainer promises a charge on the 11th, which is exactly
          what a skipped cycle does NOT do. On a skip the resumed-timing sentence
          in the banner above (SKIP_RESUME_LINE, shared with the app) replaces it,
          so neither surface ever pairs a skip with "charged on the 11th". */}
      {!skipped && (
        /* The payment method used to be named right here ("charged to Credit or
           Debit Card ····4242 on the 11th"). Settings owns the payment method -
           it is the only screen that can change it - so this sentence keeps the
           schedule and drops the instrument. The demo disclaimer is demo-only:
           a real donor must never be told their charge is fake. */
        <p style={helper} data-testid="web-estimate-schedule">
          Round-ups accrue through the last day of the month; the exact amount is emailed to you
          on the 1st and charged by {npShort} on the 11th.{demoActive ? ' Demo data  -  no real charge is made.' : ''}
        </p>
      )}
      {/* Always available, exactly like the app's Dashboard button. The shared
          ChargeReviewAlert only offers this on days 1 to 10 and only until it is
          acknowledged, which left web donors with no way to adjust at all. */}
      {canAdjust && (
        <Button variant="secondary" size="md" surface="web" onClick={onAdjust} style={{ marginTop: 12 }} data-testid="web-adjust-charge-button">
          Adjust this charge →
        </Button>
      )}
      <Button variant="secondary" size="md" surface="web" onClick={onGiveExtra} style={{ marginTop: 8 }} data-testid="web-give-extra-button">
        <Heart size={16} color="var(--green)" aria-hidden="true" /> Give a little extra…
      </Button>
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
  const capsLabel = { margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK.subtle };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2, color: INK.primary }}>Activity</h1>
        <p style={{ margin: '4px 0 0', fontSize: 15, color: INK.secondary }}>
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
          <div style={{ ...CARD, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <p style={capsLabel}>
                  This month
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, color: INK.primary, ...NUMS }} data-testid="web-activity-month-total">
                  ${fmtMoney(pending)}
                </p>
                {org && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <OrgLogo nonprofit={org} size={5} rounded="md" />
                    <span style={{ fontSize: 14, fontWeight: 600, color: INK.secondary }}>{org.name}</span>
                  </span>
                )}
              </div>
              {/* Demo-dataset stat only: a brand-new real account has no prior
                  month to compare against, so the caller passes null. */}
              {momChange != null && (
                <span
                  data-testid="web-activity-mom"
                  style={{
                    fontSize: 14, fontWeight: 700, borderRadius: RADIUS.pill, padding: '4px 12px', whiteSpace: 'nowrap',
                    color: momChange >= 0 ? 'var(--green-700)' : 'var(--danger)',
                    background: momChange >= 0 ? 'var(--green-50)' : 'var(--danger-50)',
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
                <div style={{ height: 1, background: 'var(--line)', margin: '16px 0 12px' }} />
                <SectionTitle>Giving by month</SectionTitle>
                <p style={{ margin: '2px 0 12px', fontSize: 14, color: INK.subtle }}>
                  Monthly round-up totals · {currentMonthLabel} still in progress
                </p>
                <GivingChart data={history} />
              </>
            ) : (
              <p style={{ margin: '16px 0 0', paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 14, lineHeight: 1.55, color: INK.subtle }}>
                Your monthly chart builds as months complete  -  round-ups only count from the day you joined.
              </p>
            )}
          </div>

          {/* Month summary pill  -  raw round-ups and the boost shown separately so
              the multiplied headline above is traceable. */}
          <div style={{ ...CARD, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }} data-testid="web-activity-month-summary">
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ width: 36, height: 36, borderRadius: RADIUS.sm, background: 'var(--brand-tint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={18} color="var(--brand-text-accent)" aria-hidden="true" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: INK.primary }}>{currentMonthLabel}</span>
                <span style={{ display: 'block', fontSize: 14, color: INK.subtle }}>
                  {fmtCount(monthTxnCount)} transactions · ${fmtMoney(monthBaseAmount)} rounded up
                  {multiplier > 1 && ` × ${multiplier} boost`}
                </span>
              </span>
            </span>
            <span style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ display: 'block', fontSize: 18, fontWeight: 800, color: 'var(--green-700)', ...NUMS }}>${fmtMoney(pending)}</span>
              {multiplier > 1 && (
                <span style={{ display: 'block', fontSize: 13, color: INK.subtle, ...NUMS }}>
                  ${fmtMoney(monthBaseAmount)} × {multiplier}
                </span>
              )}
            </span>
          </div>

          <div style={{ ...CARD, padding: 24 }}>
            <SectionTitle>All activity</SectionTitle>
            <p style={{ margin: '2px 0 12px', fontSize: 14, color: INK.subtle }}>
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
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><CoinMark size={36} /></div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: INK.primary }}>No round-ups yet</p>
                <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6, color: INK.secondary }}>
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
          <div style={{ ...CARD, padding: 24 }} data-testid="web-taxyear">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={capsLabel}>
                  {taxYear} tax year
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, color: INK.primary, ...NUMS }} data-testid="web-taxyear-total">
                  ${fmtMoney(tax.donated)}
                </p>
              </div>
              {demoActive && (
                <span style={SAMPLE_PILL}>
                  Demo data
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: INK.subtle }} data-testid="web-taxyear-months">
              {tax.months === 0 ? 'No completed months yet this year' : `Donated across ${taxMonthsLabel}`}
              {' · '}{currentMonthLabel} still in progress
            </p>
            <p style={{ margin: '12px 0 0', paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 14, lineHeight: 1.6, color: INK.secondary }}>
              Your round-ups are tax-deductible. The $1 monthly app fee is not (${fmtMoney(tax.feeMonths)} so far
              this year). {npShort} issues your receipt.
            </p>
            <Button
              variant="secondary" size="md" surface="web"
              onClick={onSettings}
              data-testid="web-taxyear-settings-link"
              style={{ marginTop: 16, justifyContent: 'space-between', textAlign: 'left', fontSize: 15 }}
            >
              <span>Download my giving history in Settings</span>
              <span aria-hidden style={{ color: INK.muted, flexShrink: 0 }}>›</span>
            </Button>
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
const NAV_IDS = NAV_TABS.map(t => t.id);

// The active tab lives in the URL (?tab=activity) so a refresh, a bookmark or
// an email's "manage in Settings" link lands on the right tab. Checked against
// the known ids so a stray value falls back to Overview. replaceState, not
// pushState: Back leaves the portal rather than stepping through tabs.
function tabFromUrl() {
  try {
    const t = new URLSearchParams(window.location.search).get('tab');
    return NAV_IDS.includes(t) ? t : 'overview';
  } catch {
    return 'overview';
  }
}

function writeTabToUrl(id) {
  try {
    const url = new URL(window.location.href);
    if (id === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', id);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    /* URL sync is a convenience; the tab still switches. */
  }
}

export default function WebDashboard() {
  const app = useApp();
  const {
    selectedNonprofit, totalDonated, pendingRoundUps, skipNextCharge,
    feeMonths, signOut, adminRole, setPage, setLastMode, hasAccount,
    goToOnboardingStep, setPendingSettingsAction,
    monthlyCap, chargeAdjustment, setChargeAdjustment, roundUpMultiplier,
    coverProcessing,
    hasRealBankLinked, realRoundupsRecent, realRoundupsFreshness, realRoundupsCount,
    demoActive, demoMode, demoData,
    giveExtraPending,
  } = app;
  // state-core's contract, read defensively: today's deployed server returns
  // none of these, so every read below has a local fallback.
  const realProjection = app.realProjection ?? null;
  const realRoundupsLifetimeCount = app.realRoundupsLifetimeCount;
  const np = useNp();
  const brand = useTheme();
  const [navTab, setNavTabState] = useState(tabFromUrl);
  const [menuOpen, setMenuOpen] = useState(false);
  const [giveExtra, setGiveExtra] = useState(false);
  const [adjustCharge, setAdjustCharge] = useState(false);
  const [transferOrg, setTransferOrg] = useState(false);
  // Demo stats - byte-identical to the retired data/derived constants.
  const { avgPerMonth, momChange, sinceLabel, monthsGiving } = demoData;

  function setNavTab(id) {
    setNavTabState(id);
    writeTabToUrl(id);
  }

  // realAcct: a signed-in donor looking at their own data (demo mode off).
  // Every "is this number true?" branch below keys on it.
  const realAcct = !!hasAccount && !demoMode;
  const noBank = realAcct && !hasRealBankLinked;
  // The $1 fee rides inside a quoted total only when it is actually collected
  // (APP_FEE_LIVE) or the figure is demo data; a real donor sees it named
  // outside the total until launch.
  const includeFee = APP_FEE_LIVE || demoActive;

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
  // cannot arrive at two different numbers. The server's cover_cents wins for a
  // real account when it is present.
  const localCover = coverProcessing && !skipNextCharge
    ? processingCoverFor(effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment }))
    : 0;
  const processingCover = realAcct && typeof realProjection?.coverCents === 'number'
    ? realProjection.coverCents / 100
    : localCover;
  const rolloverIn = realAcct && typeof realProjection?.rolloverInCents === 'number'
    ? realProjection.rolloverInCents / 100
    : 0;
  // One number for "what will actually be charged": the server's projection for
  // a real account when it has one, else lib/billing's math. Give Extra pledges
  // join the same charge, after cap/adjust.
  const localTotal = chargeTotal({
    pendingRoundUps, monthlyCap, chargeAdjustment, feeMonths, processingCover,
    extras: giveExtraPending, includeFee,
  });
  const upcomingCharge = realAcct && typeof realProjection?.projectedTotalCents === 'number'
    ? realProjection.projectedTotalCents / 100
    : parseFloat((localTotal + rolloverIn).toFixed(2));
  // Below the fixed $5 floor nothing is collected, so no tile may quote a
  // charge - the app's card says "rolls over at month-end" here. The floor test
  // is on round-ups (after cap/adjust) plus pledges plus any rolled-in balance,
  // never on the fee; the server's will_roll_forward wins when present.
  const floorBase = effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment }) + (giveExtraPending || 0) + rolloverIn;
  const rollingOver = !skipNextCharge && (
    realAcct && typeof realProjection?.willRollForward === 'boolean'
      ? realProjection.willRollForward
      : isBelowFloor(floorBase)
  );

  // Where the donor is in the cycle (see cycleView). Keyed on the join date so
  // a new donor's first partial window resolves to the right charge.
  const joinedAt = hasAccount?.joinedAt ?? null;
  const cycle = useMemo(() => cycleView({ realAcct, joinedAt }), [realAcct, joinedAt]);
  // The amount that locked on the 1st, for days 1 to 11: the server's locked
  // cycle for a real account (null until it returns one), the demo dataset's
  // completed month in demo mode.
  const locked = useMemo(() => {
    if (realAcct) {
      const lc = realProjection?.lockedCycle;
      if (!lc) return null;
      const cents = lc.adjustedTotalCents ?? lc.totalCents ?? 0;
      return { roundUps: cents / 100, fee: 0, total: cents / 100 };
    }
    const series = demoData.monthlyData ?? [];
    const prev = series[series.length - 2];
    if (!prev) return null;
    const fee = includeFee ? 1 : 0;
    return { roundUps: prev.donated, fee, total: parseFloat((prev.donated + fee).toFixed(2)) };
  }, [realAcct, realProjection, demoData, includeFee]);
  const lockedCharges = !!locked && !isBelowFloor(locked.total);
  // What "Adjust this charge" acts on, the same rule the phone's AdjustChargeSheet
  // uses (Dashboard.jsx adjustBase): the LOCKED round-ups during the review
  // window, the accruing total otherwise. The modal used to get this month's
  // accrual while the card's button was gated on October's locked amount, so a
  // $13.47 charge opened a modal saying $4.63 was under the floor.
  const adjustLocked = cycle.lockedMode && !skipNextCharge && !noBank && !!locked;
  const adjustBase = adjustLocked ? locked.roundUps : pendingRoundUps;
  const adjustPeriodLabel = adjustLocked ? `in ${cycle.monthName}` : 'this month';

  // Web twin of the app's milestone celebration. Real accounts only: demo
  // totals never fire a toast or write pc_seen_milestone, and the key is the
  // one the phone uses, so a club celebrated on one surface stays celebrated
  // on the other.
  const [seenMilestone, setSeenMilestone] = useState(() => (realAcct ? loadKey('pc_seen_milestone', 0) : 0));
  const milestoneToast = useMemo(() => {
    if (!realAcct) return null;
    const achieved = getMilestonesUpTo(totalDonated).filter(m => m.achieved).pop();
    return achieved && achieved.amount > (seenMilestone || 0) ? achieved : null;
  }, [realAcct, totalDonated, seenMilestone]);
  useEffect(() => {
    if (!milestoneToast) return undefined;
    const amount = milestoneToast.amount;
    const id = setTimeout(() => {
      setSeenMilestone(amount);
      saveKey('pc_seen_milestone', amount);
    }, 5000);
    return () => clearTimeout(id);
  }, [milestoneToast]);
  function dismissMilestone() {
    if (!milestoneToast) return;
    setSeenMilestone(milestoneToast.amount);
    saveKey('pc_seen_milestone', milestoneToast.amount);
  }

  // Sign out clears the nonprofit admin context too (the last admin's org
  // record and tab), which AppContext.signOut cannot reach on its own.
  function handleSignOut() {
    np?.resetNpContent?.();
    signOut();
  }

  // "Link your bank" goes into the existing Settings track-card flow.
  function handleLinkBank() {
    setPendingSettingsAction?.('track-card');
    setNavTab('settings');
  }

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

  // Tenant text on white is brand.textAccent (dark enough by contract);
  // brand.primary is the fill. BGCA's are the same navy.
  const tenantPrimary = brand.primary ?? NAVY;
  const tenantText = brand.textAccent ?? tenantPrimary;
  const menuItem = { display: 'flex', alignItems: 'center', width: '100%', minHeight: 44, textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 12px', fontSize: 15, fontWeight: 600, color: INK.primary, cursor: 'pointer', borderRadius: RADIUS.xs, fontFamily: 'inherit' };

  // The Next-charge KPI's sub line, from the same facts the EstimateCard reads.
  const nextChargeSub = skipNextCharge
    ? skipSummaryLine(feeMonths)
    : noBank
      ? 'Link your bank to start rounding up'
      : cycle.firstPartial
        ? `Your first charge (if $${MONTHLY_FLOOR}+) · $${fmtMoney(pendingRoundUps)} so far`
        : cycle.lockedMode
          ? (lockedCharges
            ? `$${fmtMoney(locked.total)} · ${cycle.monthName}'s round-ups, locked ${cycle.lockLabel}`
            : `Nothing to charge this time · $${fmtMoney(pendingRoundUps)} so far in ${cycle.accruing.monthName}`)
          : rollingOver
            ? `$${fmtMoney(pendingRoundUps)} so far  -  rolls over at month-end (under the $${MONTHLY_FLOOR} minimum)`
            // Names the cover in the tile too, so the KPI figure is
            // traceable without opening the estimate card.
            : `≈ $${fmtMoney(upcomingCharge)}${includeFee ? ' incl. $1 fee' : ''}${processingCover > 0 ? ` + $${fmtMoney(processingCover)} processing cover` : ''} · exact amount locks ${cycle.lockLabel}`;

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #EDF2F8 0%, var(--surface) 260px)' }} onClick={() => menuOpen && setMenuOpen(false)}>
      <GiveExtraModal show={giveExtra} onClose={() => setGiveExtra(false)} />
      <AdjustChargeModal
        show={adjustCharge}
        onClose={() => setAdjustCharge(false)}
        pendingRoundUps={adjustBase}
        periodLabel={adjustPeriodLabel}
        chargeAdjustment={chargeAdjustment}
        setChargeAdjustment={setChargeAdjustment}
        monthlyCap={monthlyCap}
      />
      <TransferNonprofitModal
        show={transferOrg}
        onClose={() => setTransferOrg(false)}
        adminRole={adminRole}
      />
      {/* Another nonprofit's join link opened while signed in: confirm the
          switch instead of silently re-binding (renders nothing otherwise). */}
      <PendingOrgPrompt surface="web" />
      {milestoneToast && <MilestoneToast milestone={milestoneToast} onClose={dismissMilestone} />}
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
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {brand.appName ?? `${npShort} Round-Up`}
                    {/* The subtle demo marker (Settings toggle / phone shake). */}
                    {demoMode && (
                      <span data-testid="web-demo-mode-pill" style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid #fde68a', borderRadius: RADIUS.pill, padding: '2px 8px', verticalAlign: 'middle' }}>
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
                    <span data-testid="web-demo-mode-pill" style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid #fde68a', borderRadius: RADIUS.pill, padding: '2px 8px', verticalAlign: 'middle' }}>
                      Demo
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, flex: 1 }} aria-label="Dashboard sections">
            {NAV_TABS.map(t => {
              const active = navTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNavTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className="pc-btn"
                  // Active tab follows the bound org's brand palette, exactly
                  // like the app's chrome does (item B: org theme parity): an
                  // 8% primary wash with the tenant's text accent at 700.
                  style={{
                    border: 'none', background: active ? `${tenantPrimary}14` : 'transparent', cursor: 'pointer',
                    minHeight: 44, padding: '10px 18px', borderRadius: RADIUS.pill, fontSize: 15, fontFamily: 'inherit',
                    fontWeight: active ? 700 : 500,
                    color: active ? tenantText : INK.secondary,
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
          {/* Account menu */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              className="pc-btn"
              style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--line)', background: brand.gradient ?? NAVY_GRADIENT, color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}
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
                style={{ position: 'absolute', right: 0, top: 54, width: 280, maxWidth: 'min(320px, calc(100vw - 32px))', ...CARD, boxShadow: SHADOW.lg, padding: 8, zIndex: 40, overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', marginBottom: 4, minWidth: 0 }}>
                  <p title={userName} style={{ margin: 0, fontWeight: 700, fontSize: 15, color: INK.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</p>
                  <p title={userEmail} style={{ margin: 0, fontSize: 14, color: INK.subtle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</p>
                </div>
                {adminRole && (
                  <button
                    type="button"
                    onClick={() => { setLastMode('admin'); setPage('np-dashboard'); }}
                    className="pc-btn"
                    style={menuItem}
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
                    type="button"
                    onClick={() => { setMenuOpen(false); goToOnboardingStep('nonprofit-signup'); }}
                    data-testid="web-create-nonprofit-page"
                    className="pc-btn"
                    style={menuItem}
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
                    type="button"
                    onClick={() => { setMenuOpen(false); setTransferOrg(true); }}
                    data-testid="web-transfer-nonprofit"
                    className="pc-btn"
                    style={menuItem}
                  >
                    Transfer nonprofit page
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  data-testid="web-sign-out"
                  className="pc-btn"
                  style={{ ...menuItem, color: 'var(--danger)' }}
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
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2, color: INK.primary }}>
                {greeting}{greetName ? `, ${greetName}` : ''} 👋
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: INK.secondary }}>
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
                label={cycle.firstPartial && !skipNextCharge ? 'First charge' : 'Next charge'}
                // The tile's headline figure on a skipped cycle is the amount, not
                // the word "Skipped": $0.00 is what leaves the account. For a new
                // donor it is the first charge that can hold their round-ups.
                value={skipNextCharge ? SKIP_COLLECT_AMOUNT : cycle.chargeLabel}
                sub={nextChargeSub}
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
                {/* A SAMPLE match (the BGCA seed's GM example) renders only while
                    demo data is on; a real account never sees a sponsor claim
                    about a partnership that does not exist. */}
                {isMatchVisible(org?.corporateMatch, demoActive) && (
                  <MatchLine match={org.corporateMatch} onOpen={() => setNavTab('mycause')} />
                )}
                <ActivityLinkCard
                  onOpen={() => setNavTab('activity')}
                  demoActive={demoActive}
                  realCount={realRoundupsCount}
                  realLifetimeCount={realRoundupsLifetimeCount}
                  demoData={demoData}
                />
              </div>

              <div style={{ display: 'grid', gap: 20 }}>
                <EstimateCard
                  pending={pendingRoundUps}
                  extras={giveExtraPending}
                  feeMonths={feeMonths}
                  npShort={npShort}
                  onGiveExtra={() => setGiveExtra(true)}
                  skipped={skipNextCharge}
                  monthlyCap={monthlyCap}
                  chargeAdjustment={chargeAdjustment}
                  onAdjust={() => setAdjustCharge(true)}
                  processingCover={processingCover}
                  demoActive={demoActive}
                  realAcct={realAcct}
                  includeFee={includeFee}
                  cycle={cycle}
                  locked={locked}
                  total={upcomingCharge}
                  rollingOver={rollingOver}
                  rolloverIn={rolloverIn}
                  noBank={noBank}
                  onLinkBank={handleLinkBank}
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
            // The month-over-month badge is a demo-dataset stat; a real
            // account has no prior month to compare until two have completed.
            momChange={demoActive ? momChange : null}
          />
        )}

        {navTab === 'mycause' && <WebMyCause />}
        {navTab === 'share' && <WebShare />}
        {navTab === 'settings' && <WebSettings />}
      </main>

      <footer style={{ padding: '0 24px 28px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: INK.subtle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
