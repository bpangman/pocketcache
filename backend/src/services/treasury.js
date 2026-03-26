/**
 * Stripe Treasury Service
 *
 * Responsibilities:
 *  1. Move net donation amounts (after platform fee) from Stripe platform account
 *     into the Stripe Treasury financial account
 *  2. Track balance in treasury_log table
 *  3. Initiate outbound wire/ACH to Endaoment quarterly
 *
 * How the float works:
 *  - Users are charged monthly. Net amounts (after our fee) flow into Treasury.
 *  - Treasury earns interest on the held balance (Stripe pays this to us).
 *  - Quarterly, we sweep the full Treasury balance to Endaoment via OutboundTransfer.
 *  - PocketChange earns: platform fees (5-10%) + interest on the ~45-day float.
 *
 * IMPORTANT: Requires Stripe Treasury partner approval before use.
 * Apply at: stripe.com → Contact Sales → "Stripe Treasury / Banking as a Service"
 */

import { stripe } from './stripe.js';
import db from '../db/index.js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const FINANCIAL_ACCOUNT_ID = process.env.STRIPE_TREASURY_FINANCIAL_ACCOUNT_ID;

/**
 * After a successful monthly charge, transfer the net amount (gross minus platform fee)
 * from the Stripe platform balance into the Treasury financial account.
 *
 * Called by: monthly-charge.js job after payment_intent.succeeded webhook
 */
export async function depositToTreasury(netAmountCents, chargeId) {
  if (!FINANCIAL_ACCOUNT_ID) {
    console.warn('Treasury not configured — skipping deposit. Set STRIPE_TREASURY_FINANCIAL_ACCOUNT_ID.');
    return null;
  }

  // InboundTransfer: moves money from platform Stripe balance → Treasury FA
  const transfer = await stripe.treasury.inboundTransfers.create({
    financial_account: FINANCIAL_ACCOUNT_ID,
    amount: netAmountCents,
    currency: 'usd',
    origin_payment_method: 'balance',  // pull from Stripe platform balance
    description: `PocketChange monthly deposit — charge ${chargeId}`,
    metadata: { pocketchange_charge_id: chargeId },
  });

  // Log to treasury_log
  db.prepare(`
    INSERT INTO treasury_log (id, event, amount, reference)
    VALUES (?, 'deposit', ?, ?)
  `).run(randomUUID(), netAmountCents / 100, chargeId);

  return transfer;
}

/**
 * Get current Treasury balance.
 * Used by the quarterly sweep job to know how much to send to Endaoment.
 */
export async function getTreasuryBalance() {
  if (!FINANCIAL_ACCOUNT_ID) return 0;

  const fa = await stripe.treasury.financialAccounts.retrieve(FINANCIAL_ACCOUNT_ID);
  // balance.cash.usd is the available cash balance in cents
  return fa.balance.cash.usd ?? 0;
}

/**
 * Quarterly sweep: send the Treasury balance to Endaoment's bank account.
 *
 * Endaoment will provide their bank routing + account number during partner onboarding.
 * We send via OutboundTransfer (ACH) — arrives in 1-3 business days.
 *
 * Called by: quarterly-sweep.js job
 */
export async function sweepToEndaoment(amountCents, disbursementId) {
  if (!FINANCIAL_ACCOUNT_ID) {
    throw new Error('Stripe Treasury not configured. Cannot sweep to Endaoment.');
  }

  // TODO: Replace with real Endaoment bank details from partner onboarding
  // Endaoment will provide routing number + account number during setup
  const ENDAOMENT_BANK = {
    routing_number: process.env.ENDAOMENT_ROUTING_NUMBER,   // TODO: fill after onboarding
    account_number: process.env.ENDAOMENT_ACCOUNT_NUMBER,   // TODO: fill after onboarding
    account_type: 'checking',
    network: 'ach',
  };

  if (!ENDAOMENT_BANK.routing_number || !ENDAOMENT_BANK.account_number) {
    throw new Error('Endaoment bank details not configured. Add ENDAOMENT_ROUTING_NUMBER and ENDAOMENT_ACCOUNT_NUMBER to .env after onboarding.');
  }

  // Create the outbound ACH transfer from Treasury → Endaoment
  const transfer = await stripe.treasury.outboundTransfers.create({
    financial_account: FINANCIAL_ACCOUNT_ID,
    amount: amountCents,
    currency: 'usd',
    destination_payment_method_data: {
      type: 'us_bank_account',
      us_bank_account: ENDAOMENT_BANK,
    },
    description: `PocketChange quarterly donation disbursement — ${disbursementId}`,
    metadata: { pocketchange_disbursement_id: disbursementId },
  });

  // Log the withdrawal
  db.prepare(`
    INSERT INTO treasury_log (id, event, amount, reference)
    VALUES (?, 'withdrawal', ?, ?)
  `).run(randomUUID(), -(amountCents / 100), disbursementId);

  return transfer;
}
