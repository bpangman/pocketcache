/**
 * src/lib/billing.js - SINGLE SOURCE OF TRUTH for charge dates and charge amounts.
 *
 * The billing model (Blake, 2026-07-06; floor and fee status confirmed 2026-11-07):
 *   1. Round-ups accrue across a calendar month.
 *   2. On the 1st of the following month (LOCK_DAY) the amount LOCKS and the
 *      donor gets a 10-day review window (days 1 to 10) to review or adjust it.
 *   3. The charge runs on the 11th (CHARGE_DAY). That is 10 full days' notice,
 *      the classic Reg E timing.
 *   4. One fixed $5 floor for everyone (MONTHLY_FLOOR, the same number as the
 *      cycle-lock function's MINIMUM_CENTS). A locked total under the floor is
 *      not charged - it rolls forward until the balance reaches $5. There is no
 *      per-nonprofit minimum and no forced settle-up after N months.
 *   5. A flat $1/month app fee is part of the model, but it is NOT collected by
 *      the server yet (APP_FEE_LIVE is false). `feeMonths` is how many months of
 *      that fee are pending (normally 1). While the fee is not live, surfaces
 *      show it as a pending line and leave it OUT of any total presented as
 *      "what will be charged" for a real account - see chargeTotal's includeFee.
 *   6. "Skip a month" means that month's round-ups are NEVER charged - they do
 *      not roll over and they never come out later - but the $1 fee DOES roll
 *      over, so the next charge carries $1 x 2.
 *   7. A `monthlyCap` caps the round-up portion, and a `chargeAdjustment` is a
 *      one-time donor-set amount for this month that beats everything else.
 *
 * Because the review window straddles the charge date, "the next charge date"
 * is NOT simply next month's 11th: on July 3rd the upcoming charge is July 11,
 * while on July 12th it is August 11. Getting that wrong in one component and
 * right in another is how the UI ends up contradicting itself, so every caller
 * must use these helpers instead of doing its own date math. Future changes to
 * the schedule or the amount precedence happen HERE and nowhere else.
 *
 * MONTH BOUNDARIES ARE UTC. The server (cycle-lock, roundups-me) keys cycles by
 * UTC month, and roundups.month_key comes from the Plaid transaction date, so
 * monthKey() and inReviewWindow() read UTC getters to agree with it. The
 * display helpers (nextChargeDate and friends) keep local dates: they label a
 * calendar day for a human, and a local midnight is the right thing to show.
 *
 * Pure functions only - no React, no localStorage. Every function takes an
 * injectable date so callers (and tests) can pass a fixed "now".
 */

/** Day of the month the locked amount is emailed and the review window opens. */
export const LOCK_DAY = 1;

/** Day of the month the charge actually runs. */
export const CHARGE_DAY = 11;

/** Last day of the lock-and-review window (window is days 1 to this, inclusive). */
export const REVIEW_WINDOW_LAST_DAY = 10;

/**
 * The one fixed monthly floor, in dollars and in cents. Must stay equal to
 * MINIMUM_CENTS in supabase/functions/cycle-lock - the server is what actually
 * decides whether a cycle charges or rolls forward.
 */
export const MONTHLY_FLOOR = 5;
export const MONTHLY_FLOOR_CENTS = 500;

/**
 * Is the $1 app fee collected on real charges yet? False until the Stripe
 * application-fee routing is switched on server-side. Callers pass
 * `includeFee: APP_FEE_LIVE || demoActive` to chargeTotal so the demo keeps
 * its full itemized total while real accounts never see the fee inside a
 * number that claims to be the charge.
 */
export const APP_FEE_LIVE = false;

/**
 * Highest number of $1 fee months we will ever stack onto one charge.
 * A donor who leaves the app closed for years should not come back to a
 * surprise 30-month fee bill, and we settle elapsed cycles in one step rather
 * than looping month by month, so the accumulated fee gets clamped here.
 */
export const MAX_FEE_MONTHS = 12;

/**
 * Canonical cycle identifier: the zero-padded calendar month a set of round-ups
 * belongs to, in UTC to match the server. Used as the key for "which month did
 * the donor skip" and "which cycle has the app already settled".
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {string} e.g. '2026-07'
 */
export function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * True while the locked amount is under review, i.e. UTC days 1 to 10 inclusive.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {boolean}
 */
export function inReviewWindow(d = new Date()) {
  const day = d.getUTCDate();
  return day >= LOCK_DAY && day <= REVIEW_WINDOW_LAST_DAY;
}

/**
 * Below the fixed floor? The server tests the LOCKED total (round-ups after
 * cap/adjust, plus any rolled-in balance and extra pledges) against the same
 * number, so pass that combined figure, not raw round-ups alone.
 * @param {number} totalDollars
 * @returns {boolean}
 */
export function isBelowFloor(totalDollars) {
  return Math.round((totalDollars || 0) * 100) < MONTHLY_FLOOR_CENTS;
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
 * Long name of the month whose round-ups the upcoming charge actually reflects
 * - always one calendar month before nextChargeDate's month, built from that
 * same date so it can never disagree with the charge date shown beside it.
 *
 * During the review window (days 1 to 10) the upcoming charge is THIS month's
 * 11th, so this correctly names LAST month, whose amount already locked. From
 * day 11 onward the upcoming charge is NEXT month's 11th, so this correctly
 * names the month currently accruing (same answer currentMonthName() gives in
 * that case, since nothing has locked yet).
 *
 * Use this - not currentMonthName() - anywhere copy frames what a donor is
 * reviewing or being charged for. currentMonthName() is only for copy about the
 * month currently accruing regardless of the charge/review cycle, e.g. "Skip
 * {month}'s round-ups".
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {string} e.g. 'July'
 */
export function roundUpMonthName(d = new Date()) {
  const charge = nextChargeDate(d);
  return new Date(charge.getFullYear(), charge.getMonth() - 1, 1)
    .toLocaleDateString('en-US', { month: 'long' });
}

/**
 * The cycle a "Skip a month" actually applies to, keyed the way the server
 * keys cycles (UTC month) and labeled to match.
 *
 * During the review window (UTC days 1 to 10) the charge coming up on the
 * 11th is LAST month's locked cycle, so that is the one a skip can still
 * stop. From the 11th onward the only cycle a donor can still skip is the
 * month accruing right now. One helper so the Settings row, the confirm
 * modal, the dashboard, the review alert and the server request body all
 * name the same month.
 *
 * @param {Date} [now] - the moment to read; defaults to now.
 * @returns {{ monthKey: string, label: string }} e.g. { monthKey: '2026-10', label: 'October' }
 */
export function skipTargetMonth(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const inWindow = now.getUTCDate() <= REVIEW_WINDOW_LAST_DAY;
  const target = new Date(Date.UTC(y, inWindow ? m - 1 : m, 1));
  return {
    monthKey: monthKey(target),
    label: target.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
  };
}

/**
 * The charge day BEFORE the upcoming one - i.e. the start of the cycle the
 * donor is currently inside. Needed so progress bars can measure charge-day to
 * charge-day instead of assuming a 30 day month.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {Date} midnight local time on the previous charge day.
 */
export function previousChargeDate(d = new Date()) {
  const next = nextChargeDate(d);
  return new Date(next.getFullYear(), next.getMonth() - 1, CHARGE_DAY);
}

/**
 * Length in whole days of the cycle the donor is currently inside. Varies with
 * month length (28 to 31), which is why the old `daysLeft / 30` bars drifted.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {number} integer count of days.
 */
export function cycleDays(d = new Date()) {
  return Math.round((nextChargeDate(d) - previousChargeDate(d)) / 86400000);
}

/**
 * The charge AFTER the upcoming one. When a donor skips the current month,
 * nothing is collected on the upcoming charge date, and the rolled-over app fee
 * lands on this one instead - so skip copy needs to be able to name it.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {Date} midnight local time on the charge day after next.
 */
export function chargeAfterNextDate(d = new Date()) {
  const next = nextChargeDate(d);
  return new Date(next.getFullYear(), next.getMonth() + 1, CHARGE_DAY);
}

/**
 * Short human label for the charge after the upcoming one.
 * @param {Date} [d] - the moment to read; defaults to now.
 * @returns {string} e.g. 'Sep 11'
 */
export function chargeAfterNextLabel(d = new Date()) {
  return chargeAfterNextDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The first charge date that can actually include a donor's own round-ups.
 *
 * nextChargeDate() knows nothing about when the donor joined. A donor who
 * signs up on Nov 7 sees "Next charge Nov 11", but the Nov 11 charge is
 * October's cycle, locked on Nov 1 before they existed - nothing of theirs can
 * be in it. Their first possible charge is Dec 11 (and only if the balance
 * reaches the floor). So: if the donor joined after the most recent lock (the
 * 1st of the month the upcoming charge belongs to), the first eligible charge
 * is the one after next; otherwise it is the upcoming one.
 *
 * @param {string|Date|null} joinedAt - identity.joinedAt (ISO string) or a Date;
 *   null/invalid falls back to nextChargeDate.
 * @param {Date} [now] - the moment to read; defaults to now.
 * @returns {Date} midnight local time on the first eligible charge day.
 */
export function firstEligibleChargeDate(joinedAt, now = new Date()) {
  const next = nextChargeDate(now);
  if (!joinedAt) return next;
  const joined = joinedAt instanceof Date ? joinedAt : new Date(joinedAt);
  if (Number.isNaN(joined.getTime())) return next;
  const lastLock = new Date(next.getFullYear(), next.getMonth(), LOCK_DAY);
  return joined > lastLock ? chargeAfterNextDate(now) : next;
}

/**
 * Card-processing cover for a given donation, as a TRUE GROSS-UP in integer
 * cents: the amount to add so that, after the processor takes RATE of the
 * whole charge plus the fixed fee, the nonprofit nets the full donation.
 *
 *   cover = ceil((R + fixed) / (1 - rate)) - R        (R = donation in cents)
 *
 * The old formula (amount x rate + fixed) was taken on the donation alone, so
 * the processor's cut of the cover itself was never covered and the nonprofit
 * came out a few cents short. Check: processingCoverFor(10) === 0.54.
 *
 * Only the round-up portion is grossed up. Give Extra pledges compute their
 * own cover in their sheet, and the $1 app fee is not in the numerator until
 * it is actually collected as a Stripe application fee (APP_FEE_LIVE).
 *
 * @param {number} amount - the donation the processor would take its cut from.
 * @returns {number} dollars, rounded to cents.
 */
export function processingCoverFor(amount) {
  if (!amount || amount <= 0) return 0;
  const R = Math.round(amount * 100);
  const fixed = Math.round(PROCESSING_FIXED * 100);
  const cover = Math.ceil((R + fixed) / (1 - PROCESSING_RATE)) - R;
  return cover / 100;
}

/** Standard US nonprofit card rate PocketCache quotes donors: 2.2% + 30c. */
const PROCESSING_RATE = 0.022;
const PROCESSING_FIXED = 0.30;

/**
 * A one-off "give extra" gift at or above this many dollars gets an extra
 * "was that intentional?" confirmation step before it is charged. Lives here so
 * the app sheet and the web portal modal cannot drift apart.
 */
export const LARGE_DONATION_THRESHOLD = 1000;

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
 *   - `serverFeeMonths`, when given, WINS over the local count in every branch:
 *     the fee ledger belongs on the server (charge_cycles.fee_months), and a
 *     number from roundups-me beats whatever this browser remembered.
 *
 * @param {object} args
 * @param {string|null} args.lastCycle - month key the app last settled, or null.
 * @param {string|null} args.skipMonth - month key the donor chose to skip, or null.
 * @param {number} [args.feeMonths] - months of $1 fee currently pending.
 * @param {number|null} [args.serverFeeMonths] - the server's fee-month count, if known.
 * @param {Date} [args.now] - the moment to settle against; defaults to now.
 * @returns {{changed: boolean, lastCycle: string, skipMonth: string|null, feeMonths: number}}
 */
export function settleCycle({ lastCycle, skipMonth, feeMonths = 1, serverFeeMonths = null, now = new Date() }) {
  const cycle = monthKey(now);
  const serverWins = Number.isFinite(serverFeeMonths) && serverFeeMonths >= 0;
  const clampServer = () => Math.min(Math.round(serverFeeMonths), MAX_FEE_MONTHS);
  if (!lastCycle) {
    return { changed: true, lastCycle: cycle, skipMonth, feeMonths: serverWins ? clampServer() : feeMonths };
  }
  if (lastCycle === cycle) {
    if (serverWins && clampServer() !== feeMonths) {
      return { changed: true, lastCycle, skipMonth, feeMonths: clampServer() };
    }
    return { changed: false, lastCycle, skipMonth, feeMonths };
  }
  const wasSkipped = skipMonth === lastCycle;
  const localFeeMonths = wasSkipped ? Math.min(feeMonths + 1, MAX_FEE_MONTHS) : 1;
  return { changed: true, lastCycle: cycle, skipMonth: null, feeMonths: serverWins ? clampServer() : localFeeMonths };
}

/**
 * Everything on the next charge: round-ups (after cap/adjustment), plus any
 * Give Extra pledges, plus $1 per fee month when the fee is being collected,
 * plus any optional processing-fee cover the donor opted into.
 * Callers should use this instead of re-deriving the total.
 *
 * `extras` are added AFTER cap/adjust (a pledge is never capped away) and
 * count toward the floor test alongside the round-ups. `includeFee` defaults
 * to true so existing demo callers keep their itemized total; real-account
 * surfaces pass `includeFee: APP_FEE_LIVE || demoActive` so the $1 never
 * appears inside a number presented as what will actually be charged.
 *
 * @param {object} args
 * @param {number} args.pendingRoundUps - round-ups accrued this cycle.
 * @param {number|null} [args.monthlyCap] - donor's ceiling, or null for none.
 * @param {number|null} [args.chargeAdjustment] - donor's one-time override, or null.
 * @param {number} [args.feeMonths] - months of $1 app fee on this charge.
 * @param {number} [args.processingCover] - dollars the donor chose to cover.
 * @param {number} [args.extras] - Give Extra pledges joining this charge.
 * @param {boolean} [args.includeFee] - false leaves the fee months out of the total.
 * @returns {number} total dollars, rounded to cents.
 */
export function chargeTotal({
  pendingRoundUps,
  monthlyCap = null,
  chargeAdjustment = null,
  feeMonths = 1,
  processingCover = 0,
  extras = 0,
  includeFee = true,
}) {
  const roundUps = effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment });
  const fee = includeFee ? feeMonths : 0;
  return parseFloat((roundUps + (extras || 0) + fee + processingCover).toFixed(2));
}
