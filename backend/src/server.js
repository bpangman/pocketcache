/**
 * PocketChange Backend Server
 *
 * Full fund flow:
 *
 *  USER ONBOARDING
 *  ───────────────
 *  1. Frontend calls POST /api/plaid/link-token
 *     → backend creates Plaid Link token
 *  2. User links card in Plaid Link modal (frontend)
 *  3. Frontend calls POST /api/plaid/exchange with public_token
 *     → backend exchanges for access_token (stored securely, never exposed)
 *
 *  4. User picks payment method (ACH / Apple Pay / Card)
 *  5a. Card: frontend calls POST /api/stripe/setup-intent
 *          → backend returns clientSecret
 *          → frontend calls stripe.confirmCardSetup(clientSecret) via Stripe Elements
 *          → frontend calls POST /api/stripe/save-payment-method with resulting pm_id
 *  5b. ACH:  frontend calls POST /api/stripe/financial-session
 *          → backend returns clientSecret
 *          → frontend uses Stripe Financial Connections to link bank
 *          → frontend calls POST /api/stripe/save-payment-method with resulting pm_id
 *
 *  DAILY (2am every night)
 *  ───────────────────────
 *  6. daily-roundups job fetches new transactions via Plaid for each user
 *     → calculates round-ups, saves to DB
 *     → filters out PocketChange's own charges (infinite loop prevention)
 *
 *  MONTHLY (1st of month, 6am)
 *  ───────────────────────────
 *  7. monthly-charge job sums un-swept round-ups per user
 *     → if >= $5 minimum: charges user via Stripe
 *     → deducts platform fee (5% ACH, 10% Apple Pay/Card)
 *     → deposits net amount to Stripe Treasury
 *     → on failure: retry once after 3 days; pause account if retry fails
 *
 *  QUARTERLY (Jan 1, Apr 1, Jul 1, Oct 1 at 8am)
 *  ────────────────────────────────────────────────
 *  8. quarterly-sweep job gets Treasury balance
 *     → initiates ACH OutboundTransfer from Treasury → Endaoment bank account
 *     → calls Endaoment API to submit grants proportionally to each chosen nonprofit
 *     → Endaoment issues tax receipts to users automatically
 *
 *  REVENUE STREAMS
 *  ───────────────
 *  A. Platform fees (5-10%) taken at charge time — stays in Stripe platform balance
 *  B. Float interest: Treasury earns yield on held funds between monthly charge and
 *     quarterly disbursement (~45-day average hold). Stripe pays this to the platform.
 */

import express from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import plaidRoutes from './routes/plaid.js';
import stripeRoutes from './routes/stripe.js';
import webhookRoutes from './routes/webhooks.js';
import userRoutes from './routes/users.js';
import { runDailyRoundups } from './jobs/daily-roundups.js';
import { runMonthlyCharge } from './jobs/monthly-charge.js';
import { runQuarterlySweep } from './jobs/quarterly-sweep.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
// Webhooks need raw body for signature verification — must come BEFORE express.json()
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

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Scheduled Jobs ────────────────────────────────────────────────────────────
// Daily at 2am: fetch new transactions and calculate round-ups
cron.schedule('0 2 * * *', () => {
  runDailyRoundups().catch(err => console.error('[cron] daily-roundups failed:', err));
});

// 1st of every month at 6am: charge users
cron.schedule('0 6 1 * *', () => {
  runMonthlyCharge().catch(err => console.error('[cron] monthly-charge failed:', err));
});

// Quarterly on the 1st of Jan, Apr, Jul, Oct at 8am: sweep to Endaoment
cron.schedule('0 8 1 1,4,7,10 *', () => {
  runQuarterlySweep().catch(err => console.error('[cron] quarterly-sweep failed:', err));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PocketChange backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.PLAID_ENV ?? 'sandbox'}`);
  console.log(`Treasury: ${process.env.STRIPE_TREASURY_FINANCIAL_ACCOUNT_ID ? 'configured' : 'NOT configured (TODO)'}`);
  console.log(`Endaoment: ${process.env.ENDAOMENT_CLIENT_ID ? 'configured' : 'NOT configured (TODO)'}`);
});

export default app;
