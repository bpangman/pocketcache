/**
 * Daily Round-Up Job
 * Schedule: runs every night at 2am (configured in server.js via node-cron)
 *
 * What it does:
 *  1. Fetches all active Plaid connections
 *  2. For each connection, fetches new transactions since last cursor
 *  3. Calculates round-up for each transaction
 *  4. Saves new round-ups to DB (deduped by Plaid transaction_id)
 *  5. Updates the cursor for the next run
 *
 * Does NOT charge anyone — that's the monthly job.
 */

import db from '../db/index.js';
import { fetchNewTransactions, calculateRoundup } from '../services/plaid.js';
import { randomUUID } from 'crypto';

export async function runDailyRoundups() {
  console.log('[daily-roundups] Starting...');

  // Apply any pending cause changes FIRST, before processing transactions.
  // Cause switches made in the app are staged in pending_cause_org_id and
  // take effect at the start of the next 2am job — so the switch date is
  // always a clean day boundary. Coffee at 11am and sandwich at 1pm on the
  // day of a switch both go to the OLD cause; tomorrow's purchases go to the new one.
  const pending = db.prepare(`
    SELECT id, cause_org_id, pending_cause_org_id FROM users
    WHERE pending_cause_org_id IS NOT NULL
  `).all();

  for (const u of pending) {
    db.prepare(`
      UPDATE users SET cause_org_id = pending_cause_org_id, pending_cause_org_id = NULL
      WHERE id = ?
    `).run(u.id);
    console.log(`[daily-roundups] Cause switch applied for user ${u.id}: ${u.cause_org_id} → ${u.pending_cause_org_id}`);
  }

  // Get all active Plaid connections
  const connections = db.prepare(`
    SELECT pc.*, u.id as user_id
    FROM plaid_connections pc
    JOIN users u ON pc.user_id = u.id
    WHERE u.status = 'active'
  `).all();

  console.log(`[daily-roundups] Processing ${connections.length} active connections`);

  for (const conn of connections) {
    try {
      // Build the filter for Spare's own charges (loop prevention)
      // Look back 7 days to catch any of our own charges that appeared in Plaid
      const recentCharges = db.prepare(`
        SELECT gross_amount as amount,
               date(charged_at, 'unixepoch') as date,
               ? as last4
        FROM monthly_charges
        WHERE user_id = ?
          AND charged_at > unixepoch() - (7 * 86400)
          AND status = 'succeeded'
      `).all(conn.last4, conn.user_id);

      const { transactions, nextCursor } = await fetchNewTransactions(
        conn.access_token,
        conn.cursor,
        recentCharges
      );

      // Calculate and save round-ups for each new transaction
      // Capture the user's current cause — this is what gets locked onto each round-up.
      // If the user switches cause mid-month, only NEW round-ups get the new cause.
      // Round-ups already in the DB keep their original cause_org_id.
      const user = db.prepare(`SELECT cause_org_id FROM users WHERE id = ?`).get(conn.user_id);

      const insertRoundup = db.prepare(`
        INSERT OR IGNORE INTO roundups (id, user_id, plaid_txn_id, merchant, amount, roundup, date, cause_org_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let newRoundups = 0;
      for (const txn of transactions) {
        // Only process debits (positive amounts in Plaid = money leaving account)
        if (txn.amount <= 0) continue;

        const roundup = calculateRoundup(txn.amount);
        if (roundup === 0) continue; // exact dollar amount, no round-up

        const result = insertRoundup.run(
          randomUUID(),
          conn.user_id,
          txn.transaction_id,
          txn.merchant_name ?? txn.name,
          txn.amount,
          roundup,
          txn.date,
          user.cause_org_id   // locked at time of accumulation, not at charge time
        );
        if (result.changes > 0) newRoundups++;
      }

      // Update cursor for next run
      db.prepare(`
        UPDATE plaid_connections
        SET cursor = ?, last_synced_at = unixepoch()
        WHERE id = ?
      `).run(nextCursor, conn.id);

      console.log(`[daily-roundups] User ${conn.user_id}: ${newRoundups} new round-ups from ${transactions.length} transactions`);

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
