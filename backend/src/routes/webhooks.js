/**
 * Stripe Webhook route
 * POST /api/webhooks/stripe
 *
 * Stripe sends events here asynchronously — this is how we learn if an async
 * payment (ACH, bank transfer) succeeded or failed after the initial charge call.
 *
 * Connected-account events arrive with event.account set to the nonprofit's acct_...
 * Platform events (from PocketCache's own account) do NOT have event.account.
 *
 * IMPORTANT: this route receives the RAW body — express.json() must NOT parse it.
 * See server.js for the express.raw() middleware applied before express.json().
 *
 * Bug fixed: old code read pi.metadata?.spare_charge_id but charges set pocketcache_charge_id.
 * They never matched, so async outcomes were silently ignored. Now reads pocketcache_charge_id.
 */

import express from 'express';
import { constructWebhookEvent } from '../services/stripe.js';
import { onChargeSucceeded, onChargeFailed } from '../jobs/monthly-charge.js';
import db from '../db/index.js';

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log connected-account events for traceability
  if (event.account) {
    console.log(`[webhook] Connected-account event: ${event.type} from ${event.account}`);
  }

  try {
    switch (event.type) {

      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        // FIXED: was pi.metadata?.spare_charge_id — that key never existed, so async
        // payment outcomes were never recorded. Now reads pocketcache_charge_id (the key
        // that chargeDonor() actually sets in metadata).
        const chargeId = pi.metadata?.pocketcache_charge_id;
        if (!chargeId) break; // PaymentIntent not created by us (ignore)

        const charge = db.prepare(`SELECT * FROM monthly_charges WHERE id = ?`).get(chargeId);
        if (!charge || charge.status === 'succeeded') break; // already handled (idempotent)

        await onChargeSucceeded(chargeId, pi.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const chargeId = pi.metadata?.pocketcache_charge_id;
        if (!chargeId) break;

        const charge = db.prepare(`SELECT * FROM monthly_charges WHERE id = ?`).get(chargeId);
        if (!charge || ['failed', 'succeeded'].includes(charge.status)) break;

        if (charge.status === 'retrying') {
          // Already in retry state — this failure is the final one; mark failed + pause user
          await onChargeFailed(chargeId);
        } else {
          // First failure — schedule retry in 3 days (retry-charges.js picks this up)
          db.prepare(`
            UPDATE monthly_charges
            SET status = 'retrying', retry_count = 1, retry_at = unixepoch() + (3 * 86400)
            WHERE id = ?
          `).run(chargeId);
          console.log(`[webhook] Charge ${chargeId} failed, retry scheduled in 3 days`);
        }
        break;
      }

      default:
        // Unhandled event type — fine, Stripe recommends returning 200 for unhandled events
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[webhook] Handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

export default router;
