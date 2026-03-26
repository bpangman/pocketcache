/**
 * Stripe API routes
 * POST /api/stripe/setup-intent        — create SetupIntent for card entry (Stripe Elements)
 * POST /api/stripe/financial-session   — create Financial Connections session for ACH
 * POST /api/stripe/save-payment-method — store payment method after frontend confirmation
 */

import express from 'express';
import {
  getOrCreateCustomer,
  createSetupIntent,
  createFinancialConnectionsSession,
  attachPaymentMethod,
} from '../services/stripe.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// POST /api/stripe/setup-intent
// Returns clientSecret for Stripe Elements CardElement (CC path)
router.post('/setup-intent', async (req, res) => {
  const { userId, email, name } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    // Get or create Stripe customer
    let pm = db.prepare(`SELECT stripe_customer_id FROM payment_methods WHERE user_id = ? LIMIT 1`).get(userId);
    let customerId = pm?.stripe_customer_id;

    if (!customerId) {
      customerId = await getOrCreateCustomer(userId, email, name);
    }

    const { clientSecret } = await createSetupIntent(customerId);
    // Return clientSecret to frontend — it passes this to stripe.confirmCardSetup()
    res.json({ clientSecret, customerId });
  } catch (err) {
    console.error('SetupIntent error:', err.message);
    res.status(500).json({ error: 'Failed to create setup intent' });
  }
});

// POST /api/stripe/financial-session
// Returns clientSecret for Stripe Financial Connections (ACH bank linking path)
router.post('/financial-session', async (req, res) => {
  const { userId, email, name } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    let pm = db.prepare(`SELECT stripe_customer_id FROM payment_methods WHERE user_id = ? LIMIT 1`).get(userId);
    let customerId = pm?.stripe_customer_id;

    if (!customerId) {
      customerId = await getOrCreateCustomer(userId, email, name);
    }

    const { clientSecret } = await createFinancialConnectionsSession(customerId);
    res.json({ clientSecret, customerId });
  } catch (err) {
    console.error('Financial Connections session error:', err.message);
    res.status(500).json({ error: 'Failed to create financial connections session' });
  }
});

// POST /api/stripe/save-payment-method
// Called after frontend successfully confirms card (Stripe Elements) or links bank (FC)
// Attaches the payment method to the customer and stores in DB
router.post('/save-payment-method', async (req, res) => {
  const { userId, customerId, paymentMethodId, type, last4 } = req.body;
  if (!userId || !paymentMethodId || !type) {
    return res.status(400).json({ error: 'userId, paymentMethodId, and type required' });
  }

  try {
    await attachPaymentMethod(paymentMethodId, customerId);

    // Remove old default, set new one
    db.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).run(userId);
    db.prepare(`
      INSERT OR REPLACE INTO payment_methods (id, user_id, stripe_customer_id, stripe_payment_method_id, type, last4, is_default)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(randomUUID(), userId, customerId, paymentMethodId, type, last4 ?? null);

    // Also update user's payment_method preference
    db.prepare(`UPDATE users SET payment_method = ? WHERE id = ?`).run(type, userId);

    res.json({ saved: true });
  } catch (err) {
    console.error('Save payment method error:', err.message);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

export default router;
