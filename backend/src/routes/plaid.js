/**
 * Plaid API routes
 * POST /api/plaid/link-token     — frontend calls this to open Plaid Link
 * POST /api/plaid/exchange       — frontend calls this after user links card
 */

import express from 'express';
import { createLinkToken, exchangePublicToken, getAccounts } from '../services/plaid.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// POST /api/plaid/link-token
// Returns a short-lived link_token for the frontend to open Plaid Link
router.post('/link-token', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const linkToken = await createLinkToken(userId);
    res.json({ link_token: linkToken });
  } catch (err) {
    console.error('Plaid link-token error:', err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// POST /api/plaid/exchange
// Called after user completes Plaid Link — exchanges public_token for access_token
// Also identifies the specific account (card) the user selected
router.post('/exchange', async (req, res) => {
  const { userId, publicToken, accountId } = req.body;
  if (!userId || !publicToken || !accountId) {
    return res.status(400).json({ error: 'userId, publicToken, and accountId required' });
  }

  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    const accounts = await getAccounts(accessToken);
    const selectedAccount = accounts.find(a => a.account_id === accountId);

    // Store connection — access_token is sensitive, never returned to frontend
    db.prepare(`
      INSERT OR REPLACE INTO plaid_connections (id, user_id, access_token, item_id, institution, last4, account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      userId,
      accessToken,
      itemId,
      selectedAccount?.institution_name ?? null,
      selectedAccount?.mask ?? null,  // last 4 digits
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
