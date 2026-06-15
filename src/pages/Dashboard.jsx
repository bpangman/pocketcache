import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { Zap, Heart, TrendingUp, X, Share2, Plus, Settings, CreditCard, Bell, HelpCircle, LogOut, ChevronRight, ExternalLink, Building2, Flame } from 'lucide-react';
import { useApp } from '../store/AppContext';
import CoinMark from '../components/CoinMark';
import { useTheme } from '../store/ThemeContext';
import { MONTHLY_DATA } from '../data/transactions';
import OrgLogo from '../components/OrgLogo';
import CustomTooltip from '../components/CustomTooltip';
import Sheet from '../components/Sheet';

const MILESTONE_EMOJIS = ['🌱', '⭐', '🏆', '💎', '🦸', '🚀', '🌟', '👑', '🎯', '🔮'];

function getMilestoneAt(index) {
  // 1-2.5-5 decade pattern indexed from 0:
  // index 0 → 10, 1 → 25, 2 → 50, 3 → 100, 4 → 250, 5 → 500, 6 → 1000, ...
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

const BOOST_PRESETS = [1, 5, 10, 25];
const LARGE_DONATION_THRESHOLD = 1000;

function GiveExtraSheet({ show, onClose, onConfirm, nonprofit, brand }) {
  const [selected, setSelected] = useState(5);
  const [custom, setCustom] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const inputRef = useRef(null);
  const amount = custom ? parseFloat(custom) : selected;
  const valid = amount > 0 && !isNaN(amount);
  const isLarge = valid && amount >= LARGE_DONATION_THRESHOLD;

  // Reset state every time the sheet opens
  useEffect(() => {
    if (show) {
      setSelected(5);
      setCustom('');
      setShowConfirm(false);
    }
  }, [show]);

  function handlePrimaryTap() {
    if (!valid) return;
    if (isLarge) { setShowConfirm(true); return; }
    onConfirm(amount);
    onClose();
  }

  function handleConfirmedLarge() {
    onConfirm(amount);
    setShowConfirm(false);
    onClose();
  }

  const displayAmount = valid
    ? (Number.isInteger(amount) ? amount : amount.toFixed(2))
    : '—';

  return (
    <Sheet show={show} onClose={onClose} title="Give Extra Now">
      <div className="px-6 py-5 pb-8">
        <p className="text-gray-500 text-sm mb-5">
          Make a one-time donation to{' '}
          <span className="font-semibold text-gray-900">{nonprofit?.shortName}</span>{' '}
          on top of your round-ups.
        </p>

        {/* Preset amounts */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {BOOST_PRESETS.map(p => (
            <motion.button
              key={p}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setSelected(p); setCustom(''); }}
              className="py-3 rounded-2xl font-bold text-sm transition-all"
              style={selected === p && !custom
                ? { background: brand.gradient, color: '#fff' }
                : { background: '#f3f4f6', color: '#374151' }}
            >
              ${p}
            </motion.button>
          ))}
        </div>

        {/* Custom amount */}
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5 border-2 transition-colors"
          style={{ background: '#f9fafb', borderColor: custom ? brand.primary : 'transparent' }}
        >
          <span className="text-gray-400 font-semibold">$</span>
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Custom amount"
            value={custom}
            onChange={e => { setCustom(e.target.value); setSelected(null); }}
            className="flex-1 bg-transparent text-gray-900 text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handlePrimaryTap}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ background: brand.gradient, opacity: valid ? 1 : 0.4 }}
        >
          Give ${displayAmount} Now
        </motion.button>

        {/* Large-amount confirmation overlay */}
        <AnimatePresence>
          {showConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-x-6 bottom-8 bg-white border-2 border-amber-200 rounded-3xl p-5 shadow-xl"
              style={{ background: '#fffbeb' }}
            >
              <p className="font-bold text-amber-900 text-base mb-1">Just to confirm…</p>
              <p className="text-amber-700 text-sm mb-4">
                You're about to donate <span className="font-bold">${displayAmount}</span> to{' '}
                {nonprofit?.shortName}. Was that intentional?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-amber-200 text-amber-700 font-semibold text-sm"
                >
                  Go back
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConfirmedLarge}
                  className="flex-1 py-3 rounded-2xl text-white font-bold text-sm"
                  style={{ background: brand.gradient }}
                >
                  Yes, give ${displayAmount}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

function BoostToast({ amount, nonprofit, onClose }) {
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      className="absolute top-20 left-4 right-4 z-30 bg-white rounded-3xl p-4 shadow-2xl flex items-center gap-3"
    >
      <div className="text-3xl">💚</div>
      <div className="flex-1">
        <p className="font-bold text-gray-900 text-sm">Extra ${typeof amount === 'number' && !Number.isInteger(amount) ? amount.toFixed(2) : amount} sent!</p>
        <p className="text-gray-500 text-xs">Added to your {nonprofit?.shortName} donation</p>
      </div>
      <button onClick={onClose}><X size={16} className="text-gray-300" /></button>
    </motion.div>
  );
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

function CorporateMatchSheet({ show, onClose, nonprofit, brand }) {
  const [company, setCompany] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  return (
    <Sheet show={show} onClose={() => { onClose(); setSubmitted(false); setCompany(''); }} title="Suggest a Match Sponsor">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#127962;</div>
            <p className="font-bold text-gray-900 text-lg">Inquiry Sent!</p>
            <p className="text-gray-500 text-sm mt-2">BGCA's corporate partnerships team will follow up with {company} about sponsoring the monthly match.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">Know a company that should be matching your round-ups for BGCA? Let us know — BGCA's corporate partnerships team will reach out to them.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="Company you'd like to suggest" value={company} onChange={e => setCompany(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: company ? 1 : 0.4 }}>
                Send Suggestion
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}

function BecomeMatchSponsorSheet({ show, onClose, nonprofit, brand }) {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  return (
    <Sheet show={show} onClose={() => { onClose(); setSubmitted(false); setCompanyName(''); setContactName(''); setEmail(''); setBudget(''); }} title="Become a Match Sponsor">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🤝</div>
            <p className="font-bold text-gray-900 text-lg">Application Sent!</p>
            <p className="text-gray-500 text-sm mt-2">BGCA's corporate partnerships team will be in touch within 2 business days.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">Partner with BGCA this month. Your company sponsors the monthly round-up match — donors see your logo, you get a community impact report.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="text" placeholder="Contact name" value={contactName} onChange={e => setContactName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="text" placeholder="$10,000–$50,000" value={budget} onChange={e => setBudget(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: companyName && email ? 1 : 0.4 }}>
                Submit to BGCA Partnerships
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}

function VolunteerSheet({ show, onClose, nonprofit, brand }) {
  const [interest, setInterest] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  return (
    <Sheet show={show} onClose={() => { onClose(); setSubmitted(false); setInterest(''); }} title="Volunteer">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#128588;</div>
            <p className="font-bold text-gray-900 text-lg">Interest Noted!</p>
            <p className="text-gray-500 text-sm mt-2">{nonprofit?.shortName} will reach out about volunteer opportunities near you.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">Express your interest in volunteering with {nonprofit?.shortName}.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea placeholder="Tell us how you'd like to help..." value={interest} onChange={e => setInterest(e.target.value)} required rows={3}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400 resize-none" />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: interest ? 1 : 0.4 }}>
                Express Interest
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}

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
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0" style={{ border: '1px solid #f3f4f6' }}>
            <img src={m.logoUrl} alt="GM" style={{ height: 28, objectFit: 'contain' }} />
          </div>
        )}
        <p className="font-bold text-amber-900 text-sm flex-1">{m.companyShort} is matching your round-ups this month — up to ${(m.maxAmount / 1000).toFixed(0)}K (${(m.matched / 1000).toFixed(1)}K matched so far)</p>
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

const MONTHS_GIVING = 6;

export default function Dashboard() {
  const { selectedNonprofit, totalDonated, boostDonation, pendingRoundUps, setTab } = useApp();
  const brand = useTheme();
  const [seenMilestoneAmount, setSeenMilestoneAmount] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pc_seen_milestone') ?? '0'); } catch { return 0; }
  });
  const [showBoost, setShowBoost] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [showVolunteer, setShowVolunteer] = useState(false);
  const [boostToast, setBoostToast] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSponsorSheet, setShowSponsorSheet] = useState(false);
  const toastTimerRef = useRef(null);
  const daysLeft = daysUntilMonthEnd();

  const milestones = getMilestonesUpTo(totalDonated);
  const nextMilestone = milestones.find(m => !m.achieved);
  const latestAchieved = [...milestones].filter(m => m.achieved).pop();
  const progressToNext = nextMilestone
    ? Math.min((totalDonated / nextMilestone.amount) * 100, 100)
    : 100;
  const shouldShowMilestone = latestAchieved && latestAchieved.amount > seenMilestoneAmount;

  if (!selectedNonprofit) return null;

  function handleBoostConfirm(amount) {
    boostDonation(amount);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setBoostToast(amount);
    toastTimerRef.current = setTimeout(() => setBoostToast(null), 3500);
  }

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
              try { localStorage.setItem('pc_seen_milestone', JSON.stringify(amount)); } catch {}
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

      <CorporateMatchSheet show={showMatch} onClose={() => setShowMatch(false)} nonprofit={selectedNonprofit} brand={brand} />
      <VolunteerSheet show={showVolunteer} onClose={() => setShowVolunteer(false)} nonprofit={selectedNonprofit} brand={brand} />
      <BecomeMatchSponsorSheet show={showSponsorSheet} onClose={() => setShowSponsorSheet(false)} nonprofit={selectedNonprofit} brand={brand} />

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
          <button
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold border border-white/30 active:scale-95 transition-transform relative"
            aria-label="Open account settings"
          >
            A
            {/* Subtle pulse ring to hint it's tappable */}
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
            <p className="text-white/60 text-sm mt-2">Since Jan 2026 · All time</p>
            <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
              <Flame size={13} className="text-orange-300" />
              <span className="text-white/90 text-xs font-semibold">{MONTHS_GIVING}-month giving streak</span>
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
                <button onClick={() => setShowBoost(true)} className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
                  <Plus size={12} /> Give Extra
                </button>
                <button onClick={() => setShowMatch(true)} className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
                  <Building2 size={12} /> Corp Match
                </button>
                <button onClick={() => setShowVolunteer(true)} className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
                  &#128588; Volunteer
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Corporate match banner */}
        {selectedNonprofit.corporateMatch?.active && (() => {
          const m = selectedNonprofit.corporateMatch;
          const pct = Math.round((m.matched / m.maxAmount) * 100);
          return (
            <MatchBanner m={m} pct={pct} />
          );
        })()}

        {/* Stats row */}
        <div className="flex gap-3">
          {[
            { icon: <Zap size={18} />, label: 'Pending', value: `$${pendingRoundUps.toFixed(2)}`, sub: 'This month', color: brand.primary, note: null },
            { icon: <TrendingUp size={18} />, label: 'Avg/mo', value: '$10.10', sub: '+12% vs last', color: '#10b981', note: null },
            { icon: <Heart size={18} />, label: 'Round-ups', value: '247', sub: 'All time', color: brand.secondary, note: null },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="bg-white rounded-3xl p-4 flex-1 card-shadow">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: s.color + '18' }}>
                <span style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 leading-none">{s.value}</div>
              <div className="text-xs text-gray-400 mt-1.5 font-medium">{s.label}</div>
              <div className="text-xs mt-1 font-semibold" style={{ color: s.color }}>{s.sub}</div>
              {s.note && <div className="text-xs mt-1 text-gray-400">{s.note}</div>}
            </motion.div>
          ))}
        </div>

        {/* Quarterly payout countdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-gray-900 text-sm">Monthly Charge to {selectedNonprofit.shortName}</p>
              <p className="text-gray-400 text-xs mt-0.5">Next charge: end of month</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-2xl" style={{ color: brand.primary }}>{daysLeft}</p>
              <p className="text-gray-400 text-xs">days left</p>
            </div>
          </div>
          <div className="h-2 bg-gray.100 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
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
            <p className="text-xs font-semibold" style={{ color: brand.primary }}>${pendingRoundUps.toFixed(2)} ready to send</p>
            <p className="text-gray-400 text-xs">Month end</p>
          </div>
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
            <span className="text-xs text-gray-400">Last 6 months</span>
          </div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_DATA} barSize={22}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
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
            "{selectedNonprofit.impact}"
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

      {/* ── Profile / Account sheet ── */}
      <Sheet show={showProfile} onClose={() => setShowProfile(false)} title="Your Account">
        <div className="px-6 pt-2 pb-8 space-y-1">
          {/* Avatar + name block */}
          <div className="flex flex-col items-center py-6 gap-2">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg relative"
              style={{ background: brand.gradient }}
            >
              A
            </div>
            <p className="font-bold text-gray-900 text-lg mt-1">Alex</p>
            <p className="text-gray-400 text-sm">alex@example.com</p>
          </div>

          {/* Menu rows */}
          {[
            { icon: <Settings size={18} />, label: 'Account Settings', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <CreditCard size={18} />, label: 'Payment Method', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <Bell size={18} />, label: 'Notifications', action: () => { setShowProfile(false); setTab('settings'); } },
            { icon: <HelpCircle size={18} />, label: 'Help & Support', action: null },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action ?? undefined}
              disabled={!action}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-50 active:bg-gray-100 transition-colors text-left"
            >
              <span className="text-gray-500">{icon}</span>
              <span className="flex-1 text-gray-800 font-medium text-sm">{label}</span>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          ))}

          <div className="pt-2">
            <button className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-red-50 active:bg-red-100 transition-colors text-left">
              <span className="text-red-400"><LogOut size={18} /></span>
              <span className="flex-1 text-red-500 font-medium text-sm">Sign Out</span>
            </button>
          </div>

          <p className="text-center text-gray-300 text-xs pt-4 flex items-center gap-1 justify-center"><CoinMark size={14} />PocketCache · v1.0.0</p>
        </div>
      </Sheet>
    </div>
  );
}
