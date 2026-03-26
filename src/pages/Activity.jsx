import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { CheckCircle, Clock } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { TRANSACTIONS, MONTHLY_DATA } from '../data/transactions';
import CustomTooltip from '../components/CustomTooltip';
import CoinAccent from '../components/CoinAccent';

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

const TABS = ['Transactions', 'Payouts'];

export default function Activity() {
  const { totalDonated, pendingRoundUps, selectedNonprofit } = useApp();
  const brand = useTheme();
  const [activeTab, setActiveTab] = useState('Transactions');
  const grouped = groupByDate(TRANSACTIONS);
  const totalRoundUps = TRANSACTIONS.reduce((s, t) => s + t.roundUp, 0);

  if (!selectedNonprofit) return null;

  // Quarterly payouts use the currently selected nonprofit's name and logo
  const QUARTERLY_PAYOUTS = [
    { quarter: 'Q4 2025', date: 'Jan 1, 2026', amount: 38.41, nonprofit: selectedNonprofit.name, status: 'sent', emoji: selectedNonprofit.logo },
    { quarter: 'Q3 2025', date: 'Oct 1, 2025', amount: 29.17, nonprofit: selectedNonprofit.name, status: 'sent', emoji: selectedNonprofit.logo },
    { quarter: 'Q1 2026', date: 'Apr 1, 2026', amount: pendingRoundUps, nonprofit: selectedNonprofit.name, status: 'pending', emoji: selectedNonprofit.logo },
  ];

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
          <CoinAccent size={36} opacity={0.25} />
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-4 bg-white/15 rounded-2xl p-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
              style={activeTab === t
                ? { background: '#fff', color: brand.primary }
                : { color: 'rgba(255,255,255,0.7)' }}
            >
              {t}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 space-y-4 pt-4">
        <AnimatePresence mode="wait">
          {activeTab === 'Transactions' ? (
            <motion.div key="txs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* Summary card */}
              <div className="bg-white rounded-3xl p-5 card-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">This Month</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">${pendingRoundUps.toFixed(2)}</p>
                    <p className="text-xs font-semibold mt-1" style={{ color: brand.primary }}>
                      → {selectedNonprofit.name}
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
              </div>

              {/* Month summary pill */}
              <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
                style={{ background: brand.accentLight }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🗓️</span>
                  <div>
                    <p className="text-gray-900 font-semibold text-sm">March 2026</p>
                    <p className="text-gray-400 text-xs">{TRANSACTIONS.length} transactions · ${totalRoundUps.toFixed(2)} rounded up</p>
                  </div>
                </div>
                <div className="font-bold text-base" style={{ color: brand.primary }}>${pendingRoundUps.toFixed(2)}</div>
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
            </motion.div>
          ) : (
            <motion.div key="payouts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* Payout explainer */}
              <div className="rounded-3xl p-5 text-white" style={{ background: brand.gradient }}>
                <p className="font-bold text-base mb-1">How Payouts Work</p>
                <p className="text-white/80 text-sm leading-relaxed">
                  Your round-ups accumulate each quarter and are sent directly to your chosen cause on the first of every quarter — Jan 1, Apr 1, Jul 1, Oct 1.
                </p>
              </div>

              {/* Upcoming payout */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 px-1">Upcoming</p>
                <div className="bg-white rounded-3xl p-4 card-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                      style={{ background: brand.accentLight }}>
                      <Clock size={22} style={{ color: brand.primary }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm">Q1 2026 Payout</p>
                      <p className="text-gray-400 text-xs">{selectedNonprofit.name}</p>
                      <p className="text-xs font-semibold mt-0.5" style={{ color: brand.primary }}>
                        Sends April 1, 2026 · 10 days away
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-xl text-gray-900">${pendingRoundUps.toFixed(2)}</p>
                      <p className="text-gray-400 text-xs">accumulated</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Past payouts */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 px-1">Past Payouts</p>
                <div className="bg-white rounded-3xl overflow-hidden card-shadow">
                  {QUARTERLY_PAYOUTS.filter(p => p.status === 'sent').map((payout, i, arr) => (
                    <div key={payout.quarter}
                      className={`flex items-center gap-3 px-4 py-4 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center text-xl shrink-0">
                        {payout.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 text-sm font-semibold">{payout.quarter}</p>
                        <p className="text-gray-400 text-xs truncate">{payout.nonprofit}</p>
                        <p className="text-gray-300 text-xs">Sent {payout.date}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">${payout.amount.toFixed(2)}</p>
                        <div className="flex items-center gap-1 justify-end mt-0.5">
                          <CheckCircle size={12} className="text-emerald-500" />
                          <p className="text-emerald-500 text-xs font-semibold">Sent</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total lifetime */}
              <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
                style={{ background: brand.accentLight }}>
                <p className="font-semibold text-sm text-gray-700">Total paid to nonprofits</p>
                <p className="font-bold text-lg" style={{ color: brand.primary }}>
                  ${QUARTERLY_PAYOUTS.filter(p=>p.status==='sent').reduce((s,p)=>s+p.amount,0).toFixed(2)}
                </p>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
