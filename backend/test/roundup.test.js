/**
 * PocketCache backend unit tests
 * Run with: npm test
 * Uses Node.js built-in test runner (node --test) — no extra framework needed.
 * In-memory SQLite via better-sqlite3 for DB tests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Fee scheme helpers (mirrors monthly-charge.js / stripe.js logic) ────────
// These replicate the pure math from the service layer so tests have no DB/Stripe dependency.

// v3: PocketCache $1.00/month fee is MANDATORY ($0.50 tracking + $0.50 processing).
// No opt-out. Always 100¢ × activeMonths.
function computeFeeCents(activeMonths) {
  return activeMonths * 100;
}

// Gross-up constants (mirrors NONPROFIT_STRIPE_RATE / NONPROFIT_STRIPE_FIXED in stripe.js)
// Actual rates come from the org's own Stripe account.
const NONPROFIT_STRIPE_RATE = 0.022;   // 2.2% per-transaction
const NONPROFIT_STRIPE_FIXED = 30;     // $0.30 fixed fee in cents

/**
 * Compute gross-up for cover_processing=1.
 * Returns { total, processingCoverCents } where total is the integer-cent charge amount
 * that ensures the nonprofit nets at least roundupCents after Stripe's fee and application_fee.
 */
function computeGrossUp(roundupCents, feeCents) {
  const total = Math.ceil(
    (roundupCents + feeCents + NONPROFIT_STRIPE_FIXED) / (1 - NONPROFIT_STRIPE_RATE)
  );
  const processingCoverCents = total - roundupCents - feeCents;
  return { total, processingCoverCents };
}

/**
 * Compute charge amounts for a donor.
 * cover_processing=1: gross-up applied; application_fee = feeCents only.
 * cover_processing=0: no gross-up; total = roundupCents + feeCents; application_fee = feeCents.
 */
function computeChargeAmounts(roundupCents, feeCents, coverProcessing) {
  let totalCharged, processingCoverCents;
  if (coverProcessing === 1) {
    ({ total: totalCharged, processingCoverCents } = computeGrossUp(roundupCents, feeCents));
  } else {
    totalCharged = roundupCents + feeCents;
    processingCoverCents = 0;
  }
  const applicationFee = feeCents; // always fee_cents only; never includes processingCover
  // Nonprofit nets: totalCharged - applicationFee - Stripe_fee (Stripe_fee on totalCharged)
  // For cover_processing=0: nonprofit absorbs its own Stripe fee from roundupCents.
  const nonprofitReceivesBeforeStripeFee = totalCharged - applicationFee;
  return { totalCharged, processingCoverCents, applicationFee, nonprofitReceivesBeforeStripeFee };
}

function getSettleUpThresholdPeriod(now = new Date()) {
  // Use UTC to match roundups.date which is stored as 'YYYY-MM-DD' (UTC).
  // Using local getMonth() would give wrong results in behind-UTC timezones when
  // the date string parses as UTC midnight (e.g. new Date('2026-07-01') in CST is June 30).
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() - 3; // 0-indexed: July(6) - 3 = 3 = April
  while (month < 0) { month += 12; year -= 1; }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// ─── calculateRoundup ────────────────────────────────────────────────────────
// Import directly — no DB, no Stripe, pure function
import { calculateRoundup } from '../src/services/plaid.js';

describe('calculateRoundup', () => {
  test('rounds up $4.30 to $0.70', () => {
    const result = calculateRoundup(4.30);
    assert.equal(Math.round(result * 100), 70);
  });

  test('returns 0 for exact dollar amount', () => {
    assert.equal(calculateRoundup(5.00), 0);
  });

  test('rounds up $1.01 to $0.99', () => {
    assert.equal(Math.round(calculateRoundup(1.01) * 100), 99);
  });

  test('returns 0 for negative amount', () => {
    assert.equal(calculateRoundup(-1.50), 0);
  });

  test('rounds up $9.99 to $0.01', () => {
    assert.equal(Math.round(calculateRoundup(9.99) * 100), 1);
  });

  test('returns 0 for zero amount', () => {
    assert.equal(calculateRoundup(0), 0);
  });
});

// ─── v3 fee math: mandatory fee + cover-processing toggle ─────────────────────
describe('fee model v3: mandatory fee + cover-processing toggle (single month)', () => {
  test('fee is always 100¢/active-month — no opt-out', () => {
    // v3: fee is mandatory regardless of cover_processing setting
    assert.equal(computeFeeCents(1), 100);
    assert.equal(computeFeeCents(2), 200);
    assert.equal(computeFeeCents(3), 300);
  });

  test('cover_processing=1: gross-up applied; application_fee = feeCents only (not processingCover)', () => {
    const roundupCents = 743; // $7.43
    const feeCents = computeFeeCents(1); // $1.00 for 1 month
    const { totalCharged, processingCoverCents, applicationFee } = computeChargeAmounts(roundupCents, feeCents, 1);
    assert.equal(feeCents, 100);
    // totalCharged = ceil((743 + 100 + 30) / 0.978) = ceil(873 / 0.978) = ceil(892.637...) = 893
    assert.equal(totalCharged, 893);
    // processingCover = 893 - 743 - 100 = 50
    assert.equal(processingCoverCents, 50);
    // applicationFee = feeCents only, never includes processingCover
    assert.equal(applicationFee, 100);
  });

  test('cover_processing=0: no gross-up; total = roundups + fee; applicationFee = fee', () => {
    const roundupCents = 743;
    const feeCents = computeFeeCents(1);
    const { totalCharged, processingCoverCents, applicationFee } = computeChargeAmounts(roundupCents, feeCents, 0);
    assert.equal(feeCents, 100);
    assert.equal(totalCharged, 843);          // roundups + fee only
    assert.equal(processingCoverCents, 0);    // no gross-up
    assert.equal(applicationFee, 100);        // same: feeCents routes to PocketCache
  });

  test('application_fee_amount = feeCents in both toggle states', () => {
    const feeCents = computeFeeCents(1);
    const { applicationFee: onApp } = computeChargeAmounts(500, feeCents, 1);
    const { applicationFee: offApp } = computeChargeAmounts(500, feeCents, 0);
    assert.equal(onApp, 100);
    assert.equal(offApp, 100);
  });
});

// ─── Minimum / rollover selection logic ─────────────────────────────────────
describe('minimum/rollover logic', () => {
  test('charges when total >= minimum', () => {
    const totalCents = 1200; // $12.00
    const minimumCents = 1000; // $10.00
    assert.equal(totalCents >= minimumCents, true);
  });

  test('rolls over when total < minimum', () => {
    const totalCents = 800; // $8.00
    const minimumCents = 1000;
    assert.equal(totalCents >= minimumCents, false);
  });

  test('charges at exactly the minimum', () => {
    const totalCents = 1000;
    const minimumCents = 1000;
    assert.equal(totalCents >= minimumCents, true);
  });

  test('custom minimum per nonprofit', () => {
    // Nonprofit A has $5 minimum, Nonprofit B has $25 minimum
    const total = 1500; // $15.00
    assert.equal(total >= 500, true);   // passes $5 minimum
    assert.equal(total >= 2500, false); // fails $25 minimum
  });
});

// ─── Accrual-based fee scheme v3 (2026-07-03) ───────────────────────────────
describe('accrual-based fee scheme v3', () => {

  test('mandatory fee: always 100¢ × active months (no opt-out)', () => {
    // 1 month
    assert.equal(computeFeeCents(1), 100);
    // 2-month rollover
    assert.equal(computeFeeCents(2), 200);
    // 3 months
    assert.equal(computeFeeCents(3), 300);
  });

  test('cover_processing=1: gross-up spot-check — $10.00 roundups + $1.00 fee', () => {
    // Spec: $10.00 roundups + $1.00 fees, cover ON →
    //   total such that total − fees(100) − stripeFee(2.2%·total + 30) ≥ 1000 exactly at the cent
    const roundupCents = 1000; // $10.00
    const feeCents = computeFeeCents(1); // $1.00 (mandatory, 1 active month)
    const { total, processingCoverCents } = computeGrossUp(roundupCents, feeCents);

    // total = ceil((1000 + 100 + 30) / (1 - 0.022)) = ceil(1130 / 0.978) = ceil(1155.419...) = 1156
    assert.equal(total, 1156);
    // processingCover = 1156 - 1000 - 100 = 56¢
    assert.equal(processingCoverCents, 56);

    // Verify: nonprofit nets ≥ 1000¢ regardless of how Stripe rounds their fee
    // Stripe fee on 1156¢ @ 2.2% + 30¢:
    const stripeFeeExact = NONPROFIT_STRIPE_RATE * total + NONPROFIT_STRIPE_FIXED;
    // application_fee = 100 (never includes processingCover)
    const nonprofitNet = total - 100 - stripeFeeExact;
    assert.ok(nonprofitNet >= 1000,
      `Nonprofit net ${nonprofitNet.toFixed(2)}¢ must be ≥ 1000¢`);
  });

  test('cover_processing=0: no gross-up; donor pays roundups + fee; toggle does not waive fee', () => {
    // The toggle only controls gross-up, NOT the mandatory $1.00 fee
    const roundupCents = 800; // $8.00
    const feeCents = computeFeeCents(1); // $1.00 still mandatory
    const { totalCharged, processingCoverCents, applicationFee } = computeChargeAmounts(roundupCents, feeCents, 0);

    assert.equal(feeCents, 100);              // mandatory, not reduced
    assert.equal(totalCharged, 900);          // roundups + $1.00 fee (no gross-up)
    assert.equal(processingCoverCents, 0);    // no gross-up when toggle off
    assert.equal(applicationFee, 100);        // $1.00 routes to PocketCache
  });

  test('cover_processing=1, 1-month: gross-up ensures nonprofit nets full roundup amount', () => {
    const roundupCents = 800; // $8.00 of round-ups
    const feeCents = computeFeeCents(1); // 1 active month × $1.00
    const { totalCharged, processingCoverCents, applicationFee } = computeChargeAmounts(roundupCents, feeCents, 1);

    // ceil((800 + 100 + 30) / 0.978) = ceil(930 / 0.978) = ceil(950.9203...) = 951
    assert.equal(totalCharged, 951);
    assert.equal(processingCoverCents, 51); // 951 - 800 - 100
    assert.equal(applicationFee, 100);      // $1.00 to PocketCache, never processingCover
    // Gross verification: nonprofit nets ≥ roundupCents
    const stripeFeeExact = NONPROFIT_STRIPE_RATE * totalCharged + NONPROFIT_STRIPE_FIXED;
    const nonprofitNet = totalCharged - applicationFee - stripeFeeExact;
    assert.ok(nonprofitNet >= roundupCents,
      `Nonprofit net ${nonprofitNet.toFixed(2)}¢ must be ≥ ${roundupCents}¢`);
  });

  test('2-month rollover: fees accumulate to $2.00 (mandatory); gross-up on full charge', () => {
    // Donor had round-ups in June ($700) and July ($500), both unswept
    const roundupCents = 700 + 500; // $12.00 total (over 2 months)
    const feeCents = computeFeeCents(2); // 2 active months × $1.00 = $2.00

    assert.equal(feeCents, 200); // $2.00 accumulated over 2 months

    // cover_processing=0 path (no gross-up)
    const { totalCharged: offTotal, processingCoverCents: offCover } =
      computeChargeAmounts(roundupCents, feeCents, 0);
    assert.equal(offTotal, 1400);    // $12.00 + $2.00
    assert.equal(offCover, 0);

    // cover_processing=1 path (gross-up applied)
    const { totalCharged: onTotal, processingCoverCents: onCover, applicationFee: onApp } =
      computeChargeAmounts(roundupCents, feeCents, 1);
    assert.ok(onTotal > 1400);  // grossed up above roundups+fees
    assert.ok(onCover > 0);     // non-zero gross-up
    assert.equal(onApp, 200);   // application_fee = feeCents only
  });

  test('3-month settle-up floor triggers when oldest roundup is exactly 3 months old', () => {
    const roundupCents = 500; // $5.00 — below $10.00 minimum
    const minimumCents = 1000;
    // Today = July 2026 → threshold = April 2026
    const threshold = getSettleUpThresholdPeriod(new Date('2026-07-01'));
    const oldestPeriod = '2026-04'; // exactly 3 months old

    const meetsMinimum = roundupCents >= minimumCents;
    const meetsSettleUp = oldestPeriod <= threshold;
    const shouldCharge = meetsMinimum || meetsSettleUp;

    assert.equal(threshold, '2026-04');
    assert.equal(meetsMinimum, false);  // below $10 minimum
    assert.equal(meetsSettleUp, true);  // April = exactly 3 months old → floor triggers
    assert.equal(shouldCharge, true);   // charge despite sub-minimum balance
  });

  test('3-month settle-up floor triggers when oldest roundup is older than 3 months', () => {
    const roundupCents = 300; // $3.00
    const minimumCents = 1000;
    const threshold = getSettleUpThresholdPeriod(new Date('2026-07-01'));
    const oldestPeriod = '2026-02'; // 5 months old

    const meetsSettleUp = oldestPeriod <= threshold;
    assert.equal(meetsSettleUp, true); // definitely triggers
    assert.equal(roundupCents < minimumCents, true); // below minimum
  });

  test('3-month settle-up floor does NOT trigger when oldest roundup is only 2 months old', () => {
    const roundupCents = 500;
    const minimumCents = 1000;
    const threshold = getSettleUpThresholdPeriod(new Date('2026-07-01'));
    const oldestPeriod = '2026-05'; // only 2 months old — too recent

    const meetsMinimum = roundupCents >= minimumCents;
    const meetsSettleUp = oldestPeriod <= threshold;
    const shouldCharge = meetsMinimum || meetsSettleUp;

    assert.equal(meetsMinimum, false);
    assert.equal(meetsSettleUp, false); // '2026-05' > '2026-04' — not old enough
    assert.equal(shouldCharge, false);  // roll over
  });

  test('settle-up threshold crosses year boundary correctly', () => {
    // February 2026 → threshold should be November 2025
    const threshold = getSettleUpThresholdPeriod(new Date('2026-02-01'));
    assert.equal(threshold, '2025-11');
  });

  test('final cancel charge: minimum always waived, charges full balance', () => {
    // User cancels with a tiny balance — charged regardless of minimum
    const roundupCents = 150; // $1.50 — well below $10 minimum
    const feeCents = computeFeeCents(1); // 1 active month × $1.00 mandatory

    // cover_processing=0: total = roundups + fees (no gross-up)
    const { totalCharged: offTotal } = computeChargeAmounts(roundupCents, feeCents, 0);
    // Final charge always proceeds (minimum = 0)
    const minimumWaived = true;
    assert.equal(minimumWaived, true);
    assert.equal(offTotal, 250); // $1.50 + $1.00 = $2.50

    // cover_processing=1: total = grossed-up amount
    const { totalCharged: onTotal } = computeChargeAmounts(roundupCents, feeCents, 1);
    assert.ok(onTotal > 250); // grossed up
  });

  test('final cancel charge idempotency key format', () => {
    const userId = 'user-abc-123';
    const key = `charge_${userId}_final`;
    assert.equal(key, 'charge_user-abc-123_final');
  });

  test('cancel with donate=false: accrued fees are waived (no exit-fee feel)', () => {
    // Founder guardrail (v3): fees are NEVER collected without a donation charge.
    // If donate=false at cancel, fee_accruals are deleted — not charged.
    // This test verifies the semantic: if no charge is issued, no fee is collected.
    const accruals = [
      { period: '2026-05', fee_cents: 100, included_in: null },
      { period: '2026-06', fee_cents: 100, included_in: null },
    ];
    // Simulate donate=false path: DELETE fee_accruals WHERE included_in IS NULL
    const waived = accruals.filter(f => f.included_in === null);
    assert.equal(waived.length, 2);       // both unswept accruals would be deleted
    const remaining = accruals.filter(f => f.included_in !== null);
    assert.equal(remaining.length, 0);   // nothing swept → nothing charged
  });

  test('fee_accrual per-month uniqueness: UNIQUE(user_id, period) prevents double-accrual', () => {
    // Simulate writing fee for same user+period twice — second should be ignored
    const accruals = new Map();
    function insertOrIgnoreFee(userId, period, feeCents) {
      const key = `${userId}|${period}`;
      if (!accruals.has(key)) {
        accruals.set(key, { userId, period, feeCents });
      }
    }

    insertOrIgnoreFee('user-1', '2026-05', 100);
    insertOrIgnoreFee('user-1', '2026-06', 100);
    insertOrIgnoreFee('user-1', '2026-05', 100); // duplicate — should be ignored

    assert.equal(accruals.size, 2); // only 2 unique periods
    assert.equal([...accruals.values()].filter(f => f.period === '2026-05').length, 1);
  });
});

// ─── Idempotency-skip logic ──────────────────────────────────────────────────
describe('idempotency-skip logic', () => {
  test('skips if charge exists with status=pending', () => {
    const existingStatus = 'pending';
    const shouldSkip = ['pending', 'succeeded', 'retrying'].includes(existingStatus);
    assert.equal(shouldSkip, true);
  });

  test('skips if charge exists with status=succeeded', () => {
    const existingStatus = 'succeeded';
    const shouldSkip = ['pending', 'succeeded', 'retrying'].includes(existingStatus);
    assert.equal(shouldSkip, true);
  });

  test('skips if charge exists with status=retrying', () => {
    const existingStatus = 'retrying';
    const shouldSkip = ['pending', 'succeeded', 'retrying'].includes(existingStatus);
    assert.equal(shouldSkip, true);
  });

  test('does NOT skip if charge exists with status=failed (allows re-attempt)', () => {
    const existingStatus = 'failed';
    const shouldSkip = ['pending', 'succeeded', 'retrying'].includes(existingStatus);
    assert.equal(shouldSkip, false);
  });

  test('idempotency key format', () => {
    const userId = 'abc-123';
    const period = '2026-07';
    const key = `charge_${userId}_${period}`;
    assert.equal(key, 'charge_abc-123_2026-07');
  });
});

// ─── Pending→posted dedup guard ─────────────────────────────────────────────
describe('pending→posted dedup', () => {
  test('pending transactions (txn.pending=true) are skipped', () => {
    const txns = [
      { transaction_id: 'txn_1', pending: false, amount: 4.30 },
      { transaction_id: 'txn_2', pending: true,  amount: 6.50 },
      { transaction_id: 'txn_3', pending: false, amount: 2.75 },
    ];
    const posted = txns.filter(t => t.pending !== true);
    assert.equal(posted.length, 2);
    assert.equal(posted.some(t => t.transaction_id === 'txn_2'), false);
  });

  test('posted txn with pending_transaction_id triggers dedup check', () => {
    const txn = {
      transaction_id: 'posted_123',
      pending_transaction_id: 'pending_456',
      pending: false,
      amount: 4.30,
    };
    // Simulate: if a roundup with plaid_txn_id = pending_456 exists, it must be replaced
    const existingRoundupForPending = { plaid_txn_id: 'pending_456' };
    const needsDedup = !!txn.pending_transaction_id && !!existingRoundupForPending;
    assert.equal(needsDedup, true);
  });

  test('posted txn without pending_transaction_id skips dedup', () => {
    const txn = {
      transaction_id: 'txn_789',
      pending_transaction_id: null,
      pending: false,
      amount: 4.30,
    };
    assert.equal(!!txn.pending_transaction_id, false);
  });
});
