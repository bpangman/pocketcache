/**
 * src/lib/billing.js - SINGLE SOURCE OF TRUTH for charge dates and charge amounts.
 *
 * The billing model (Blake, 2026-07-06):
 *   1. Round-ups accrue across a calendar month.
 *   2. On the 1st of the following month the amount LOCKS and the donor gets a
 *      10-day review window (days 1 to 10) to review or adjust it.
 *   3. The charge runs on the 11th. That is 10 full days' notice, the classic
 *      Reg E timing.
 *   4. A flat $1/month app fee rides along. `feeMonths` is how many months of
 *      that fee are on the next charge (normally 1).
 *   5. "Skip a month" means that month's round-ups are NEVER charged - they do
 *      not roll over and they never come out later - but the $1 fee DOES roll
 *      over, so the next charge carries $1 x 2.
 *   6. A `monthlyCap` caps the round-up portion, and a `chargeAdjustment` is a
 *      one-time donor-set amount for this month that beats everything else.
 *
 * Because the review window straddles the charge date, "the next charge date"
 * is NOT simply next month's 11th: on July 3rd the upcoming charge is July 11,
 * while on July 12th it is August 11. Getting that wrong in one component and
 * right in another is how the UI ends up contradicting itself, so every caller
 * must use these helpers instead of doing its own date math. Future changes to
 * the schedule or the amount precedence happen HERE and nowhere else.
 *
 * Pure functions only - no React, no localStorage. Every function takes an
 * injectable date so callers (and tests) can pass a fixed "now".
 */

/** Day of the month the charge actually runs. */
export const CHARGE_DAY = 11;

/** Last day of the lock-and-review window (window is days 1 to this, inclusive). */
export const REVIEW_WINDOW_LAST_DAY = 10;

/**
 * Highest number of $1 fee months we will ever stack onto one charge.
 * A donor who leaves the app closed for years should not come back to a
 * surprise 30-month fee bill, and we settle elapsed cycles in one step rather
 * than looping month by month, so the accumulated fee gets clamped here.
 */
export const MAX_FEE_MONTHS = 12;

/**
 * Canonical cycle identifier: the zero-padded calendar month a set of round-ups
 * belongs to. Used as the key for "which month did the donor skip" and "which
 * cycle has the app already settled".
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {string} e.g. '2026-07'
 */
export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * True while the locked amount is under review, i.e. days 1 to 10 inclusive.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {boolean}
 */
export function inReviewWindow(d = new Date()) {
  const day = d.getDate();
  return day >= 1 && day <= REVIEW_WINDOW_LAST_DAY;
}

/**
 * The date of the charge the donor is currently looking forward to.
 * Up to and including the 11th that is THIS month's 11th - during the review
 * window the charge has not run yet, and on the 11th itself it runs TODAY, so
 * showing next month would be a lie. From the 12th onward it is next month's
 * 11th. Rolls the year correctly in December.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {Date} midnight local time on the upcoming charge day.
 */
export function nextChargeDate(d = new Date()) {
  const monthOffset = d.getDate() <= CHARGE_DAY ? 0 : 1;
  return new Date(d.getFullYear(), d.getMonth() + monthOffset, CHARGE_DAY);
}

/**
 * Short human label for the upcoming charge date.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {string} e.g. 'Aug 11'
 */
export function nextChargeLabel(d = new Date()) {
  return nextChargeDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Whole days from now until the upcoming charge. Never negative - on the 11th
 * itself this is 0.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {number} integer count of days.
 */
export function daysUntilNextCharge(d = new Date()) {
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const target = nextChargeDate(d);
  const days = Math.round((target - today) / 86400000);
  return Math.max(0, days);
}

/**
 * Long name of the month a "Skip" action applies to - the month whose round-ups
 * are still accruing right now.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {string} e.g. 'July'
 */
export function currentMonthName(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'long' });
}

/**
 * The round-up dollars that will actually be charged, applying the app's
 * precedence: an explicit one-time `chargeAdjustment` wins outright; otherwise
 * an active `monthlyCap` trims the total; otherwise the raw round-ups stand.
 * @param {object} args
 * @param {number} args.pendingRoundUps - round-ups accrued this cycle.
 * @param {number|null} [args.monthlyCap] - donor's ceiling, or null for none.
 * @param {number|null} [args.chargeAdjustment] - donor's one-time override, or null.
 * @returns {number} dollars of round-ups to charge.
 */
export function effectiveCharge({ pendingRoundUps, monthlyCap = null, chargeAdjustment = null }) {
  if (chargeAdjustment !== null && chargeAdjustment !== undefined) return chargeAdjustment;
  const capActive = monthlyCap !== null && monthlyCap !== undefined && pendingRoundUps > monthlyCap;
  return capActive ? monthlyCap : pendingRoundUps;
}

/**
 * Decide what happens when a billing cycle has elapsed since the app was last
 * opened. Pure: it takes the stored facts and returns the new ones, so the
 * caller owns all persistence.
 *
 * Rules:
 *   - No stored cycle yet (first open): adopt the current cycle, change nothing
 *     else.
 *   - Still inside the stored cycle: no-op (`changed: false`). This is what
 *     makes the call idempotent and safe to repeat, e.g. when the app was left
 *     open across midnight on the 1st.
 *   - A cycle elapsed and it was the skipped one: the $1 fee rolled over, so
 *     `feeMonths` goes up by one (clamped at MAX_FEE_MONTHS, since months away
 *     are settled in a single step rather than looped).
 *   - A cycle elapsed and it was charged normally: `feeMonths` returns to 1.
 *   - Either way the skip is cleared, because "skip your next charge" is one
 *     month only and must never silently repeat.
 *
 * @param {object} args
 * @param {string|null} args.lastCycle - month key the app last settled, or null.
 * @param {string|null} args.skipMonth - month key the donor chose to skip, or null.
 * @param {number} [args.feeMonths] - months of $1 fee currently pending.
 * @param {Date} [args.now] - the moment to settle against; defaults to now.
 * @returns {{changed: boolean, lastCycle: string, skipMonth: string|null, feeMonths: number}}
 */
export function settleCycle({ lastCycle, skipMonth, feeMonths = 1, now = new Date() }) {
  const cycle = monthKey(now);
  if (!lastCycle) {
    return { changed: true, lastCycle: cycle, skipMonth, feeMonths };
  }
  if (lastCycle === cycle) {
    return { changed: false, lastCycle, skipMonth, feeMonths };
  }
  const wasSkipped = skipMonth === lastCycle;
  const nextFeeMonths = wasSkipped ? Math.min(feeMonths + 1, MAX_FEE_MONTHS) : 1;
  return { changed: true, lastCycle: cycle, skipMonth: null, feeMonths: nextFeeMonths };
}

/**
 * Everything on the next charge: round-ups (after cap/adjustment) plus $1 per
 * fee month plus any optional processing-fee cover the donor opted into.
 * Callers should use this instead of re-deriving the total.
 * @param {object} args
 * @param {number} args.pendingRoundUps - round-ups accrued this cycle.
 * @param {number|null} [args.monthlyCap] - donor's ceiling, or null for none.
 * @param {number|null} [args.chargeAdjustment] - donor's one-time override, or null.
 * @param {number} [args.feeMonths] - months of $1 app fee on this charge.
 * @param {number} [args.processingCover] - dollars the donor chose to cover.
 * @returns {number} total dollars, rounded to cents.
 */
export function chargeTotal({
  pendingRoundUps,
  monthlyCap = null,
  chargeAdjustment = null,
  feeMonths = 1,
  processingCover = 0,
}) {
  const roundUps = effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment });
  return parseFloat((roundUps + feeMonths + processingCover).toFixed(2));
}
