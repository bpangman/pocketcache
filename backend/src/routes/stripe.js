/**
 * Stripe API routes
 * POST /api/stripe/setup-intent        — create SetupIntent for card entry (Stripe Elements)
 * POST /api/stripe/financial-session   — create Financial Connections session for ACH
 * POST /api/stripe/save-payment-method — store payment method after frontend confirmation
 *
 * All routes require auth. req.userId comes from the JWT token.
 */

import express from 'express';
import {
  getOrCreateCustomer,
  createSetupIntent,
  createFinancialConnectionsSession,
  attachPaymentMethod,
} from '../services/stripe.js';
import { requireAuth } from '../middleware/auth.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

router.use(requireAuth);

// POST /api/stripe/setup-intent
router.post('/setup-intent', async (req, res) => {
  const { email, name } = req.body;

  try {
    const customerId = await getOrCreateCustomer(req.userId, email, name);
    const { clientSecret } = await createSetupIntent(customerId);
    res.json({ clientSecret, customerId });
  } catch (err) {
    console.error('SetupIntent error:', err.message);
    res.status(500).json({ error: 'Failed to create setup intent' });
  }
});

// POST /api/stripe/financial-session
router.post('/financial-session', async (req, res) => {
  const { email, name } = req.body;

  try {
    const customerId = await getOrCreateCustomer(req.userId, email, name);
    const { clientSecret } = await createFinancialConnectionsSession(customerId);
    res.json({ clientSecret, customerId });
  } catch (err) {
    console.error('Financial Connections session error:', err.message);
    res.status(500).json({ error: 'Failed to create financial connections session' });
  }
});

// POST /api/stripe/save-payment-method
router.post('/save-payment-method', async (req, res) => {
  const { customerId, paymentMethodId, type, last4 } = req.body;
  if (!paymentMethodId || !type || !customerId) {
    return res.status(400).json({ error: 'customerId, paymentMethodId, and type required' });
  }

  try {
    await attachPaymentMethod(paymentMethodId, customerId);

    db.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).run(req.userId);
    db.prepare(`
      INSERT OR REPLACE INTO payment_methods (id, user_id, stripe_customer_id, stripe_payment_method_id, type, last4, is_default)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(randomUUID(), req.userId, customerId, paymentMethodId, type, last4 ?? null);

    db.prepare(`UPDATE users SET payment_method = ? WHERE id = ?`).run(type, req.userId);

    res.json({ saved: true });
  } catch (err) {
    console.error('Save payment method error:', err.message);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

export default router;
