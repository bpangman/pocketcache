/**
 * Plaid API routes
 * POST /api/plaid/link-token     — frontend calls this to open Plaid Link
 * POST /api/plaid/exchange       — frontend calls this after user links card
 *
 * All routes require auth. req.userId comes from the JWT token (never from request body).
 */

import express from 'express';
import { createLinkToken, exchangePublicToken, getAccounts } from '../services/plaid.js';
import { encrypt } from '../lib/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

router.use(requireAuth);

// POST /api/plaid/link-token
router.post('/link-token', async (req, res) => {
  try {
    const linkToken = await createLinkToken(req.userId);
    res.json({ link_token: linkToken });
  } catch (err) {
    console.error('Plaid link-token error:', err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// POST /api/plaid/exchange
// Called after user completes Plaid Link. Stores the access_token ENCRYPTED.
router.post('/exchange', async (req, res) => {
  const { publicToken, accountId } = req.body;
  if (!publicToken || !accountId) {
    return res.status(400).json({ error: 'publicToken and accountId required' });
  }

  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    const accounts = await getAccounts(accessToken);
    const selectedAccount = accounts.find(a => a.account_id === accountId);

    // SECURITY: encrypt access_token before storing — never persisted in plaintext
    const encryptedToken = encrypt(accessToken);

    db.prepare(`
      INSERT OR REPLACE INTO plaid_connections (id, user_id, access_token, item_id, institution, last4, account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      req.userId,                                    // from JWT, not body
      encryptedToken,                                // encrypted at rest
      itemId,
      selectedAccount?.institution_name ?? null,
      selectedAccount?.mask ?? null,
      accountId
    );

    res.json({
      connected: true,
      institution: selectedAccount?.institution_name,
      last4: selectedAccount?.mask,
    });
  } catch (err) {
    console.error('Plaid exchange error:', err.message);
    res.status(500).json({ error: 'Failed to link card' });
  }
});

export default router;
