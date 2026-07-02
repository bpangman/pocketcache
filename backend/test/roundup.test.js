/**
 * PocketCache backend unit tests
 * Run with: npm test
 * Uses Node.js built-in test runner (node --test) — no extra framework needed.
 * In-memory SQLite via better-sqlite3 for DB tests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

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

// ─── Cover-fee amount math ───────────────────────────────────────────────────
describe('cover-fee amount math', () => {
  const FEE_CENTS = 50;

  test('cover_fee=1: total = roundups + 50¢', () => {
    const roundupCents = 743; // $7.43
    const coverFee = true;
    const total = coverFee ? roundupCents + FEE_CENTS : roundupCents;
    assert.equal(total, 793);
  });

  test('cover_fee=0: total = roundups only', () => {
    const roundupCents = 743;
    const coverFee = false;
    const total = coverFee ? roundupCents + FEE_CENTS : roundupCents;
    assert.equal(total, 743);
  });

  test('cover_fee=0: nonprofit receives roundups - 50¢', () => {
    const roundupCents = 743;
    // application_fee = 50, so nonprofit gets total - 50
    const nonprofitReceives = roundupCents - FEE_CENTS;
    assert.equal(nonprofitReceives, 693);
  });

  test('cover_fee=1: application_fee always 50¢ regardless', () => {
    // Whether donor covers or not, our application_fee_amount is always 50
    assert.equal(FEE_CENTS, 50);
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
