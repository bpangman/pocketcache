import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { AlertCircle, CalendarDays, TrendingUp, Users } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { fmtMoney } from '../../../lib/format';
import {
  ACTIVE_COUNT, MTD_TOTAL, NEXT_CHARGE_DATE,
  LAST_MONTH_GROSS, AVG_PER_DONOR, FAILED_COUNT, GROWTH_CHART,
} from '../demoData';
import gmLogoUrl from '../../../assets/gm-logo.svg';

function DemoPill() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      Demo data
    </span>
  );
}

function StatCard({ iconComponent, label, value, sub, accent }) {
  const TheIcon = iconComponent;
  return (
    <div className="bg-white rounded-2xl p-4 flex-1 card-shadow">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${accent}18` }}>
        <TheIcon size={18} style={{ color: accent }} />
      </div>
      <div className="text-xl font-bold text-gray-900 leading-none">{value}</div>
      <div className="text-xs text-gray-400 mt-1 font-medium">{label}</div>
      {sub && <div className="text-xs mt-1 font-semibold text-gray-500">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const { npOrg } = useNp();
  const accent = npOrg.color || '#0D9488';

  return (
    <div className="flex-1 scrollable px-4 pb-28 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live snapshot</p>
        <DemoPill />
      </div>

      {/* Fee model framing */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 flex flex-col gap-1.5"
        style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}
      >
        <p className="text-green-800 text-sm font-bold">Always free for you — donors cover everything</p>
        <p className="text-green-700 text-xs leading-relaxed">
          Donors cover the flat $1 app fee, and most also cover your card-processing costs (pre-selected at signup) — so PocketCache costs you $0, ever. We never take a percentage of donations.
        </p>
      </motion.div>

      {/* Hero stat: active donors + MTD */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-3xl p-5 text-white overflow-hidden relative"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, #001a33 100%)` }}
      >
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-start gap-6">
            <div>
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Active Donors</p>
              <p className="text-5xl font-bold text-white mt-1">{ACTIVE_COUNT}</p>
            </div>
            <div className="border-l border-white/25 pl-6">
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">This Month</p>
              <p className="text-5xl font-bold mt-1" style={{ color: '#86efac' }}>${fmtMoney(MTD_TOTAL)}</p>
              <p className="text-white/50 text-xs mt-1">accruing</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stat cards row */}
      <div className="flex gap-3">
        <StatCard iconComponent={CalendarDays} label="Next charge" value={NEXT_CHARGE_DATE} accent={accent} />
        <StatCard iconComponent={TrendingUp}   label="Last month"  value={`$${fmtMoney(LAST_MONTH_GROSS)}`} sub="collected" accent={accent} />
        <StatCard iconComponent={Users}        label="Avg / donor" value={`$${fmtMoney(AVG_PER_DONOR)}`}    accent={accent} />
      </div>

      {/* Failed charges alert */}
      {FAILED_COUNT > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: '#fff7ed', border: '1.5px solid #fed7aa' }}
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5" style={{ color: '#ea580c' }} />
          <div>
            <p className="font-bold text-orange-800 text-sm">
              {FAILED_COUNT} donor{FAILED_COUNT > 1 ? "s'" : "'s"} payment failed — retrying automatically
            </p>
            <p className="text-orange-600 text-xs mt-0.5">
              Stripe will retry these charges. No action needed unless retries exhaust.
            </p>
          </div>
        </motion.div>
      )}

      {/* Donor growth chart */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl p-5 card-shadow"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm">Donor Growth</h3>
          <span className="text-xs text-gray-400">Last 6 months</span>
        </div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={GROWTH_CHART} barSize={20}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                formatter={v => [`${v} donors`, 'Active']}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)' }}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              />
              <Bar dataKey="donors" radius={[6, 6, 0, 0]} fill={accent} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Corporate match card — GM example */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl p-4"
        style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 border border-gray-100">
            <img src={gmLogoUrl} alt="GM" style={{ height: 26, objectFit: 'contain' }} />
          </div>
          <div>
            <p className="font-bold text-amber-900 text-sm">
              Example: GM Corporate Match
            </p>
            <p className="text-amber-700 text-xs">$23,400 of $50,000 matched this month</p>
          </div>
        </div>
        <div className="h-2 bg-amber-100 rounded-full overflow-hidden mb-1.5">
          <div className="h-full bg-amber-400 rounded-full" style={{ width: '47%' }} />
        </div>
        <p className="text-amber-600 text-xs">47% used · $26,600 remaining · Resets next month</p>
        <p className="text-amber-600 text-xs mt-1 italic">
          This is an example partnership. Have a corporate partner who&apos;d match donations? Add your own match campaign here.
        </p>
      </motion.div>
    </div>
  );
}
