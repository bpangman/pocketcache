import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { fmtMoney, fmtMoneyWhole } from '../lib/format';
import { Zap, Heart, TrendingUp, X, Plus, ChevronRight, Building2, Flame, Landmark } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { loadKey, saveKey } from '../store/identityStore';
import { useTheme } from '../store/ThemeContext';
import {
  APP_FEE_LIVE, CHARGE_DAY, LOCK_DAY, MONTHLY_FLOOR,
  chargeAfterNextLabel, chargeTotal, currentMonthName, effectiveCharge,
  firstEligibleChargeDate, isBelowFloor, nextChargeDate,
  processingCoverFor, roundUpMonthName,
} from '../lib/billing';
import {
  ADJUST_NOTE, PREVIEW_NOTE, ROLL_FORWARD_NOTE,
  SKIP_COLLECT_AMOUNT, SKIP_COLLECT_LABEL, SKIP_TILE_SUB,
  adjustBounds, appFeePendingLine, getMilestonesUpTo, isMatchVisible, matchProgress, skipExplainer,
} from '../lib/donorContent';
import { Z } from '../lib/overlay';
import { safeBottomAtLeast } from '../lib/safeArea';
import { DEMO_USER, FIRST_MONTH_LABEL } from '../data/derived';
import { greetingNameFor } from '../lib/donorAuth';
import OrgLogo from '../components/OrgLogo';
import NamePromptCard from '../components/NamePromptCard';
import Sheet from '../components/Sheet';
import Button from '../components/ui/Button';
import GiveExtraSheet from '../components/sheets/GiveExtraSheet';
import { submitGiveExtra } from '../lib/engagement';
import BoostToast, { TOAST_BOTTOM } from '../components/sheets/BoostToast';
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

/** Positive money is always green (BRANDING.md rule 2) - a semantic color, not a brand one. */
const GREEN = 'var(--green)';

/** How long a celebration toast stays up before it dismisses itself. */
const TOAST_AUTO_DISMISS_MS = 5000;

/**
 * How long Home waits before it raises the milestone toast. The launch splash
 * (SplashAnimation, about 2.3s) plays OVER a freshly mounted Dashboard, and
 * the hero card is still settling for a moment after it: raised at mount the
 * toast's 5s were half spent before anyone could see it. Measured from here
 * the donor gets the whole dwell, with the hero total already on screen.
 */
const TOAST_RAISE_DELAY_MS = 2600;

const shortDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The "this value has not reached the server yet" tag beside a Skip / Cap /
 * Adjust / Cover control on a real account. Donor settings used to live only
 * in this browser while the real charge ignored them; until the server
 * confirms it honors them (serverCaps.donorSettings) the control still works
 * locally but says so.
 */
function PreviewTag() {
  return (
    <p className="text-xs font-semibold text-warning mt-1" data-testid="preview-note">{PREVIEW_NOTE}</p>
  );
}

function MilestoneToast({ milestone, onClose }) {
  // Auto-dismiss through the same onClose the X uses, so pc_seen_milestone is
  // saved either way and the toast never comes back for this tier.
  useEffect(() => {
    const id = setTimeout(onClose, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      role="status"
      className="absolute left-4 right-4 bg-white rounded-panel p-4 flex items-center gap-3"
      // Z.pageToast, not Z.toast: this is a celebration on the Dashboard, so if
      // the donor has a bottom sheet open it belongs BEHIND the sheet with the
      // rest of the page instead of painting over the sheet's card.
      //
      // Anchored just above the tab bar (BoostToast.TOAST_BOTTOM), not under
      // the header: at the top it painted over the hero's "Total donated"
      // figure on first open, hiding the one number the screen is for until
      // the donor dismissed it. Down here it covers nothing that matters and
      // sits clear of the global avatar button too.
      style={{ bottom: TOAST_BOTTOM, zIndex: Z.pageToast, boxShadow: 'var(--shadow-3)' }}
    >
      <div className="w-11 h-11 rounded-card flex items-center justify-center shrink-0" style={{ background: 'var(--surface)', color: 'var(--navy)' }} aria-hidden="true">
        <milestone.Icon size={24} />
      </div>
      <div className="flex-1">
        <p className="font-bold text-ink text-sm">Milestone Unlocked!</p>
        <p className="text-slate text-[13px]">{milestone.label} donated 🎉</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="w-11 h-11 -mr-2 flex items-center justify-center rounded-input shrink-0"
      >
        <X size={18} className="text-gray-400" />
      </button>
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
 * A SAMPLE match (BGCA's seeded GM example) carries the same tag My Cause uses,
 * so demo mode never passes an example partnership off as a real sponsor.
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
      className="w-full bg-white rounded-card px-4 py-3 card-shadow flex items-center gap-3 text-left min-h-[44px]"
    >
      {m.logoUrl ? (
        <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0"
          style={{ border: '1px solid var(--line)' }}>
          <img src={m.logoUrl} alt={m.companyShort} style={{ height: 22, objectFit: 'contain' }} />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-input flex items-center justify-center shrink-0"
          style={{ background: 'var(--gold-50)' }}>
          <Building2 size={16} style={{ color: 'var(--gold-700)' }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-slate text-[11px] font-semibold uppercase tracking-[0.06em]">Corporate Match</p>
          {m.sample && (
            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700">
              Example partnership - demo
            </span>
          )}
        </div>
        <p className="text-sm text-ink-2 leading-snug mt-0.5">{mp.headline}</p>
      </div>
      <ChevronRight size={18} className="text-gray-400 shrink-0" />
    </motion.button>
  );
}

function AdjustChargeSheet({
  show, onClose, pendingRoundUps, effectiveAmount, chargeAdjustment, setChargeAdjustment,
  setSkipNextCharge, feeMonths, realAcct, showPreviewNote, periodLabel = 'this month',
}) {
  // ONE set of bounds for this control, shared with the charge-review alert.
  // This slider used to start at $1.00 in $0.01 steps while the review alert
  // driving the same `chargeAdjustment` value started at $0 in $0.25 steps, so
  // the two disagreed about what a donor was allowed to choose. The floor is
  // the fixed $5 minimum now: a charge under $5 never runs, so the slider must
  // not offer one. Under the floor there is nothing to adjust - the sheet
  // offers Skip instead, the one control that means "charge me nothing".
  const bounds = adjustBounds(pendingRoundUps);
  // Component is remounted via key when opened, so useState always starts fresh.
  // It opens on the amount that would actually be charged (lib/billing's
  // effectiveCharge - an existing adjustment, else the cap, else the raw
  // round-ups), clamped into the legal range.
  const [value, setValue] = useState(() => Math.min(Math.max(effectiveAmount, bounds.min), Math.max(bounds.max, bounds.min)));

  function handleConfirm() {
    setChargeAdjustment(value);
    onClose();
  }

  function handleSkipInstead() {
    setSkipNextCharge(true);
    onClose();
  }

  const feeLine = realAcct ? appFeePendingLine(feeMonths) : `$1 x ${feeMonths} app fee still applies.`;

  return (
    <Sheet show={show} onClose={onClose} title="Adjust This Month's Charge">
      {/* pt-5 not py-5: Sheet owns the bottom safe-area inset now, and a pb of
          any kind here stacks on top of it. */}
      <div className="px-6 pt-5 space-y-5">
        <p className="text-ink-2 text-sm leading-relaxed">{ADJUST_NOTE}</p>
        {bounds.belowFloor ? (
          <>
            <div className="text-center">
              <p className="text-4xl font-bold text-ink tabular-nums">${fmtMoney(pendingRoundUps)}</p>
              <p className="text-slate text-[13px] mt-1">accrued {periodLabel}</p>
            </div>
            <p className="text-slate text-[13px] leading-relaxed">{ROLL_FORWARD_NOTE}</p>
            <p className="text-slate text-[13px] leading-relaxed">{feeLine}</p>
            <Button variant="secondary" size="md" onClick={handleSkipInstead} data-testid="adjust-skip-instead">
              Skip this month instead
            </Button>
            {showPreviewNote && <PreviewTag />}
          </>
        ) : (
          <>
            <div className="text-center">
              <p className="text-4xl font-bold text-ink tabular-nums">${fmtMoney(value)}</p>
              <p className="text-slate text-[13px] mt-1">of ${fmtMoney(pendingRoundUps)} accrued {periodLabel}</p>
            </div>
            <div className="px-2">
              <input
                type="range"
                aria-label="Charge amount for this month"
                min={bounds.min}
                max={bounds.max}
                step={bounds.step}
                value={value}
                onChange={e => setValue(parseFloat(e.target.value))}
                className="w-full accent-teal-600"
                style={{ minHeight: 44 }}
              />
              <div className="flex justify-between text-xs text-slate mt-1 tabular-nums">
                <span>${fmtMoney(bounds.min)}</span>
                <span>${fmtMoney(bounds.max)}</span>
              </div>
            </div>
            <p className="text-slate text-[13px] leading-relaxed">{feeLine}</p>
            <Button onClick={handleConfirm} data-testid="adjust-confirm">
              Set Charge to ${fmtMoney(value)}
            </Button>
            {showPreviewNote && <PreviewTag />}
            {chargeAdjustment !== null && (
              <Button variant="tertiary" size="md" onClick={() => { setChargeAdjustment(null); onClose(); }}>
                Reset to full amount
              </Button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

export default function Dashboard() {
  const {
    selectedNonprofit, totalDonated, boostDonation, pendingRoundUps, setTab, monthlyCap, chargeAdjustment, setChargeAdjustment, feeMonths, skipNextCharge, setSkipNextCharge, coverProcessing,
    hasRealBankLinked, realRoundupsRecent, realRoundupsFreshness, realRoundupsCount, hasAccount,
    demoActive, demoMode, demoData,
    giveExtraPending, refreshRealRoundups, setPendingSettingsAction,
    // Server-side truth for a real account (state-core). Read defensively:
    // every one of these may be undefined until that layer is merged or the
    // server has answered, and the local math below is the fallback.
    realProjection, serverCaps, realRoundupsLifetimeCount,
  } = useApp();
  // Demo-dataset stats - byte-identical to the old data/derived constants.
  const { monthsGiving, momChange, totalRoundupsCount, avgPerMonth, sinceLabel } = demoData;
  const brand = useTheme();
  const [seenMilestoneAmount, setSeenMilestoneAmount] = useState(() => loadKey('pc_seen_milestone', 0));
  const [showBoost, setShowBoost] = useState(false);
  const [showSponsorSheet, setShowSponsorSheet] = useState(false);
  const [boostToast, setBoostToast] = useState(null);
  const [showAdjustCharge, setShowAdjustCharge] = useState(false);
  const toastTimerRef = useRef(null);

  // A real account on real data. Demo mode (toggle or shake) keeps the full
  // itemized demo story; everything server-truth below is gated on this.
  const realAcct = !!hasAccount && !demoMode;
  // Skip / Cap / Adjust / Cover only reach the real charge once the server
  // says it honors them. Until then the controls work locally and say so.
  const showPreviewNote = realAcct && !serverCaps?.donorSettings;

  const milestones = getMilestonesUpTo(totalDonated);
  const nextMilestone = milestones.find(m => !m.achieved);
  const latestAchieved = [...milestones].filter(m => m.achieved).pop();
  const progressToNext = nextMilestone
    ? Math.min((totalDonated / nextMilestone.amount) * 100, 100)
    : 100;
  // Raised only once the splash and the hero's entrance are out of the way
  // (TOAST_RAISE_DELAY_MS); the timer is per mount, so a tab hop back to Home
  // repeats the short wait rather than flashing the toast mid-transition.
  const [toastReady, setToastReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setToastReady(true), TOAST_RAISE_DELAY_MS);
    return () => clearTimeout(id);
  }, []);
  const shouldShowMilestone = toastReady && latestAchieved && latestAchieved.amount > seenMilestoneAmount;

  // Billing schedule (Blake, 2026-07-06): the month's round-ups LOCK on the
  // 1st (exact amount emailed) and the charge runs on the 11th  -  10 full
  // days' review notice (classic Reg E timing), so donors are never surprised.
  // Every date comes from lib/billing so this card, Settings and the review
  // alert can never disagree.
  //
  // For a REAL account the charge the donor is heading toward respects when
  // they joined: a Nov 7 signup cannot be in the Nov 11 charge (October's
  // cycle locked on Nov 1, before they existed), so their first eligible
  // charge is Dec 11. Demo keeps the plain upcoming-charge view.
  const now = new Date();
  const upcoming = nextChargeDate(now);
  const chargeDate = realAcct ? firstEligibleChargeDate(hasAccount?.joinedAt, now) : upcoming;
  const firstPartialWindow = realAcct && chargeDate.getTime() !== upcoming.getTime();
  const chargeDateLabel = shortDate(chargeDate);
  // Days until the charge actually runs - NOT days until the end of the
  // calendar month. Those two differ by 10 days and the number sitting next to
  // "Next charge: <date>" has to mean that date. Never negative.
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.max(0, Math.round((chargeDate - today0) / 86400000));
  // Progress through the cycle, measured from the 1st of the month the charge
  // covers (round-ups accrue from the 1st, lock on the next 1st, charge on the
  // 11th) - not from the previous charge day, which built an 11th-to-11th
  // cycle that does not exist in this model.
  const cycleStart = new Date(chargeDate.getFullYear(), chargeDate.getMonth() - 1, LOCK_DAY);
  const cycleSpan = Math.max(1, chargeDate - cycleStart);
  const cyclePct = Math.max(0, Math.min(100, ((today0 - cycleStart) / cycleSpan) * 100));

  // The $1 app fee is part of the model but is NOT collected by the server yet
  // (billing.APP_FEE_LIVE). A real account's total therefore leaves it out and
  // shows it as a pending line underneath; demo keeps the full itemization.
  const includeFee = APP_FEE_LIVE || !realAcct;

  // Days 1 to 11 (the same local-calendar test as the web portal's cycleView,
  // so on the 11th itself the amount running today still reads as locked):
  // the upcoming charge is LAST month's locked cycle, and this card has to
  // tell that story, not this month's accrual dressed up as last month's.
  //   - Real account: the figure the server locked on the 1st, when state-core
  //     has handed it over (roundups-me only ever returns the CURRENT month's
  //     accrual). Without it the card falls back to today's accrual, as before.
  //   - Demo: the demo dataset's last completed month, exactly as the web's
  //     EstimateCard reads it, so the two surfaces describe the same month the
  //     same way ("October's charge · Nov 11 ... One charge from BGCA $14.47").
  const lockedMode = now.getDate() <= CHARGE_DAY && !firstPartialWindow;
  const locked = (() => {
    if (!lockedMode) return null;
    if (realAcct) {
      const lc = realProjection?.lockedCycle;
      if (!lc) return null;
      const amount = (lc.adjustedTotalCents ?? lc.totalCents ?? 0) / 100;
      return { roundUps: amount, fee: 0, total: amount, rolled: lc.status === 'rolled_forward' };
    }
    const series = demoData.monthlyData ?? [];
    const prev = series[series.length - 2];
    if (!prev) return null;
    const fee = includeFee ? 1 : 0;
    const total = parseFloat((prev.donated + fee).toFixed(2));
    return { roundUps: prev.donated, fee, total, rolled: isBelowFloor(total) };
  })();
  const lockedRolled = !!locked && locked.rolled;
  const lockedMonth = roundUpMonthName(now);
  const lockLabel = shortDate(new Date(chargeDate.getFullYear(), chargeDate.getMonth(), LOCK_DAY));
  const accruingMonth = currentMonthName(now);
  const nextLockLabel = shortDate(new Date(now.getFullYear(), now.getMonth() + 1, LOCK_DAY));

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
  // The $5 floor is tested on what the server tests: round-ups after cap or
  // adjustment PLUS any Give Extra pledge joining the same charge. The server's
  // own verdict wins when it has one (it also knows about rolled-in balances).
  // A skipped cycle collects nothing, so the below-minimum rollover story (and
  // the cap / adjustment notes, and the "adjust this charge" affordance) must
  // never show alongside it - there is no charge left to roll over or adjust.
  const belowMinimum = !skipNextCharge && (
    realAcct && typeof realProjection?.willRollForward === 'boolean'
      ? realProjection.willRollForward
      : isBelowFloor(chargeAmount + giveExtraPending)
  );
  const localDue = chargeTotal({ pendingRoundUps, monthlyCap, chargeAdjustment, feeMonths, processingCover, extras: giveExtraPending, includeFee });
  const chargeDue = realAcct && Number.isFinite(realProjection?.projectedTotalCents)
    ? realProjection.projectedTotalCents / 100
    : localDue;
  const feeLabel = feeMonths === 1 ? '$1 app fee' : `$1 x ${feeMonths} app fee`;
  const extraLabel = giveExtraPending > 0 ? ` + $${fmtMoney(giveExtraPending)} extra gift` : '';
  // Shown only when the donor actually has the cover on. An always-visible
  // "+ $0.00 processing cover" term is noise, and the itemisation still adds up
  // without it because `processingCover` is 0 in that case.
  const coverLabel = processingCover > 0 ? ` + $${fmtMoney(processingCover)} processing cover` : '';
  const itemization = `$${fmtMoney(chargeAmount)}${extraLabel}${includeFee ? ` + ${feeLabel}` : ''}${coverLabel} · $${fmtMoney(chargeDue)} pending`;
  // A real account that has not linked a bank yet has nothing accruing, so the
  // rollover and fee lines would describe money that does not exist.
  const needsBank = realAcct && !hasRealBankLinked;

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

  // Same real pledge path as MyCause's handleRealGiveExtra (see the note
  // there for why this never calls boostDonation). Identity is the session
  // JWT only - with no session submitGiveExtra resolves
  // { ok:false, reason:'no-session', error:'Sign in to add a real gift.' }
  // and the sheet shows that sentence; nothing is recorded.
  async function handleRealGiveExtra(amount) {
    const res = await submitGiveExtra({
      amountCents: Math.round(amount * 100),
      orgCode: selectedNonprofit?.shortName,
    });
    if (res?.ok) refreshRealRoundups();
    return res;
  }

  function openLinkBank() {
    // The bank-link flow lives on Settings ("Track a different card"). The
    // pending action lets Settings open that sheet directly on arrival.
    setPendingSettingsAction('link-bank');
    setTab('settings');
  }

  // "How billing works" is a Settings popup; the pending action asks Settings
  // to open it on arrival (and lands the donor on its row either way).
  function openBillingHelp() {
    setPendingSettingsAction('how-billing');
    setTab('settings');
  }

  const match = selectedNonprofit.corporateMatch;
  // BGCA's seed carries a SAMPLE match so the demo has something to show. A
  // real account with $0 donated must never see a sponsor claim about a
  // partnership that does not exist (lib/donorContent.isMatchVisible).
  const matchVisible = isMatchVisible(match, demoActive);

  // What "Adjust this charge" acts on, the web EstimateCard's canAdjust rule:
  // the LOCKED amount during the review window (nothing to adjust when it
  // rolled forward), the accruing total otherwise (nothing under the floor).
  const canAdjust = locked ? !lockedRolled : !belowMinimum;
  const adjustBase = locked ? locked.roundUps : pendingRoundUps;
  const adjustEffective = locked
    ? effectiveCharge({ pendingRoundUps: locked.roundUps, monthlyCap, chargeAdjustment })
    : chargeAmount;

  const captionLine = skipNextCharge
    ? 'Next charge: Skipped'
    : firstPartialWindow
      ? `First charge: ${chargeDateLabel} (if $${MONTHLY_FLOOR}+)`
      : locked
        ? `${lockedMonth}'s charge · ${chargeDateLabel}`
        : `Next charge: ${chargeDateLabel}`;

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
        demoActive={demoActive}
        onSubmitReal={handleRealGiveExtra}
      />

      {/* Corp Match hero button - only rendered when NO match is showing, so the
          only sheet Home needs is Become a Sponsor. A visible match is a compact
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
          {/* Greeting name comes from greetingNameFor: a stored real name
              (server display_name / SSO), NEVER the email local part - an
              Apple relay address must not greet anyone as "safjbdwkfbd"
              (item 7c). No name yet -> greet without one. The demo visitor
              (no account) keeps a friendly generic greeting too. */}
          <p className="text-white/70 text-sm font-medium">
            {getGreeting()}{(() => { const n = hasAccount ? greetingNameFor(hasAccount) : DEMO_USER.name; return n ? `, ${n}` : ''; })()} 👋
          </p>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-white text-2xl font-bold" style={{ letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              {brand.appName}
            </h1>
            {/* The one demo marker on this screen (Settings toggle / phone shake). */}
            {demoMode && (
              <span data-testid="demo-mode-pill" className="text-[11px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-pill bg-amber-300/90 text-amber-900">
                Demo
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* pb-28 (112px) cleared the tab bar before it consumed --pc-safe-bottom.
          The tab bar now grows with the home-indicator inset, so the scroll
          padding has to grow with it or the last card hides behind it. */}
      <div
        className="flex-1 scrollable pc-scrollbar px-4 space-y-4 pt-4"
        style={{ paddingBottom: safeBottomAtLeast(112, 106) }}
      >

        {/* One-time name capture for accounts without a stored display name
            (item 7c) - renders null for everyone else. */}
        <NamePromptCard variant="app" />

        {/* Hero donation card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-panel p-6 text-white overflow-hidden relative pc-on-dark"
          style={{ background: brand.gradient }}
        >
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-black/10 translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.06em]">Total Donated</p>
            <div className="mt-1">
              <span className="text-5xl font-bold tabular-nums" style={{ lineHeight: 1.2 }}>${fmtMoney(totalDonated)}</span>
            </div>
            {/* Subtitle derived from MONTHLY_DATA range  -  never hardcoded.
                A REAL account with no charge history yet reads an honest,
                positively-framed "Your first month" instead of the demo
                total's history - see AppContext's totalDonated initializer -
                and skips the streak badge, which would otherwise read as a
                fake multi-month streak on a brand-new account. Demo mode
                keeps the streak; the header DEMO pill already labels it. */}
            {!demoActive ? (
              <p className="text-white/70 text-sm mt-2">{FIRST_MONTH_LABEL} · All time</p>
            ) : (
              <>
                <p className="text-white/70 text-sm mt-2">{sinceLabel} · All time</p>
                <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 rounded-pill px-3 py-1">
                  <Flame size={13} className="text-amber-300" />
                  <span className="text-white/90 text-xs font-semibold">{monthsGiving}-month giving streak</span>
                </div>
              </>
            )}
            <div className="mt-5 pt-4 border-t border-white/20 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                <OrgLogo nonprofit={selectedNonprofit} size={8} rounded="full" className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm leading-snug">{selectedNonprofit.name}</p>
                  <p className="text-white/70 text-xs">Your chosen cause</p>
                </div>
              </div>
              {/* Each button is a 44px hit area (py-1.5 + the 32px chip) with
                  negative margins so the chips keep their compact visual size
                  and the column stays as tall as before. */}
              <div className="flex flex-col gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBoost(true)}
                  className="-my-1.5 py-1.5 flex items-center"
                  aria-label="Give extra"
                >
                  <span className="bg-white/20 hover:bg-white/30 rounded-input px-3 h-8 text-white text-[13px] font-semibold flex items-center gap-1">
                    <Plus size={14} /> Give Extra
                  </span>
                </button>
                {/* Corp Match: demo only, and only when no match is showing -
                    an invitation to bring one in, for an org whose demo has no
                    sample match. A real account never sees it here: the web
                    hero has no such chip, a brand-new donor has nothing behind
                    it, and "Become a Match Sponsor" already lives on My Cause
                    with the other involvement actions. While a match IS visible
                    the compact match line below carries it. */}
                {demoActive && !matchVisible && (
                  <button
                    type="button"
                    onClick={() => setShowSponsorSheet(true)}
                    className="-my-1.5 py-1.5 flex items-center"
                    aria-label="Become a corporate match sponsor"
                  >
                    <span className="bg-white/20 hover:bg-white/30 rounded-input px-3 h-8 text-white text-[13px] font-semibold flex items-center gap-1">
                      <Building2 size={14} /> Corp Match
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Corporate match: one compact line into My Cause */}
        {matchVisible && <MatchLine m={match} onOpen={() => setTab('mycause')} />}

        {/* Stats row  -  all values computed from real data via derived.js */}
        <div className="flex gap-3">
          {[
            {
              icon: <Zap size={18} />,
              label: 'Pending',
              // Round-ups accrued this month PLUS any real "Give Extra"
              // pledges still pending (they join the same monthly charge -
              // giveExtraPending is 0 while demoActive, so the demo figure is
              // untouched). The sub names the pledge portion when there is
              // one so the bump is explained, not mysterious.
              value: `$${fmtMoney(pendingRoundUps + giveExtraPending)}`,
              // Accrual figure, so the raw round-ups are the honest number here -
              // but on a skipped cycle "This month" would read as "coming out this
              // month", which is exactly what is NOT happening. For a donor with a
              // real linked bank, "This month" becomes the freshness caption
              // (computed once on response arrival, not a ticking clock - see
              // fmtFreshness) so the figure reads as live, not a static demo number.
              sub: skipNextCharge
                ? SKIP_TILE_SUB
                : giveExtraPending > 0
                  ? `Incl. $${fmtMoney(giveExtraPending)} extra gift`
                  : (hasRealBankLinked ? realRoundupsFreshness : 'This month'),
              textColor: GREEN,
            },
            // Average + count bind to REAL account data for a real account
            // (item 12): a fresh account has no completed months, so there is
            // no average to fake - it reads a dash - and the round-up count is
            // the server's real figure (0 until the card starts purchasing).
            // The rich fake numbers only appear while demoActive. Green and red
            // are reserved for the demo month-over-month delta; a plain caption
            // is gray.
            {
              icon: <TrendingUp size={18} />,
              label: 'Avg/mo',
              value: demoActive ? `$${fmtMoney(avgPerMonth)}` : '--',
              sub: demoActive ? momDisplay : 'No data yet',
              textColor: demoActive
                ? (momChange !== null && momChange < 0 ? 'var(--danger)' : GREEN)
                : 'var(--slate)',
            },
            // The server's count covers the CURRENT cycle only, so that is
            // what the figure is called. A lifetime count appears only when
            // the server actually provides one (realRoundupsLifetimeCount).
            {
              icon: <Heart size={18} />,
              label: 'Round-ups',
              value: demoActive ? String(totalRoundupsCount) : String(realRoundupsCount),
              sub: demoActive
                ? 'All time (est.)'
                : Number.isFinite(realRoundupsLifetimeCount)
                  ? `This cycle · ${realRoundupsLifetimeCount} since you joined`
                  : 'This cycle',
              textColor: 'var(--slate)',
            },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="bg-white rounded-card p-4 flex-1 card-shadow min-w-0">
              <div className="w-9 h-9 rounded-input flex items-center justify-center mb-3"
                style={{ background: `${brand.primary}14` }}>
                <span style={{ color: brand.primary }}>{s.icon}</span>
              </div>
              <div className="text-2xl font-bold text-ink leading-none tabular-nums">{s.value}</div>
              <div className="text-xs text-slate mt-1.5 font-medium">{s.label}</div>
              <div className="text-xs mt-1 font-semibold" style={{ color: s.textColor }}>{s.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* Monthly Charge card  -  shows rollover state when pending is below the monthly minimum */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-card p-4 card-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <p className="font-bold text-ink text-sm">
                Monthly Charge to {selectedNonprofit.shortName}
              </p>
              {/* On a skipped cycle this caption is a STATE WORD, not a claim.
                  It shares a tight flex row with the day counter, so the sentence
                  that carries the "only charged in the months you give" framing
                  cannot live here - and the framing must never appear without the
                  "$1 app fee is not waived" sentence beside it. Both live in the
                  full-width skipExplainer paragraph below, together.
                  During the review window with a locked cycle in hand, the
                  caption names the month that locked (October's charge · Nov 11)
                  so the figure below cannot be mistaken for this month's accrual. */}
              <p className="text-slate text-[13px] mt-0.5" data-testid="skip-status-line">
                {captionLine}
              </p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="font-bold text-2xl tabular-nums" style={{ color: 'var(--navy)' }}>{daysLeft}</p>
              {/* The countdown measures the CYCLE, and on a skipped cycle its end
                  is not a charge - saying "days left" next to "nothing is
                  collected" would read as a countdown to money leaving. */}
              <p className="text-slate text-xs">{skipNextCharge ? 'days left in cycle' : 'days left'}</p>
            </div>
          </div>
          <div className="h-2 rounded-pill overflow-hidden" style={{ background: 'var(--line)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${cyclePct}%` }}
              transition={{ duration: 1, delay: 0.4 }}
              className="h-full rounded-pill"
              style={{ background: brand.gradient }}
            />
          </div>
          {/* The bar's two end labels get their own row, and the itemisation sits
              on a full-width line below it. It used to be the middle child of a
              three-way justify-between, which left it about 200px: enough for
              "round-ups + fee · total", not enough once the processing cover
              became a third term. */}
          <div className="flex justify-between mt-1.5">
            <p className="text-slate text-xs">{shortDate(cycleStart)}</p>
            {/* On a skipped cycle the right-hand end of the bar is not a charge day. */}
            <p className="text-slate text-xs">{skipNextCharge ? 'Skipped' : 'Charge day'}</p>
          </div>
          {skipNextCharge ? (
            /* The figure a skipped donor sees for the upcoming charge: zero.
               It used to print the full "$13.89 + $1 app fee · $14.89 pending"
               immediately under copy saying the charge was skipped. */
            <p className="text-[13px] font-semibold text-warning mt-1.5" data-testid="skip-collect-line">
              {SKIP_COLLECT_LABEL}: {SKIP_COLLECT_AMOUNT}
            </p>
          ) : needsBank ? (
            /* A real account with no bank linked has nothing accruing - the
               rollover and fee lines would describe money that does not exist. */
            <div className="mt-3" data-testid="link-bank-prompt">
              <p className="text-[13px] text-slate leading-relaxed">Link your bank to start rounding up.</p>
              <div className="mt-2">
                <Button variant="secondary" size="md" fullWidth={false} onClick={openLinkBank}>
                  <Landmark size={16} /> Link a bank
                </Button>
              </div>
            </div>
          ) : locked ? (
            /* Days 1 to 11 with a locked cycle in hand: the amount that locked
               on the 1st (server figure for a real account, the demo dataset's
               completed month in demo), itemized the way the web's EstimateCard
               itemizes it - never this month's accrual dressed up as last
               month's. */
            <div className="mt-3 pt-2 border-t border-line" data-testid="locked-itemization">
              {lockedRolled ? (
                <>
                  <div className="flex items-center justify-between gap-3 py-1 text-sm">
                    <span className="font-bold text-ink" data-testid="locked-rolled-line">Nothing to charge this time</span>
                    <span className="text-slate font-semibold tabular-nums">$0.00</span>
                  </div>
                  <p className="text-[13px] text-slate mt-1 leading-relaxed" data-testid="rollover-note">
                    {locked.total > 0
                      ? `${lockedMonth}'s $${fmtMoney(locked.total)} was under $${MONTHLY_FLOOR}, so it rolls forward. ${ROLL_FORWARD_NOTE}`
                      : ROLL_FORWARD_NOTE}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 py-1 text-sm">
                    <span className="text-slate">{lockedMonth} round-ups, locked {lockLabel}</span>
                    <span className="font-semibold text-ink tabular-nums shrink-0" data-testid="locked-roundups">${fmtMoney(locked.roundUps)}</span>
                  </div>
                  {locked.fee > 0 && (
                    <div className="flex items-center justify-between gap-3 py-1 text-sm">
                      <span className="text-slate">{feeLabel}</span>
                      <span className="text-slate tabular-nums shrink-0">+${fmtMoney(locked.fee)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-line text-sm">
                    <span className="font-bold text-ink">One charge from {selectedNonprofit.shortName}</span>
                    <span className="font-bold text-lg tabular-nums shrink-0" style={{ color: 'var(--navy)' }} data-testid="locked-total">${fmtMoney(locked.total)}</span>
                  </div>
                </>
              )}
            </div>
          ) : belowMinimum ? (
            /* The normal under-$5 state is not a warning: plain helper text,
               amount in ink. Amber is kept for skip, cap and failed states. */
            <p className="text-[13px] text-slate mt-1.5" data-testid="rollover-line">
              <span className="font-semibold text-ink tabular-nums">${fmtMoney(chargeAmount + giveExtraPending)}</span> so far - rolls over at month-end
            </p>
          ) : (
            <p className="text-[13px] font-semibold mt-1.5 tabular-nums" style={{ color: GREEN }} data-testid="charge-itemization">
              {itemization}
            </p>
          )}
          {/* Review window: this month keeps accruing toward the charge after
              this one, so it gets its own line instead of being folded into
              the locked figure. */}
          {locked && (
            <p className="text-[13px] text-slate mt-3 pt-3 border-t border-line leading-relaxed" data-testid="accruing-line">
              {accruingMonth} so far: <span className="font-semibold text-ink tabular-nums">${fmtMoney(pendingRoundUps + giveExtraPending)}</span> - locks {nextLockLabel}, charged {chargeAfterNextLabel(now)}.
            </p>
          )}
          {/* The $1 app fee is not collected yet: for a real account it sits
              outside the total, as its own line, until APP_FEE_LIVE. */}
          {!skipNextCharge && !needsBank && realAcct && !APP_FEE_LIVE && !lockedRolled && (
            <p className="text-slate text-[13px] mt-1 leading-relaxed" data-testid="fee-pending-line">
              {appFeePendingLine(feeMonths)}
            </p>
          )}
          {/* Says where the extra money lands. The cover is a donation to the
              nonprofit, not a PocketCache charge, and the donor pre-agreed to it
              at signup - so the one place the total names it should also say so. */}
          {!skipNextCharge && !needsBank && !locked && !belowMinimum && processingCover > 0 && (
            <p className="text-slate text-[13px] mt-1 leading-relaxed" data-testid="charge-cover-note">
              The ${fmtMoney(processingCover)} processing cover goes to {selectedNonprofit.shortName}, not to PocketCache, so 100% of your round-ups reach them. Change it in Settings.
            </p>
          )}
          {skipNextCharge && (
            <p className="text-warning text-[13px] mt-2 leading-relaxed" data-testid="skip-detail">
              {skipExplainer({ pendingRoundUps, feeMonths })}
            </p>
          )}
          {!needsBank && !locked && belowMinimum && (
            <p className="text-slate text-[13px] mt-2 leading-relaxed" data-testid="rollover-note">
              {ROLL_FORWARD_NOTE}
              {/* The fee rolls with a below-floor balance too. Demo tells the
                  itemized story; a real account sees the not-yet-collected line
                  above instead of a second fee sentence. */}
              {!realAcct && ` $1/month fee rolls too - ${feeMonths} month${feeMonths !== 1 ? 's' : ''} so far ($${feeMonths}) - itemized on your charge.`}
            </p>
          )}
          {!skipNextCharge && !needsBank && !locked && !belowMinimum && capActive && chargeAdjustment === null && (
            <p className="text-warning text-[13px] mt-2 leading-relaxed">
              Capped at ${fmtMoney(monthlyCap)} - the rest won&apos;t be charged.
            </p>
          )}
          {!skipNextCharge && !needsBank && !locked && !belowMinimum && chargeAdjustment !== null && (
            <p className="text-[13px] mt-2 font-medium" style={{ color: GREEN }}>
              Adjusted to ${fmtMoney(chargeAdjustment)} for this month.
            </p>
          )}
          {/* Nothing to adjust on a skipped cycle - the web portal hides this
              button on `!skipped` too, and the app used to offer it. 44px hit
              areas with a negative margin so the card keeps its height. The
              "How billing works" link stands in for the long explainer this
              card used to carry; the full text lives in Settings. */}
          {!skipNextCharge && !needsBank && (
            <>
              <div className="flex items-center justify-between gap-3 mt-1 -mb-2">
                {canAdjust ? (
                  <button
                    type="button"
                    onClick={() => setShowAdjustCharge(true)}
                    className="text-[13px] min-h-[44px] font-semibold underline-offset-2 underline flex items-center"
                    style={{ color: brand.primary }}
                  >
                    Adjust this charge →
                  </button>
                ) : <span />}
                <button
                  type="button"
                  onClick={openBillingHelp}
                  className="text-[13px] min-h-[44px] font-semibold text-slate flex items-center"
                  data-testid="how-billing-link"
                >
                  How billing works
                </button>
              </div>
              {showPreviewNote && canAdjust && <div className="mt-2"><PreviewTag /></div>}
            </>
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
            className="bg-white rounded-card p-4 card-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-ink text-base">Recent round-ups</h3>
              <span className="text-xs text-slate">{realRoundupsFreshness}</span>
            </div>
            <div>
              {realRoundupsRecent.slice(0, 5).map((r, i) => (
                <div key={`${r.date}-${i}`} className={`flex items-center justify-between py-2 ${i > 0 ? 'border-t border-line' : ''}`}>
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-medium text-ink truncate">{r.merchant || 'Purchase'}</p>
                    <p className="text-xs text-slate">{r.date}</p>
                  </div>
                  <p className="text-sm font-bold shrink-0 tabular-nums" style={{ color: GREEN }}>
                    +${fmtMoney(r.roundup_cents / 100)}
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
          className="bg-white rounded-card p-4 card-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            {/* Badges below are driven by totalDonated, which while demoActive
                is the fake demo total. The header DEMO pill already says so;
                a second "Demo data" pill here was the same label twice. */}
            <h3 className="font-bold text-ink text-base">Milestones</h3>
            {nextMilestone && (
              <span className="text-xs text-slate tabular-nums">${fmtMoney(nextMilestone.amount - totalDonated)} to next</span>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto scrollable pb-1">
            {milestones.map((m) => (
              <div key={m.amount} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`w-12 h-12 rounded-card flex items-center justify-center transition-all ${
                  m.achieved ? '' : 'opacity-45'
                }`}
                  style={{ background: m.achieved ? brand.gradient : 'var(--line)', color: m.achieved ? '#fff' : 'var(--slate)', boxShadow: m.achieved ? 'var(--shadow-1)' : 'none' }}
                  aria-hidden="true">
                  <m.Icon size={22} />
                </div>
                <p className="text-xs text-slate font-medium whitespace-nowrap">{m.label}</p>
              </div>
            ))}
          </div>
          {nextMilestone && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate mb-1 tabular-nums">
                <span>${fmtMoney(totalDonated)}</span>
                <span>${fmtMoneyWhole(nextMilestone.amount)}</span>
              </div>
              <div className="h-1.5 rounded-pill" style={{ background: 'var(--line)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressToNext}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-full rounded-pill"
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
        pendingRoundUps={adjustBase}
        effectiveAmount={adjustEffective}
        chargeAdjustment={chargeAdjustment}
        periodLabel={locked ? `in ${lockedMonth}` : 'this month'}
        setChargeAdjustment={setChargeAdjustment}
        setSkipNextCharge={setSkipNextCharge}
        feeMonths={feeMonths}
        realAcct={realAcct}
        showPreviewNote={showPreviewNote}
      />
    </div>
  );
}
