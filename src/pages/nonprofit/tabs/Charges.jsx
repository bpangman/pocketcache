// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { ExternalLink, CheckCircle, RefreshCw } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { CHARGE_HISTORY } from '../demoData';
import { fmtMoney } from '../../../lib/format';

function DemoPill() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      Demo data
    </span>
  );
}

export default function Charges() {
  const { npOrg } = useNp();
  const accent = npOrg.color || '#0D9488';

  return (
    <div className="flex-1 scrollable pc-scrollbar px-4 pb-28 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Charge Runs</p>
        <DemoPill />
      </div>

      {/* Honest framing banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 flex flex-col gap-2"
        style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <p className="text-green-800 text-sm font-bold">
            Every donation lands in your Stripe. PocketCache never touches it.
          </p>
        </div>
        <p className="text-green-700 text-xs pl-6 leading-relaxed">
          Donors cover the flat $1 app fee  -  you pay $0 for app costs, ever. Most also cover your card-processing costs (pre-selected). When they do, that amount goes directly to you  -  PocketCache never keeps it. Never a percentage of donations.
        </p>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold pl-6"
          style={{ color: accent }}
        >
          View in Stripe <ExternalLink size={13} />
        </a>
      </motion.div>

      {/* Charge run history */}
      {CHARGE_HISTORY.map((run, idx) => (
        <motion.div
          key={run.label}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.04 }}
          className="bg-white rounded-2xl p-4 space-y-3 card-shadow"
        >
          {/* Period header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-gray-900 text-sm">{run.label}</p>
              <p className="text-gray-400 text-xs">{run.donorsCharged} donors charged</p>
            </div>
            <p className="font-bold text-xl" style={{ color: '#059669' }}>
              ${fmtMoney(run.gross)}
            </p>
          </div>

          {/* Fee breakdown */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-xs">Gross round-ups from donors</span>
              <span className="font-semibold text-xs text-gray-700">${fmtMoney(run.gross)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-xs">Processing covered by donors (to you)</span>
              <span className="font-semibold text-xs text-green-600">+${fmtMoney(run.processingCovered)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-xs">Card costs absorbed (opt-out donors)</span>
              <span className="font-semibold text-xs text-gray-500">−${fmtMoney(run.processingAbsorbed)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-xs">App fees (donor-paid, to PocketCache)</span>
              <span className="font-semibold text-xs text-gray-400">${fmtMoney(run.appFees)}</span>
            </div>
            <div className="h-px bg-gray-100" />
            <div className="flex justify-between items-center">
              <span className="text-gray-700 text-xs font-semibold">Net to your Stripe</span>
              <span className="font-bold text-xs" style={{ color: accent }}>
                ${fmtMoney(run.netToStripe)}
              </span>
            </div>
          </div>

          {/* Failures */}
          {run.failures > 0 && (
            <div
              className="flex items-center gap-2 rounded-xl p-2.5 text-xs"
              style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}
            >
              <RefreshCw size={13} className="text-orange-500 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
              <p className="text-orange-700 font-semibold">
                {run.failures} payment{run.failures > 1 ? 's' : ''} failed  -  Stripe retrying
              </p>
            </div>
          )}
        </motion.div>
      ))}

      <p className="text-center text-gray-400 text-xs pb-2">
        Showing last {CHARGE_HISTORY.length} completed charge runs
      </p>
    </div>
  );
}
