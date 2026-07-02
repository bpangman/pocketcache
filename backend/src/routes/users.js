/**
 * User routes
 *
 * POST /api/users/register                    — create donor account (CA blocked)
 * POST /api/users/:id/switch-nonprofit        — stage a nonprofit switch (day-boundary)
 * GET  /api/users/:id/nonprofit               — current + pending nonprofit
 * GET  /api/users/:id/roundups                — recent round-ups
 * POST /api/users/:id/cover-fee              — update cover_fee preference
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// POST /api/users/register — public (called before auth token exists)
// Creates a donor account. California donors are blocked at signup per legal requirements.
router.post('/register', (req, res) => {
  const { email, name, state, nonprofitJoinCode, coverFee } = req.body;
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
    INSERT INTO users (id, email, name, state, nonprofit_id, cover_fee)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, email, name ?? null, state.toUpperCase(), nonprofit.id, coverFee === false ? 0 : 1);

  res.status(201).json({ id });
});

// All routes below require auth
router.use(requireAuth);

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

// POST /api/users/:id/cover-fee — update the cover-fee preference
router.post('/:id/cover-fee', (req, res) => {
  if (req.userId !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

  const { coverFee } = req.body;
  if (typeof coverFee !== 'boolean' && coverFee !== 0 && coverFee !== 1) {
    return res.status(400).json({ error: 'coverFee must be boolean or 0/1' });
  }

  db.prepare(`UPDATE users SET cover_fee = ? WHERE id = ?`).run(coverFee ? 1 : 0, req.params.id);
  res.json({ updated: true });
});

export default router;
