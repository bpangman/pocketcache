/**
 * Retry Charges Job
 * Schedule: daily at 7am (configured in server.js)
 *
 * Picks up monthly_charges rows where:
 *   status = 'retrying' AND retry_at <= now
 *
 * First failure (retry_count=1): retried here with idempotency key suffix '_retry1'
 * Second failure: marks status='failed', pauses user.
 *
 * MONEY INVARIANT: amounts are already recorded in monthly_charges — we read
 * total_charged_cents and roundup_cents from the row, never recompute from roundups.
 */

import db from '../db/index.js';
import { chargeDonor } from '../services/stripe.js';
import { onChargeSucceeded, onChargeFailed } from './monthly-charge.js';

export async function runRetryCharges() {
  const now = Math.floor(Date.now() / 1000);
  console.log(`[retry-charges] Starting at ${new Date().toISOString()}...`);

  const retries = db.prepare(`
    SELECT
      mc.*,
      u.stripe_customer_id,
      u.cover_fee,
      pm.stripe_payment_method_id,
      np.stripe_account_id,
      np.name AS nonprofit_name
    FROM monthly_charges mc
    JOIN users u       ON u.id = mc.user_id
    JOIN payment_methods pm ON pm.user_id = mc.user_id AND pm.is_default = 1
    JOIN nonprofits np ON np.id = mc.nonprofit_id
    WHERE mc.status = 'retrying' AND mc.retry_at <= ?
  `).all(now);

  console.log(`[retry-charges] ${retries.length} charges to retry`);

  for (const charge of retries) {
    const retryN = charge.retry_count + 1;

    const userObj = {
      id: charge.user_id,
      stripe_customer_id: charge.stripe_customer_id,
      cover_fee: charge.cover_fee,
    };
    const pmObj = { stripe_payment_method_id: charge.stripe_payment_method_id };
    const nonprofitObj = {
      id: charge.nonprofit_id,
      stripe_account_id: charge.stripe_account_id,
      name: charge.nonprofit_name,
    };

    try {
      // Use the stored roundup_cents — do NOT re-sum from roundups (amounts were locked at charge creation)
      const result = await chargeDonor(userObj, pmObj, nonprofitObj, charge.roundup_cents, charge.id);

      db.prepare(`UPDATE monthly_charges SET retry_count = ?, stripe_payment_intent_id = ? WHERE id = ?`)
        .run(retryN, result.paymentIntentId, charge.id);

      if (result.status === 'succeeded') {
        await onChargeSucceeded(charge.id);
      } else {
        console.log(`[retry-charges] Charge ${charge.id}: retry ${retryN} ${result.status}, awaiting webhook`);
      }

    } catch (err) {
      console.error(`[retry-charges] Charge ${charge.id} retry ${retryN} failed:`, err.message);

      // Second failure → mark failed, pause user
      db.prepare(`UPDATE monthly_charges SET retry_count = ? WHERE id = ?`).run(retryN, charge.id);
      await onChargeFailed(charge.id);
    }
  }

  console.log('[retry-charges] Done.');
}

// Allow running directly
if (process.argv[1].endsWith('retry-charges.js')) {
  runRetryCharges().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
