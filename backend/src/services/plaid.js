/**
 * Plaid Service
 *
 * Responsibilities:
 *  1. Create a Link token so the frontend can open Plaid Link
 *  2. Exchange the public token for a permanent access token
 *  3. Fetch transaction updates (added/modified/removed) using the cursor-based sync API
 *  4. Calculate round-ups from transaction amounts
 *
 * NOTE: access_tokens are stored ENCRYPTED in the DB (lib/crypto.js).
 * Encrypt before storing; decrypt before passing to Plaid API calls.
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
    client_name: 'PocketCache',   // was 'Spare' — updated to match our brand
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  return response.data.link_token;
}

/**
 * Step 2 of Plaid Link: exchange the one-time public token for a permanent access token.
 * IMPORTANT: the caller must encrypt the returned accessToken before storing it in the DB.
 */
export async function exchangePublicToken(publicToken) {
  const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  return {
    accessToken: response.data.access_token,  // caller must encrypt before storing
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
 * Fetch transaction updates since the last sync cursor.
 *
 * Returns three arrays:
 *   added    — new posted transactions (pending=false). IMPORTANT: do NOT process txns
 *              where txn.pending === true; they're not finalized and would be double-counted.
 *   modified — previously-seen transactions that changed (amount, category, etc.)
 *   removed  — transactions that were removed (refunds, cancellations, bank errors)
 *
 * The caller is responsible for:
 *   - Skipping added txns where txn.pending === true (daily-roundups.js does this)
 *   - Handling the removed array to reverse already-logged round-ups
 *   - Handling the modified array to update amount/roundup if not yet charged
 *
 * @param {string} accessToken - DECRYPTED Plaid access token
 * @param {string|null} cursor - last cursor from DB (null = first sync)
 * @returns {{ added: array, modified: array, removed: array, nextCursor: string }}
 */
export async function fetchTransactionUpdates(accessToken, cursor) {
  let added = [];
  let modified = [];
  let removed = [];
  let nextCursor = cursor;
  let hasMore = true;

  // Paginate until Plaid says no more updates
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

  return { added, modified, removed, nextCursor };
}

/**
 * Calculate the round-up amount for a single transaction.
 *
 * Round-up = ceiling(amount) - amount.
 * e.g. $4.30 → $0.70; $5.00 → $0.00 (exact dollar, no round-up)
 *
 * Uses integer arithmetic to avoid floating-point rounding errors.
 * Returns a number in DOLLARS (not cents) for backward compat — callers convert to cents.
 *
 * @param {number} transactionAmount - amount in dollars (from Plaid)
 * @returns {number} round-up amount in dollars, 0 if exact dollar amount
 */
export function calculateRoundup(transactionAmount) {
  if (transactionAmount <= 0) return 0;
  // Convert to cents with rounding to avoid float drift (e.g. 1.10 * 100 = 110.00000001)
  const cents = Math.round(transactionAmount * 100);
  const remainder = cents % 100;
  // MONEY INVARIANT: arithmetic is in integer cents, result converted back to dollars
  return remainder === 0 ? 0 : (100 - remainder) / 100;
}
