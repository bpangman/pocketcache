import { motion } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { TRANSACTIONS, MONTHLY_DATA } from '../data/transactions';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
        <p className="font-bold">${payload[0].value.toFixed(2)}</p>
        <p className="text-gray-400">{label}</p>
      </div>
    );
  }
  return null;
};

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
  const today = new Date('2026-03-21');
  const yesterday = new Date('2026-03-20');
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Activity() {
  const { totalDonated, pendingRoundUps, selectedNonprofit } = useApp();
  const brand = useTheme();
  const grouped = groupByDate(TRANSACTIONS);
  const totalRoundUps = TRANSACTIONS.reduce((s, t) => s + t.roundUp, 0);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-5"
      >
        <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Activity</h1>
        <p className="text-white/70 text-sm mt-0.5">Your giving history</p>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 space-y-4 pt-4">

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">This Month</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">${pendingRoundUps.toFixed(2)}</p>
              <p className="text-xs font-semibold mt-1" style={{ color: brand.primary }}>
                → {selectedNonprofit.name.split(' ').slice(0,3).join(' ')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">All Time</p>
              <p className="text-xl font-bold text-gray-900 mt-1">${totalDonated.toFixed(2)}</p>
              <p className="text-emerald-500 text-xs font-semibold mt-1">↑ 12% vs last month</p>
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
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="donated" stroke={brand.primary} strokeWidth={2.5}
                  fill="url(#areaGradient)" dot={false} activeDot={{ r: 4, fill: brand.primary, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Month summary */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: brand.accentLight }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🗓️</span>
            <div>
              <p className="text-gray-900 font-semibold text-sm">March 2026</p>
              <p className="text-gray-400 text-xs">{TRANSACTIONS.length} transactions · ${totalRoundUps.toFixed(2)} rounded up</p>
            </div>
          </div>
          <div className="font-bold text-base" style={{ color: brand.primary }}>${pendingRoundUps.toFixed(2)}</div>
        </motion.div>

        {/* Transaction groups */}
        {grouped.map(([date, txs], groupIdx) => (
          <motion.div
            key={date}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + groupIdx * 0.05 }}
          >
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
              {formatDate(date)}
            </p>
            <div className="bg-white rounded-3xl overflow-hidden card-shadow">
              {txs.map((tx, i) => (
                <div key={tx.id} className={`flex items-center gap-3 px-4 py-3.5 ${i < txs.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center text-xl shrink-0">
                    {tx.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-sm font-semibold truncate">{tx.merchant}</p>
                    <p className="text-gray-400 text-xs">{tx.category}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gray-400 text-xs">-${tx.amount.toFixed(2)}</p>
                    <p className="text-sm font-bold" style={{ color: brand.primary }}>+${tx.roundUp.toFixed(2)}</p>
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
