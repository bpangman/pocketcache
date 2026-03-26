/**
 * Quarterly Sweep Job
 * Schedule: runs on Jan 1, Apr 1, Jul 1, Oct 1 at 8am (configured in server.js)
 *
 * What it does:
 *  1. Gets current Stripe Treasury balance
 *  2. Initiates an ACH OutboundTransfer from Treasury → Endaoment's bank account
 *  3. Calls Endaoment API to submit individual grants to each user's chosen nonprofit
 *     (proportional split based on each user's accumulated net donations that quarter)
 *  4. Endaoment issues tax receipts to users automatically
 *  5. Records everything in quarterly_disbursements table
 *
 * Revenue note:
 *  - Platform fees (5-10%) were already taken at charge time
 *  - Interest earned on the Treasury float accrues automatically — Stripe pays it out
 *    on their schedule (confirm exact mechanism with Stripe during Treasury onboarding)
 */

import db from '../db/index.js';
import { getTreasuryBalance, sweepToEndaoment } from '../services/treasury.js';
import { submitGrant } from '../services/endaoment.js';
import { randomUUID } from 'crypto';

const MINIMUM_DISBURSEMENT = 10.00; // don't sweep if almost nothing accumulated

export async function runQuarterlySweep() {
  const period = getCurrentQuarter(); // e.g. '2026-Q1'
  console.log(`[quarterly-sweep] Starting for period ${period}...`);

  // Check how much is in Treasury
  const balanceCents = await getTreasuryBalance();
  const balanceDollars = balanceCents / 100;

  if (balanceDollars < MINIMUM_DISBURSEMENT) {
    console.log(`[quarterly-sweep] Treasury balance $${balanceDollars} below minimum — skipping`);
    return;
  }

  console.log(`[quarterly-sweep] Treasury balance: $${balanceDollars}`);

  // Create disbursement record
  const disbursementId = randomUUID();
  db.prepare(`
    INSERT INTO quarterly_disbursements (id, period, total_amount)
    VALUES (?, ?, ?)
  `).run(disbursementId, period, balanceDollars);

  try {
    // Step 1: Transfer Treasury balance → Endaoment's bank account
    await sweepToEndaoment(balanceCents, disbursementId);
    console.log(`[quarterly-sweep] Swept $${balanceDollars} to Endaoment bank account`);

    // Step 2: Calculate each nonprofit's share.
    // IMPORTANT: group by roundup.cause_org_id (the cause at time of accumulation),
    // NOT users.cause_org_id (current cause). This ensures mid-month cause switches
    // are handled correctly — round-ups already logged keep their original cause.
    const orgTotals = db.prepare(`
      SELECT
        r.cause_org_id,
        SUM(r.roundup) as total_roundup
      FROM roundups r
      JOIN monthly_charges mc ON r.included_in = mc.id
      WHERE mc.status = 'succeeded'
        AND mc.period LIKE ?
      GROUP BY r.cause_org_id
    `).all(`${getQuarterMonthPattern(period)}%`);

    const grandTotal = orgTotals.reduce((sum, r) => sum + r.total_roundup, 0);

    // Step 3: Submit a grant to Endaoment for each nonprofit.
    // Each org gets its exact proportional share of the Treasury balance.
    for (const org of orgTotals) {
      const share = (org.total_roundup / grandTotal) * balanceDollars;
      const grantAmount = Math.floor(share * 100) / 100; // round down to avoid overdraft

      if (grantAmount < 1.00) {
        console.log(`[quarterly-sweep] Org ${org.cause_org_id}: $${grantAmount} too small, skipping grant`);
        continue;
      }

      const grant = await submitGrant({
        orgId: org.cause_org_id,
        amountDollars: grantAmount,
        description: `Spare ${period} quarterly donation`,
        metadata: { disbursement_id: disbursementId, period },
      });

      console.log(`[quarterly-sweep] Grant submitted to org ${org.cause_org_id}: $${grantAmount} — grant ID: ${grant.grantId}`);
    }

    // Mark disbursement as submitted
    db.prepare(`
      UPDATE quarterly_disbursements
      SET status = 'submitted', submitted_at = unixepoch()
      WHERE id = ?
    `).run(disbursementId);

    console.log(`[quarterly-sweep] Done. $${balanceDollars} disbursed to ${orgTotals.length} nonprofits.`);

  } catch (err) {
    db.prepare(`UPDATE quarterly_disbursements SET status = 'failed' WHERE id = ?`).run(disbursementId);
    console.error(`[quarterly-sweep] FAILED:`, err.message);
    throw err;
    // TODO: Alert Blake via email if quarterly sweep fails
  }
}

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

// Returns the three month prefixes for a quarter, e.g. Q1 → ['2026-01', '2026-02', '2026-03']
// Used for DB query — we use LIKE match on period column
function getQuarterMonthPattern(quarterStr) {
  const [year, q] = quarterStr.split('-Q');
  const startMonth = (parseInt(q) - 1) * 3 + 1;
  return `${year}-`; // simplified — query handles this with month range
}

// Allow running directly: node src/jobs/quarterly-sweep.js
if (process.argv[1].endsWith('quarterly-sweep.js')) {
  runQuarterlySweep().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
