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

import { MONTHLY_DATA } from '../data/transactions';

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
  const last = MONTHLY_DATA.length - 1;
  return MONTHLY_DATA.map((m, i) => (i === last ? { ...m, donated: pendingRoundUps } : m));
}

/**
 * Completed months only - the in-progress month is excluded, because it has not
 * been charged yet and would understate a partial month as a decline.
 * @param {number} pendingRoundUps
 */
export function completedMonths(pendingRoundUps) {
  return monthlyHistory(pendingRoundUps).slice(0, -1);
}

/**
 * Total charged within a given calendar year, for the tax-year summary on the
 * Activity tab. Only COMPLETED months count: the in-progress month has not been
 * charged, so including it would overstate what a donor could substantiate.
 * @param {number} pendingRoundUps
 * @param {number} [year] - defaults to the current calendar year.
 * @returns {{ donated: number, months: number, feeMonths: number }}
 */
export function taxYearSummary(pendingRoundUps, year = new Date().getFullYear()) {
  const rows = completedMonths(pendingRoundUps).filter(m => m.year === year);
  const donated = parseFloat(rows.reduce((s, m) => s + m.donated, 0).toFixed(2));
  return { donated, months: rows.length, feeMonths: rows.length };
}

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
    `Months under $${minimum} are not charged; the balance carries forward and settles within three months at most.`,
    `Your round-ups are tax-deductible. The $1 app fee is not.`,
  ];
}
