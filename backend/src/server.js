/**
 * PocketCache Backend Server
 *
 * PocketCache is a PURE TECH VENDOR (white-label SaaS).
 * The NONPROFIT is the merchant of record on its own Stripe Connect Standard account.
 * PocketCache NEVER holds, receives, or controls donation funds.
 *
 * REVENUE MODEL v3 (2026-07-03, flat fees only — no percentages, no SaaS invoices):
 *   Single stream: $1.00/active-donor/month via Stripe application_fee on each monthly charge.
 *   Itemized: $0.50 tracking + $0.50 processing. MANDATORY — no opt-out.
 *   Nonprofits NEVER pay PocketCache directly.
 *
 * FUND FLOW:
 *   Donor → Stripe → Nonprofit's Stripe Connect account
 *   PocketCache takes $0.50 application_fee (routes to our platform Stripe balance)
 *   No DAF. No Endaoment. No Treasury. No % fees. No fund custody.
 *
 * JOB SCHEDULE:
 *   12:01am daily  — apply nonprofit switches, fetch Plaid transactions, log round-ups
 *    7:00am daily  — retry failed charges (retry-charges.js)
 *    6:00am 1st    — monthly charge run (monthly-charge.js)
 */

import express from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import plaidRoutes from './routes/plaid.js';
import stripeRoutes from './routes/stripe.js';
import webhookRoutes from './routes/webhooks.js';
import userRoutes from './routes/users.js';
import nonprofitRoutes from './routes/nonprofits.js';
import { runDailyRoundups } from './jobs/daily-roundups.js';
import { runMonthlyCharge } from './jobs/monthly-charge.js';
import { runRetryCharges } from './jobs/retry-charges.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
// Webhooks MUST come BEFORE express.json() — they need the raw body for signature verification
app.use('/api/webhooks', webhookRoutes);
app.use(express.json());

// CORS — allow requests from frontend
app.use((req, res, next) => {
  const allowed = process.env.FRONTEND_URL ?? 'https://bpangman.github.io';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/plaid', plaidRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/nonprofits', nonprofitRoutes);

// /health is intentionally unauthenticated — used by uptime monitors
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Scheduled Jobs ────────────────────────────────────────────────────────────
// 12:01am daily: apply pending nonprofit switches and fetch new Plaid transactions.
// The 12:01am time ensures nonprofit switches take effect on a clean day boundary —
// purchases before midnight get the old nonprofit; purchases after get the new one.
cron.schedule('1 0 * * *', () => {
  runDailyRoundups().catch(err => console.error('[cron] daily-roundups failed:', err));
});

// 7am daily: retry failed monthly charges (retries scheduled 3 days after first failure)
cron.schedule('0 7 * * *', () => {
  runRetryCharges().catch(err => console.error('[cron] retry-charges failed:', err));
});

// 1st of every month at 6am: charge all eligible donors
cron.schedule('0 6 1 * *', () => {
  runMonthlyCharge().catch(err => console.error('[cron] monthly-charge failed:', err));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PocketCache backend running on port ${PORT}`);
  console.log(`Plaid env: ${process.env.PLAID_ENV ?? 'sandbox'}`);
  console.log(`Stripe Connect: ${process.env.STRIPE_CLIENT_ID ? 'configured' : 'NOT configured (TODO for nonprofit onboarding)'}`);
  console.log(`Auth: ${process.env.SESSION_SECRET ? 'JWT configured' : 'WARNING: SESSION_SECRET not set'}`);
  console.log(`Crypto: ${process.env.PLAID_TOKEN_KEY ? 'token encryption configured' : 'WARNING: PLAID_TOKEN_KEY not set'}`);
});

export default app;
