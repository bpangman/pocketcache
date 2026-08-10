/**
 * Shared donor-facing derivations and copy.
 *
 * WHY THIS FILE EXISTS
 * An audit found the same facts computed and worded in several files at once,
 * and two of them genuinely disagreed with each other:
 *
 *   - The corporate-match percentage was recomputed in three files
 *     (Dashboard, MatchBadge, MatchDetailsSheet).
 *   - `impactTier()` was a verbatim duplicate in MyCause.jsx and
 *     WebPortalPages.jsx.
 *   - The monthly chart plotted the CURRENT month un-multiplied while the
 *     headline figure beside it was multiplied, so at 2x a donor saw
 *     "Pending $9.26" directly above a $4.63 bar for the same month.
 *
 * Anything a donor reads on more than one screen belongs here so the two
 * surfaces (iPhone app and web portal) cannot drift.
 */

import { MONTHLY_DATA, TRANSACTIONS, CURRENT_MONTH_PENDING, PRIOR_MONTHS_SUM } from '../data/transactions';
import { MAX_FEE_MONTHS, chargeAfterNextLabel, nextChargeLabel } from './billing';
import { fmtMoney } from './format';

// ─── The demo dataset ────────────────────────────────────────────────────────
//
// Demo is a simple ON/OFF again (round-4 item 2b - the round-3 progressive
// levels 1 and 2 are gone by owner request). Shaking the phone, or the
// Settings toggle, flips between the donor's real data and THE full rich
// demo dataset: the original one, src/data/transactions.js untouched. A
// visitor with no real account always gets this dataset too - that is the
// prototype experience. Screens label demo figures with a small "Demo" pill
// whenever demo mode is on.
//
// Everything below is derived from the exact arrays data/transactions.js
// exports, so the demo experience is byte-identical to the historical one.

const priorMonthDonations = MONTHLY_DATA.slice(0, -1).map(m => m.donated);
const completedDemoMonths = MONTHLY_DATA.slice(0, -1);

export const DEMO_DATASET = {
  transactions: TRANSACTIONS,
  monthlyData: MONTHLY_DATA,
  currentMonthPending: CURRENT_MONTH_PENDING,
  priorMonthsSum: PRIOR_MONTHS_SUM,
  monthsGiving: MONTHLY_DATA.length,
  avgPerMonth: completedDemoMonths.length > 0
    ? parseFloat((priorMonthDonations.reduce((s, d) => s + d, 0) / completedDemoMonths.length).toFixed(2))
    : 0,
  momChange: completedDemoMonths.length >= 2 && completedDemoMonths[completedDemoMonths.length - 2].donated > 0
    ? parseFloat(((completedDemoMonths[completedDemoMonths.length - 1].donated - completedDemoMonths[completedDemoMonths.length - 2].donated)
      / completedDemoMonths[completedDemoMonths.length - 2].donated * 100).toFixed(1))
    : null,
  totalRoundupsCount: Math.round(TRANSACTIONS.length * MONTHLY_DATA.length),
  sinceLabel: `Since ${MONTHLY_DATA[0].month} ${MONTHLY_DATA[0].year}`,
};

/** Toast copy for the shake gesture - one line per direction of the flip. */
export const DEMO_TOASTS = {
  on: 'Demo on - full sample history',
  off: 'Demo off - your real data',
};

// ─── Monthly history ─────────────────────────────────────────────────────────

/**
 * MONTHLY_DATA with the in-progress month replaced by the live pending figure.
 *
 * `MONTHLY_DATA`'s last entry is the raw sum of this month's transaction
 * round-ups. The donor's round-up multiplier is applied downstream in
 * AppContext (`pendingRoundUps = BASE_PENDING x multiplier`), so any chart that
 * plots the raw array contradicts every headline that reads `pendingRoundUps`.
 * Always chart through this function.
 *
 * @param {number} pendingRoundUps - live multiplied pending total.
 * @returns {Array<{month:string,year:number,monthIndex:number,donated:number}>}
 */
export function monthlyHistory(pendingRoundUps) {
  return monthlyHistoryFor(MONTHLY_DATA, pendingRoundUps);
}

/**
 * Same substitution against an explicit month series - the demo-level
 * datasets above carry their own (shorter) MONTHLY_DATA-shaped arrays, and
 * charts must plot whichever one is active.
 * @param {Array} monthlyData - MONTHLY_DATA-shaped series, last entry = current month.
 * @param {number} pendingRoundUps - live multiplied pending total.
 */
export function monthlyHistoryFor(monthlyData, pendingRoundUps) {
  const last = monthlyData.length - 1;
  return monthlyData.map((m, i) => (i === last ? { ...m, donated: pendingRoundUps } : m));
}

/**
 * Completed months only - the in-progress month is excluded, because it has not
 * been charged yet and would understate a partial month as a decline.
 * @param {number} pendingRoundUps
 */
export function completedMonths(pendingRoundUps, monthlyData = MONTHLY_DATA) {
  return monthlyHistoryFor(monthlyData, pendingRoundUps).slice(0, -1);
}

/**
 * Total charged within a given calendar year, for the tax-year summary on the
 * Activity tab. Only COMPLETED months count: the in-progress month has not been
 * charged, so including it would overstate what a donor could substantiate.
 * @param {number} pendingRoundUps
 * @param {number} [year] - defaults to the current calendar year.
 * @returns {{ donated: number, months: number, feeMonths: number }}
 */
export function taxYearSummary(pendingRoundUps, year = new Date().getFullYear(), monthlyData = MONTHLY_DATA) {
  const rows = completedMonths(pendingRoundUps, monthlyData).filter(m => m.year === year);
  const donated = parseFloat(rows.reduce((s, m) => s + m.donated, 0).toFixed(2));
  return { donated, months: rows.length, feeMonths: rows.length };
}

// ─── Signup review example ───────────────────────────────────────────────────

/**
 * The obviously-sample round-up figure the signup review step illustrates a
 * month with, on BOTH surfaces. A brand-new account has accrued NOTHING, so
 * the review step must never present a number as the donor's own current
 * total - it walks through "here is how a month could look" instead, using
 * this figure and labeling it an example. One constant so the app and the web
 * cannot illustrate two different months.
 */
export const EXAMPLE_MONTH_ROUNDUPS = 12.40;

/** The one-line honesty note under the example - same string on both surfaces. */
export const EXAMPLE_DISCLAIMER = 'Sample numbers, shown as an example only. Your own round-ups start at $0.00 and only count purchases made from today onward.';

// ─── Corporate match ─────────────────────────────────────────────────────────

/**
 * Everything any surface needs to describe an active corporate match.
 * Replaces three separate re-derivations of the same percentage.
 * @param {{company:string,companyShort?:string,matched:number,maxAmount:number}} match
 */
export function matchProgress(match) {
  if (!match) return null;
  const pct = Math.round((match.matched / match.maxAmount) * 100);
  const remaining = match.maxAmount - match.matched;
  const k = n => (n % 1000 === 0 ? `${n / 1000}K` : `${(n / 1000).toFixed(1)}K`);
  return {
    pct,
    remaining,
    matchedLabel: `$${k(match.matched)}`,
    poolLabel: `$${k(match.maxAmount)}`,
    remainingLabel: `$${k(remaining)}`,
    // The one canonical sentence. Previously three different wordings.
    headline: `${match.companyShort ?? match.company} is matching your round-ups this month, up to $${k(match.maxAmount)}.`,
    progressLabel: `${pct}% of match pool used · $${k(remaining)} remaining`,
    impactLinkLabel: `See ${match.companyShort ?? match.company}'s community impact`,
  };
}

// ─── "Your impact" equivalency ───────────────────────────────────────────────

const IMPACT_TIERS = [
  { min: 100, text: 'About $%T% might cover roughly a month of after-school programming for a Club member  -  example equivalency.' },
  { min: 60, text: 'About $%T% might cover approximately 2 weeks of after-school snacks for a Club member  -  example equivalency.' },
  { min: 25, text: 'About $%T% might cover art supplies for a small group project  -  example equivalency.' },
  { min: 0, text: 'Every round-up adds up  -  your giving is already on its way to %ORG%.' },
];

/**
 * The single implementation of the impact equivalency copy. Was duplicated
 * verbatim between MyCause.jsx and WebPortalPages.jsx.
 * @param {number} total - lifetime donated.
 * @param {string} [orgShortName]
 */
export function impactTier(total, orgShortName = 'your cause') {
  const tier = IMPACT_TIERS.find(t => total >= t.min) ?? IMPACT_TIERS[IMPACT_TIERS.length - 1];
  return tier.text.replace('%T%', Math.floor(total)).replace('%ORG%', orgShortName);
}

// ─── Milestones ──────────────────────────────────────────────────────────────

const MILESTONE_EMOJIS = ['🌱', '⭐', '🏆', '💎', '🦸', '🚀', '🌟', '👑', '🎯', '🔮'];

/**
 * The milestone tier at a given index. Tiers step 1x / 2.5x / 5x within each
 * power of ten: $10, $25, $50, $100, $250, $500, $1K...
 *
 * This formula was module-private in Dashboard.jsx while the web portal carried
 * a verbatim copy, which made it the last place the two donor surfaces could
 * silently disagree about what a donor had achieved. Both import it now.
 *
 * @param {number} index - zero-based tier index.
 * @returns {{amount:number,label:string,emoji:string,index:number}}
 */
export function getMilestoneAt(index) {
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

/**
 * Every milestone up to and a little past the donor's lifetime total, each
 * flagged achieved or not, so a surface can show the ladder plus what is next.
 * @param {number} total - lifetime donated.
 */
export function getMilestonesUpTo(total) {
  const result = [];
  for (let i = 0; i <= 50; i++) {
    const m = getMilestoneAt(i);
    result.push({ ...m, achieved: total >= m.amount });
    // Stop once we are past the total AND have five unachieved tiers to show.
    if (m.amount > total && result.filter(x => !x.achieved).length >= 5) break;
  }
  return result;
}

// ─── Charge adjustment bounds ────────────────────────────────────────────────

/**
 * One set of bounds for the "adjust this charge" control.
 *
 * There were two sliders driving the same `chargeAdjustment` value with
 * different rules: the Dashboard sheet allowed $1.00 upward in $0.01 steps
 * while the review alert allowed $0 upward in $0.25 steps. A donor could set
 * $0.00 from one and not the other, and $4.63 from one but only $4.50 from the
 * other. Both now import this.
 *
 * The floor is $0 on purpose: setting this month's round-ups to zero is a
 * legitimate thing to want, and the review alert already allowed it.
 */
export const ADJUST_MIN = 0;
export const ADJUST_STEP = 0.01;

/**
 * @param {number} accrued - this month's accrued round-ups (the ceiling).
 */
export function adjustBounds(accrued) {
  return { min: ADJUST_MIN, max: accrued, step: ADJUST_STEP };
}

// ─── Skipping a month: THE canonical wording ─────────────────────────────────

/**
 * WHAT ACTUALLY HAPPENS WHEN A DONOR SKIPS (lib/billing.js rule 5, and Terms
 * section 7, "Skipping a month"):
 *
 *   - That month's round-ups are NEVER charged. They do not roll over and they
 *     are not collected later. They are gone.
 *   - NOTHING AT ALL is collected on that month's charge date.
 *   - The $1 app fee is NOT waived. It rolls forward and joins the next charge,
 *     which therefore carries $1 x 2 (or more, if the donor skipped twice).
 *
 * THE HONESTY RULE FOR THIS COPY. The house framing is "you're only charged in
 * the months you give". That is true as a statement about TIMING - no money
 * leaves the card in a month you skip - and it is false as a statement about
 * COST, because the skipped month's $1 is deferred, not forgiven. So the
 * framing sentence and the fee-rollover sentence are written as a pair and must
 * be rendered as a pair. Never ship a surface that says a skipped month costs
 * nothing without the fee sentence beside it. `skipSummaryLine()` is the
 * shortest legal pairing; use it rather than rendering `skipStatusLine()` alone.
 *
 * Every donor surface renders these exact strings: the app Dashboard and
 * Settings, the web dashboard, the web portal settings, and the web onboarding
 * preview. They are here, not in a page module, because five hand-typed
 * variants is how the app and the browser ended up telling a donor two
 * different stories about the same $1.
 */

/** Label for the upcoming-charge figure while a skip is in effect. */
export const SKIP_COLLECT_LABEL = 'To be collected';

/** The upcoming-charge figure itself while a skip is in effect. Not a total to
 *  be computed - a skipped cycle collects nothing, so it is always zero. */
export const SKIP_COLLECT_AMOUNT = '$0.00';

/** When the normal lock-on-the-1st / charge-on-the-11th rhythm picks back up.
 *  Says "next month's round-ups" deliberately: this month's are gone, so the
 *  resumed schedule is about money the donor has not rounded up yet. */
export const SKIP_RESUME_LINE = "Normal timing resumes with next month's round-ups  -  exact amount emailed on the 1st, charged on the 11th.";

/** How a donor gets out of the skip. */
export const SKIP_UNDO_LINE = 'Un-skip anytime in Settings.';

/** Sub-label for an accrued round-ups tile while a skip is in effect, so the
 *  accrual figure can never read as money that is about to be collected. */
export const SKIP_TILE_SUB = 'Never charged';

/**
 * The house framing, tied to the charge date it is actually true about.
 *
 * DO NOT RENDER THIS ALONE. On its own it reads as "a skipped month is free",
 * which is not what happens to the $1. Pair it with `skipFeeLine()`, or use
 * `skipSummaryLine()` which does the pairing for you.
 *
 * @param {Date} [now] - injectable clock, same convention as lib/billing.
 * @returns {string} e.g. "You're only charged in the months you give, so nothing is collected on Aug 11."
 */
export function skipStatusLine(now = new Date()) {
  return `You're only charged in the months you give, so nothing is collected on ${nextChargeLabel(now)}.`;
}

/**
 * Sentence stating the accrued round-ups are gone, not deferred.
 * @param {number} pendingRoundUps - round-ups accrued this cycle.
 * @returns {string}
 */
export function skipAccruedLine(pendingRoundUps) {
  return `Your $${fmtMoney(pendingRoundUps)} of round-ups this month is never charged  -  it does not roll over and it will not be collected later.`;
}

/**
 * The other half of the pair: the $1 is deferred, not forgiven. Says "not
 * waived" in as many words, because "rolls forward" alone was being read as a
 * detail rather than as a cost. The multiplier is derived from real state and
 * clamped by MAX_FEE_MONTHS, so two skips in a row honestly read $1 x 3.
 *
 * @param {number} feeMonths - months of $1 fee pending today.
 * @param {Date} [now] - injectable clock.
 * @returns {string}
 */
export function skipFeeLine(feeMonths, now = new Date()) {
  const rolled = Math.min(feeMonths + 1, MAX_FEE_MONTHS);
  return `The $1 app fee is not waived, though: it rolls forward and joins your ${chargeAfterNextLabel(now)} charge as $1 × ${rolled}.`;
}

/**
 * The shortest honest statement of a skip: the timing claim plus the fee fact.
 * This is what belongs in a one-line slot (a "next charge" caption, a KPI
 * sub-label) where the full explainer will not fit.
 * @param {number} feeMonths - months of $1 fee pending today.
 * @param {Date} [now] - injectable clock.
 * @returns {string}
 */
export function skipSummaryLine(feeMonths, now = new Date()) {
  return `${skipStatusLine(now)} ${skipFeeLine(feeMonths, now)}`;
}

/**
 * The full skipped-cycle paragraph, for the estimate card on both dashboards.
 * Identical string on the app and in the browser - that is the whole point of
 * composing it here instead of at each call site.
 * @param {object} o
 * @param {number} o.pendingRoundUps - round-ups accrued this cycle.
 * @param {number} o.feeMonths - months of $1 fee pending today.
 * @param {Date} [o.now] - injectable clock.
 * @returns {string}
 */
export function skipExplainer({ pendingRoundUps, feeMonths, now = new Date() }) {
  return [
    skipStatusLine(now),
    skipAccruedLine(pendingRoundUps),
    skipFeeLine(feeMonths, now),
    SKIP_RESUME_LINE,
    SKIP_UNDO_LINE,
  ].join(' ');
}

/**
 * Sub-label for the "Skip a month" row once a skip is on.
 * @param {object} o
 * @param {string} o.monthName - the month being skipped, e.g. 'July'.
 * @param {number} o.feeMonths - months of $1 fee pending today.
 * @param {Date} [o.now] - injectable clock.
 * @returns {string}
 */
export function skipRowSub({ monthName, feeMonths, now = new Date() }) {
  return `${monthName} skipped. ${skipSummaryLine(feeMonths, now)}`;
}

/**
 * Sub-label for the same row BEFORE a skip is on - the decision point, so the
 * fee caveat has to be here too. "Skip {month}'s charge" on its own was the one
 * place a donor could opt in believing the month was free.
 * @param {string} monthName - the month that would be skipped.
 * @returns {string}
 */
export function skipRowOfferSub(monthName) {
  return `Need a breather? Skip ${monthName}'s round-ups  -  the $1 app fee still rolls forward to your next charge.`;
}

/**
 * The skip confirmation modal, as short paragraphs. Same array on the app sheet
 * and the web modal.
 * @param {object} o
 * @param {string} o.monthName - the month being skipped.
 * @param {number} o.feeMonths - months of $1 fee pending today.
 * @param {Date} [o.now] - injectable clock.
 * @returns {string[]}
 */
export function skipConfirmParagraphs({ monthName, feeMonths, now = new Date() }) {
  return [
    `You're only charged in the months you give, so ${monthName}'s round-ups are simply never charged  -  they don't roll over and they don't come out later.`,
    `Nothing is collected on ${nextChargeLabel(now)}. ${skipFeeLine(feeMonths, now)}`,
    `Changed your mind? Tap Undo on this screen any time before ${nextChargeLabel(now)}.`,
  ];
}

// ─── Canonical billing explainer ─────────────────────────────────────────────

/**
 * THE billing explanation. It previously existed as a 4-sentence banner on the
 * Activity tab AND an 8-sentence block in Settings AND scattered fragments
 * elsewhere, in different wordings - and both long versions referred to "your
 * toggle" for a processing-cover control that exists only inside the Give Extra
 * and Cancel sheets, nowhere the donor could find from those screens.
 *
 * Settings is now the only home for it. Returns an array of short paragraphs so
 * each surface can lay them out in its own style.
 *
 * @param {object} o
 * @param {string} o.orgShort - nonprofit short name.
 * @param {number} o.minimum - the nonprofit's monthly minimum.
 * @param {number} o.chargeDay - day of month the charge runs.
 * @param {number} o.reviewDays - length of the review window in days.
 */
export function billingExplainer({ orgShort, minimum, chargeDay, reviewDays }) {
  const ord = chargeDay === 1 ? '1st' : chargeDay === 11 ? '11th' : `${chargeDay}th`;
  return [
    `Your round-ups add up all month. The exact amount is emailed to you on the 1st and charged on the ${ord}, so you get ${reviewDays} full days to review or adjust it.`,
    `It arrives as one charge from ${orgShort}, on ${orgShort}'s own Stripe account. They are the merchant of record and they issue your receipt.`,
    `A flat $1 app fee is included in that charge. ${orgShort} never pays PocketCache anything, and PocketCache never takes a percentage of your donation.`,
    // The skip paragraph. The timing claim and the fee fact are one paragraph on
    // purpose: split across two, a donor stops reading after the good news.
    `Skip a month and you're only charged in the months you give: nothing at all is collected on that charge date, and that month's round-ups are never collected later. The $1 app fee is not waived, though  -  it rolls forward and joins your next charge.`,
    // The fee rolls over with a below-minimum balance too (Terms section 7).
    // This paragraph used to name only the balance, which read as a free month.
    `Months under $${minimum} are not charged; the balance and the $1 app fee carry forward and settle within three months at most.`,
    `Your round-ups are tax-deductible. The $1 app fee is not.`,
  ];
}
