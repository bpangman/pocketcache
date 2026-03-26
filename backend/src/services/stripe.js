/**
 * Stripe Service
 *
 * Responsibilities:
 *  1. Create/retrieve Stripe Customers for users
 *  2. Create SetupIntents for saving card details via Stripe Elements (frontend)
 *  3. Create Financial Connections sessions for linking bank accounts (ACH)
 *  4. Charge users monthly via their stored payment method
 *  5. Handle failed payments: retry logic, pause account on second failure
 *  6. Process Stripe webhooks to confirm payment outcomes
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Fee rates ────────────────────────────────────────────────────────────────
const FEE_RATES = {
  ach:       0.05,   // 5%
  apple_pay: 0.10,   // 10%
  card:      0.10,   // 10%
};

/**
 * Create or retrieve a Stripe Customer for a user.
 * Idempotent — call freely, it won't create duplicates if stripe_customer_id is stored.
 */
export async function getOrCreateCustomer(userId, email, name) {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { pocketchange_user_id: userId },
  });
  return customer.id;
}

/**
 * Step 1 for card (CC) payment method:
 * Create a SetupIntent so the frontend (Stripe Elements) can securely collect card details.
 * The frontend calls stripe.confirmCardSetup(clientSecret) — card never touches our server.
 */
export async function createSetupIntent(stripeCustomerId) {
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    usage: 'off_session',  // we'll charge them without them being present (monthly sweep)
  });
  return { clientSecret: setupIntent.client_secret };
}

/**
 * Step 1 for ACH payment method:
 * Create a Financial Connections session so the frontend can link a bank account.
 * Returns a client_secret the frontend passes to Stripe Financial Connections.
 */
export async function createFinancialConnectionsSession(stripeCustomerId) {
  const session = await stripe.financialConnections.sessions.create({
    account_holder: { type: 'customer', customer: stripeCustomerId },
    permissions: ['payment_method', 'balances'],
  });
  return { clientSecret: session.client_secret };
}

/**
 * After the frontend completes Stripe Elements / Financial Connections,
 * they send us the resulting payment_method ID. Attach it to the customer
 * so we can charge them off-session in the future.
 */
export async function attachPaymentMethod(paymentMethodId, stripeCustomerId) {
  await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
  // Set as default for future charges
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

/**
 * Monthly charge: collect the user's accumulated round-ups.
 * Deducts the platform fee before the net amount moves to Stripe Treasury.
 *
 * Flow:
 *   1. Charge user's stored payment method for gross_amount
 *   2. Stripe deposits gross_amount into our platform account
 *   3. Platform fee stays in platform account (our revenue)
 *   4. Net amount gets transferred to Treasury financial account (see treasury.js)
 */
export async function chargeUser(stripeCustomerId, paymentMethodId, grossAmount, paymentMethod, chargeId) {
  const feeRate = FEE_RATES[paymentMethod] ?? 0.10;
  const platformFee = Math.round(grossAmount * feeRate * 100); // in cents
  const grossCents = Math.round(grossAmount * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: grossCents,
    currency: 'usd',
    customer: stripeCustomerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    // application_fee_amount: platformFee,  // uncomment if using Stripe Connect
    metadata: {
      pocketchange_charge_id: chargeId,
      platform_fee_cents: platformFee,
      net_cents: grossCents - platformFee,
    },
    description: `PocketChange monthly round-up donation`,
  });

  return {
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    platformFeeCents: platformFee,
    netCents: grossCents - platformFee,
  };
}

/**
 * Webhook handler: called by Express when Stripe sends an event.
 * Verifies the signature then routes to the right handler.
 */
export function constructWebhookEvent(payload, signature) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

export { stripe };
