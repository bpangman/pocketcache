/**
 * Daily Round-Up Job
 * Schedule: 12:01am every night (configured in server.js)
 *
 * What it does:
 *  1. Apply any pending nonprofit switches (staged day-boundary semantics)
 *  2. For each active Plaid connection, fetch new posted transactions (skip pending!)
 *  3. Handle removed transactions (refunds/cancels) — mark roundups 'reversed'
 *  4. Handle modified transactions — update amount/roundup if not yet charged
 *  5. Calculate and save round-ups for new transactions
 *  6. Update cursor for next run
 *
 * Does NOT charge anyone — that's monthly-charge.js.
 *
 * MONEY INVARIANT: all amounts stored as INTEGER CENTS. No floats in DB.
 *
 * SELF-CHARGE FILTER (loop prevention):
 *   We cannot reliably detect our own charges via payment_meta (Plaid field is
 *   inconsistent). Instead, skip any posted transaction if within 3 days of a
 *   succeeded monthly_charge whose total_charged_cents matches the transaction amount.
 *   LIMITATION: this could theoretically skip a legitimate purchase that coincidentally
 *   matches a recent charge amount. We document this and accept the trade-off —
 *   the alternative (no filter) risks infinite loops on ACH.
 */

import db from '../db/index.js';
import { fetchTransactionUpdates, calculateRoundup } from '../services/plaid.js';
import { randomUUID } from 'crypto';

export async function runDailyRoundups() {
  console.log('[daily-roundups] Starting...');

  // 1. Apply pending nonprofit switches.
  //    Switches made in the app are staged in pending_nonprofit_id and applied HERE
  //    so the switch always falls on a clean 12:01am day boundary.
  //    Purchases made before 12:01am on the switch day go to the OLD nonprofit.
  //    Purchases after 12:01am go to the new one.
  const pending = db.prepare(`
    SELECT id, nonprofit_id, pending_nonprofit_id FROM users
    WHERE pending_nonprofit_id IS NOT NULL
  `).all();

  for (const u of pending) {
    db.prepare(`
      UPDATE users SET nonprofit_id = pending_nonprofit_id, pending_nonprofit_id = NULL WHERE id = ?
    `).run(u.id);
    console.log(`[daily-roundups] Nonprofit switch applied for user ${u.id}: ${u.nonprofit_id} → ${u.pending_nonprofit_id}`);
  }

  // 2. Get all active Plaid connections for active users
  const connections = db.prepare(`
    SELECT pc.*, u.id AS user_id, u.nonprofit_id
    FROM plaid_connections pc
    JOIN users u ON pc.user_id = u.id
    WHERE u.status = 'active' AND u.nonprofit_id IS NOT NULL
  `).all();

  console.log(`[daily-roundups] Processing ${connections.length} active connections`);

  for (const conn of connections) {
    try {
      // Build self-charge filter: recent succeeded charges for this user (last 3 days)
      // We match on total_charged_cents (what actually appeared on the bank statement)
      const recentCharges = db.prepare(`
        SELECT total_charged_cents, charged_at
        FROM monthly_charges
        WHERE user_id = ? AND status = 'succeeded'
          AND charged_at >= unixepoch() - (3 * 86400)
      `).all(conn.user_id);

      // Decrypt the access token before use
      const { decrypt } = await import('../lib/crypto.js');
      const accessToken = decrypt(conn.access_token);

      const { added, modified, removed, nextCursor } = await fetchTransactionUpdates(
        accessToken,
        conn.cursor
      );

      // 3. Handle removed transactions (refunds, cancellations):
      //    Mark any matching roundup as 'reversed' if not yet charged.
      for (const removedTxn of removed) {
        const affected = db.prepare(`
          UPDATE roundups SET status = 'reversed'
          WHERE plaid_txn_id = ? AND status = 'accrued'
        `).run(removedTxn.transaction_id);
        if (affected.changes > 0) {
          console.log(`[daily-roundups] Reversed roundup for removed txn ${removedTxn.transaction_id}`);
        }
      }

      // 4. Handle modified transactions:
      //    Update amount/roundup if the roundup hasn't been charged yet.
      for (const modTxn of modified) {
        if (modTxn.amount <= 0) continue;
        const newAmountCents = Math.round(modTxn.amount * 100);
        const newRoundupCents = Math.round(calculateRoundup(modTxn.amount) * 100);
        db.prepare(`
          UPDATE roundups SET amount_cents = ?, roundup_cents = ?
          WHERE plaid_txn_id = ? AND status = 'accrued'
        `).run(newAmountCents, newRoundupCents, modTxn.transaction_id);
      }

      // 5. Process new (added) posted transactions
      const insertRoundup = db.prepare(`
        INSERT OR IGNORE INTO roundups
          (id, user_id, plaid_txn_id, pending_plaid_txn_id, merchant, amount_cents, roundup_cents, date, nonprofit_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let newRoundups = 0;
      for (const txn of added) {
        // SKIP pending transactions — only process posted transactions.
        // Plaid marks pending transactions with txn.pending = true.
        // Processing pending txns would mean charging the donor twice once the txn posts.
        if (txn.pending === true) continue;

        // Only process debits (positive amount in Plaid = money leaving account)
        if (txn.amount <= 0) continue;

        // Self-charge filter: skip if this looks like one of our own monthly charges.
        // We compare the transaction amount (in cents) against recent succeeded charges.
        // LIMITATION: could theoretically skip a real purchase that coincidentally matches
        // a recent charge amount. Accept this trade-off to prevent ACH infinite loops.
        const txnCents = Math.round(txn.amount * 100);
        const txnDate = Math.floor(new Date(txn.date).getTime() / 1000);
        const isSelfCharge = recentCharges.some(charge => {
          const daysDiff = Math.abs(txnDate - charge.charged_at) / 86400;
          return charge.total_charged_cents === txnCents && daysDiff <= 3;
        });
        if (isSelfCharge) {
          console.log(`[daily-roundups] Skipping likely self-charge: ${txn.transaction_id} ($${txn.amount})`);
          continue;
        }

        // Pending→posted dedup: when a posted txn arrives carrying a pending_transaction_id,
        // check if we already have a roundup for that pending txn ID (shouldn't happen if
        // we correctly skip pending txns, but guard anyway for robustness).
        if (txn.pending_transaction_id) {
          const pendingExists = db.prepare(`
            SELECT 1 FROM roundups WHERE plaid_txn_id = ? LIMIT 1
          `).get(txn.pending_transaction_id);
          if (pendingExists) {
            // The pending version was incorrectly inserted; remove it and let this posted one win.
            // In normal operation this shouldn't happen since we skip pending txns above.
            db.prepare(`
              DELETE FROM roundups WHERE plaid_txn_id = ? AND status = 'accrued'
            `).run(txn.pending_transaction_id);
            console.log(`[daily-roundups] Replaced pending roundup ${txn.pending_transaction_id} with posted ${txn.transaction_id}`);
          }
        }

        const roundup = calculateRoundup(txn.amount);
        if (roundup === 0) continue; // exact dollar amount, no round-up needed

        // MONEY INVARIANT: store as integer cents, never REAL/float
        const amountCents = Math.round(txn.amount * 100);
        const roundupCents = Math.round(roundup * 100);

        const result = insertRoundup.run(
          randomUUID(),
          conn.user_id,
          txn.transaction_id,
          txn.pending_transaction_id ?? null,  // for dedup reference
          txn.merchant_name ?? txn.name,
          amountCents,
          roundupCents,
          txn.date,
          conn.nonprofit_id  // locked at accrual time — cause switches only affect future round-ups
        );
        if (result.changes > 0) newRoundups++;
      }

      // 6. Update cursor for next run
      db.prepare(`
        UPDATE plaid_connections SET cursor = ?, last_synced_at = unixepoch() WHERE id = ?
      `).run(nextCursor, conn.id);

      console.log(`[daily-roundups] User ${conn.user_id}: ${newRoundups} new round-ups, ` +
        `${removed.length} removed, ${modified.length} modified`);

    } catch (err) {
      console.error(`[daily-roundups] Error processing connection ${conn.id}:`, err.message);
      // Don't throw — continue with other users
    }
  }

  console.log('[daily-roundups] Done.');
}

// Allow running directly: node src/jobs/daily-roundups.js
if (process.argv[1].endsWith('daily-roundups.js')) {
  runDailyRoundups().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
