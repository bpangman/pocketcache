import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { AlertCircle, CalendarDays, CheckCircle, Copy, Check, TrendingUp, Users } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { useApp } from '../../../store/AppContext';
import { fmtMoney } from '../../../lib/format';
import { nextChargeLabel } from '../../../lib/billing';
import { findOrgByCode, getAppleApproval, setOrgAppleApproval } from '../../../store/orgStore';
import { APPLE_TEAM_ID, BENEVITY_PORTAL_URL } from '../../../lib/npSignup';
import {
  ACTIVE_COUNT, MTD_TOTAL,
  LAST_MONTH_GROSS, AVG_PER_DONOR, FAILED_COUNT, GROWTH_CHART,
} from '../demoData';
import DemoPill from '../DemoPill';
import { NpPage, NpBlock, useNpLayout } from '../NpLayout';
import gmLogoUrl from '../../../assets/gm-logo.svg';
import { copyText } from '../../../lib/clipboard';

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
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors shrink-0"
      style={{ background: copied ? '#d1fae5' : failed ? '#fee2e2' : '#f3f4f6', color: copied ? '#065f46' : failed ? '#991b1b' : '#374151' }}
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
  const { npOrg } = useNp();
  const { showToast } = useApp();
  const orgRecord = findOrgByCode(npOrg.joinCode);
  const [approval, setApproval] = useState(() => getAppleApproval(orgRecord));

  function markRegistered() {
    const next = { status: 'benevity_submitted', method: 'benevity' };
    setOrgAppleApproval(orgRecord?.id ?? npOrg._orgId ?? 'bgca', next);
    setApproval(next);
    showToast?.('Marked as registered with Benevity.');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-4 card-shadow"
    >
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">iPhone app listing</p>
      {approval.status === 'approved' ? (
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-green-500 shrink-0" />
          <p className="text-gray-700 text-sm">
            {approval.method === 'candid_seal'
              ? 'Verified through your Candid Seal of Transparency  -  nothing to do.'
              : 'Approved and listed in the app.'}
          </p>
        </div>
      ) : approval.status === 'benevity_submitted' ? (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500 shrink-0">⏳</span>
            <p className="text-gray-700 text-sm font-semibold">In review with Benevity</p>
          </div>
          <p className="text-gray-500 text-xs">We&apos;ll list you in the iPhone app as soon as that approval comes through.</p>
        </>
      ) : (
        <>
          <p className="text-gray-600 text-xs leading-relaxed mb-3">
            Apple asks every nonprofit to be verified once before it can appear inside the iPhone app.
            Register free at the Benevity Causes Portal using your organization&apos;s details and the ID below.
          </p>
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-3">
            <code className="text-xs text-gray-700 font-mono flex-1 truncate">{APPLE_TEAM_ID}</code>
            <TeamIdCopyButton />
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={BENEVITY_PORTAL_URL}
              target="_blank"
              rel="noopener"
              className="text-xs font-bold px-3 py-2 rounded-xl bg-gray-100 text-gray-700"
            >
              Open the Benevity portal →
            </a>
            <button
              onClick={markRegistered}
              className="text-xs font-bold px-3 py-2 rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}
            >
              I have registered →
            </button>
          </div>
        </>
      )}
      <p className="text-gray-400 text-xs mt-2.5">Your webpage and widget are already live either way  -  Apple only decides the app listing.</p>
    </motion.div>
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
  const { web } = useNpLayout();
  const accent = npOrg.color || '#0D9488';

  return (
    <NpPage gap={4} cols={2}>
      <NpBlock span="full">
        {/* The eyebrow orients the phone screen, which has no page title. The
            desktop shell prints a real <h1>, so it would just be a duplicate. */}
        <div className="flex items-center justify-between" style={web ? { justifyContent: 'flex-end' } : undefined}>
          {!web && <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live snapshot</p>}
          <DemoPill />
        </div>
      </NpBlock>

      {/* iPhone app listing status - near the top so it's never missed */}
      <NpBlock span="full">
        <AppleListingCard />
      </NpBlock>

      {/* Fee model framing */}
      <NpBlock>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 flex flex-col gap-1.5"
          style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}
        >
          <p className="text-green-800 text-sm font-bold">Always free for you  -  donors cover everything</p>
          <p className="text-green-700 text-xs leading-relaxed">
            Donors cover the flat $1 app fee, and most also cover your card-processing costs (pre-selected at signup)  -  so PocketCache costs you $0, ever. We never take a percentage of donations.
          </p>
        </motion.div>
      </NpBlock>

      {/* Hero stat: active donors + MTD */}
      <NpBlock>
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
      </NpBlock>

      {/* Stat cards row */}
      <NpBlock span="full">
        <div className="flex gap-3">
          {/* Charge day comes from lib/billing so admins and donors are told the
              same date  -  round-ups lock on the 1st, money moves on the 11th. */}
          <StatCard iconComponent={CalendarDays} label="Next charge" value={nextChargeLabel()} accent={accent} />
          <StatCard iconComponent={TrendingUp}   label="Last month"  value={`$${fmtMoney(LAST_MONTH_GROSS)}`} sub="collected" accent={accent} />
          <StatCard iconComponent={Users}        label="Avg / donor" value={`$${fmtMoney(AVG_PER_DONOR)}`}    accent={accent} />
        </div>
      </NpBlock>

      {/* Failed charges alert */}
      {FAILED_COUNT > 0 && (
        <NpBlock span="full">
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
                {FAILED_COUNT} donor{FAILED_COUNT > 1 ? "s'" : "'s"} payment failed  -  retrying automatically
              </p>
              <p className="text-orange-600 text-xs mt-0.5">
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
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-sm">Donor Growth</h3>
            <span className="text-xs text-gray-400">Last 6 months</span>
          </div>
          {/* Taller on desktop: the card is ~2x as wide there, and a 112px plot
              in a 600px card reads as a sparkline rather than a chart. */}
          <div style={{ height: web ? 220 : 112 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={GROWTH_CHART} barSize={web ? 34 : 20}>
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
      </NpBlock>

      {/* Corporate match card  -  GM example */}
      <NpBlock>
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
          <p className="text-amber-700 text-xs mt-2">
            Match campaigns: sponsors pay PocketCache a flat tooling fee  -  never a percentage. Match dollars go straight from the sponsor to you.
          </p>
        </motion.div>
      </NpBlock>
    </NpPage>
  );
}
