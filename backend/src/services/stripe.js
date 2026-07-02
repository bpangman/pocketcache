/**
 * Stripe Service
 *
 * PocketCache uses Stripe Connect Standard (OAuth).
 * The NONPROFIT is the merchant of record on its own Stripe account.
 * All donation charges are DIRECT CHARGES on the nonprofit's connected account.
 * PocketCache NEVER holds or controls donation funds.
 *
 * FEE MODEL (accrual-based, no percentages):
 *   Fees accrue monthly — one fee_accrual row per active month per donor.
 *   application_fee_amount = sum of unswept fee_accruals swept in this charge.
 *   The fee routes to the PocketCache platform Stripe balance.
 *
 * COVER-FEE LOGIC (per donor preference):
 *   cover_fee = 1 (default): $1.00/month accrues per active month.
 *     total charged = roundup_cents + fee_cents
 *     nonprofit receives = roundup_cents (PocketCache collects $1.00/active-month via app fee)
 *     → covers both PocketCache's processing fee AND nonprofit's software fee; nonprofit pays $0
 *   cover_fee = 0 (opted out): $0.50/month accrues per active month.
 *     total charged = roundup_cents only
 *     nonprofit receives = roundup_cents - fee_cents (PocketCache collects $0.50/month via app fee)
 *     → remaining $0.50/month owed by nonprofit via SaaS invoice (see fee_accruals.covered=0)
 *   In BOTH cases, application_fee_amount = fee_cents (the sum of swept accruals).
 *
 * CONNECT NUANCE — payment method cloning:
 *   A platform-level Customer/PaymentMethod CANNOT be used directly on a connected account.
 *   Canonical pattern:
 *     1. stripe.paymentMethods.create({ customer: platformCustomerId, payment_method: platformPmId },
 *                                      { stripeAccount: connectedAccountId })
 *        → creates a cloned pm_... on the connected account
 *     2. stripe.customers.create({ payment_method: clonedPmId }, { stripeAccount: connectedAccountId })
 *        → creates a connected-account Customer; store connected_customer_id in DB
 *     3. On subsequent charges for the same user+nonprofit, reuse the stored connected_customer_id
 *        and connected_payment_method_id (no re-cloning needed).
 *   See: https://stripe.com/docs/connect/cloning-customers-across-accounts
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';
import db from '../db/index.js';
import { randomUUID } from 'crypto';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Get or create a platform-level Stripe Customer for a user.
 * Idempotent — looks up users.stripe_customer_id first, only creates if missing.
 *
 * @param {string} userId
 * @param {string} email
 * @param {string} [name]
 * @returns {Promise<string>} Stripe customer ID (cus_...)
 */
export async function getOrCreateCustomer(userId, email, name) {
  // Look up existing customer first — never create duplicates
  const user = db.prepare(`SELECT stripe_customer_id FROM users WHERE id = ?`).get(userId);
  if (user?.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { pocketcache_user_id: userId },
  });

  // Persist so future calls are idempotent
  db.prepare(`UPDATE users SET stripe_customer_id = ? WHERE id = ?`).run(customer.id, userId);
  return customer.id;
}

/**
 * Get or create a connected-account Customer for this user+nonprofit pair.
 *
 * On first charge for a given (user, nonprofit), we clone the platform-level
 * payment method to the nonprofit's connected Stripe account. We then create a
 * Customer object on that connected account and store both IDs in connected_customers.
 *
 * On subsequent charges, we reuse the stored connected_customer_id and
 * connected_payment_method_id — no re-cloning, no duplicate customers.
 *
 * @param {object} user - { id, stripe_customer_id }
 * @param {object} pm   - { stripe_payment_method_id } — the platform-level pm_...
 * @param {object} nonprofit - { id, stripe_account_id }
 * @returns {Promise<{connectedCustomerId: string, connectedPaymentMethodId: string}>}
 */
async function getOrCreateConnectedCustomer(user, pm, nonprofit) {
  // Check for existing connected customer record
  const existing = db.prepare(`
    SELECT connected_customer_id, connected_payment_method_id
    FROM connected_customers
    WHERE user_id = ? AND nonprofit_id = ?
  `).get(user.id, nonprofit.id);

  if (existing) {
    return {
      connectedCustomerId: existing.connected_customer_id,
      connectedPaymentMethodId: existing.connected_payment_method_id,
    };
  }

  // Clone the platform payment method to the connected account.
  // This is the Stripe-canonical approach; the cloned pm_... lives on the connected account.
  const clonedPm = await stripe.paymentMethods.create(
    {
      customer: user.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
    },
    { stripeAccount: nonprofit.stripe_account_id }
  );

  // Create a Customer on the connected account so future charges can use off_session
  const connectedCustomer = await stripe.customers.create(
    {
      payment_method: clonedPm.id,
      metadata: { pocketcache_user_id: user.id },
    },
    { stripeAccount: nonprofit.stripe_account_id }
  );

  // Store for reuse — unique per (user, nonprofit)
  db.prepare(`
    INSERT OR IGNORE INTO connected_customers
      (id, user_id, nonprofit_id, connected_customer_id, connected_payment_method_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), user.id, nonprofit.id, connectedCustomer.id, clonedPm.id);

  return {
    connectedCustomerId: connectedCustomer.id,
    connectedPaymentMethodId: clonedPm.id,
  };
}

/**
 * Charge a donor for their monthly round-up accumulation plus accrued service fees.
 *
 * Creates ONE PaymentIntent as a DIRECT CHARGE on the nonprofit's connected Stripe account.
 * application_fee_amount = feeCents (sum of fee_accruals swept in this charge).
 *
 * Cover-fee logic (per donor preference set at checkout):
 *   cover_fee = 1: donor pays round-ups + feeCents → nonprofit gets round-ups (minus Stripe fees)
 *   cover_fee = 0: donor pays round-ups only       → nonprofit gets round-ups - feeCents (minus Stripe fees)
 *
 * feeCents is computed upstream as: 100¢ × active-months if covered, 50¢ × active-months if opted-out.
 *
 * @param {object} user      - { id, stripe_customer_id, cover_fee }
 * @param {object} pm        - { stripe_payment_method_id }
 * @param {object} nonprofit - { id, stripe_account_id, name }
 * @param {number} roundupCents - INTEGER cents, total round-ups to charge
 * @param {number} feeCents  - INTEGER cents, total accrued fees swept in this charge
 * @param {string} chargeId  - monthly_charges.id (for metadata + idempotency)
 * @returns {Promise<{paymentIntentId: string, status: string, totalChargedCents: number}>}
 */
export async function chargeDonor(user, pm, nonprofit, roundupCents, feeCents, chargeId) {
  // All money is integers (cents). No floats in money math.
  const coverFee = user.cover_fee === 1;
  // cover_fee=1: donor pays round-ups + fees → nonprofit gets round-ups (fees route to PocketCache)
  // cover_fee=0: donor pays round-ups only   → nonprofit gets round-ups - fees (fees route to PocketCache)
  // In both cases, application_fee_amount = feeCents.
  const totalChargedCents = coverFee ? roundupCents + feeCents : roundupCents;

  // Sanitize nonprofit name for statement descriptor (Stripe rules: ≤22 chars, alphanumeric + spaces/dashes)
  const descriptorSuffix = nonprofit.name
    .replace(/[^a-zA-Z0-9 \-]/g, '')
    .trim()
    .slice(0, 22);

  // Get or create the cloned payment method on the connected account
  const { connectedCustomerId, connectedPaymentMethodId } = await getOrCreateConnectedCustomer(user, pm, nonprofit);

  const idempotencyKey = `charge_${chargeId}`;

  const pi = await stripe.paymentIntents.create(
    {
      amount: totalChargedCents,
      currency: 'usd',
      customer: connectedCustomerId,
      payment_method: connectedPaymentMethodId,
      application_fee_amount: feeCents, // routes to PocketCache platform balance (100¢×months or 50¢×months)
      off_session: true,
      confirm: true,
      statement_descriptor_suffix: descriptorSuffix,
      metadata: {
        pocketcache_charge_id: chargeId,        // webhook handler reads this key — keep in sync
      },
      description: `PocketCache monthly round-up — ${nonprofit.name}`,
    },
    {
      stripeAccount: nonprofit.stripe_account_id, // DIRECT CHARGE on nonprofit's account
      idempotencyKey,                              // safe to retry on network failure
    }
  );

  return {
    paymentIntentId: pi.id,
    status: pi.status,
    totalChargedCents,
  };
}

/**
 * Create SetupIntent for card entry (Stripe Elements).
 * Called at donor onboarding — saves card for future off-session charges.
 */
export async function createSetupIntent(stripeCustomerId) {
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
  return { clientSecret: setupIntent.client_secret };
}

/**
 * Create Financial Connections session for ACH bank linking.
 */
export async function createFinancialConnectionsSession(stripeCustomerId) {
  const session = await stripe.financialConnections.sessions.create({
    account_holder: { type: 'customer', customer: stripeCustomerId },
    permissions: ['payment_method', 'balances'],
  });
  return { clientSecret: session.client_secret };
}

/**
 * Attach a payment method to a platform-level customer after frontend confirmation.
 */
export async function attachPaymentMethod(paymentMethodId, stripeCustomerId) {
  await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

/**
 * Initiate Stripe Connect Standard onboarding for a nonprofit.
 * Returns the URL that the nonprofit admin visits to connect their Stripe account.
 *
 * After the nonprofit completes OAuth, Stripe redirects to STRIPE_CONNECT_REDIRECT_URI
 * with a `code` query param. Pass that to handleConnectCallback() to store the account ID.
 *
 * @param {string} nonprofitId - used in `state` param so callback can look up the nonprofit
 * @returns {Promise<string>} Stripe Connect OAuth URL
 */
export async function createNonprofitStripeConnectLink(nonprofitId) {
  // Stripe Connect Standard OAuth link
  // Docs: https://stripe.com/docs/connect/oauth-reference
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CLIENT_ID,  // Connect application's client_id (ca_...)
    scope: 'read_write',
    state: nonprofitId,  // returned by Stripe in redirect so we know which nonprofit
    redirect_uri: process.env.STRIPE_CONNECT_REDIRECT_URI,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

/**
 * Handle the OAuth callback after a nonprofit completes Stripe Connect onboarding.
 * Exchanges the one-time `code` for a permanent account ID and stores it.
 *
 * @param {string} nonprofitId - from the `state` param returned by Stripe
 * @param {string} code - one-time OAuth code from Stripe
 */
export async function handleConnectCallback(nonprofitId, code) {
  const response = await stripe.oauth.token({ grant_type: 'authorization_code', code });
  const stripeAccountId = response.stripe_user_id; // acct_...

  db.prepare(`UPDATE nonprofits SET stripe_account_id = ? WHERE id = ?`).run(stripeAccountId, nonprofitId);
  return stripeAccountId;
}

/**
 * Verify a Stripe webhook signature and parse the event.
 *
 * Connected-account events (from the nonprofit's Stripe account) include event.account.
 * Platform events (from PocketCache's own Stripe account) do NOT have event.account.
 * Both types use the same webhook secret if registered on the platform; if you use
 * per-connected-account webhook endpoints, each has its own secret.
 */
export function constructWebhookEvent(payload, signature) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

export { stripe };
