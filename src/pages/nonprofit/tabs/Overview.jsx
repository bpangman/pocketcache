import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { AlertTriangle, CalendarDays, CheckCircle, Copy, Check, Hourglass, TrendingUp, Users } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { useApp } from '../../../store/AppContext';
import { fmtMoney } from '../../../lib/format';
import { nextChargeLabel } from '../../../lib/billing';
import { findOrgByCode, getAppleApproval, setOrgAppleApproval } from '../../../store/orgStore';
import { orgSignup } from '../../../lib/npApi';
import { APPLE_TEAM_ID, BENEVITY_PORTAL_URL } from '../../../lib/npSignup';
import {
  ACTIVE_COUNT, MTD_TOTAL,
  LAST_MONTH_GROSS, AVG_PER_DONOR, FAILED_COUNT, GROWTH_CHART,
} from '../demoData';
import DemoPill from '../DemoPill';
import Button from '../../../components/ui/Button';
import { NpPage, NpBlock, useNpLayout } from '../NpLayout';
import { useNpDemoData, serverOrgIdFor } from '../useNpAdminActions';
import gmLogoUrl from '../../../assets/gm-logo.svg';
import { copyText } from '../../../lib/clipboard';

// Six empty months so the chart keeps its axis (and its height) while a real
// org has no donors yet - a blank card would read as a loading failure.
const EMPTY_CHART = GROWTH_CHART.map(d => ({ month: d.month, donors: 0 }));

/** The note under a control that is locked during the read-only demo preview. */
export const PREVIEW_NOTE = 'Demo preview - read only. Sign in as your organization to make changes.';

function TeamIdCopyButton() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function handleCopy() {
    const ok = await copyText(APPLE_TEAM_ID);
    if (ok) {
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setFailed(true);
      setTimeout(() => setFailed(false), 2500);
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 rounded-input transition-colors shrink-0"
      style={{ minHeight: 36, background: copied ? 'var(--green-50)' : failed ? 'var(--danger-50)' : 'var(--surface)', color: copied ? 'var(--green-700)' : failed ? 'var(--danger)' : 'var(--ink-2)' }}
      title={failed ? 'Copy failed  -  select and copy manually' : undefined}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : failed ? 'Try again' : 'Copy'}
    </button>
  );
}

/**
 * "iPhone app listing" status card. Apple requires every nonprofit inside
 * the iPhone app to be verified (Candid Seal, or a free Benevity Causes
 * Portal registration) - the org's webpage and website widget are NEVER
 * gated by this, which is why every state below says so.
 */
function AppleListingCard() {
  const { npOrg, previewAdmin } = useNp();
  const { showToast } = useApp();
  const { web } = useNpLayout();
  const orgRecord = findOrgByCode(npOrg.joinCode);
  const [approval, setApproval] = useState(() => getAppleApproval(orgRecord));
  const [saving, setSaving] = useState(false);

  async function markRegistered() {
    if (previewAdmin || saving) return;
    // Self-reported: this only ever records "submitted to Benevity". An
    // approved status is the platform owner's call (org-approve), never a
    // button on the admin's own dashboard.
    const next = { status: 'benevity_submitted', method: 'benevity' };
    const serverId = serverOrgIdFor(npOrg);
    if (serverId) {
      // A real org: the server row is what donors (and this admin on another
      // device) read, so the status has to land there, not just in this
      // browser. org-signup patches apple_approval for the signed-in admin.
      setSaving(true);
      const res = await orgSignup({ appleApproval: next, benevitySubmitted: true });
      setSaving(false);
      if (!res.ok) {
        showToast?.(res.status === 401
          ? 'Your admin session has expired. Sign in again to save this.'
          : "Couldn't save that right now. Please try again.");
        return;
      }
    }
    setOrgAppleApproval(orgRecord?.id ?? npOrg._orgId ?? 'bgca', next);
    setApproval(next);
    showToast?.('Marked as registered with Benevity.');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-card card-shadow"
      style={{ padding: web ? 24 : 16 }}
    >
      <p className="text-[11px] font-semibold text-slate uppercase mb-2" style={{ letterSpacing: '0.06em' }}>iPhone app listing</p>
      {approval.status === 'approved' ? (
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="shrink-0" style={{ color: 'var(--green)' }} />
          <p className="text-ink-2 text-sm">
            {approval.method === 'candid_seal'
              ? 'Verified through your Candid Seal of Transparency  -  nothing to do.'
              : 'Approved and listed in the app.'}
          </p>
        </div>
      ) : approval.status === 'benevity_submitted' ? (
        <>
          <div className="flex items-center gap-2 mb-1">
            <Hourglass size={16} className="shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
            <p className="text-ink text-sm font-semibold">In review with Benevity</p>
          </div>
          <p className="text-slate text-[13px]">We&apos;ll list you in the iPhone app as soon as that approval comes through.</p>
        </>
      ) : (
        <>
          <p className="text-ink-2 text-[13px] leading-relaxed mb-3">
            Apple asks every nonprofit to be verified once before it can appear inside the iPhone app.
            Register free at the Benevity Causes Portal using your organization&apos;s details and the ID below.
          </p>
          <div className="flex items-center gap-2 rounded-input px-3 py-2 mb-3" style={{ background: 'var(--surface)' }}>
            <code className="text-xs text-ink-2 font-mono flex-1 truncate">{APPLE_TEAM_ID}</code>
            <TeamIdCopyButton />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="md"
              surface={web ? 'web' : 'app'}
              fullWidth={false}
              onClick={() => window.open(BENEVITY_PORTAL_URL, '_blank', 'noopener')}
              style={{ fontSize: 14 }}
            >
              Open the Benevity portal
            </Button>
            <Button
              size="md"
              surface={web ? 'web' : 'app'}
              fullWidth={false}
              disabled={previewAdmin}
              loading={saving}
              onDisabledPress={() => showToast?.(PREVIEW_NOTE)}
              onClick={markRegistered}
              style={{ fontSize: 14 }}
            >
              {saving ? 'Saving…' : 'I have registered'}
            </Button>
          </div>
          {previewAdmin && <p className="text-slate text-[13px] mt-2">{PREVIEW_NOTE}</p>}
        </>
      )}
      <p className="text-slate text-[13px] mt-3">Your webpage and widget are already live either way  -  Apple only decides the app listing.</p>
    </motion.div>
  );
}

function StatCard({ iconComponent, label, value, sub, accent, money = false }) {
  const TheIcon = iconComponent;
  return (
    <div className="bg-white rounded-card p-4 flex-1 card-shadow min-w-0">
      <div className="w-9 h-9 rounded-input flex items-center justify-center mb-3" style={{ background: `${accent}14` }}>
        <TheIcon size={18} style={{ color: accent }} />
      </div>
      <div className="text-xl font-bold text-ink leading-none truncate" style={{ fontVariantNumeric: 'tabular-nums', color: money ? 'var(--green)' : undefined }}>{value}</div>
      <div className="text-xs text-slate mt-1 font-medium">{label}</div>
      {sub && <div className="text-xs mt-1 font-semibold text-slate">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const { npOrg } = useNp();
  const { web } = useNpLayout();
  const showDemo = useNpDemoData();
  const accent = npOrg.color || '#0D9488';
  const padding = web ? 24 : 16;

  // Honest figures: the seeded demo numbers only while demo mode (or the
  // read-only preview) is on; zero and empty states for every real org,
  // including BGCA, until server-backed stats are wired in.
  const activeCount = showDemo ? ACTIVE_COUNT : 0;
  const mtdTotal = showDemo ? MTD_TOTAL : 0;
  const lastMonthGross = showDemo ? LAST_MONTH_GROSS : 0;
  const failedCount = showDemo ? FAILED_COUNT : 0;
  const chartData = showDemo ? GROWTH_CHART : EMPTY_CHART;

  return (
    <NpPage gap={4} cols={2}>
      <NpBlock span="full">
        {/* The eyebrow orients the phone screen, which has no page title. The
            desktop shell prints a real <h1>, so it would just be a duplicate. */}
        <div className="flex items-center justify-between" style={web ? { justifyContent: 'flex-end' } : undefined}>
          {!web && <p className="text-[11px] font-semibold text-slate uppercase" style={{ letterSpacing: '0.06em' }}>Live snapshot</p>}
          <DemoPill />
        </div>
      </NpBlock>

      {/* iPhone app listing status - near the top so it's never missed */}
      <NpBlock span="full">
        <AppleListingCard />
      </NpBlock>

      {/* Fee model framing. A neutral explanation, so it is helper text in a
          white card rather than one more tinted callout above the fold. */}
      <NpBlock>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-card card-shadow flex flex-col gap-1"
          style={{ padding }}
        >
          <p className="text-ink text-sm font-semibold">Always free for you  -  donors cover everything</p>
          <p className="text-slate text-[13px] leading-relaxed">
            Donors cover the flat $1 app fee, and most also cover your card-processing costs (pre-selected at signup)  -  so PocketCache costs you $0, ever. We never take a percentage of donations.
          </p>
        </motion.div>
      </NpBlock>

      {/* Hero stat: active donors + MTD */}
      <NpBlock>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-panel p-5 text-white overflow-hidden relative pc-on-dark"
          style={{ background: `linear-gradient(135deg, ${accent} 0%, #001a33 100%)` }}
        >
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-start gap-6">
              <div>
                <p className="text-white/70 text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.06em' }}>Active Donors</p>
                <p className="text-5xl font-bold text-white mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>{activeCount}</p>
              </div>
              <div className="border-l border-white/25 pl-6">
                <p className="text-white/70 text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.06em' }}>This Month</p>
                <p className="text-5xl font-bold mt-1 text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(mtdTotal)}</p>
                <p className="text-white/70 text-xs mt-1">{showDemo ? 'accruing' : 'nothing accrued yet'}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </NpBlock>

      {/* Stat cards row */}
      <NpBlock span="full">
        <div className="flex gap-3">
          {/* Charge day comes from lib/billing so admins and donors are told the
              same date  -  round-ups lock on the 1st, money moves on the 11th. */}
          <StatCard iconComponent={CalendarDays} label="Next charge" value={nextChargeLabel()} accent={accent} />
          {/* Gross, not net: Charges itemizes the Stripe fee; this is the
              headline that matches each run's collected total there. */}
          <StatCard iconComponent={TrendingUp}   label="Last month"  value={`$${fmtMoney(lastMonthGross)}`} sub="collected (gross)" accent={accent} money={showDemo} />
          <StatCard iconComponent={Users}        label="Avg / donor" value={showDemo ? `$${fmtMoney(AVG_PER_DONOR)}` : '-'} accent={accent} money={showDemo} />
        </div>
      </NpBlock>

      {/* Failed charges alert - the one tinted callout this screen keeps,
          because a failed payment is status that matters. */}
      {failedCount > 0 && (
        <NpBlock span="full">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-card p-4 flex items-start gap-3"
            style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A' }}
          >
            <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} aria-hidden />
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--warning)' }}>
                {failedCount} donor{failedCount > 1 ? "s'" : "'s"} payment failed  -  retrying automatically
              </p>
              <p className="text-[13px] mt-0.5 text-ink-2">
                Stripe will retry these charges. No action needed unless retries exhaust.
              </p>
            </div>
          </motion.div>
        </NpBlock>
      )}

      {/* Donor growth chart */}
      <NpBlock>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-card card-shadow"
          style={{ padding }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink text-sm">Donor Growth</h3>
            <span className="text-xs text-slate">{showDemo ? 'Last 6 months' : 'No donors yet'}</span>
          </div>
          {/* Taller on desktop: the card is ~2x as wide there, and a 112px plot
              in a 600px card reads as a sparkline rather than a chart.
              initialDimension gives Recharts a real first size instead of its
              -1 x -1 default, which logged a width(-1) warning on every mount. */}
          <div style={{ height: web ? 220 : 112 }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: web ? 220 : 112 }}>
              <BarChart data={chartData} barSize={web ? 34 : 20}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#5B6B80', fontSize: 11 }} />
                <Tooltip
                  formatter={v => [`${v} donors`, 'Active']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E6EBF2', boxShadow: 'var(--shadow-2)' }}
                  cursor={{ fill: 'rgba(11,42,74,0.04)' }}
                />
                <Bar dataKey="donors" radius={[6, 6, 0, 0]} fill={accent} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </NpBlock>

      {/* Corporate match card  -  GM example. Sample content, so demo only;
          a white card with a thin gold bar rather than another amber box. */}
      {showDemo && (
        <NpBlock>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white rounded-card card-shadow"
            style={{ padding }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-1)' }}>
                <img src={gmLogoUrl} alt="GM" style={{ height: 26, objectFit: 'contain' }} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink text-sm">Example: GM Corporate Match</p>
                <p className="text-slate text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>$23,400 of $50,000 matched this month</p>
              </div>
            </div>
            <div className="h-1.5 rounded-pill overflow-hidden mb-2" style={{ background: 'var(--gold-50)' }}>
              <div className="h-full rounded-pill" style={{ width: '47%', background: 'var(--gold)' }} />
            </div>
            <p className="text-slate text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>47% used · $26,600 remaining · Resets next month</p>
            <p className="text-slate text-[13px] mt-2">
              This is an example partnership. Have a corporate partner who&apos;d match donations? Add your own match campaign here.
            </p>
            <p className="text-slate text-[13px] mt-2">
              Match campaigns: sponsors pay PocketCache a flat tooling fee  -  never a percentage. Match dollars go straight from the sponsor to you.
            </p>
          </motion.div>
        </NpBlock>
      )}
    </NpPage>
  );
}
