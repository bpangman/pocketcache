/**
 * PocketCache Backend Server
 *
 * Architecture: White-label B2B tech vendor model.
 * PocketCache is the SOFTWARE PROVIDER. The Nonprofit is the MERCHANT OF RECORD.
 * All donation charges are DIRECT CHARGES on the nonprofit's own Stripe Connect Standard account.
 * PocketCache NEVER holds, receives, or controls donation funds.
 * PocketCache's revenue is FLAT FEES only — never a percentage of donations.
 *
 * FUND FLOW
 * ─────────
 * All charges are created as direct charges (not destination charges) on the nonprofit's
 * Stripe Connect account. The nonprofit is the merchant of record on the donor's statement.
 *
 * NONPROFIT ONBOARDING
 * ────────────────────
 * 1. Nonprofit enters EIN → verified against IRS tax-exempt database
 * 2. Nonprofit connects their own Stripe account via Stripe Connect Standard OAuth
 *    → PocketCache stores the connected account ID (acct_xxx), never the keys
 * 3. Nonprofit configures branding (logo, colors, story) and accepts Nonprofit Software License
 * 4. Nonprofit's PocketCache page is live immediately
 *
 * DONOR ONBOARDING
 * ────────────────
 * 1. Donor follows nonprofit's link/QR code
 * 2. Donor signs up (SSO) and selects their state (California residents blocked at launch)
 * 3. Donor links card via Plaid (read-only transaction monitoring)
 * 4. Donor selects payment method (ACH or card)
 * 5. Donor reviews checkout screen: sees round-up estimate, one-charge explanation,
 *    and pre-checked "cover the $0.50/mo processing fee" checkbox
 * 6. Donor confirms → donor record created linked to nonprofit's Stripe Connect account
 *
 * DAILY (2am every night)
 * ───────────────────────
 * 7. daily-roundups job fetches new transactions via Plaid for each donor
 *    → calculates round-ups, saves to DB
 *    → filters out PocketCache's own charges (infinite loop prevention)
 *
 * MONTHLY CHARGE (1st of month, 6am)
 * ────────────────────────────────────
 * 8. monthly-charge job sums un-swept round-ups per donor
 *    → if >= $0.01: creates a DIRECT CHARGE on nonprofit's Stripe Connect account
 *      (stripe.charges.create with stripe_account: nonprofit.stripeAccountId)
 *    → amount = round-ups + $0.50 processing fee (if donor opted to cover it)
 *      OR amount = round-ups alone (if donor opted out; $0.50 deducted from round-up total)
 *    → application_fee_amount = $0.50 (flat) per charge → routes to PocketCache platform balance
 *    → statement_descriptor = nonprofit's name (not "PocketCache")
 *    → on failure: retry once after 3 days; pause donor if retry fails
 *
 * MONTHLY INVOICE TO NONPROFIT (5th of month)
 * ─────────────────────────────────────────────
 * 9. Monthly Stripe Billing invoice to nonprofit for $0.50 × active linked users
 *    "Active linked user" = at least $0.01 in round-ups during the month
 *    This is separate from and in addition to the application_fee from charges.
 *    Total PocketCache revenue per active donor ≈ $1.00/month.
 *
 * NO DAF, NO ENDAOMENT, NO TREASURY
 * ───────────────────────────────────
 * Phase 1 launches with direct Stripe charges only.
 * No donor-advised fund, no Endaoment sweep, no Stripe Treasury float.
 * DAF/marketplace features are deferred to Phase 2 (multi-charity platform stage).
 *
 * REVENUE STREAMS
 * ───────────────
 * A. application_fee_amount: $0.50 flat per monthly donor charge (processing fee)
 * B. Monthly SaaS invoice: $0.50/active linked user/month to nonprofit
 * Total: ~$1.00/active donor/month to PocketCache. Always flat. Never a %.
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
// Daily at 12:01am: apply pending cause changes and fetch new transactions.
// Must run at midnight so cause switches take effect on the correct calendar day —
// transactions from 12:01am onward get the new cause, not the old one.
cron.schedule('1 0 * * *', () => {
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
  console.log(`Spare backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.PLAID_ENV ?? 'sandbox'}`);
  console.log(`Treasury: ${process.env.STRIPE_TREASURY_FINANCIAL_ACCOUNT_ID ? 'configured' : 'NOT configured (TODO)'}`);
  console.log(`Endaoment: ${process.env.ENDAOMENT_CLIENT_ID ? 'configured' : 'NOT configured (TODO)'}`);
});

export default app;
