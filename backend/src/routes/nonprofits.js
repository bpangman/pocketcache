/**
 * Nonprofit routes
 *
 * Public:
 *   GET  /api/nonprofits/by-code/:code     — returns branding for gate screen (no auth needed)
 *
 * Auth'd (nonprofit admin — TODO: scope to nonprofit admin role in production):
 *   POST /api/nonprofits                   — EIN signup, verify via ProPublica
 *   POST /api/nonprofits/:id/connect-stripe — returns Stripe Connect onboarding URL
 *   GET  /api/nonprofits/:id/summary       — active donors, MTD accrued, last charge run
 *   GET  /api/nonprofits/:id/donors        — paginated, masked emails
 *   GET  /api/nonprofits/:id/charges       — charge-run history
 */

import express from 'express';
import axios from 'axios';
import { createNonprofitStripeConnectLink, handleConnectCallback } from '../services/stripe.js';
import { requireAuth } from '../middleware/auth.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// ── PUBLIC: Gate screen branding ─────────────────────────────────────────────
// Returns only safe public branding fields — no PII, no Stripe account IDs.
router.get('/by-code/:code', (req, res) => {
  const nonprofit = db.prepare(`
    SELECT name, logo_url, brand_color, mission, monthly_minimum_cents
    FROM nonprofits
    WHERE join_code = ? AND status = 'active'
  `).get(req.params.code.toUpperCase());

  if (!nonprofit) return res.status(404).json({ error: 'Nonprofit not found or inactive' });
  res.json(nonprofit);
});

// ── PUBLIC: Per-org public stats ──────────────────────────────────────────────
// DEPLOY NOTE: include this endpoint in the rate-limiting middleware at launch
// (public, no auth — serves the org landing page and donor-facing stats grid).
//
// Stat definitions:
//   totalRaisedCents — SUM(roundup_cents) from monthly_charges WHERE status='succeeded'
//     for this org. Donation portion only (round-ups directed to the nonprofit, not fees
//     or processing cover). Honest public headline: what donors sent to the org.
//   totalDonors     — COUNT(DISTINCT user_id) from monthly_charges WHERE status='succeeded'
//     for this org. Lifetime unique donors with ≥1 completed charge.
//   activeDonors    — COUNT of users WHERE nonprofit_id = this AND status = 'active'.
//     Currently-linked donors who will accrue and be charged in the next cycle.
router.get('/by-code/:code/stats', (req, res) => {
  const np = db.prepare(`
    SELECT id FROM nonprofits WHERE join_code = ? AND status = 'active'
  `).get(req.params.code.toUpperCase());

  if (!np) return res.status(404).json({ error: 'Nonprofit not found or inactive' });

  const { totalRaisedCents } = db.prepare(`
    SELECT COALESCE(SUM(roundup_cents), 0) AS totalRaisedCents
    FROM monthly_charges
    WHERE nonprofit_id = ? AND status = 'succeeded'
  `).get(np.id);

  const { totalDonors } = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS totalDonors
    FROM monthly_charges
    WHERE nonprofit_id = ? AND status = 'succeeded'
  `).get(np.id);

  const { activeDonors } = db.prepare(`
    SELECT COUNT(*) AS activeDonors
    FROM users
    WHERE nonprofit_id = ? AND status = 'active'
  `).get(np.id);

  res.json({ totalRaisedCents, totalDonors, activeDonors });
});

// ── AUTH'd routes ─────────────────────────────────────────────────────────────
router.use(requireAuth);

// POST /api/nonprofits — EIN signup
// Verifies the EIN against ProPublica Nonprofit Explorer API, creates nonprofit record.
router.post('/', async (req, res) => {
  const { ein, name, address, joinCode, adminEmail, mission, logoUrl, brandColor } = req.body;
  if (!ein || !joinCode || !adminEmail) {
    return res.status(400).json({ error: 'ein, joinCode, and adminEmail required' });
  }

  // Normalize EIN (strip dashes for API lookup)
  const einClean = ein.replace(/-/g, '');
  const einFormatted = `${einClean.slice(0, 2)}-${einClean.slice(2)}`;

  // Verify via ProPublica Nonprofit Explorer
  // Docs: https://projects.propublica.org/nonprofits/api/v2/organizations/{ein}.json
  let proPublicaName = name;
  try {
    const ppResp = await axios.get(
      `https://projects.propublica.org/nonprofits/api/v2/organizations/${einClean}.json`,
      { timeout: 8000 }
    );
    if (!ppResp.data?.organization) {
      return res.status(400).json({ error: 'EIN not found in IRS tax-exempt database. Please verify the EIN.' });
    }
    proPublicaName = ppResp.data.organization.name ?? name;
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(400).json({ error: 'EIN not found in IRS tax-exempt database.' });
    }
    // API down or network error — log and continue with provided name
    console.error('[nonprofits] ProPublica API error (proceeding without verification):', err.message);
  }

  // Check for duplicate EIN or join code
  const existing = db.prepare(`SELECT id FROM nonprofits WHERE ein = ? OR join_code = ?`)
    .get(einFormatted, joinCode.toUpperCase());
  if (existing) {
    return res.status(409).json({ error: 'A nonprofit with this EIN or join code already exists.' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO nonprofits (id, ein, name, address, join_code, admin_email, mission, logo_url, brand_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, einFormatted, proPublicaName, address ?? null, joinCode.toUpperCase(),
         adminEmail, mission ?? null, logoUrl ?? null, brandColor ?? null);

  res.status(201).json({ id, ein: einFormatted, name: proPublicaName, joinCode: joinCode.toUpperCase() });
});

// POST /api/nonprofits/:id/connect-stripe — initiate Stripe Connect Standard OAuth
router.post('/:id/connect-stripe', async (req, res) => {
  const nonprofit = db.prepare(`SELECT id, name FROM nonprofits WHERE id = ?`).get(req.params.id);
  if (!nonprofit) return res.status(404).json({ error: 'Nonprofit not found' });

  try {
    const url = await createNonprofitStripeConnectLink(nonprofit.id);
    res.json({ url });
  } catch (err) {
    console.error('[nonprofits] Stripe Connect link error:', err.message);
    res.status(500).json({ error: 'Failed to create Stripe Connect link' });
  }
});

// GET /api/nonprofits/connect-callback — Stripe OAuth callback (called by redirect)
// In production this would be a real redirect URL; for now it's an API endpoint.
router.get('/connect-callback', async (req, res) => {
  const { code, state: nonprofitId } = req.query;
  if (!code || !nonprofitId) return res.status(400).json({ error: 'code and state required' });

  try {
    const accountId = await handleConnectCallback(nonprofitId, code);
    res.json({ stripe_account_id: accountId, connected: true });
  } catch (err) {
    console.error('[nonprofits] Connect callback error:', err.message);
    res.status(500).json({ error: 'Failed to complete Stripe Connect' });
  }
});

// GET /api/nonprofits/:id/summary — MTD stats for dashboard
router.get('/:id/summary', (req, res) => {
  const { id } = req.params;
  const nonprofit = db.prepare(`SELECT id FROM nonprofits WHERE id = ?`).get(id);
  if (!nonprofit) return res.status(404).json({ error: 'Nonprofit not found' });

  const period = getCurrentPeriod();

  const activeDonors = db.prepare(`
    SELECT COUNT(*) AS count FROM users WHERE nonprofit_id = ? AND status = 'active'
  `).get(id);

  // MTD accrued = sum of un-swept round-ups for this nonprofit's donors this month
  const mtdAccrued = db.prepare(`
    SELECT COALESCE(SUM(r.roundup_cents), 0) AS total_cents
    FROM roundups r
    JOIN users u ON u.id = r.user_id
    WHERE r.nonprofit_id = ? AND r.status = 'accrued' AND r.date LIKE ?
  `).get(id, `${period}%`);

  // Last charge run totals
  const lastRun = db.prepare(`
    SELECT
      COUNT(*) AS charge_count,
      COALESCE(SUM(roundup_cents), 0) AS roundup_cents,
      COALESCE(SUM(total_charged_cents), 0) AS total_charged_cents,
      period
    FROM monthly_charges
    WHERE nonprofit_id = ? AND status = 'succeeded'
    ORDER BY charged_at DESC
    LIMIT 20
  `).all(id);

  res.json({
    active_donors: activeDonors.count,
    mtd_accrued_cents: mtdAccrued.total_cents,
    last_charge_runs: lastRun,
  });
});

// GET /api/nonprofits/:id/donors — paginated, masked emails
router.get('/:id/donors', (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
  const offset = parseInt(req.query.offset ?? '0', 10);

  const donors = db.prepare(`
    SELECT
      u.id,
      -- Mask email: first 2 chars + *** + @domain
      SUBSTR(u.email, 1, 2) || '***@' || SUBSTR(u.email, INSTR(u.email, '@') + 1) AS masked_email,
      u.status,
      u.cover_fee,
      u.created_at
    FROM users u
    WHERE u.nonprofit_id = ?
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(id, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE nonprofit_id = ?`).get(id);

  res.json({ donors, total: total.count, limit, offset });
});

// GET /api/nonprofits/:id/charges — charge-run history
router.get('/:id/charges', (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
  const offset = parseInt(req.query.offset ?? '0', 10);

  const charges = db.prepare(`
    SELECT
      mc.id, mc.user_id, mc.period, mc.roundup_cents,
      mc.fee_cents, mc.cover_fee, mc.total_charged_cents,
      mc.status, mc.retry_count, mc.charged_at, mc.created_at
    FROM monthly_charges mc
    WHERE mc.nonprofit_id = ?
    ORDER BY mc.created_at DESC
    LIMIT ? OFFSET ?
  `).all(id, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) AS count FROM monthly_charges WHERE nonprofit_id = ?`).get(id);

  res.json({ charges, total: total.count, limit, offset });
});

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default router;
