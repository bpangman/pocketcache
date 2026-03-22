import { motion } from 'framer-motion';
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { ArrowUpRight, Zap, Heart, TrendingUp } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { TRANSACTIONS, MONTHLY_DATA } from '../data/transactions';

function StatCard({ icon, label, value, sub, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="bg-white rounded-3xl p-4 flex-1 card-shadow"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: color + '18' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
      <div className="text-xs text-gray-400 mt-1.5 font-medium">{label}</div>
      {sub && <div className="text-xs mt-1 font-semibold" style={{ color }}>{sub}</div>}
    </motion.div>
  );
}

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

export default function Dashboard() {
  const { selectedNonprofit, totalDonated, pendingRoundUps, setTab } = useApp();
  const brand = useTheme();

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-sm font-medium">Good morning, Alex 👋</p>
            <h1 className="text-white text-2xl font-bold mt-1" style={{ letterSpacing: '-0.3px' }}>
              {brand.appName}
            </h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold shadow-md border border-white/30">
            A
          </div>
        </div>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 space-y-4 pt-4">

        {/* Hero donation card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="rounded-3xl p-6 text-white overflow-hidden relative"
          style={{ background: brand.gradient }}
        >
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-black/10 translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <p className="text-white/70 text-sm font-medium uppercase tracking-widest">Total Donated</p>
            <div className="mt-1">
              <span className="text-5xl font-bold">${totalDonated.toFixed(2)}</span>
            </div>
            <p className="text-white/60 text-sm mt-2">Since Jan 2026 · All time</p>

            <div className="mt-5 pt-4 border-t border-white/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
                  {selectedNonprofit.logo}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{selectedNonprofit.name.split(' ').slice(0, 3).join(' ')}</p>
                  <p className="text-white/60 text-xs">Your chosen cause</p>
                </div>
              </div>
              <button
                onClick={() => setTab('nonprofits')}
                className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1"
              >
                Change <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stats row */}
        <div className="flex gap-3">
          <StatCard icon={<Zap size={18} />} label="Pending" value={`$${pendingRoundUps}`} sub="This month" color={brand.primary} delay={0.1} />
          <StatCard icon={<TrendingUp size={18} />} label="Avg/mo" value="$10.10" sub="+12% vs last" color="#10b981" delay={0.15} />
          <StatCard icon={<Heart size={18} />} label="Round-ups" value="247" sub="All time" color={brand.secondary} delay={0.2} />
        </div>

        {/* Giving chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-base">Monthly Giving</h3>
            <span className="text-xs text-gray-400 font-medium">Last 6 months</span>
          </div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_DATA} barSize={22}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }} />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Bar dataKey="donated" radius={[8, 8, 0, 0]} fill={brand.primary} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Impact card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-3xl p-5 text-white relative overflow-hidden"
          style={{ background: brand.gradient }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Your Impact</p>
          <p className="text-white font-bold text-base leading-snug relative z-10">
            "{selectedNonprofit.impact}"
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-2xl">{selectedNonprofit.logo}</span>
            <p className="text-white/70 text-xs">{selectedNonprofit.name}</p>
          </div>
        </motion.div>

        {/* Recent transactions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-base">Recent Round-ups</h3>
            <button onClick={() => setTab('activity')} className="text-xs font-semibold" style={{ color: brand.primary }}>
              See all
            </button>
          </div>
          <div className="space-y-3">
            {TRANSACTIONS.slice(0, 4).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center text-xl shrink-0">
                  {tx.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-sm font-semibold truncate">{tx.merchant}</p>
                  <p className="text-gray-400 text-xs">{tx.category}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gray-400 text-xs">${tx.amount.toFixed(2)}</p>
                  <p className="text-sm font-bold" style={{ color: brand.primary }}>+${tx.roundUp.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
