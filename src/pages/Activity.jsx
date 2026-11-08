import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Calendar, ChevronRight, Coins } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { monthlyHistoryFor, taxYearSummary } from '../lib/donorContent';
import CustomTooltip from '../components/CustomTooltip';
import OrgLogo from '../components/OrgLogo';
import { fmtMoney } from '../lib/format';
import { categoryIcon } from '../lib/categoryEmoji';
import { safeBottomAtLeast } from '../lib/safeArea';

/** Positive money is always green (BRANDING.md rule 2) - semantic, not brand. */
const GREEN = 'var(--green)';

function groupByDate(transactions) {
  const groups = {};
  transactions.forEach(tx => {
    if (!groups[tx.date]) groups[tx.date] = [];
    groups[tx.date].push(tx);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** 32px tinted square with the category's line icon. */
function CategoryChip({ category, color }) {
  return (
    <div className="w-8 h-8 rounded-chip flex items-center justify-center shrink-0"
      style={{ background: `${color}14`, color }} aria-hidden="true">
      {categoryIcon(category, 16)}
    </div>
  );
}

export default function Activity() {
  const {
    pendingRoundUps, roundUpMultiplier, selectedNonprofit, setTab,
    demoActive, realRoundupsRecent, realRoundupsFreshness, realRoundupsCount, demoData,
    giveExtraPending,
    // Server-side raw sum before the multiplier (state-core). Undefined until
    // that layer lands; the fallback below divides the multiplied figure back.
    realRoundupsBaseTotal,
  } = useApp();
  const brand = useTheme();
  // Demo figures follow the active shake level's dataset (item 8b) - level 3
  // is byte-identical to the old TRANSACTIONS / derived constants.
  const { transactions: demoTransactions, currentMonthPending: demoPending, momChange } = demoData;
  // REAL account, demo mode off (item 12): the ledger binds to the server's
  // real round-up rows (roundups-me) - a brand-new account has none, so it
  // renders the friendly empty state instead of the prefilled demo feed.
  // The demo TRANSACTIONS dataset only ever renders while demoActive.
  const realRows = (realRoundupsRecent ?? []).map((r, i) => ({
    id: `real-${r.date}-${i}`,
    date: r.date,
    merchant: r.merchant || 'Purchase',
    category: 'Bank purchase',
    amount: (r.amount_cents ?? 0) / 100,
    roundUp: (r.roundup_cents ?? 0) / 100,
  }));
  const rows = demoActive ? demoTransactions : realRows;
  const grouped = groupByDate(rows);
  // The server returns at most the latest 10 rows but counts the whole cycle,
  // so the pill counts from realRoundupsCount - summing the 10 visible rows
  // undercounted a donor with 40 purchases by 30.
  const txCount = demoActive ? rows.length : (Number.isFinite(realRoundupsCount) ? realRoundupsCount : rows.length);
  const listTruncated = !demoActive && txCount > rows.length && rows.length > 0;
  // Raw sum of round-ups before any multiplier  -  the exported constant for
  // the demo dataset; for a real account the server's own base total when it
  // provides one, else the multiplied figure divided back (never the sum of
  // the 10 visible rows, which is only part of the cycle).
  const mult = roundUpMultiplier > 0 ? roundUpMultiplier : 1;
  const rawRoundUps = demoActive
    ? demoPending
    : Number.isFinite(realRoundupsBaseTotal)
      ? realRoundupsBaseTotal
      : parseFloat((pendingRoundUps / mult).toFixed(2));
  // Any real Give Extra pledge joins this month's charge (0 while demoActive).
  const extras = typeof giveExtraPending === 'number' ? giveExtraPending : 0;
  const thisMonth = pendingRoundUps + extras;

  // The chart MUST plot the same numbers the headlines show: monthlyHistory()
  // swaps the in-progress month for the live multiplied figure. Plotting raw
  // MONTHLY_DATA is what made "This Month $9.26" sit above a $4.63 bar at 2x.
  // Demo dataset only: a real account has no multi-month history to chart yet,
  // so the chart itself is demo-gated below.
  const history = monthlyHistoryFor(demoData.monthlyData, pendingRoundUps);

  // Current month label derived from the history data  -  never hardcoded
  const currentEntry = history[history.length - 1];
  const currentMonthLabel = `${currentEntry.month} ${currentEntry.year}`;

  // Calendar-year giving summary (completed months only  -  this month is not
  // charged yet, so counting it would overstate what a donor can substantiate).
  // A real account has ZERO completed months of charge history - honest zeros,
  // never the demo dataset's totals.
  const taxYear = new Date().getFullYear();
  const tax = demoActive
    ? taxYearSummary(pendingRoundUps, taxYear, demoData.monthlyData)
    : { donated: 0, months: 0, feeMonths: 0 };
  const taxMonthsLabel = tax.months === 1 ? '1 completed month' : `${tax.months} completed months`;

  // MoM display (computed from the demo dataset - meaningless for a fresh
  // real account, so it only renders while demoActive)
  const momDisplay = !demoActive || momChange === null
    ? null
    : `${momChange >= 0 ? '↑' : '↓'} ${Math.abs(momChange).toFixed(0)}% vs last month`;

  if (!selectedNonprofit) return null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pb-4"
        style={{ paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Activity</h1>
            <p className="text-white/70 text-sm mt-0.5">Your giving history</p>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 scrollable pc-scrollbar px-4 space-y-4 pt-4" style={{ paddingBottom: safeBottomAtLeast(112, 106) }}>
        {/* Summary card. The lifetime total lives on Home's hero, not here, and the
            billing explainer lives in Settings  -  one home per fact. */}
        <div className="bg-white rounded-card p-4 card-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate text-[11px] font-semibold uppercase tracking-[0.06em]">This Month</p>
              <p className="text-3xl font-bold text-ink mt-1 tabular-nums">${fmtMoney(thisMonth)}</p>
              {extras > 0 && (
                <p className="text-slate text-[13px] mt-0.5">Incl. ${fmtMoney(extras)} extra gift</p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <OrgLogo nonprofit={selectedNonprofit} size={4} rounded="md" />
                <span className="text-xs font-semibold text-ink-2 truncate">{selectedNonprofit.name}</span>
              </div>
            </div>
            {momDisplay && (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-pill shrink-0 mt-0.5"
                style={{
                  color: momChange >= 0 ? GREEN : 'var(--danger)',
                  background: momChange >= 0 ? 'rgba(5,150,105,0.08)' : 'var(--danger-50)',
                }}
              >
                {momDisplay}
              </span>
            )}
          </div>
          {/* Monthly chart: demo dataset only. A real account has no
              multi-month history yet - its story is this month, live.
              initialDimension gives recharts a real box on the first paint so
              the chart does not flash at 0x0 inside the phone frame. */}
          {demoActive ? (
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 96 }}>
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={brand.primary} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={brand.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="donated" stroke={brand.primary} strokeWidth={2.5}
                    fill="url(#areaGradient)" dot={false}
                    activeDot={{ r: 4, fill: brand.primary, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate text-[13px] pt-1 leading-relaxed">
              {realRoundupsFreshness
                ? `Live from your linked card · ${realRoundupsFreshness}`
                : 'Counting from the day you joined - your monthly chart builds as months complete.'}
            </p>
          )}
        </div>

        {/* Tax-year summary. Sits between the month headline and the month list
            because it is the zoomed-out version of the same ledger, and the pill
            below reads as the header of the transaction list. Deliberately quiet:
            reference information, not a call to action. The export itself lives in
            Settings > Privacy > Download My Data  -  this only points at it. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-card p-4 card-shadow"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-slate text-[11px] font-semibold uppercase tracking-[0.06em]">{taxYear} Tax Year</p>
              <p className="text-2xl font-bold text-ink mt-1 tabular-nums">${fmtMoney(tax.donated)}</p>
              <p className="text-slate text-[13px] mt-1">
                {tax.months === 0
                  ? 'No completed months yet this year'
                  : `Donated across ${taxMonthsLabel}`}
                {' · '}{currentMonthLabel} still in progress
              </p>
            </div>
          </div>
          <p className="text-ink-2 text-[13px] leading-relaxed mt-3 pt-3 border-t border-line">
            Your round-ups are tax-deductible. The $1 monthly app fee is not (${fmtMoney(tax.feeMonths)} so far
            this year). {selectedNonprofit.shortName} issues your receipt.
          </p>
          {/* Quiet text link, not a filled button: the export lives in Settings and
              this card is reference information, not a call to action. 44px hit
              area with a negative margin so the card keeps its height. */}
          <button
            type="button"
            onClick={() => setTab('settings')}
            className="mt-1 -mb-2 min-h-[44px] inline-flex items-center gap-1 text-[13px] font-semibold"
            style={{ color: brand.textAccent }}
          >
            Download my giving history in Settings
            <ChevronRight size={14} />
          </button>
        </motion.div>

        {/* Month summary  -  current month name from data, not hardcoded. A white
            card like its neighbors (the tinted version read as a warning in a
            red-accented tenant). When multiplier > 1 both the raw and boosted
            amounts are shown clearly. */}
        <div className="bg-white rounded-card px-4 py-3 flex items-center justify-between card-shadow">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-input flex items-center justify-center shrink-0"
              style={{ background: `${brand.primary}14`, color: brand.primary }} aria-hidden="true">
              <Calendar size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-ink font-semibold text-sm">{currentMonthLabel}</p>
              <p className="text-slate text-[13px]">
                {txCount} transaction{txCount !== 1 ? 's' : ''} · ${fmtMoney(rawRoundUps)} rounded up
                {roundUpMultiplier > 1 && ` x ${roundUpMultiplier} boost`}
              </p>
            </div>
          </div>
          {roundUpMultiplier > 1 ? (
            <div className="text-right shrink-0 ml-2">
              <div className="font-bold text-base tabular-nums" style={{ color: GREEN }}>
                ${fmtMoney(pendingRoundUps)}
              </div>
              <div className="text-xs text-slate tabular-nums">
                ${fmtMoney(rawRoundUps)} x {roundUpMultiplier}
              </div>
            </div>
          ) : (
            <div className="font-bold text-base tabular-nums shrink-0 ml-2" style={{ color: GREEN }}>
              ${fmtMoney(pendingRoundUps)}
            </div>
          )}
        </div>

        {/* Friendly empty state - a brand-new real account has no activity
            yet, and that is the honest story (item 12). */}
        {!demoActive && rows.length === 0 && (
          <div className="bg-white rounded-card p-6 card-shadow text-center" data-testid="activity-empty-state">
            <div className="w-12 h-12 rounded-card mx-auto mb-3 flex items-center justify-center"
              style={{ background: `${brand.primary}14`, color: brand.primary }} aria-hidden="true">
              <Coins size={24} />
            </div>
            <p className="font-bold text-ink text-sm mb-1">No round-ups yet</p>
            <p className="text-ink-2 text-[13px] leading-relaxed">
              Your round-ups will appear here once your card starts making purchases. Every purchase rounds up to the next dollar - the spare change lands on this page.
            </p>
          </div>
        )}

        {/* The server sends the latest 10 rows of a cycle that may hold more,
            so the list says what it is. */}
        {listTruncated && (
          <p className="text-slate text-xs font-semibold uppercase tracking-[0.06em] px-1 -mb-2">
            Latest {rows.length} round-ups
          </p>
        )}

        {/* Transaction groups */}
        {grouped.map(([date, txs], groupIdx) => (
          <motion.div key={date} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIdx * 0.04 }}>
            <p className="text-slate text-xs font-semibold uppercase tracking-[0.06em] mb-2 px-1">
              {formatDate(date)}
            </p>
            <div className="bg-white rounded-card overflow-hidden card-shadow">
              {txs.map((tx, i) => (
                <div key={tx.id}
                  className={`flex items-center gap-3 px-4 py-3 min-h-[56px] ${i < txs.length - 1 ? 'border-b border-line' : ''}`}>
                  <CategoryChip category={tx.category} color={brand.primary} />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm font-semibold truncate">{tx.merchant}</p>
                    <p className="text-slate text-xs">{tx.category}</p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <p className="text-slate text-xs">-${fmtMoney(tx.amount)}</p>
                    <p className="text-sm font-bold" style={{ color: GREEN }}>+${fmtMoney(tx.roundUp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
