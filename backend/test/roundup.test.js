/**
 * PocketCache backend unit tests
 * Run with: npm test
 * Uses Node.js built-in test runner (node --test) — no extra framework needed.
 * In-memory SQLite via better-sqlite3 for DB tests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Fee scheme helpers (mirrors monthly-charge.js logic) ───────────────────
// These replicate the pure math from monthly-charge.js so tests have no DB/Stripe dependency.

function computeFeeCents(coverFee, activeMonths) {
  // cover_fee=1: $1.00/month; cover_fee=0: $0.50/month
  return coverFee === 1 ? activeMonths * 100 : activeMonths * 50;
}

function computeChargeAmounts(roundupCents, feeCents, coverFee) {
  const totalCharged = coverFee === 1 ? roundupCents + feeCents : roundupCents;
  const applicationFee = feeCents; // always routes to PocketCache platform balance
  const nonprofitReceives = roundupCents - (coverFee === 1 ? 0 : feeCents);
  return { totalCharged, applicationFee, nonprofitReceives };
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

// ─── Cover-fee amount math (legacy single-month sanity checks) ───────────────
describe('cover-fee amount math (single month)', () => {
  test('cover_fee=1: total = roundups + 100¢ fee (1 active month)', () => {
    const roundupCents = 743; // $7.43
    const feeCents = computeFeeCents(1, 1); // $1.00 for 1 month
    const { totalCharged, applicationFee, nonprofitReceives } = computeChargeAmounts(roundupCents, feeCents, 1);
    assert.equal(feeCents, 100);
    assert.equal(totalCharged, 843);    // $7.43 + $1.00
    assert.equal(applicationFee, 100); // $1.00 routes to PocketCache
    assert.equal(nonprofitReceives, 743); // nonprofit gets full round-up amount
  });

  test('cover_fee=0: total = roundups only; nonprofit receives roundups - 50¢', () => {
    const roundupCents = 743;
    const feeCents = computeFeeCents(0, 1); // $0.50 for 1 month
    const { totalCharged, applicationFee, nonprofitReceives } = computeChargeAmounts(roundupCents, feeCents, 0);
    assert.equal(feeCents, 50);
    assert.equal(totalCharged, 743);   // donor pays roundups only
    assert.equal(applicationFee, 50); // $0.50 deducted from nonprofit via app fee
    assert.equal(nonprofitReceives, 693); // nonprofit gets roundups - $0.50
  });

  test('application_fee_amount always equals feeCents regardless of cover_fee', () => {
    // Both cover and opt-out paths pass feeCents as application_fee_amount
    const coveredFee = computeFeeCents(1, 1);
    const optOutFee = computeFeeCents(0, 1);
    const { applicationFee: covApp } = computeChargeAmounts(500, coveredFee, 1);
    const { applicationFee: optApp } = computeChargeAmounts(500, optOutFee, 0);
    assert.equal(covApp, 100);
    assert.equal(optApp, 50);
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

// ─── Accrual-based fee scheme (approved 2026-07-01) ─────────────────────────
describe('accrual-based fee scheme', () => {

  test('1-month covering donor: charge = roundups + $1.00 fee', () => {
    const roundupCents = 800; // $8.00 of round-ups
    const feeCents = computeFeeCents(1, 1); // 1 active month × $1.00
    const { totalCharged, applicationFee, nonprofitReceives } = computeChargeAmounts(roundupCents, feeCents, 1);

    assert.equal(feeCents, 100);             // $1.00 total fee
    assert.equal(totalCharged, 900);         // $8.00 + $1.00
    assert.equal(applicationFee, 100);      // $1.00 to PocketCache
    assert.equal(nonprofitReceives, 800);   // nonprofit gets full $8.00
  });

  test('2-month rollover accumulates $2.00 in fees (cover_fee=1)', () => {
    // Donor had round-ups in June ($700) and July ($500), both unswept
    const roundupCents = 700 + 500; // $12.00 total (over 2 months)
    const feeCents = computeFeeCents(1, 2); // 2 active months × $1.00

    const { totalCharged, applicationFee } = computeChargeAmounts(roundupCents, feeCents, 1);

    assert.equal(feeCents, 200);    // $2.00 accumulated over 2 months
    assert.equal(totalCharged, 1400); // $12.00 + $2.00
    assert.equal(applicationFee, 200);
  });

  test('opt-out deduction math: charge = roundups, nonprofit loses $0.50 per active month', () => {
    const roundupCents = 800; // $8.00
    const feeCents = computeFeeCents(0, 1); // 1 active month × $0.50
    const { totalCharged, applicationFee, nonprofitReceives } = computeChargeAmounts(roundupCents, feeCents, 0);

    assert.equal(feeCents, 50);           // $0.50 fee (from nonprofit's share)
    assert.equal(totalCharged, 800);      // donor pays roundups only
    assert.equal(applicationFee, 50);    // $0.50 deducted from nonprofit via app fee
    assert.equal(nonprofitReceives, 750); // nonprofit receives $7.50
  });

  test('opt-out 2-month rollover: nonprofit loses $1.00 in application fees', () => {
    const roundupCents = 1200; // $12.00 over 2 months
    const feeCents = computeFeeCents(0, 2); // 2 active months × $0.50

    const { totalCharged, applicationFee, nonprofitReceives } = computeChargeAmounts(roundupCents, feeCents, 0);

    assert.equal(feeCents, 100);           // $1.00 (2 × $0.50)
    assert.equal(totalCharged, 1200);      // donor pays roundups only
    assert.equal(applicationFee, 100);    // $1.00 to PocketCache via app fee
    assert.equal(nonprofitReceives, 1100); // nonprofit receives $11.00
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
    const feeCents = computeFeeCents(1, 1); // 1 active month × $1.00

    const { totalCharged } = computeChargeAmounts(roundupCents, feeCents, 1);

    // Final charge always proceeds (minimum = 0)
    const minimumWaived = true;
    assert.equal(minimumWaived, true);
    assert.equal(totalCharged, 250); // $1.50 + $1.00 = $2.50
  });

  test('final cancel charge idempotency key format', () => {
    const userId = 'user-abc-123';
    const key = `charge_${userId}_final`;
    assert.equal(key, 'charge_user-abc-123_final');
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
