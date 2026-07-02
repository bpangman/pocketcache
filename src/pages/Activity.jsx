import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { TRANSACTIONS, MONTHLY_DATA } from '../data/transactions';
import { momChange } from '../data/derived';
import CustomTooltip from '../components/CustomTooltip';
import OrgLogo from '../components/OrgLogo';

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
  const { totalDonated, pendingRoundUps, roundUpMultiplier, selectedNonprofit } = useApp();
  const brand = useTheme();
  const grouped = groupByDate(TRANSACTIONS);
  // Raw sum of round-ups before any multiplier
  const rawRoundUps = parseFloat(TRANSACTIONS.reduce((s, t) => s + t.roundUp, 0).toFixed(2));

  // Current month label derived from MONTHLY_DATA — never hardcoded
  const currentEntry = MONTHLY_DATA[MONTHLY_DATA.length - 1];
  const currentMonthLabel = `${currentEntry.month} ${currentEntry.year}`;

  // MoM display (real computed value from derived.js)
  const momDisplay = momChange === null
    ? null
    : `${momChange >= 0 ? '↑' : '↓'} ${Math.abs(momChange).toFixed(0)}% vs last month`;

  if (!selectedNonprofit) return null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Activity</h1>
            <p className="text-white/70 text-sm mt-0.5">Your giving history</p>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 space-y-4 pt-4">
        {/* Monthly Charges info banner — dynamic nonprofit name + tax receipt line */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 text-white"
          style={{ background: brand.gradient }}
        >
          <p className="font-bold text-sm mb-1">Monthly Charges</p>
          <p className="text-white/80 text-xs leading-relaxed">
            Once a month, your round-ups roll up into one charge on {selectedNonprofit.shortName}&apos;s Stripe.
            The $1/month fee is pre-selected — opt out anytime in Settings. Months under ${selectedNonprofit.monthlyMinimum ?? 10} carry forward; we settle every 3 months at most.{' '}
            {selectedNonprofit.shortName} sends your tax receipt. (The $1 fee isn&apos;t tax-deductible, but your round-ups are.)
          </p>
        </motion.div>

        {/* Summary card */}
        <div className="bg-white rounded-3xl p-5 card-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">This Month</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">${pendingRoundUps.toFixed(2)}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <OrgLogo nonprofit={selectedNonprofit} size={4} rounded="md" />
                <span className="text-xs font-semibold text-gray-600 truncate">{selectedNonprofit.name}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">All Time</p>
              <p className="text-xl font-bold text-gray-900 mt-1">${totalDonated.toFixed(2)}</p>
              {momDisplay && (
                <p style={{ color: momChange >= 0 ? '#059669' : '#dc2626' }}
                  className="text-xs font-semibold mt-1">
                  {momDisplay}
                </p>
              )}
            </div>
          </div>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MONTHLY_DATA}>
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
        </div>

        {/* Month summary pill — current month name from data, not hardcoded.
            When multiplier > 1 both the raw and boosted amounts are shown clearly. */}
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: brand.accentLight }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🗓️</span>
            <div>
              <p className="text-gray-900 font-semibold text-sm">{currentMonthLabel}</p>
              <p className="text-gray-400 text-xs">
                {TRANSACTIONS.length} transactions · ${rawRoundUps.toFixed(2)} rounded up
                {roundUpMultiplier > 1 && ` × ${roundUpMultiplier} boost`}
              </p>
            </div>
          </div>
          {roundUpMultiplier > 1 ? (
            <div className="text-right">
              <div className="font-bold text-base" style={{ color: '#059669' }}>
                ${pendingRoundUps.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400">
                ${rawRoundUps.toFixed(2)} × {roundUpMultiplier}
              </div>
            </div>
          ) : (
            <div className="font-bold text-base" style={{ color: '#059669' }}>
              ${pendingRoundUps.toFixed(2)}
            </div>
          )}
        </div>

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
                    {tx.icon}
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
