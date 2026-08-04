import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { fmtMoney } from '../lib/format';
import { Zap, Heart, TrendingUp, X, Plus, ChevronRight, Building2, Flame } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { loadKey, saveKey } from '../store/identityStore';
import { useTheme } from '../store/ThemeContext';
import {
  chargeTotal, cycleDays, daysUntilNextCharge,
  effectiveCharge, nextChargeLabel, processingCoverFor,
} from '../lib/billing';
import {
  SKIP_COLLECT_AMOUNT, SKIP_COLLECT_LABEL, SKIP_TILE_SUB,
  adjustBounds, getMilestonesUpTo, matchProgress, skipExplainer,
} from '../lib/donorContent';
import { Z } from '../lib/overlay';
import { safeBottomAtLeast, safeTopAtLeast } from '../lib/safeArea';
import { monthsGiving, momChange, totalRoundupsCount, avgPerMonth, sinceLabel, DEMO_USER } from '../data/derived';
import OrgLogo from '../components/OrgLogo';
import Sheet from '../components/Sheet';
import GiveExtraSheet from '../components/sheets/GiveExtraSheet';
import BoostToast from '../components/sheets/BoostToast';
import BecomeMatchSponsorSheet from '../components/sheets/BecomeMatchSponsorSheet';

// ─── Skipped-cycle copy  -  SHARED with the web portal ───────────────────────
// The sentences themselves now live in lib/donorContent, next to every other
// piece of copy a donor reads on more than one screen, and the honesty rule they
// encode is documented there: the "you're only charged in the months you give"
// framing is true about TIMING and false about COST, so it never renders without
// the $1-rolls-forward sentence beside it.
//
// These re-exports exist only so the import paths in WebDashboard.jsx and
// WebOnboarding.jsx keep working. New callers should import from
// '../lib/donorContent' directly.
/* eslint-disable react-refresh/only-export-components */
export {
  SKIP_COLLECT_AMOUNT, SKIP_COLLECT_LABEL, SKIP_RESUME_LINE, SKIP_TILE_SUB,
  SKIP_UNDO_LINE, skipAccruedLine, skipExplainer, skipFeeLine, skipStatusLine,
  skipSummaryLine,
} from '../lib/donorContent';
/* eslint-enable react-refresh/only-export-components */

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
      className="absolute left-4 right-4 bg-white rounded-3xl p-4 shadow-2xl flex items-center gap-3"
      // Z.pageToast, not Z.toast: this is a celebration on the Dashboard, so if
      // the donor has a bottom sheet open it belongs BEHIND the sheet with the
      // rest of the page instead of painting over the sheet's card.
      //
      // The top offset clears the global avatar button (safe-top + 12px, 40px
      // tall) rather than using a flat top-20. At top-20 the toast's X landed
      // directly under the avatar on any device with a notch, so tapping the X
      // opened the account sheet instead of dismissing the toast.
      style={{ top: safeTopAtLeast(80, 60), zIndex: Z.pageToast }}
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

/**
 * One quiet tappable line pointing at the active corporate match.
 *
 * Home used to carry the whole amber banner (logo, progress bar, pool figures,
 * impact link) - byte-for-byte the same facts My Cause shows. My Cause now owns
 * the full match display, so Home keeps only the single canonical sentence from
 * `matchProgress().headline` and a chevron into that tab. No progress bar here.
 */
function MatchLine({ m, onOpen }) {
  const mp = matchProgress(m);
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      data-testid="home-match-line"
      className="w-full bg-white rounded-3xl px-4 py-3.5 card-shadow flex items-center gap-3 text-left"
    >
      {m.logoUrl ? (
        <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0"
          style={{ border: '1px solid #f3f4f6' }}>
          <img src={m.logoUrl} alt={m.companyShort} style={{ height: 22, objectFit: 'contain' }} />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: '#fef3c7' }}>
          <Building2 size={16} className="text-amber-700" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Corporate Match</p>
        <p className="text-sm text-gray-700 leading-snug mt-0.5">{mp.headline}</p>
      </div>
      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </motion.button>
  );
}

function AdjustChargeSheet({ show, onClose, pendingRoundUps, effectiveAmount, chargeAdjustment, setChargeAdjustment, brand }) {
  // Component is remounted via key when opened, so useState always starts fresh.
  // It opens on the amount that would actually be charged (lib/billing's
  // effectiveCharge - an existing adjustment, else the cap, else the raw
  // round-ups), never on a number the donor would not be billed.
  const [value, setValue] = useState(effectiveAmount);
  // ONE set of bounds for this control, shared with the charge-review alert.
  // This slider used to start at $1.00 in $0.01 steps while the review alert
  // driving the same `chargeAdjustment` value started at $0 in $0.25 steps, so
  // the two disagreed about what a donor was allowed to choose.
  const bounds = adjustBounds(pendingRoundUps);

  function handleConfirm() {
    setChargeAdjustment(value);
    onClose();
  }

  return (
    <Sheet show={show} onClose={onClose} title="Adjust This Month's Charge">
      {/* pt-5 not py-5: Sheet owns the bottom safe-area inset now, and a pb of
          any kind here stacks on top of it. */}
      <div className="px-6 pt-5 space-y-5">
        <p className="text-gray-600 text-sm leading-relaxed">
          One-time adjustment for this month&apos;s charge only. In the real app you&apos;ll also get an email/push 3 days before each charge with this same control.
        </p>
        <div className="text-center">
          <p className="text-4xl font-bold text-gray-900">${fmtMoney(value)}</p>
          <p className="text-gray-400 text-xs mt-1">of ${fmtMoney(pendingRoundUps)} accrued this month</p>
        </div>
        <div className="px-2">
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
            value={value}
            onChange={e => setValue(parseFloat(e.target.value))}
            className="w-full accent-teal-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>${fmtMoney(bounds.min)}</span>
            <span>${fmtMoney(bounds.max)}</span>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleConfirm}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ background: brand.gradient }}
        >
          Set Charge to ${fmtMoney(value)}
        </motion.button>
        {chargeAdjustment !== null && (
          <button
            onClick={() => { setChargeAdjustment(null); onClose(); }}
            className="w-full py-2 text-sm text-gray-400 font-medium"
          >
            Reset to full amount
          </button>
        )}
      </div>
    </Sheet>
  );
}

export default function Dashboard() {
  const {
    selectedNonprofit, totalDonated, boostDonation, pendingRoundUps, setTab, monthlyCap, chargeAdjustment, setChargeAdjustment, feeMonths, skipNextCharge, coverProcessing,
    hasRealBankLinked, realRoundupsRecent, realRoundupsFreshness,
  } = useApp();
  const brand = useTheme();
  const [seenMilestoneAmount, setSeenMilestoneAmount] = useState(() => loadKey('pc_seen_milestone', 0));
  const [showBoost, setShowBoost] = useState(false);
  const [showSponsorSheet, setShowSponsorSheet] = useState(false);
  const [boostToast, setBoostToast] = useState(null);
  const [showAdjustCharge, setShowAdjustCharge] = useState(false);
  const toastTimerRef = useRef(null);
  // Days until the charge actually runs, straight from the billing module - NOT
  // days until the end of the calendar month. Those two differ by 10 days and
  // the number sitting next to "Next charge: <date>" has to mean that date.
  const daysLeft = daysUntilNextCharge();

  const milestones = getMilestonesUpTo(totalDonated);
  const nextMilestone = milestones.find(m => !m.achieved);
  const latestAchieved = [...milestones].filter(m => m.achieved).pop();
  const progressToNext = nextMilestone
    ? Math.min((totalDonated / nextMilestone.amount) * 100, 100)
    : 100;
  const shouldShowMilestone = latestAchieved && latestAchieved.amount > seenMilestoneAmount;

  const monthlyMinimum = selectedNonprofit?.monthlyMinimum ?? 5;
  // Billing schedule (Blake, 2026-07-06): the month's round-ups LOCK on the
  // 1st (exact amount emailed) and the charge runs on the 11th  -  10 full
  // days' review notice (classic Reg E timing), so donors are never surprised.
  // The date itself comes from lib/billing so this card, Settings and the
  // review alert can never disagree (during days 1-10 the upcoming charge is
  // THIS month's 11th, not next month's).
  const nextChargeDateLabel = nextChargeLabel();
  // A skipped cycle collects nothing, so the below-minimum rollover story (and
  // the cap / adjustment notes, and the "adjust this charge" affordance) must
  // never show alongside it - there is no charge left to roll over or adjust.
  // The web portal gates the same three things on `!skipped`.
  const belowMinimum = pendingRoundUps < monthlyMinimum && !skipNextCharge;

  // Progress through the billing cycle: charge day to charge day, not a
  // hardcoded 30. Both ends come from lib/billing (previous charge day to next
  // charge day) rather than being re-derived here.
  const cycleLength = cycleDays();
  const cyclePct = Math.max(0, Math.min(100, ((cycleLength - daysLeft) / cycleLength) * 100));

  // Cap + per-charge adjustment precedence lives in lib/billing so the app and
  // the web portal cannot drift.
  const capActive = monthlyCap !== null && pendingRoundUps > monthlyCap;
  const chargeAmount = effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment });
  // The donor's standing "cover the card-processing costs" consent (persisted in
  // AppContext, pre-checked at signup) is real money on every charge, so it has
  // to be in this figure. Two rules:
  //   - It is computed on `chargeAmount`, the EFFECTIVE round-ups after any cap
  //     or one-time adjustment, because the processor only takes its cut of what
  //     is actually collected. Basing it on the raw accrual would overcharge a
  //     capped donor.
  //   - A skipped cycle collects nothing, so there is nothing to process and no
  //     cover - which is why the skipped state below still reads $0.00.
  const processingCover = coverProcessing && !skipNextCharge
    ? processingCoverFor(chargeAmount)
    : 0;
  const chargeDue = chargeTotal({ pendingRoundUps, monthlyCap, chargeAdjustment, feeMonths, processingCover });
  const feeLabel = feeMonths === 1 ? '$1 app fee' : `$1 × ${feeMonths} app fee`;
  // Shown only when the donor actually has the cover on. An always-visible
  // "+ $0.00 processing cover" term is noise, and the itemisation still adds up
  // without it because `processingCover` is 0 in that case.
  const coverLabel = processingCover > 0 ? ` + $${fmtMoney(processingCover)} processing cover` : '';

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
              saveKey('pc_seen_milestone', amount);
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

      {/* Corp Match hero button - only rendered when NO match is running, so the
          only sheet Home needs is Become a Sponsor. An active match is a compact
          line into My Cause, which owns the match details drill-in. */}
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
        className="px-5 pb-6"
        style={{ paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <div>
          <p className="text-white/70 text-sm font-medium">{getGreeting()}, {DEMO_USER.name} 👋</p>
          <h1 className="text-white text-2xl font-bold mt-1" style={{ letterSpacing: '-0.3px' }}>
            {brand.appName}
          </h1>
        </div>
      </motion.div>

      {/* pb-28 (112px) cleared the tab bar before it consumed --pc-safe-bottom.
          The tab bar now grows with the home-indicator inset, so the scroll
          padding has to grow with it or the last card hides behind it. */}
      <div
        className="flex-1 scrollable pc-scrollbar px-4 space-y-4 pt-4"
        style={{ paddingBottom: safeBottomAtLeast(112, 106) }}
      >

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
              <span className="text-5xl font-bold">${fmtMoney(totalDonated)}</span>
            </div>
            {/* Subtitle derived from MONTHLY_DATA range  -  never hardcoded */}
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
                {/* Corp Match: only when no match is running, and then it is an
                    invitation to bring one in. While a match IS active the
                    compact match line below carries it and My Cause owns the
                    detail. Volunteer lives on My Cause with the other
                    involvement actions. */}
                {!match?.active && (
                  <button onClick={() => setShowSponsorSheet(true)}
                    className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
                    <Building2 size={12} /> Corp Match
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Corporate match: one compact line into My Cause */}
        {match?.active && <MatchLine m={match} onOpen={() => setTab('mycause')} />}

        {/* Stats row  -  all values computed from real data via derived.js */}
        <div className="flex gap-3">
          {[
            {
              icon: <Zap size={18} />,
              label: 'Pending',
              value: `$${pendingRoundUps.toFixed(2)}`,
              // Accrual figure, so the raw round-ups are the honest number here -
              // but on a skipped cycle "This month" would read as "coming out this
              // month", which is exactly what is NOT happening. For a donor with a
              // real linked bank, "This month" becomes the freshness caption
              // (computed once on response arrival, not a ticking clock - see
              // fmtFreshness) so the figure reads as live, not a static demo number.
              sub: skipNextCharge ? SKIP_TILE_SUB : (hasRealBankLinked ? realRoundupsFreshness : 'This month'),
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

        {/* Monthly Charge card  -  shows rollover state when pending is below the monthly minimum */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-sm">
                Monthly Charge to {selectedNonprofit.shortName}
              </p>
              {/* On a skipped cycle this caption is a STATE WORD, not a claim.
                  It shares a tight flex row with the day counter, so the sentence
                  that carries the "only charged in the months you give" framing
                  cannot live here - and the framing must never appear without the
                  "$1 app fee is not waived" sentence beside it. Both live in the
                  full-width skipExplainer paragraph below, together. */}
              <p className="text-gray-400 text-xs mt-0.5" data-testid="skip-status-line">
                Next charge: {skipNextCharge ? 'Skipped' : nextChargeDateLabel}
              </p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="font-bold text-2xl" style={{ color: '#0B2A4A' }}>{daysLeft}</p>
              {/* The countdown measures the CYCLE, and on a skipped cycle its end
                  is not a charge - saying "days left" next to "nothing is
                  collected" would read as a countdown to money leaving. */}
              <p className="text-gray-400 text-xs">{skipNextCharge ? 'days left in cycle' : 'days left'}</p>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${cyclePct}%` }}
              transition={{ duration: 1, delay: 0.4 }}
              className="h-full rounded-full"
              style={{ background: brand.gradient }}
            />
          </div>
          {/* The bar's two end labels get their own row, and the itemisation sits
              on a full-width line below it. It used to be the middle child of a
              three-way justify-between, which left it about 200px: enough for
              "round-ups + fee · total", not enough once the processing cover
              became a third term. */}
          <div className="flex justify-between mt-1.5">
            <p className="text-gray-400 text-xs">Cycle start</p>
            {/* On a skipped cycle the right-hand end of the bar is not a charge day. */}
            <p className="text-gray-400 text-xs">{skipNextCharge ? 'Skipped' : 'Charge day'}</p>
          </div>
          {skipNextCharge ? (
            /* The figure a skipped donor sees for the upcoming charge: zero.
               It used to print the full "$13.89 + $1 app fee · $14.89 pending"
               immediately under copy saying the charge was skipped. */
            <p className="text-xs font-semibold text-amber-600 mt-1.5" data-testid="skip-collect-line">
              {SKIP_COLLECT_LABEL}: {SKIP_COLLECT_AMOUNT}
            </p>
          ) : belowMinimum ? (
            <p className="text-xs font-semibold text-amber-600 mt-1.5">
              ${fmtMoney(pendingRoundUps)} so far  -  rolls over at month-end
            </p>
          ) : (
            <p className="text-xs font-semibold mt-1.5" style={{ color: '#059669' }} data-testid="charge-itemization">
              ${fmtMoney(chargeAmount)} + {feeLabel}{coverLabel} · ${fmtMoney(chargeDue)} pending
            </p>
          )}
          {/* Says where the extra money lands. The cover is a donation to the
              nonprofit, not a PocketCache charge, and the donor pre-agreed to it
              at signup - so the one place the total names it should also say so. */}
          {!skipNextCharge && !belowMinimum && processingCover > 0 && (
            <p className="text-gray-400 text-xs mt-1 leading-relaxed" data-testid="charge-cover-note">
              The ${fmtMoney(processingCover)} processing cover goes to {selectedNonprofit.shortName}, not to PocketCache, so 100% of your round-ups reach them. Change it in Settings.
            </p>
          )}
          {skipNextCharge && (
            <p className="text-amber-600 text-xs mt-2 leading-relaxed" data-testid="skip-detail">
              {skipExplainer({ pendingRoundUps, feeMonths })}
            </p>
          )}
          {belowMinimum && (
            <p className="text-amber-600 text-xs mt-2 leading-relaxed">
              Not quite ${monthlyMinimum} yet  -  your round-ups carry forward. We settle every 3 months at most, so nothing&apos;s ever left behind.
              {' '}&middot; $1/month fee rolls too  -  {feeMonths} month{feeMonths !== 1 ? 's' : ''} so far (${feeMonths})  -  itemized on your charge.
            </p>
          )}
          {!skipNextCharge && !belowMinimum && capActive && chargeAdjustment === null && (
            <p className="text-amber-600 text-xs mt-2 leading-relaxed">
              Capped at ${monthlyCap.toFixed(2)}  -  the rest won&apos;t be charged.
            </p>
          )}
          {!skipNextCharge && !belowMinimum && chargeAdjustment !== null && (
            <p className="text-xs mt-2 font-medium" style={{ color: '#059669' }}>
              Adjusted to ${chargeAdjustment.toFixed(2)} for this month.
            </p>
          )}
          {/* Nothing to adjust on a skipped cycle - the web portal hides this
              button on `!skipped` too, and the app used to offer it. */}
          {!skipNextCharge && !belowMinimum && (
            <button
              onClick={() => setShowAdjustCharge(true)}
              className="text-xs mt-2 font-semibold underline-offset-2 underline block"
              style={{ color: brand.primary }}
            >
              Adjust this charge →
            </button>
          )}
        </motion.div>

        {/* Recent round-ups  -  REAL data only, for a donor with a real linked
            bank. A demo-only donor never sees this card (hasRealBankLinked is
            false), so the existing demo layout is untouched below and above.
            Capped to 5 rows for a compact card even though the server can
            return up to 10 - this is a glance-and-go list, not a ledger (the
            Activity tab is where a fuller history would live in a later pass). */}
        {hasRealBankLinked && realRoundupsRecent.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="bg-white rounded-3xl p-5 card-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-base">Recent round-ups</h3>
              <span className="text-xs text-gray-400">{realRoundupsFreshness}</span>
            </div>
            <div className="space-y-2.5">
              {realRoundupsRecent.slice(0, 5).map((r, i) => (
                <div key={`${r.date}-${i}`} className="flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.merchant || 'Purchase'}</p>
                    <p className="text-xs text-gray-400">{r.date}</p>
                  </div>
                  <p className="text-sm font-bold shrink-0" style={{ color: '#059669' }}>
                    +${(r.roundup_cents / 100).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

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
                <span>${fmtMoney(totalDonated)}</span>
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

        {/* Monthly history chart: Activity owns it.
            "Your Impact" quote card: My Cause owns it.
            "Powered by PocketCache" footer: Settings owns it. */}

      </div>

      {/* Adjust charge sheet  -  key remounts on open so slider initializes fresh */}
      <AdjustChargeSheet
        key={showAdjustCharge ? 'open' : 'closed'}
        show={showAdjustCharge}
        onClose={() => setShowAdjustCharge(false)}
        pendingRoundUps={pendingRoundUps}
        effectiveAmount={chargeAmount}
        chargeAdjustment={chargeAdjustment}
        setChargeAdjustment={setChargeAdjustment}
        brand={brand}
      />
    </div>
  );
}
