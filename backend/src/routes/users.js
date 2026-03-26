/**
 * User routes
 * POST /api/users/:id/cause  — stage a cause change (takes effect tomorrow at 2am)
 * GET  /api/users/:id/cause  — get current + pending cause
 */

import express from 'express';
import db from '../db/index.js';

const router = express.Router();

// POST /api/users/:id/cause
// Stages a cause change. Does NOT take effect immediately — applied at next 2am job.
// Response includes effective_date so the frontend can show "effective tomorrow."
router.post('/:id/cause', (req, res) => {
  const { id } = req.params;
  const { causeOrgId } = req.body;
  if (!causeOrgId) return res.status(400).json({ error: 'causeOrgId required' });

  const user = db.prepare(`SELECT cause_org_id FROM users WHERE id = ?`).get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.cause_org_id === causeOrgId) {
    return res.json({ changed: false, message: 'Already your active cause.' });
  }

  db.prepare(`UPDATE users SET pending_cause_org_id = ? WHERE id = ?`).run(causeOrgId, id);

  // Calculate tomorrow's date for the UI message
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const effectiveDate = tomorrow.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  res.json({
    changed: true,
    effectiveDate,
    message: `Your cause will switch on ${effectiveDate}. Today's round-ups still go to your current cause.`,
  });
});

// GET /api/users/:id/cause
router.get('/:id/cause', (req, res) => {
  const user = db.prepare(`
    SELECT cause_org_id, pending_cause_org_id FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

export default router;
