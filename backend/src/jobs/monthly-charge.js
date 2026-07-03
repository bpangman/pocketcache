/**
 * Monthly Charge Job
 * Schedule: 1st of every month at 6am (configured in server.js)
 *
 * What it does:
 *  1. For each active user with unswept round-ups, write fee_accruals for all months
 *     represented by those round-ups (one fee row per active month, idempotent).
 *  2. Skip if a monthly_charges row for (user, period) already exists — idempotent re-runs.
 *  3. Minimum check with 3-month settle-up floor:
 *     a. If sum >= nonprofit's monthly_minimum_cents → charge.
 *     b. If sum < minimum BUT oldest unswept round-up is from 3+ calendar months ago → charge
 *        anyway (minimum waived; caps Plaid float exposure at ~3 months).
 *     c. Otherwise → roll over to next month.
 *  4. SELECT the EXACT roundup IDs and fee_accrual IDs being charged (lock them before async work).
 *  5. Create monthly_charges row, charge_roundups rows, and charge_fee_accruals rows.
 *  6. Charge via Stripe direct charge on the nonprofit's connected account.
 *  7. On success: mark those specific roundups and fee_accruals as swept (exact-ID, no re-scan).
 *  8. On failure: status='retrying', retry_at = now + 3 days.
 *     retry-charges.js (daily 7am) picks these up.
 *
 * MONEY INVARIANT: all amounts are INTEGER CENTS throughout. No floats in money math.
 *
 * IDEMPOTENCY: idempotency_key = 'charge_{userId}_{period}' stored in monthly_charges
 * (UNIQUE constraint) AND passed to Stripe. Safe to re-run after a crash.
 *
 * FEE SCHEME v3 (2026-07-03):
 *   PocketCache's $1.00/month fee is MANDATORY ($0.50 tracking + $0.50 processing). No opt-out.
 *   fee_accruals rows always accrue 100¢/active-month; application_fee_amount = accrued fees only.
 *
 * COVER-PROCESSING TOGGLE (users.cover_processing, default 1 = ON):
 *   cover_processing=1: charge is grossed up (in stripe.js) so nonprofit nets 100% of round-ups
 *     after Stripe fees. The gross-up = processing_cover_cents, stored in monthly_charges.
 *   cover_processing=0: donor pays roundups + $1.00 fee; nonprofit absorbs its own Stripe fees.
 *   In BOTH cases, application_fee_amount = feeCents (never includes processing_cover).
 *   fee_accruals table tracks per-month fee rows; charge_fee_accruals records which were swept.
 */

import db from '../db/index.js';
import { chargeDonor } from '../services/stripe.js';
import { randomUUID } from 'crypto';

export async function runMonthlyCharge() {
  const period = getCurrentPeriod(); // 'YYYY-MM'
  const settleUpThreshold = getSettleUpThresholdPeriod(); // oldest roundup must be <= this to waive minimum
  console.log(`[monthly-charge] Starting for period ${period} (settle-up threshold: ${settleUpThreshold})...`);

  // Get active users who have accrued round-ups and a payment method.
  // No HAVING minimum filter — we apply the minimum + 3-month floor in code.
  // GROUP BY nonprofit_id because a user's round-ups are locked to their nonprofit_id at accrual time.
  const candidates = db.prepare(`
    SELECT
      u.id                          AS user_id,
      u.cover_processing,
      u.stripe_customer_id,
      u.nonprofit_id,
      pm.stripe_payment_method_id,
      pm.last4,
      SUM(r.roundup_cents)          AS total_roundup_cents,
      MIN(r.date)                   AS oldest_roundup_date,
      np.stripe_account_id,
      np.name                       AS nonprofit_name,
      np.monthly_minimum_cents
    FROM users u
    JOIN payment_methods pm   ON pm.user_id = u.id AND pm.is_default = 1
    JOIN roundups r            ON r.user_id = u.id AND r.status = 'accrued' AND r.included_in IS NULL
    JOIN nonprofits np         ON np.id = r.nonprofit_id
    WHERE u.status = 'active'
      AND np.status = 'active'
      AND np.stripe_account_id IS NOT NULL
    GROUP BY u.id, r.nonprofit_id
  `).all();

  console.log(`[monthly-charge] ${candidates.length} users evaluated for period ${period}`);

  for (const candidate of candidates) {
    const idempotencyKey = `charge_${candidate.user_id}_${period}`;

    // IDEMPOTENCY CHECK: skip if already have a record for this user+period
    const existing = db.prepare(`
      SELECT id, status FROM monthly_charges
      WHERE user_id = ? AND period = ?
    `).get(candidate.user_id, period);

    if (existing && ['pending', 'succeeded', 'retrying'].includes(existing.status)) {
      console.log(`[monthly-charge] User ${candidate.user_id}: already has ${existing.status} charge for ${period}, skipping`);
      continue;
    }

    // SELECT the EXACT roundup IDs we're about to charge — lock them NOW, before any async work.
    // Also fetch date so we can (a) compute oldest and (b) derive fee_accrual periods.
    const roundupRows = db.prepare(`
      SELECT id, roundup_cents, date
      FROM roundups
      WHERE user_id = ? AND nonprofit_id = ? AND status = 'accrued' AND included_in IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM charge_roundups cr
          JOIN monthly_charges mc ON mc.id = cr.charge_id
          WHERE cr.roundup_id = roundups.id AND mc.status IN ('pending', 'retrying')
        )
    `).all(candidate.user_id, candidate.nonprofit_id);

    if (roundupRows.length === 0) continue;

    // Compute exact sum from the locked rows
    const roundupCents = roundupRows.reduce((sum, r) => sum + r.roundup_cents, 0);

    // 3-MONTH SETTLE-UP FLOOR:
    // If below minimum, charge anyway if the oldest roundup is 3+ calendar months old.
    const oldestDate = roundupRows.reduce((min, r) => r.date < min ? r.date : min, roundupRows[0].date);
    const oldestPeriod = oldestDate.slice(0, 7); // 'YYYY-MM'
    const meetsMinimum = roundupCents >= candidate.monthly_minimum_cents;
    const meetsSettleUp = oldestPeriod <= settleUpThreshold;

    if (!meetsMinimum && !meetsSettleUp) {
      console.log(`[monthly-charge] User ${candidate.user_id}: ${roundupCents}¢ below minimum ${candidate.monthly_minimum_cents}¢, ` +
        `oldest ${oldestPeriod} not old enough (threshold ${settleUpThreshold}), rolling over`);
      continue;
    }

    if (!meetsMinimum) {
      console.log(`[monthly-charge] User ${candidate.user_id}: ${roundupCents}¢ below minimum but oldest roundup ${oldestPeriod} ` +
        `>= 3 months old — settle-up floor triggered`);
    }

    // Write fee_accruals for all distinct months in the locked roundup rows (idempotent).
    // UNIQUE(user_id, period) means INSERT OR IGNORE is safe on re-run.
    // v3: always 100¢/month (mandatory), cover_processing toggle does not affect fee amount.
    writeFeesForRoundupMonths(candidate.user_id, candidate.nonprofit_id, roundupRows);

    // Get ALL unswept fee_accruals for this user (may span multiple rolled-over months).
    // Exclude fee_accruals already in a pending/retrying charge.
    const feeAccrualRows = getUnsweptFeeAccruals(candidate.user_id);
    const totalFeeCents = feeAccrualRows.reduce((sum, f) => sum + f.fee_cents, 0);

    // CHARGE MATH: application_fee = feeCents only; gross-up (if any) is computed in stripe.js.
    // We write processing_cover_cents=0 initially; update after chargeDonor returns the actual value.
    // Create monthly_charges row BEFORE calling Stripe — gives us the charge ID for metadata
    const chargeId = randomUUID();

    try {
      db.prepare(`
        INSERT INTO monthly_charges
          (id, user_id, nonprofit_id, period, roundup_cents, fee_cents, cover_processing,
           processing_cover_cents, total_charged_cents, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(chargeId, candidate.user_id, candidate.nonprofit_id, period,
             roundupCents, totalFeeCents, candidate.cover_processing,
             roundupCents + totalFeeCents,  // placeholder; updated below after Stripe call
             idempotencyKey);
    } catch (err) {
      if (err.message?.includes('UNIQUE constraint failed')) {
        // Race: another process inserted the same idempotency key — safe to skip
        console.log(`[monthly-charge] User ${candidate.user_id}: idempotency key collision, skipping`);
        continue;
      }
      throw err;
    }

    // Record EXACTLY which roundup IDs belong to this charge — prevents sweep race on async success
    const insertChargeRoundup = db.prepare(`
      INSERT OR IGNORE INTO charge_roundups (charge_id, roundup_id) VALUES (?, ?)
    `);
    db.transaction((rows) => {
      for (const row of rows) insertChargeRoundup.run(chargeId, row.id);
    })(roundupRows);

    // Record EXACTLY which fee_accrual IDs belong to this charge — same race-safe pattern
    const insertChargeFee = db.prepare(`
      INSERT OR IGNORE INTO charge_fee_accruals (charge_id, fee_accrual_id) VALUES (?, ?)
    `);
    db.transaction((rows) => {
      for (const row of rows) insertChargeFee.run(chargeId, row.id);
    })(feeAccrualRows);

    // Build objects for chargeDonor
    const userObj = {
      id: candidate.user_id,
      stripe_customer_id: candidate.stripe_customer_id,
      cover_processing: candidate.cover_processing,
    };
    const pmObj = { stripe_payment_method_id: candidate.stripe_payment_method_id };
    const nonprofitObj = {
      id: candidate.nonprofit_id,
      stripe_account_id: candidate.stripe_account_id,
      name: candidate.nonprofit_name,
    };

    try {
      const result = await chargeDonor(userObj, pmObj, nonprofitObj, roundupCents, totalFeeCents, chargeId);

      // Update the row with the actual totalChargedCents and processingCoverCents from stripe.js
      db.prepare(`
        UPDATE monthly_charges
        SET stripe_payment_intent_id = ?,
            processing_cover_cents   = ?,
            total_charged_cents      = ?
        WHERE id = ?
      `).run(result.paymentIntentId, result.processingCoverCents, result.totalChargedCents, chargeId);

      if (result.status === 'succeeded') {
        await onChargeSucceeded(chargeId);
      } else {
        // Async payment (e.g. ACH) — webhook will call onChargeSucceeded when confirmed
        console.log(`[monthly-charge] User ${candidate.user_id}: charge ${result.status}, awaiting webhook`);
      }

    } catch (err) {
      console.error(`[monthly-charge] User ${candidate.user_id} charge failed:`, err.message);
      // First failure → schedule retry in 3 days
      db.prepare(`
        UPDATE monthly_charges
        SET status = 'retrying', retry_count = 1, retry_at = unixepoch() + (3 * 86400)
        WHERE id = ?
      `).run(chargeId);
    }
  }

  console.log('[monthly-charge] Done.');
}

/**
 * Mark a charge as succeeded and sweep the EXACT roundup + fee_accrual IDs recorded for it.
 * Called synchronously for card charges; called by the webhook handler for async payments.
 *
 * IMPORTANT: we mark ONLY the IDs pre-recorded in charge_roundups / charge_fee_accruals —
 * NEVER re-scan `status = 'accrued'` or `included_in IS NULL`. That re-scan is the sweep race.
 *
 * @param {string} chargeId - monthly_charges.id
 * @param {string} [paymentIntentId] - if provided, update stripe_payment_intent_id
 */
export async function onChargeSucceeded(chargeId, paymentIntentId) {
  const updatePi = db.prepare(`
    UPDATE monthly_charges SET stripe_payment_intent_id = ? WHERE id = ?
  `);
  const succeed = db.prepare(`
    UPDATE monthly_charges SET status = 'succeeded', charged_at = unixepoch() WHERE id = ?
  `);
  const sweepRoundups = db.prepare(`
    UPDATE roundups SET status = 'charged', included_in = ?
    WHERE id IN (SELECT roundup_id FROM charge_roundups WHERE charge_id = ?)
  `);
  const sweepFeeAccruals = db.prepare(`
    UPDATE fee_accruals SET included_in = ?
    WHERE id IN (SELECT fee_accrual_id FROM charge_fee_accruals WHERE charge_id = ?)
  `);

  db.transaction(() => {
    if (paymentIntentId) updatePi.run(paymentIntentId, chargeId);
    succeed.run(chargeId);
    // Mark exactly the IDs that were recorded when this charge was created
    sweepRoundups.run(chargeId, chargeId);
    sweepFeeAccruals.run(chargeId, chargeId);
  })();

  const charge = db.prepare(
    `SELECT user_id, roundup_cents, fee_cents, processing_cover_cents, total_charged_cents FROM monthly_charges WHERE id = ?`
  ).get(chargeId);
  console.log(`[monthly-charge] Charge ${chargeId} succeeded: user ${charge?.user_id}, ` +
    `${charge?.roundup_cents}¢ round-ups + ${charge?.fee_cents}¢ fees` +
    (charge?.processing_cover_cents > 0 ? ` + ${charge?.processing_cover_cents}¢ processing cover` : '') +
    ` = ${charge?.total_charged_cents}¢ total`);
}

/**
 * Mark a charge as failed and pause the user.
 * Called by retry-charges.js after the second failure.
 *
 * @param {string} chargeId
 */
export async function onChargeFailed(chargeId) {
  const charge = db.prepare(`SELECT user_id FROM monthly_charges WHERE id = ?`).get(chargeId);
  if (!charge) return;

  db.prepare(`UPDATE monthly_charges SET status = 'failed' WHERE id = ?`).run(chargeId);
  db.prepare(`UPDATE users SET status = 'paused' WHERE id = ?`).run(charge.user_id);

  console.log(`[monthly-charge] Charge ${chargeId} failed — user ${charge.user_id} paused`);
  // TODO: notify user to update payment method (email via gogcli or SendGrid)
}

/**
 * Run a final settle-up charge for a user (called on account cancellation).
 *
 * Charges ALL accrued round-ups + ALL accrued fees in one shot, regardless of the
 * nonprofit's monthly minimum. Idempotency key: 'charge_{userId}_final'.
 *
 * @param {string} userId
 * @returns {Promise<{chargeId: string, totalChargedCents: number, status: string}|null>}
 *   Returns null if the user has no accrued round-ups to settle.
 */
export async function runFinalCharge(userId) {
  const user = db.prepare(`
    SELECT u.id, u.stripe_customer_id, u.cover_processing, u.nonprofit_id,
           pm.stripe_payment_method_id
    FROM users u
    JOIN payment_methods pm ON pm.user_id = u.id AND pm.is_default = 1
    WHERE u.id = ?
  `).get(userId);

  if (!user) throw new Error(`User ${userId} not found`);
  if (!user.stripe_payment_method_id) throw new Error(`User ${userId} has no payment method`);

  // Collect all unswept round-ups, excluding those already in a pending/retrying charge
  const roundupRows = db.prepare(`
    SELECT r.id, r.roundup_cents, r.date, r.nonprofit_id,
           np.stripe_account_id, np.name AS nonprofit_name
    FROM roundups r
    JOIN nonprofits np ON np.id = r.nonprofit_id
    WHERE r.user_id = ? AND r.status = 'accrued' AND r.included_in IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM charge_roundups cr
        JOIN monthly_charges mc ON mc.id = cr.charge_id
        WHERE cr.roundup_id = r.id AND mc.status IN ('pending', 'retrying')
      )
  `).all(userId);

  if (roundupRows.length === 0) {
    console.log(`[monthly-charge] Final charge for user ${userId}: no accrued round-ups to settle`);
    return null;
  }

  // Use the nonprofit from the most recent roundup
  const latestRoundup = roundupRows[roundupRows.length - 1];
  const nonprofitId = latestRoundup.nonprofit_id;
  const stripeAccountId = latestRoundup.stripe_account_id;
  const nonprofitName = latestRoundup.nonprofit_name;

  // Write fee_accruals for all unswept months (idempotent)
  // v3: always 100¢/month mandatory; cover_processing does not affect fee amount
  writeFeesForRoundupMonths(userId, nonprofitId, roundupRows);

  // Get all unswept fee_accruals (excluding any already in a pending/retrying charge)
  const feeAccrualRows = getUnsweptFeeAccruals(userId);
  const roundupCents = roundupRows.reduce((sum, r) => sum + r.roundup_cents, 0);
  const totalFeeCents = feeAccrualRows.reduce((sum, f) => sum + f.fee_cents, 0);

  const idempotencyKey = `charge_${userId}_final`;
  const chargeId = randomUUID();

  try {
    // period='final' marks this as a cancellation settle-up (not a regular monthly charge).
    // Write processing_cover_cents=0 placeholder; updated after chargeDonor returns actual value.
    db.prepare(`
      INSERT INTO monthly_charges
        (id, user_id, nonprofit_id, period, roundup_cents, fee_cents, cover_processing,
         processing_cover_cents, total_charged_cents, idempotency_key)
      VALUES (?, ?, ?, 'final', ?, ?, ?, 0, ?, ?)
    `).run(chargeId, userId, nonprofitId, roundupCents, totalFeeCents, user.cover_processing,
           roundupCents + totalFeeCents,  // placeholder; updated below
           idempotencyKey);
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      console.log(`[monthly-charge] Final charge for user ${userId}: already exists (idempotent)`);
      return null;
    }
    throw err;
  }

  // Record exact IDs — same race-safe pattern as runMonthlyCharge
  const insertChargeRoundup = db.prepare(`INSERT OR IGNORE INTO charge_roundups (charge_id, roundup_id) VALUES (?, ?)`);
  db.transaction((rows) => {
    for (const row of rows) insertChargeRoundup.run(chargeId, row.id);
  })(roundupRows);

  const insertChargeFee = db.prepare(`INSERT OR IGNORE INTO charge_fee_accruals (charge_id, fee_accrual_id) VALUES (?, ?)`);
  db.transaction((rows) => {
    for (const row of rows) insertChargeFee.run(chargeId, row.id);
  })(feeAccrualRows);

  const userObj = { id: userId, stripe_customer_id: user.stripe_customer_id, cover_processing: user.cover_processing };
  const pmObj = { stripe_payment_method_id: user.stripe_payment_method_id };
  const nonprofitObj = { id: nonprofitId, stripe_account_id: stripeAccountId, name: nonprofitName };

  const result = await chargeDonor(userObj, pmObj, nonprofitObj, roundupCents, totalFeeCents, chargeId);

  // Update with actual values returned by stripe.js (gross-up computed there)
  db.prepare(`
    UPDATE monthly_charges
    SET stripe_payment_intent_id = ?,
        processing_cover_cents   = ?,
        total_charged_cents      = ?
    WHERE id = ?
  `).run(result.paymentIntentId, result.processingCoverCents, result.totalChargedCents, chargeId);

  if (result.status === 'succeeded') {
    await onChargeSucceeded(chargeId);
  } else {
    // Async payment (ACH) — webhook confirms later
    console.log(`[monthly-charge] Final charge for user ${userId}: ${result.status}, awaiting webhook`);
  }

  console.log(`[monthly-charge] Final charge ${chargeId} created: user ${userId}, ` +
    `${roundupCents}¢ round-ups + ${totalFeeCents}¢ fees` +
    (result.processingCoverCents > 0 ? ` + ${result.processingCoverCents}¢ processing cover` : '') +
    ` = ${result.totalChargedCents}¢ total`);

  return { chargeId, totalChargedCents, status: result.status };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Write fee_accruals for every distinct calendar month present in a set of roundup rows.
 * Idempotent — UNIQUE(user_id, period) makes INSERT OR IGNORE safe on re-run.
 *
 * v3: PocketCache's $1.00/month fee is MANDATORY — always 100¢, always covered=1.
 *   Itemized as: $0.50 tracking + $0.50 processing.
 *   The cover_processing toggle (nonprofit's card costs) does not affect this amount.
 *
 * @param {string} userId
 * @param {string} nonprofitId
 * @param {Array}  roundupRows - rows with a 'date' field ('YYYY-MM-DD')
 */
function writeFeesForRoundupMonths(userId, nonprofitId, roundupRows) {
  // $1.00/month mandatory PocketCache fee ($0.50 tracking + $0.50 processing)
  const feeCents = 100;
  const insertFeeAccrual = db.prepare(`
    INSERT OR IGNORE INTO fee_accruals (id, user_id, period, fee_cents, covered, nonprofit_id)
    VALUES (?, ?, ?, ?, 1, ?)
  `);
  const periods = new Set(roundupRows.map(r => r.date.slice(0, 7))); // 'YYYY-MM'
  db.transaction(() => {
    for (const period of periods) {
      insertFeeAccrual.run(randomUUID(), userId, period, feeCents, nonprofitId);
    }
  })();
}

/**
 * Get all unswept fee_accruals for a user, ordered by period (oldest first).
 * Excludes fee_accruals already locked into a pending or retrying charge.
 *
 * @param {string} userId
 * @returns {Array<{id: string, fee_cents: number, period: string}>}
 */
function getUnsweptFeeAccruals(userId) {
  return db.prepare(`
    SELECT fa.id, fa.fee_cents, fa.period
    FROM fee_accruals fa
    WHERE fa.user_id = ? AND fa.included_in IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM charge_fee_accruals cfa
        JOIN monthly_charges mc ON mc.id = cfa.charge_id
        WHERE cfa.fee_accrual_id = fa.id AND mc.status IN ('pending', 'retrying')
      )
    ORDER BY fa.period ASC
  `).all(userId);
}

/**
 * Returns 'YYYY-MM' for the current calendar month.
 */
function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Returns the 'YYYY-MM' period that is exactly 3 calendar months before the current month.
 * Oldest unswept round-up with period <= this threshold triggers the settle-up floor.
 *
 * Example: if today is July 2026 → returns '2026-04' (April 2026).
 * An oldest roundup from April or earlier is 3+ months stale — charge regardless of minimum.
 *
 * Uses UTC month/year to match the date strings stored in roundups.date ('YYYY-MM-DD' UTC).
 */
export function getSettleUpThresholdPeriod() {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() - 3; // 0-indexed; getUTCMonth()=6 for July → 3 = April
  while (month < 0) { month += 12; year -= 1; }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Allow running directly: node src/jobs/monthly-charge.js
if (process.argv[1].endsWith('monthly-charge.js')) {
  runMonthlyCharge().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
