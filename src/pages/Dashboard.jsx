import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { Zap, Heart, TrendingUp, X, Share2, Plus, Settings, CreditCard, Bell, HelpCircle, LogOut, ChevronRight, ExternalLink, Building2, Flame } from 'lucide-react';
import { useApp } from '../store/AppContext';
import CoinMark from '../components/CoinMark';
import { useTheme } from '../store/ThemeContext';
import { MONTHLY_DATA } from '../data/transactions';
import { monthsGiving, momChange, totalRoundupsCount, avgPerMonth, sinceLabel, DEMO_USER } from '../data/derived';
import OrgLogo from '../components/OrgLogo';
import CustomTooltip from '../components/CustomTooltip';
import Sheet from '../components/Sheet';
import GiveExtraSheet from '../components/sheets/GiveExtraSheet';
import BoostToast from '../components/sheets/BoostToast';
import VolunteerSheet from '../components/sheets/VolunteerSheet';
import BecomeMatchSponsorSheet from '../components/sheets/BecomeMatchSponsorSheet';
import MatchDetailsSheet from '../components/sheets/MatchDetailsSheet';

const MILESTONE_EMOJIS = ['🌱', '⭐', '🏆', '💎', '🦸', '🚀', '🌟', '👑', '🎯', '🔮'];

function getMilestoneAt(index) {
  const tier = Math.floor(index / 3);
  const pos = index % 3;
  const multiplier = pos === 0 ? 1 : pos === 1 ? 2.5 : 5;
  const amount = Math.round(10 * Math.pow(10, tier) * multiplier);
  const emoji = MILESTONE_EMOJIS[index % MILESTONE_EMOJIS.length];
  const label = amount >= 1000
    ? `$${(amount / 1000 % 1 === 0 ? amount / 1000 : (amount / 1000).toFixed(1))}K club`
    : `$${amount} club`;
  return { amount, label, emoji, index };
}

function getMilestonesUpTo(total) {
  const result = [];
  let i = 0;
  while (true) {
    const m = getMilestoneAt(i);
    result.push({ ...m, achieved: total >= m.amount });
    if (m.amount > total && result.filter(x => !x.achieved).length >= 5) break;
    i++;
    if (i > 50) break;
  }
  return result;
}

function daysUntilMonthEnd() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(1, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function MilestoneToast({ milestone, onClose }) {
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      className="absolute top-20 left-4 right-4 z-30 bg-white rounded-3xl p-4 shadow-2xl flex items-center gap-3"
    >
      <div className="text-3xl">{milestone.emoji}</div>
      <div className="flex-1">
        <p className="font-bold text-gray-900 text-sm">Milestone Unlocked!</p>
        <p className="text-gray-500 text-xs">{milestone.label} donated 🎉</p>
      </div>
      <button onClick={onClose}><X size={16} className="text-gray-300" /></button>
    </motion.div>
  );
}

// Displays the active corporate match progress inline on the Dashboard.
// Clicking the Corp Match hero button opens MatchDetailsSheet instead.
function MatchBanner({ m, pct }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-3xl p-4 card-shadow"
      style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}
    >
      <div className="flex items-center gap-3 mb-2">
        {m.logoUrl && (
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0"
            style={{ border: '1px solid #f3f4f6' }}>
            <img src={m.logoUrl} alt={m.companyShort} style={{ height: 28, objectFit: 'contain' }} />
          </div>
        )}
        <p className="font-bold text-amber-900 text-sm flex-1">
          {m.companyShort} is matching your round-ups this month — up to ${(m.maxAmount / 1000).toFixed(0)}K (${(m.matched / 1000).toFixed(1)}K matched so far)
        </p>
      </div>
      <div className="h-2 bg-amber-100 rounded-full overflow-hidden mb-1.5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, delay: 0.4 }}
          className="h-full bg-amber-400 rounded-full"
        />
      </div>
      <p className="text-amber-700 text-xs mb-3">{pct}% of match pool used · ${((m.maxAmount - m.matched) / 1000).toFixed(1)}K remaining</p>
      {m.impactUrl && (
        <a href={m.impactUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900">
          See {m.companyShort}&apos;s community impact <ExternalLink size={11} />
        </a>
      )}
    </motion.div>
  );
}

export default function Dashboard() {
  const { selectedNonprofit, totalDonated, boostDonation, pendingRoundUps, setTab, signOut } = useApp();
  const brand = useTheme();
  const [seenMilestoneAmount, setSeenMilestoneAmount] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pc_seen_milestone') ?? '0'); } catch { return 0; }
  });
  const [showBoost, setShowBoost] = useState(false);
  const [showMatchDetails, setShowMatchDetails] = useState(false);
  const [showVolunteer, setShowVolunteer] = useState(false);
  const [showSponsorSheet, setShowSponsorSheet] = useState(false);
  const [boostToast, setBoostToast] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const toastTimerRef = useRef(null);
  const daysLeft = daysUntilMonthEnd();

  const milestones = getMilestonesUpTo(totalDonated);
  const nextMilestone = milestones.find(m => !m.achieved);
  const latestAchieved = [...milestones].filter(m => m.achieved).pop();
  const progressToNext = nextMilestone
    ? Math.min((totalDonated / nextMilestone.amount) * 100, 100)
    : 100;
  const shouldShowMilestone = latestAchieved && latestAchieved.amount > seenMilestoneAmount;

  const monthlyMinimum = selectedNonprofit?.monthlyMinimum ?? 10;
  const belowMinimum = pendingRoundUps < monthlyMinimum;

  // MoM display: "↑ 14% vs last" or "↓ 5% vs last" or "First month"
  const momDisplay = momChange === null
    ? 'First month'
    : `${momChange >= 0 ? '↑' : '↓'} ${Math.abs(momChange).toFixed(0)}% vs last`;

  if (!selectedNonprofit) return null;

  function handleBoostConfirm(amount) {
    boostDonation(amount);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setBoostToast(amount);
    toastTimerRef.current = setTimeout(() => setBoostToast(null), 3500);
  }

  const match = selectedNonprofit.corporateMatch;

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Boost toast */}
      <AnimatePresence>
        {boostToast !== null && (
          <BoostToast amount={boostToast} nonprofit={selectedNonprofit} onClose={() => setBoostToast(null)} />
        )}
      </AnimatePresence>

      {/* Milestone toast */}
      <AnimatePresence>
        {shouldShowMilestone && boostToast === null && (
          <MilestoneToast
            milestone={latestAchieved}
            onClose={() => {
              const amount = latestAchieved.amount;
              setSeenMilestoneAmount(amount);
              try { localStorage.setItem('pc_seen_milestone', JSON.stringify(amount)); } catch { /* ignore */ }
            }}
          />
        )}
      </AnimatePresence>

      {/* Give Extra sheet */}
      <GiveExtraSheet
        show={showBoost}
        onClose={() => setShowBoost(false)}
        onConfirm={handleBoostConfirm}
        nonprofit={selectedNonprofit}
        brand={brand}
      />

      {/* Corp Match button opens match DETAILS when match is active;
          falls back to Become a Sponsor when no match is running */}
      {match?.active ? (
        <MatchDetailsSheet
          show={showMatchDetails}
          onClose={() => setShowMatchDetails(false)}
          match={match}
        />
      ) : (
        <BecomeMatchSponsorSheet
          show={showMatchDetails}
          onClose={() => setShowMatchDetails(false)}
          nonprofit={selectedNonprofit}
          brand={brand}
        />
      )}

      <VolunteerSheet
        show={showVolunteer}
        onClose={() => setShowVolunteer(false)}
        nonprofit={selectedNonprofit}
        brand={brand}
      />
      <BecomeMatchSponsorSheet
        show={showSponsorSheet}
        onClose={() => setShowSponsorSheet(false)}
        nonprofit={selectedNonprofit}
        brand={brand}
      />

      {/* Header */}
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-sm font-medium">{getGreeting()}, {DEMO_USER.name} 👋</p>
            <h1 className="text-white text-2xl font-bold mt-1" style={{ letterSpacing: '-0.3px' }}>
              {brand.appName}
            </h1>
          </div>
          <button
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold border border-white/30 active:scale-95 transition-transform relative"
            aria-label="Open account settings"
          >
            {DEMO_USER.name[0]}
            <span className="absolute inset-0 rounded-full border border-white/40 animate-ping opacity-30" style={{ animationDuration: '3s' }} />
          </button>
        </div>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 space-y-4 pt-4">

        {/* Hero donation card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
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
            {/* Subtitle derived from MONTHLY_DATA range — never hardcoded */}
            <p className="text-white/60 text-sm mt-2">{sinceLabel} · All time</p>
            <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
              <Flame size={13} className="text-amber-300" />
              <span className="text-white/90 text-xs font-semibold">{monthsGiving}-month giving streak</span>
            </div>
            <div className="mt-5 pt-4 border-t border-white/20 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                <OrgLogo nonprofit={selectedNonprofit} size={8} rounded="full" className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm leading-snug">{selectedNonprofit.name}</p>
                  <p className="text-white/60 text-xs">Your chosen cause</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={() => setShowBoost(true)}
                  className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
                  <Plus size={12} /> Give Extra
                </button>
                {/* Corp Match button: opens match DETAILS when active, not a suggestion form */}
                <button onClick={() => setShowMatchDetails(true)}
                  className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
                  <Building2 size={12} /> Corp Match
                </button>
                <button onClick={() => setShowVolunteer(true)}
                  className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
                  &#128588; Volunteer
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Corporate match banner */}
        {match?.active && (() => {
          const pct = Math.round((match.matched / match.maxAmount) * 100);
          return <MatchBanner m={match} pct={pct} />;
        })()}

        {/* Stats row — all values computed from real data via derived.js */}
        <div className="flex gap-3">
          {[
            {
              icon: <Zap size={18} />,
              label: 'Pending',
              value: `$${pendingRoundUps.toFixed(2)}`,
              sub: 'This month',
              iconColor: brand.primary,
              textColor: '#059669',
            },
            {
              icon: <TrendingUp size={18} />,
              label: 'Avg/mo',
              value: `$${avgPerMonth.toFixed(2)}`,
              sub: momDisplay,
              iconColor: brand.secondary,
              textColor: momChange !== null && momChange < 0 ? '#dc2626' : '#059669',
            },
            {
              icon: <Heart size={18} />,
              label: 'Round-ups',
              value: String(totalRoundupsCount),
              sub: 'All time (est.)',
              iconColor: brand.secondary,
              textColor: brand.secondary,
            },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="bg-white rounded-3xl p-4 flex-1 card-shadow">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: s.iconColor + '18' }}>
                <span style={{ color: s.iconColor }}>{s.icon}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 leading-none">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1.5 font-medium">{s.label}</div>
              <div className="text-xs mt-1 font-semibold" style={{ color: s.textColor }}>{s.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* Monthly Charge card — shows rollover state when pending < $10 minimum */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-gray-900 text-sm">
                Monthly Charge to {selectedNonprofit.shortName}
              </p>
              <p className="text-gray-400 text-xs mt-0.5">Next charge: end of month</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-2xl" style={{ color: '#0B2A4A' }}>{daysLeft}</p>
              <p className="text-gray-400 text-xs">days left</p>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${100 - (daysLeft / 30) * 100}%` }}
              transition={{ duration: 1, delay: 0.4 }}
              className="h-full rounded-full"
              style={{ background: brand.gradient }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <p className="text-gray-400 text-xs">Month start</p>
            {belowMinimum ? (
              <p className="text-xs font-semibold text-amber-600">
                ${pendingRoundUps.toFixed(2)} so far — rolls over at month-end
              </p>
            ) : (
              <p className="text-xs font-semibold" style={{ color: '#059669' }}>
                ${pendingRoundUps.toFixed(2)} ready to send · +$1 fee if you&apos;re covering it
              </p>
            )}
            <p className="text-gray-400 text-xs">Month end</p>
          </div>
          {belowMinimum && (
            <p className="text-amber-600 text-xs mt-2 leading-relaxed">
              Not quite ${monthlyMinimum} yet — your round-ups carry forward. We settle every 3 months at most, so nothing&apos;s ever left behind.
            </p>
          )}
        </motion.div>

        {/* Milestones */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-base">Milestones</h3>
            {nextMilestone && (
              <span className="text-xs text-gray-400">${(nextMilestone.amount - totalDonated).toFixed(2)} to next</span>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto scrollable pb-1">
            {milestones.map((m) => (
              <div key={m.amount} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all ${
                  m.achieved ? 'shadow-md' : 'opacity-30 grayscale'
                }`}
                  style={{ background: m.achieved ? brand.gradient : '#f3f4f6' }}>
                  {m.emoji}
                </div>
                <p className="text-xs text-gray-400 font-medium whitespace-nowrap">{m.label}</p>
              </div>
            ))}
          </div>
          {nextMilestone && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>${totalDonated.toFixed(0)}</span>
                <span>${nextMilestone.amount}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressToNext}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-full rounded-full"
                  style={{ background: brand.gradient }}
                />
              </div>
            </div>
          )}
        </motion.div>

        {/* Monthly chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-base">Monthly Giving</h3>
            <span className="text-xs text-gray-400">Last {monthsGiving} months</span>
          </div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_DATA} barSize={22}>
                <XAxis dataKey="month" axisLine={false} tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 11 }} />
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
          transition={{ delay: 0.35 }}
          className="rounded-3xl p-5 text-white relative overflow-hidden"
          style={{ background: brand.gradient }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Your Impact</p>
          <p className="text-white font-bold text-base leading-snug relative z-10">
            &ldquo;{selectedNonprofit.impact}&rdquo;
          </p>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <OrgLogo nonprofit={selectedNonprofit} size={7} rounded="full" className="shrink-0" />
              <p className="text-white/70 text-xs">{selectedNonprofit.name}</p>
            </div>
            <button
              onClick={() => setTab('share')}
              className="bg-white/20 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1"
            >
              <Share2 size={11} /> Share
            </button>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-300">Powered by <span className="font-semibold">PocketCache</span></p>
        </div>

      </div>

      {/* Profile / Account sheet */}
      <Sheet show={showProfile} onClose={() => setShowProfile(false)} title="Your Account">
        <div className="px-6 pt-2 pb-8 space-y-1">
          {/* Avatar + name block */}
          <div className="flex flex-col items-center py-6 gap-2">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
              style={{ background: brand.gradient }}
            >
              {DEMO_USER.name[0]}
            </div>
            <p className="font-bold text-gray-900 text-lg mt-1">{DEMO_USER.name}</p>
            <p className="text-gray-400 text-sm">{DEMO_USER.email}</p>
          </div>

          {/* Menu rows */}
          {[
            { icon: <Settings size={18} />, label: 'Account Settings', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <CreditCard size={18} />, label: 'Payment Method', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <Bell size={18} />, label: 'Notifications', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <HelpCircle size={18} />, label: 'Help & Support', action: () => window.open('mailto:support@pocketcache.app') },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-50 active:bg-gray-100 transition-colors text-left"
            >
              <span className="text-gray-500">{icon}</span>
              <span className="flex-1 text-gray-800 font-medium text-sm">{label}</span>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          ))}

          <div className="pt-2">
            <button
              onClick={() => { setShowProfile(false); signOut(); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-red-50 active:bg-red-100 transition-colors text-left"
            >
              <span className="text-red-400"><LogOut size={18} /></span>
              <span className="flex-1 text-red-500 font-medium text-sm">Sign Out</span>
            </button>
          </div>

          <p className="text-center text-gray-300 text-xs pt-4 flex items-center gap-1 justify-center">
            <CoinMark size={14} />PocketCache · v1.0.0
          </p>
        </div>
      </Sheet>
    </div>
  );
}
