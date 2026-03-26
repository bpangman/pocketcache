/**
 * Stripe Webhook route
 * POST /api/webhooks/stripe
 *
 * Stripe sends events here asynchronously — this is how we know if a charge
 * actually succeeded or failed (some payment methods are async).
 *
 * IMPORTANT: This route must receive the raw body (not parsed JSON) for
 * signature verification. See server.js for the express.raw() middleware.
 *
 * To test locally:
 *   stripe listen --forward-to localhost:3001/api/webhooks/stripe
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
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const chargeId = pi.metadata?.spare_charge_id;
        if (!chargeId) break;

        const charge = db.prepare(`SELECT * FROM monthly_charges WHERE id = ?`).get(chargeId);
        if (!charge || charge.status === 'succeeded') break; // already handled

        const user = db.prepare(`
          SELECT u.*, pm.stripe_payment_method_id, pm.type as payment_method_type
          FROM users u JOIN payment_methods pm ON pm.user_id = u.id AND pm.is_default = 1
          WHERE u.id = ?
        `).get(charge.user_id);

        await onChargeSucceeded(chargeId, user, {
          paymentIntentId: pi.id,
          status: 'succeeded',
        }, charge.net_amount);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const chargeId = pi.metadata?.spare_charge_id;
        if (!chargeId) break;

        const charge = db.prepare(`SELECT * FROM monthly_charges WHERE id = ?`).get(chargeId);
        if (!charge) break;

        await onChargeFailed(charge.user_id, new Error(pi.last_payment_error?.message ?? 'Payment failed'));
        break;
      }

      case 'treasury.inbound_transfer.succeeded': {
        // Treasury deposit confirmed — log it
        console.log(`Treasury deposit confirmed: ${event.data.object.id}`);
        break;
      }

      case 'treasury.outbound_transfer.posted': {
        // Quarterly sweep to Endaoment confirmed by ACH network
        const disbursementId = event.data.object.metadata?.spare_disbursement_id;
        if (disbursementId) {
          db.prepare(`
            UPDATE quarterly_disbursements SET status = 'confirmed', confirmed_at = unixepoch()
            WHERE id = ?
          `).run(disbursementId);
          console.log(`Quarterly disbursement ${disbursementId} confirmed by ACH network`);
        }
        break;
      }

      default:
        // Unhandled event type — fine, just ignore
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

export default router;
