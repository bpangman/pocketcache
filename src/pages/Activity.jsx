import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ChevronRight } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { TRANSACTIONS, CURRENT_MONTH_PENDING } from '../data/transactions';
import { momChange } from '../data/derived';
import { monthlyHistory, taxYearSummary } from '../lib/donorContent';
import CustomTooltip from '../components/CustomTooltip';
import OrgLogo from '../components/OrgLogo';
import { fmtMoney } from '../lib/format';
import { categoryEmoji } from '../lib/categoryEmoji';

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

export default function Activity() {
  const {
    pendingRoundUps, roundUpMultiplier, selectedNonprofit, setTab,
    demoActive, realRoundupsRecent, realRoundupsFreshness,
  } = useApp();
  const brand = useTheme();
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
  const rows = demoActive ? TRANSACTIONS : realRows;
  const grouped = groupByDate(rows);
  // Raw sum of round-ups before any multiplier  -  the exported constant for
  // the demo dataset, the real rows' own sum for a real account.
  const rawRoundUps = demoActive
    ? CURRENT_MONTH_PENDING
    : parseFloat(realRows.reduce((s, r) => s + r.roundUp, 0).toFixed(2));

  // The chart MUST plot the same numbers the headlines show: monthlyHistory()
  // swaps the in-progress month for the live multiplied figure. Plotting raw
  // MONTHLY_DATA is what made "This Month $9.26" sit above a $4.63 bar at 2x.
  // Demo dataset only: a real account has no multi-month history to chart yet,
  // so the chart itself is demo-gated below.
  const history = monthlyHistory(pendingRoundUps);

  // Current month label derived from the history data  -  never hardcoded
  const currentEntry = history[history.length - 1];
  const currentMonthLabel = `${currentEntry.month} ${currentEntry.year}`;

  // Calendar-year giving summary (completed months only  -  this month is not
  // charged yet, so counting it would overstate what a donor can substantiate).
  // A real account has ZERO completed months of charge history - honest zeros,
  // never the demo dataset's totals.
  const taxYear = new Date().getFullYear();
  const tax = demoActive
    ? taxYearSummary(pendingRoundUps, taxYear)
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

      <div className="flex-1 scrollable pc-scrollbar px-4 pb-28 space-y-4 pt-4">
        {/* Summary card. The lifetime total lives on Home's hero, not here, and the
            billing explainer lives in Settings  -  one home per fact. */}
        <div className="bg-white rounded-3xl p-5 card-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">This Month</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">${fmtMoney(pendingRoundUps)}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <OrgLogo nonprofit={selectedNonprofit} size={4} rounded="md" />
                <span className="text-xs font-semibold text-gray-600 truncate">{selectedNonprofit.name}</span>
              </div>
            </div>
            {momDisplay && (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 mt-0.5"
                style={{
                  color: momChange >= 0 ? '#059669' : '#dc2626',
                  background: momChange >= 0 ? '#ecfdf5' : '#fef2f2',
                }}
              >
                {momDisplay}
              </span>
            )}
          </div>
          {/* Monthly chart: demo dataset only. A real account has no
              multi-month history yet - its story is this month, live. */}
          {demoActive ? (
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={brand.primary} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={brand.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="donated" stroke={brand.primary} strokeWidth={2.5}
                    fill="url(#areaGradient)" dot={false}
                    activeDot={{ r: 4, fill: brand.primary, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-400 text-xs pt-1">
              {realRoundupsFreshness
                ? `Live from your linked card · ${realRoundupsFreshness}`
                : 'Counting from the day you joined  -  your monthly chart builds as months complete.'}
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
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{taxYear} Tax Year</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">${fmtMoney(tax.donated)}</p>
              <p className="text-gray-400 text-xs mt-1">
                {tax.months === 0
                  ? 'No completed months yet this year'
                  : `Donated across ${taxMonthsLabel}`}
                {' · '}{currentMonthLabel} still in progress
              </p>
            </div>
            {demoActive && (
              <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                Demo data
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs leading-relaxed mt-3 pt-3 border-t border-gray-50">
            Your round-ups are tax-deductible. The $1 monthly app fee is not (${fmtMoney(tax.feeMonths)} so far
            this year). {selectedNonprofit.shortName} issues your receipt.
          </p>
          {/* Quiet text link, not a filled button: the export lives in Settings and
              this card is reference information, not a call to action. */}
          <button
            onClick={() => setTab('settings')}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: brand.textAccent }}
          >
            Download my giving history in Settings
            <ChevronRight size={14} />
          </button>
        </motion.div>

        {/* Month summary pill  -  current month name from data, not hardcoded.
            When multiplier > 1 both the raw and boosted amounts are shown clearly. */}
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: brand.accentLight }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🗓️</span>
            <div>
              <p className="text-gray-900 font-semibold text-sm">{currentMonthLabel}</p>
              <p className="text-gray-400 text-xs">
                {rows.length} transaction{rows.length !== 1 ? 's' : ''} · ${fmtMoney(rawRoundUps)} rounded up
                {roundUpMultiplier > 1 && ` × ${roundUpMultiplier} boost`}
              </p>
            </div>
          </div>
          {roundUpMultiplier > 1 ? (
            <div className="text-right">
              <div className="font-bold text-base" style={{ color: '#059669' }}>
                ${fmtMoney(pendingRoundUps)}
              </div>
              <div className="text-xs text-gray-400">
                ${fmtMoney(rawRoundUps)} × {roundUpMultiplier}
              </div>
            </div>
          ) : (
            <div className="font-bold text-base" style={{ color: '#059669' }}>
              ${fmtMoney(pendingRoundUps)}
            </div>
          )}
        </div>

        {/* Friendly empty state - a brand-new real account has no activity
            yet, and that is the honest story (item 12). */}
        {!demoActive && rows.length === 0 && (
          <div className="bg-white rounded-3xl p-6 card-shadow text-center" data-testid="activity-empty-state">
            <div className="text-4xl mb-2">🪙</div>
            <p className="font-bold text-gray-900 text-sm mb-1">No round-ups yet</p>
            <p className="text-gray-500 text-xs leading-relaxed">
              Your round-ups will appear here once your card starts making purchases. Every purchase rounds up to the next dollar  -  the spare change lands on this page.
            </p>
          </div>
        )}

        {/* Transaction groups */}
        {grouped.map(([date, txs], groupIdx) => (
          <motion.div key={date} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIdx * 0.04 }}>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
              {formatDate(date)}
            </p>
            <div className="bg-white rounded-3xl overflow-hidden card-shadow">
              {txs.map((tx, i) => (
                <div key={tx.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${i < txs.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center text-xl shrink-0">
                    {categoryEmoji(tx.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-sm font-semibold truncate">{tx.merchant}</p>
                    <p className="text-gray-400 text-xs">{tx.category}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gray-400 text-xs">-${tx.amount.toFixed(2)}</p>
                    <p className="text-sm font-bold" style={{ color: '#059669' }}>+${tx.roundUp.toFixed(2)}</p>
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
