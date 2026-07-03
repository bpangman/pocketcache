-- PocketCache database schema
-- Run once: sqlite3 pocketcache.db < src/db/schema.sql

-- ── Nonprofits ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nonprofits (
  id                    TEXT PRIMARY KEY,           -- UUID
  ein                   TEXT UNIQUE NOT NULL,        -- IRS EIN (XX-XXXXXXX)
  name                  TEXT NOT NULL,
  address               TEXT,
  join_code             TEXT UNIQUE NOT NULL,        -- e.g. 'BGCA' — used in QR/URL
  stripe_account_id     TEXT,                        -- acct_... (Stripe Connect Standard)
  logo_url              TEXT,
  brand_color           TEXT,                        -- hex color e.g. '#1A7F5A'
  mission               TEXT,
  monthly_minimum_cents INTEGER NOT NULL DEFAULT 500,   -- $5.00 — roll over if below (configurable per nonprofit)
  admin_email           TEXT NOT NULL,
  license_accepted_at   INTEGER,                     -- unixepoch when license was accepted
  status                TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused'
  created_at            INTEGER DEFAULT (unixepoch())
);

-- ── Users (donors) ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                      TEXT PRIMARY KEY,          -- UUID
  email                   TEXT UNIQUE NOT NULL,
  name                    TEXT,
  state                   TEXT NOT NULL,             -- 2-letter state code; CA blocked at signup
  nonprofit_id            TEXT REFERENCES nonprofits(id),     -- active nonprofit
  pending_nonprofit_id    TEXT REFERENCES nonprofits(id),     -- staged switch, applied at 12:01am
  stripe_customer_id      TEXT,                      -- cus_... (platform-level customer)
  payment_method          TEXT,                      -- 'ach' | 'apple_pay' | 'card'
  -- cover_processing: 1 = donor covers the NONPROFIT'S Stripe card-processing costs (default, pre-checked).
  --   When ON, the charge is grossed up so the nonprofit nets 100% of round-ups after Stripe fees.
  --   The gross-up portion is additional donor→nonprofit money, not PocketCache revenue.
  --   When OFF, the nonprofit absorbs its own Stripe fees; donor pays round-ups only.
  -- NOTE: PocketCache's $1.00/month service fee is MANDATORY regardless of this toggle (see fee_accruals).
  -- MIGRATION (v2→v3): ALTER TABLE users RENAME COLUMN cover_fee TO cover_processing;
  cover_processing        INTEGER NOT NULL DEFAULT 1,
  comms_optin             INTEGER NOT NULL DEFAULT 1,      -- marketing/data-sharing election; transactional messages (charge notices, receipts, security) always sent regardless
  status                  TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'paused' | 'cancelled'
  created_at              INTEGER DEFAULT (unixepoch())
);

-- ── Plaid connections ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plaid_connections (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  -- access_token is stored ENCRYPTED (AES-256-GCM via lib/crypto.js).
  -- Never expose the plaintext token to the frontend.
  access_token    TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  institution     TEXT,
  last4           TEXT,                              -- last 4 of tracked card
  account_id      TEXT NOT NULL,
  cursor          TEXT,                              -- Plaid sync cursor
  status          TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'disconnected'
  connected_at    INTEGER DEFAULT (unixepoch()),
  last_synced_at  INTEGER,
  disconnected_at INTEGER                            -- set when zombie auto-disconnected or cancelled
);

-- ── Stripe payment methods ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id          TEXT NOT NULL,         -- platform-level cus_...
  stripe_payment_method_id    TEXT NOT NULL,         -- pm_...
  type                        TEXT NOT NULL,         -- 'ach' | 'apple_pay' | 'card'
  last4                       TEXT,
  is_default                  INTEGER NOT NULL DEFAULT 1,
  created_at                  INTEGER DEFAULT (unixepoch())
);

-- ── Connected-account customers ───────────────────────────────────────────────
-- When charging a donor on a nonprofit's connected Stripe account for the first time,
-- we clone the platform payment method to the connected account and create a
-- connected-account Customer there. We store that per-nonprofit customer ID here
-- so future charges reuse it (no duplicate customer creation).
CREATE TABLE IF NOT EXISTS connected_customers (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id),
  nonprofit_id                TEXT NOT NULL REFERENCES nonprofits(id),
  connected_customer_id       TEXT NOT NULL,         -- cus_... on the connected account
  connected_payment_method_id TEXT NOT NULL,         -- pm_... cloned to the connected account
  created_at                  INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, nonprofit_id)
);

-- ── Round-ups ─────────────────────────────────────────────────────────────────
-- One row per purchase that generated a round-up.
-- All money stored as INTEGER CENTS — never REAL/float.
CREATE TABLE IF NOT EXISTS roundups (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  plaid_txn_id          TEXT UNIQUE NOT NULL,        -- Plaid transaction_id (dedup key)
  pending_plaid_txn_id  TEXT,                        -- Plaid pending_transaction_id for dedup
                                                     -- When a posted txn arrives, check this
                                                     -- against existing plaid_txn_id values.
  merchant              TEXT,
  amount_cents          INTEGER NOT NULL,            -- original purchase amount in cents
  roundup_cents         INTEGER NOT NULL,            -- ceil(amount) - amount, in cents
  date                  TEXT NOT NULL,               -- YYYY-MM-DD
  nonprofit_id          TEXT NOT NULL REFERENCES nonprofits(id), -- locked at accrual time
                                                     -- cause switches only affect FUTURE round-ups
  included_in           TEXT REFERENCES monthly_charges(id),    -- set once swept
  status                TEXT NOT NULL DEFAULT 'accrued', -- 'accrued' | 'charged' | 'reversed'
  created_at            INTEGER DEFAULT (unixepoch())
);

-- ── Monthly charges ───────────────────────────────────────────────────────────
-- One row per monthly charge attempt per user.
-- All money stored as INTEGER CENTS.
-- period = 'YYYY-MM' for regular monthly charges; 'final' for cancellation settle-up.
CREATE TABLE IF NOT EXISTS monthly_charges (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  nonprofit_id              TEXT NOT NULL REFERENCES nonprofits(id),
  period                    TEXT NOT NULL,           -- 'YYYY-MM' or 'final'
  roundup_cents             INTEGER NOT NULL,        -- sum of round-ups swept
  fee_cents                 INTEGER NOT NULL,        -- sum of fee_accruals swept; always 100¢×months (mandatory PocketCache fee)
  cover_processing          INTEGER NOT NULL,        -- 1 = donor grossed up to cover nonprofit's Stripe processing costs
  -- MIGRATION (v2→v3): ALTER TABLE monthly_charges RENAME COLUMN cover_fee TO cover_processing;
  --                    ALTER TABLE monthly_charges ADD COLUMN processing_cover_cents INTEGER NOT NULL DEFAULT 0;
  processing_cover_cents    INTEGER NOT NULL DEFAULT 0, -- gross-up amount; 0 when cover_processing=0
  total_charged_cents       INTEGER NOT NULL,        -- roundup_cents + fee_cents + processing_cover_cents
  -- net to nonprofit = roundup_cents (cover_processing=1, after Stripe fees) or roundup_cents - fee_cents (cover_processing=0)
  -- application_fee_amount = fee_cents ONLY (processing_cover routes to nonprofit, not PocketCache)
  stripe_payment_intent_id  TEXT,
  idempotency_key           TEXT UNIQUE NOT NULL,    -- 'charge_{userId}_{period}' — safe to re-run job
  status                    TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'succeeded'|'failed'|'retrying'
  retry_count               INTEGER NOT NULL DEFAULT 0,
  retry_at                  INTEGER,                 -- unixepoch when retry is due
  charged_at                INTEGER,
  created_at                INTEGER DEFAULT (unixepoch())
);

-- ── Charge-roundup join ───────────────────────────────────────────────────────
-- Records EXACTLY which roundup IDs were swept in each charge.
-- Used by webhook handler to mark the correct roundups on async payment confirmation
-- without the race condition of re-scanning `included_in IS NULL` after the fact.
CREATE TABLE IF NOT EXISTS charge_roundups (
  charge_id   TEXT NOT NULL REFERENCES monthly_charges(id),
  roundup_id  TEXT NOT NULL REFERENCES roundups(id),
  PRIMARY KEY (charge_id, roundup_id)
);

-- ── Fee accruals ──────────────────────────────────────────────────────────────
-- One row per active month per user. Written by the monthly job when a month has
-- at least one unswept round-up. Swept alongside roundups in the monthly charge —
-- same race-safe exact-ID pattern as charge_roundups.
--
-- FEE MODEL v3 (2026-07-03): PocketCache's $1.00/month fee is MANDATORY.
--   Itemized as: $0.50 tracking + $0.50 processing.
--   fee_cents = 100 ALWAYS. No opt-out. Nonprofits never pay PocketCache.
--   The `covered` column is vestigial (always 1 in v3); kept for schema compatibility.
--   Nonprofit's card-processing costs are handled separately via the cover_processing
--   gross-up on the monthly charge, not here.
--
-- MIGRATION (v2→v3): existing covered=0 rows remain as-is; job now always writes covered=1.
CREATE TABLE IF NOT EXISTS fee_accruals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  period          TEXT NOT NULL,            -- 'YYYY-MM' of the active month
  fee_cents       INTEGER NOT NULL,         -- always 100 ($1.00/month, mandatory PocketCache fee)
  covered         INTEGER NOT NULL DEFAULT 1, -- vestigial in v3; always 1
  nonprofit_id    TEXT NOT NULL REFERENCES nonprofits(id),
  included_in     TEXT REFERENCES monthly_charges(id),      -- NULL until swept
  created_at      INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, period)
);

-- ── Charge-fee-accrual join ───────────────────────────────────────────────────
-- Records EXACTLY which fee_accrual IDs were swept in each charge.
-- Same race-safe pattern as charge_roundups — marked atomically on success.
CREATE TABLE IF NOT EXISTS charge_fee_accruals (
  charge_id       TEXT NOT NULL REFERENCES monthly_charges(id),
  fee_accrual_id  TEXT NOT NULL REFERENCES fee_accruals(id),
  PRIMARY KEY (charge_id, fee_accrual_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_roundups_user_status  ON roundups(user_id, status);
CREATE INDEX IF NOT EXISTS idx_roundups_included     ON roundups(included_in);
CREATE INDEX IF NOT EXISTS idx_roundups_pending_txn  ON roundups(pending_plaid_txn_id);
CREATE INDEX IF NOT EXISTS idx_monthly_user_period   ON monthly_charges(user_id, period);
CREATE INDEX IF NOT EXISTS idx_monthly_status_retry  ON monthly_charges(status, retry_at);
CREATE INDEX IF NOT EXISTS idx_plaid_user            ON plaid_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_status          ON plaid_connections(user_id, status);
CREATE INDEX IF NOT EXISTS idx_connected_user_np     ON connected_customers(user_id, nonprofit_id);
CREATE INDEX IF NOT EXISTS idx_fee_accruals_user     ON fee_accruals(user_id, included_in);
CREATE INDEX IF NOT EXISTS idx_fee_accruals_np       ON fee_accruals(nonprofit_id, included_in);
