/**
 * Plaid Service
 *
 * Responsibilities:
 *  1. Create a Link token so the frontend can open Plaid Link
 *  2. Exchange the public token (returned by Plaid Link) for a permanent access token
 *  3. Fetch new transactions daily using the cursor-based sync API
 *  4. Calculate round-ups from transactions
 *  5. Filter out PocketChange's own monthly charges (infinite loop prevention)
 */

import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import dotenv from 'dotenv';

dotenv.config();

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV ?? 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(config);

/**
 * Step 1 of Plaid Link: create a link token.
 * Frontend passes this to Plaid Link to open the card-connection modal.
 */
export async function createLinkToken(userId) {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'PocketChange',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  return response.data.link_token;
}

/**
 * Step 2 of Plaid Link: exchange the one-time public token for a permanent access token.
 * Call this after the user successfully links their card in the frontend.
 * Store the access_token and item_id in DB — never send them to the frontend.
 */
export async function exchangePublicToken(publicToken) {
  const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

/**
 * Get the accounts associated with a Plaid item.
 * Used after exchange to identify the specific account (card) the user picked.
 */
export async function getAccounts(accessToken) {
  const response = await plaidClient.accountsGet({ access_token: accessToken });
  return response.data.accounts;
}

/**
 * Daily job: fetch new transactions since last sync using cursor.
 * Returns only ADDED transactions (not modified/removed) for round-up calculation.
 *
 * Infinite loop prevention: we filter out any transaction that matches
 * a known PocketChange charge by amount + date + last4 of the payment card.
 * DO NOT filter by merchant name — it's unreliable across institutions.
 */
export async function fetchNewTransactions(accessToken, cursor, ownChargeFilter = []) {
  let added = [];
  let modified = [];
  let removed = [];
  let nextCursor = cursor;
  let hasMore = true;

  // Paginate until Plaid says no more
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor ?? undefined,
    });

    added = added.concat(response.data.added);
    modified = modified.concat(response.data.modified);
    removed = removed.concat(response.data.removed);
    nextCursor = response.data.next_cursor;
    hasMore = response.data.has_more;
  }

  // Filter out PocketChange's own charges to prevent double-counting
  // ownChargeFilter: [{ amount, date, last4 }] — from monthly_charges table
  const filtered = added.filter(txn => {
    return !ownChargeFilter.some(charge =>
      Math.abs(txn.amount - charge.amount) < 0.01 &&
      txn.date === charge.date &&
      txn.payment_meta?.payment_processor?.slice(-4) === charge.last4
    );
  });

  return { transactions: filtered, nextCursor };
}

/**
 * Calculate the round-up amount for a single transaction.
 * e.g. $4.30 → $0.70 round-up, $5.00 → $0.00 (exact dollar, no round-up)
 */
export function calculateRoundup(transactionAmount) {
  if (transactionAmount <= 0) return 0;
  const cents = Math.round(transactionAmount * 100);
  const remainder = cents % 100;
  return remainder === 0 ? 0 : (100 - remainder) / 100;
}
