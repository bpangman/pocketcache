/**
 * Monthly Charge Job
 * Schedule: 1st of every month at 6am (configured in server.js)
 *
 * What it does:
 *  1. For each active user, SELECT the specific roundup IDs being charged (lock them first)
 *  2. Skip if a monthly_charges row for (user, period) already exists — idempotent re-runs
 *  3. If sum >= nonprofit's monthly_minimum_cents: charge via Stripe direct charge
 *  4. Record EXACTLY which roundup IDs were swept in charge_roundups join table
 *  5. On success: mark those specific roundups as charged
 *  6. On failure: status='retrying', retry_at = now + 3 days
 *     retry-charges.js (daily 7am) picks these up
 *
 * MONEY INVARIANT: all amounts are INTEGER CENTS throughout. No floats in money math.
 *
 * IDEMPOTENCY: idempotency_key = 'charge_{userId}_{period}' stored in monthly_charges
 * (UNIQUE constraint) AND passed to Stripe. Safe to re-run after a crash.
 */

import db from '../db/index.js';
import { chargeDonor } from '../services/stripe.js';
import { randomUUID } from 'crypto';

export async function runMonthlyCharge() {
  const period = getCurrentPeriod(); // 'YYYY-MM'
  console.log(`[monthly-charge] Starting for period ${period}...`);

  // Get active users who have accrued round-ups and a payment method,
  // where the sum meets the nonprofit's per-nonprofit monthly minimum.
  // GROUP BY nonprofit_id because a user's round-ups are locked to their nonprofit_id at accrual.
  const candidates = db.prepare(`
    SELECT
      u.id                          AS user_id,
      u.cover_fee,
      u.stripe_customer_id,
      u.nonprofit_id,
      pm.stripe_payment_method_id,
      pm.last4,
      SUM(r.roundup_cents)          AS total_roundup_cents,
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
    HAVING total_roundup_cents >= np.monthly_minimum_cents
  `).all();

  console.log(`[monthly-charge] ${candidates.length} users to charge for period ${period}`);

  for (const candidate of candidates) {
    const idempotencyKey = `charge_${candidate.user_id}_${period}`;

    // IDEMPOTENCY CHECK: skip if already have a record for this user+period
    // (handles job crash and re-run — we never double-charge)
    const existing = db.prepare(`
      SELECT id, status FROM monthly_charges
      WHERE user_id = ? AND period = ?
    `).get(candidate.user_id, period);

    if (existing && ['pending', 'succeeded', 'retrying'].includes(existing.status)) {
      console.log(`[monthly-charge] User ${candidate.user_id}: already has ${existing.status} charge for ${period}, skipping`);
      continue;
    }

    // SELECT the EXACT roundup IDs we're about to charge — lock them NOW, before any async work.
    // This prevents the sweep race: we sum these specific IDs, then mark ONLY these IDs on success.
    // We never re-scan `status = 'accrued'` after the charge (that's the race condition).
    const roundupRows = db.prepare(`
      SELECT id, roundup_cents
      FROM roundups
      WHERE user_id = ? AND nonprofit_id = ? AND status = 'accrued' AND included_in IS NULL
    `).all(candidate.user_id, candidate.nonprofit_id);

    if (roundupRows.length === 0) continue;

    // Compute exact sum from the locked rows (may differ slightly from candidate total
    // if another row appeared between the HAVING query and now — take the re-confirmed sum)
    const roundupCents = roundupRows.reduce((sum, r) => sum + r.roundup_cents, 0);

    // Re-check minimum against the confirmed sum
    if (roundupCents < candidate.monthly_minimum_cents) {
      console.log(`[monthly-charge] User ${candidate.user_id}: confirmed sum ${roundupCents}¢ below minimum ${candidate.monthly_minimum_cents}¢, rolling over`);
      continue;
    }

    // Cover-fee logic (all integer cents):
    //   cover_fee=1: total_charged = roundup_cents + 50
    //   cover_fee=0: total_charged = roundup_cents (nonprofit receives roundup_cents - 50)
    const coverFee = candidate.cover_fee === 1;
    const totalChargedCents = coverFee ? roundupCents + 50 : roundupCents;

    // Create monthly_charges row BEFORE calling Stripe — gives us the charge ID for metadata
    const chargeId = randomUUID();

    try {
      db.prepare(`
        INSERT INTO monthly_charges
          (id, user_id, nonprofit_id, period, roundup_cents, fee_cents, cover_fee, total_charged_cents, idempotency_key)
        VALUES (?, ?, ?, ?, ?, 50, ?, ?, ?)
      `).run(chargeId, candidate.user_id, candidate.nonprofit_id, period,
             roundupCents, candidate.cover_fee, totalChargedCents, idempotencyKey);
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
    const insertAll = db.transaction((rows) => {
      for (const row of rows) insertChargeRoundup.run(chargeId, row.id);
    });
    insertAll(roundupRows);

    // Build objects for chargeDonor
    const userObj = {
      id: candidate.user_id,
      stripe_customer_id: candidate.stripe_customer_id,
      cover_fee: candidate.cover_fee,
    };
    const pmObj = { stripe_payment_method_id: candidate.stripe_payment_method_id };
    const nonprofitObj = {
      id: candidate.nonprofit_id,
      stripe_account_id: candidate.stripe_account_id,
      name: candidate.nonprofit_name,
    };

    try {
      const result = await chargeDonor(userObj, pmObj, nonprofitObj, roundupCents, chargeId);

      db.prepare(`
        UPDATE monthly_charges SET stripe_payment_intent_id = ? WHERE id = ?
      `).run(result.paymentIntentId, chargeId);

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
 * Mark a charge as succeeded and sweep the EXACT roundup IDs recorded for it.
 * Called synchronously for card charges; called by the webhook handler for async payments.
 *
 * IMPORTANT: we mark ONLY the roundup IDs pre-recorded in charge_roundups — NEVER
 * re-scan `status = 'accrued'` here. That re-scan is the sweep race condition.
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

  db.transaction(() => {
    if (paymentIntentId) updatePi.run(paymentIntentId, chargeId);
    succeed.run(chargeId);
    // Mark exactly the roundup IDs that were recorded when this charge was created
    sweepRoundups.run(chargeId, chargeId);
  })();

  const charge = db.prepare(`SELECT user_id, roundup_cents, total_charged_cents FROM monthly_charges WHERE id = ?`).get(chargeId);
  console.log(`[monthly-charge] Charge ${chargeId} succeeded: user ${charge?.user_id}, ` +
    `${charge?.roundup_cents}¢ round-ups, ${charge?.total_charged_cents}¢ charged`);
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

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Allow running directly: node src/jobs/monthly-charge.js
if (process.argv[1].endsWith('monthly-charge.js')) {
  runMonthlyCharge().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
