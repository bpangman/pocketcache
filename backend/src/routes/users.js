/**
 * User routes
 *
 * POST /api/users/register                    — create donor account (CA blocked)
 * POST /api/users/me/cancel                   — final settle-up charge + account cancellation
 * POST /api/users/:id/switch-nonprofit        — stage a nonprofit switch (day-boundary)
 * GET  /api/users/:id/nonprofit               — current + pending nonprofit
 * GET  /api/users/:id/roundups                — recent round-ups
 * POST /api/users/:id/cover-fee              — update cover_processing preference (route path kept stable)
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// POST /api/users/register — public (called before auth token exists)
// Creates a donor account. California donors are blocked at signup per legal requirements.
router.post('/register', (req, res) => {
  // coverProcessing: donor toggle to cover the nonprofit's Stripe card-processing costs.
  // Default ON (pre-checked). Does NOT affect the mandatory $1.00/month PocketCache fee.
  const { email, name, state, nonprofitJoinCode, coverProcessing } = req.body;
  if (!email || !state || !nonprofitJoinCode) {
    return res.status(400).json({ error: 'email, state, and nonprofitJoinCode required' });
  }

  // LEGAL REQUIREMENT: California donors are blocked at launch.
  // This must be enforced server-side — never rely on frontend only.
  if (state.toUpperCase() === 'CA') {
    return res.status(403).json({
      error: 'PocketCache is not available to California residents at this time.',
      code: 'CA_BLOCKED',
    });
  }

  const nonprofit = db.prepare(`SELECT id FROM nonprofits WHERE join_code = ? AND status = 'active'`).get(nonprofitJoinCode.toUpperCase());
  if (!nonprofit) return res.status(404).json({ error: 'Nonprofit not found or inactive' });

  // Check for duplicate email
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, name, state, nonprofit_id, cover_processing)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, email, name ?? null, state.toUpperCase(), nonprofit.id, coverProcessing === false ? 0 : 1);

  res.status(201).json({ id });
});

// All routes below require auth
router.use(requireAuth);

// POST /api/users/me/cancel
// Immediately runs a final settle-up charge of all accrued round-ups + fees (minimum waived),
// then marks the account cancelled and disconnects all Plaid items.
// Idempotency key: charge_{userId}_final — safe to call more than once.
// NOTE: declare BEFORE /:id routes so 'me' is matched literally, not as a user ID.
router.post('/me/cancel', async (req, res) => {
  const userId = req.userId; // from JWT — never from body

  const user = db.prepare(`SELECT id, status FROM users WHERE id = ?`).get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status === 'cancelled') return res.status(409).json({ error: 'Account already cancelled' });

  try {
    // 0. The cancel screen lets the donor choose whether to cover the nonprofit's card-processing
    //    costs on the final charge (pre-checked, always their call — never a penalty for leaving).
    //    Persist the choice BEFORE the final charge so the settle-up honors it.
    if (typeof req.body?.coverProcessing === 'boolean') {
      db.prepare(`UPDATE users SET cover_processing = ? WHERE id = ?`).run(req.body.coverProcessing ? 1 : 0, userId);
    }

    // 1. Final settle-up charge (minimum waived, idempotent) — unless the donor
    //    declined the final donation (body.donate === false), in which case their
    //    uncharged round-ups and fee accruals are waived per Terms §12.
    let chargeResult = null;
    if (req.body?.donate === false) {
      db.prepare(`UPDATE roundups SET status = 'reversed' WHERE user_id = ? AND included_in IS NULL`).run(userId);
      db.prepare(`DELETE FROM fee_accruals WHERE user_id = ? AND included_in IS NULL`).run(userId);
    } else {
      const { runFinalCharge } = await import('../jobs/monthly-charge.js');
      chargeResult = await runFinalCharge(userId);
    }

    // 2. Mark account cancelled
    db.prepare(`UPDATE users SET status = 'cancelled' WHERE id = ?`).run(userId);

    // 3. Disconnect all active Plaid items — stops Plaid billing.
    //    Tolerate individual failures (log and continue); user is cancelled regardless.
    const { removeItem } = await import('../services/plaid.js');
    const { decrypt } = await import('../lib/crypto.js');

    const connections = db.prepare(`
      SELECT id, access_token FROM plaid_connections WHERE user_id = ? AND status = 'active'
    `).all(userId);

    for (const conn of connections) {
      try {
        const accessToken = decrypt(conn.access_token);
        await removeItem(accessToken);
      } catch (err) {
        console.warn(`[cancel] Plaid removeItem failed for connection ${conn.id}:`, err.message);
        // Tolerate failure — connection is marked disconnected regardless
      }
      db.prepare(`
        UPDATE plaid_connections SET status = 'disconnected', disconnected_at = unixepoch()
        WHERE id = ?
      `).run(conn.id);
    }

    console.log(`[cancel] User ${userId} cancelled. Plaid connections disconnected: ${connections.length}`);

    return res.json({
      cancelled: true,
      finalCharge: chargeResult ?? null,
      message: chargeResult
        ? 'Account cancelled. Your final balance has been charged.'
        : 'Account cancelled. No outstanding balance to charge.',
    });

  } catch (err) {
    console.error(`[cancel] Error cancelling user ${userId}:`, err.message);
    return res.status(500).json({ error: 'Cancellation failed. Please try again or contact support.' });
  }
});

// POST /api/users/me/reactivate
// Reactivates a cancelled account. Only callable from status 'cancelled'.
// Frontend must run Plaid Link again after this call — the Plaid item was removed
// at cancellation (see /me/cancel), so needsPlaidRelink is always true.
// New round-ups accrue from the re-link date. Fee accrual resumes with activity.
router.post('/me/reactivate', async (req, res) => {
  const userId = req.userId; // from JWT — never from body

  const user = db.prepare(`SELECT id, status FROM users WHERE id = ?`).get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status !== 'cancelled') {
    return res.status(409).json({ error: 'Account is not cancelled — cannot reactivate' });
  }

  db.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).run(userId);

  return res.json({
    reactivated: true,
    // Plaid item was removed at cancellation; frontend must run Plaid Link again.
    // Round-ups accrue from re-link date only; fee accrual resumes with activity.
    needsPlaidRelink: true,
  });
});

// POST /api/users/:id/switch-nonprofit
// Stages a nonprofit switch. Takes effect at next 12:01am job.
// req.userId (from JWT) must match :id — prevents IDOR.
router.post('/:id/switch-nonprofit', (req, res) => {
  const { id } = req.params;

  // Authorization: users can only update their own record
  if (req.userId !== id) return res.status(403).json({ error: 'Forbidden' });

  const { joinCode } = req.body;
  if (!joinCode) return res.status(400).json({ error: 'joinCode required' });

  const user = db.prepare(`SELECT nonprofit_id FROM users WHERE id = ?`).get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const nonprofit = db.prepare(`SELECT id FROM nonprofits WHERE join_code = ? AND status = 'active'`).get(joinCode.toUpperCase());
  if (!nonprofit) return res.status(404).json({ error: 'Nonprofit not found or inactive' });

  if (user.nonprofit_id === nonprofit.id) {
    return res.json({ changed: false, message: 'Already your active nonprofit.' });
  }

  db.prepare(`UPDATE users SET pending_nonprofit_id = ? WHERE id = ?`).run(nonprofit.id, id);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const effectiveDate = tomorrow.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  res.json({
    changed: true,
    effectiveDate,
    message: `Your nonprofit will switch on ${effectiveDate}. Today's round-ups still go to your current nonprofit.`,
  });
});

// GET /api/users/:id/nonprofit
router.get('/:id/nonprofit', (req, res) => {
  if (req.userId !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

  const user = db.prepare(`
    SELECT
      u.nonprofit_id, u.pending_nonprofit_id,
      np.name AS nonprofit_name, np.join_code,
      pnp.name AS pending_nonprofit_name, pnp.join_code AS pending_join_code
    FROM users u
    LEFT JOIN nonprofits np  ON np.id = u.nonprofit_id
    LEFT JOIN nonprofits pnp ON pnp.id = u.pending_nonprofit_id
    WHERE u.id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// GET /api/users/:id/roundups — recent round-ups for the donor dashboard
router.get('/:id/roundups', (req, res) => {
  if (req.userId !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

  const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
  const roundups = db.prepare(`
    SELECT id, merchant, amount_cents, roundup_cents, date, status, created_at
    FROM roundups
    WHERE user_id = ?
    ORDER BY date DESC
    LIMIT ?
  `).all(req.params.id, limit);
  res.json(roundups);
});

// POST /api/users/:id/cover-fee — update the cover-processing preference
// Route path kept stable (/cover-fee) for API compatibility; semantics updated in v3:
//   this toggle now controls whether the donor covers the NONPROFIT'S Stripe card-processing
//   costs via a gross-up. The mandatory $1.00/month PocketCache fee is unaffected by this toggle.
router.post('/:id/cover-fee', (req, res) => {
  if (req.userId !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

  // Accept both old (coverFee) and new (coverProcessing) field names for compatibility
  const rawValue = req.body.coverProcessing ?? req.body.coverFee;
  if (typeof rawValue !== 'boolean' && rawValue !== 0 && rawValue !== 1) {
    return res.status(400).json({ error: 'coverProcessing must be boolean or 0/1' });
  }

  db.prepare(`UPDATE users SET cover_processing = ? WHERE id = ?`).run(rawValue ? 1 : 0, req.params.id);
  res.json({ updated: true });
});

export default router;
