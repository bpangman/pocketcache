// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { ExternalLink, RefreshCw, AlertTriangle, Receipt } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { CHARGE_HISTORY } from '../demoData';
import { fmtMoney } from '../../../lib/format';
import { CHARGE_DAY, nextChargeLabel } from '../../../lib/billing';
import DemoPill from '../DemoPill';
import { NpPage, NpBlock, useNpLayout } from '../NpLayout';
import { useNpDemoData } from '../useNpAdminActions';

function Row({ label, value, tone }) {
  const color = tone === 'plus' ? 'var(--green)' : tone === 'minus' ? 'var(--slate)' : tone === 'muted' ? 'var(--muted)' : 'var(--ink-2)';
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-slate text-xs">{label}</span>
      <span className="font-semibold text-xs" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function Charges() {
  const { npOrg } = useNp();
  const { web } = useNpLayout();
  const showDemo = useNpDemoData();
  const accent = npOrg.color || '#0D9488';

  // Seeded runs only in demo mode / the read-only preview. A real org has no
  // charge history until the server provides one.
  const runs = showDemo ? CHARGE_HISTORY : [];

  return (
    <NpPage gap={4} cols={3}>
      <NpBlock span="full">
        {/* Eyebrow only on the phone  -  the desktop shell prints a real <h1>. */}
        <div className="flex items-center justify-between" style={web ? { justifyContent: 'flex-end' } : undefined}>
          {!web && <p className="text-[11px] font-semibold text-slate uppercase" style={{ letterSpacing: '0.06em' }}>Charge Runs</p>}
          <DemoPill />
        </div>
      </NpBlock>

      {/* Demo-data honesty banner. Every figure below is fabricated seed data;
          a tiny "Demo data" pill above is easy to miss on a page that is
          entirely numbers, so this page gets a real banner too. It is the one
          tinted callout this screen keeps, and it only exists while the sample
          runs do. */}
      {showDemo && (
        <NpBlock span="full">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-card p-4 flex items-start gap-3"
            style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A' }}
          >
            <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} aria-hidden />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--warning)' }}>These are sample figures, not real charges</p>
              <p className="text-ink-2 text-[13px] mt-0.5 leading-relaxed">
                Every run below (amounts, donor counts, fee breakdowns) is simulated demo data. Nothing here has actually moved through Stripe yet - this page will show your real charge history once your program is live and donors are being charged for real.
              </p>
            </div>
          </motion.div>
        </NpBlock>
      )}

      {/* Honest framing. Neutral helper text in a white card, not a second
          tinted box. */}
      <NpBlock span="full">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-card card-shadow flex flex-col gap-1"
          style={{ padding: web ? 24 : 16 }}
        >
          <p className="text-ink text-sm font-semibold">
            Every donation lands in your Stripe. PocketCache never touches it.
          </p>
          <p className="text-slate text-[13px] leading-relaxed">
            Donors cover the flat $1 app fee  -  you pay $0 for app costs, ever. Most also cover your card-processing costs (pre-selected). When they do, that amount goes directly to you  -  PocketCache never keeps it. Never a percentage of donations.
          </p>
          {/* Charge day + next run come from lib/billing, so this matches the
              date donors are shown to the day. */}
          <p className="text-slate text-[13px] leading-relaxed">
            Runs monthly on the {CHARGE_DAY}th  -  next run {nextChargeLabel()}.
          </p>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold mt-1"
            style={{ color: accent, minHeight: 44 }}
          >
            View in Stripe <ExternalLink size={13} aria-hidden />
          </a>
        </motion.div>
      </NpBlock>

      {/* Charge run history */}
      {runs.map((run, idx) => (
        <NpBlock key={run.label}>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="bg-white rounded-card p-4 space-y-3 card-shadow"
          >
            {/* Period header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-ink text-sm">{run.label}</p>
                <p className="text-slate text-xs">{run.donorsCharged} donors charged</p>
              </div>
              <p className="font-bold text-xl" style={{ color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                ${fmtMoney(run.gross)}
              </p>
            </div>

            {/* Fee breakdown. Stripe takes its fee on every charge; the amount
                donors cover only offsets it, so both lines show and the net is
                gross + covered - fees (= gross - absorbed). */}
            <div className="space-y-1.5 text-sm">
              <Row label="Gross round-ups from donors" value={`$${fmtMoney(run.gross)}`} />
              <Row label="Card processing covered by donors" value={`+$${fmtMoney(run.processingCovered)}`} tone="plus" />
              <Row label="Stripe processing fees" value={`-$${fmtMoney(run.stripeFees)}`} tone="minus" />
              <Row label="App fees (donor-paid, to PocketCache)" value={`$${fmtMoney(run.appFees)}`} tone="muted" />
              <div className="h-px bg-line" />
              <div className="flex justify-between items-center">
                <span className="text-ink text-xs font-semibold">Net to your Stripe</span>
                <span className="font-bold text-xs" style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}>
                  ${fmtMoney(run.netToStripe)}
                </span>
              </div>
            </div>

            {/* Failures */}
            {run.failures > 0 && (
              <div
                className="flex items-center gap-2 rounded-input p-2.5 text-xs"
                style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A' }}
              >
                <RefreshCw size={13} className="shrink-0 animate-spin" style={{ color: 'var(--warning)', animationDuration: '3s' }} aria-hidden />
                <p className="font-semibold" style={{ color: 'var(--warning)' }}>
                  {run.failures} payment{run.failures > 1 ? 's' : ''} failed  -  Stripe retrying
                </p>
              </div>
            )}
          </motion.div>
        </NpBlock>
      ))}

      {runs.length === 0 ? (
        <NpBlock span="full">
          <div className="bg-white rounded-card card-shadow text-center px-5 py-10" style={web ? { maxWidth: 460 } : undefined}>
            <div className="w-9 h-9 rounded-input flex items-center justify-center mx-auto mb-3" style={{ background: `${accent}14` }}>
              <Receipt size={18} style={{ color: accent }} aria-hidden />
            </div>
            <p className="text-ink text-sm font-semibold">No charge runs yet</p>
            <p className="text-slate text-[13px] mt-1 leading-relaxed">
              Your first run shows here after donors are charged on the {CHARGE_DAY}th.
            </p>
          </div>
        </NpBlock>
      ) : (
        <NpBlock span="full">
          <p className="text-center text-slate text-xs pb-2">
            Showing last {runs.length} completed charge runs
          </p>
        </NpBlock>
      )}
    </NpPage>
  );
}
