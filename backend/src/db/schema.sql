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
  monthly_minimum_cents INTEGER NOT NULL DEFAULT 1000,  -- $10.00 — roll over if below
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
  cover_fee               INTEGER NOT NULL DEFAULT 1, -- 1 = donor covers $0.50 fee, 0 = deducted
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
  connected_at    INTEGER DEFAULT (unixepoch()),
  last_synced_at  INTEGER
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
CREATE TABLE IF NOT EXISTS monthly_charges (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  nonprofit_id              TEXT NOT NULL REFERENCES nonprofits(id),
  period                    TEXT NOT NULL,           -- 'YYYY-MM'
  roundup_cents             INTEGER NOT NULL,        -- sum of round-ups swept
  fee_cents                 INTEGER NOT NULL DEFAULT 50, -- ALWAYS 50 — flat fee
  cover_fee                 INTEGER NOT NULL,        -- 1 = donor covered $0.50
  total_charged_cents       INTEGER NOT NULL,        -- roundup_cents + 50 if cover_fee=1, else roundup_cents
  -- net to nonprofit = roundup_cents if cover_fee=1, else (roundup_cents - 50)
  -- application_fee_amount = always 50 cents regardless of cover_fee
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

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_roundups_user_status  ON roundups(user_id, status);
CREATE INDEX IF NOT EXISTS idx_roundups_included     ON roundups(included_in);
CREATE INDEX IF NOT EXISTS idx_roundups_pending_txn  ON roundups(pending_plaid_txn_id);
CREATE INDEX IF NOT EXISTS idx_monthly_user_period   ON monthly_charges(user_id, period);
CREATE INDEX IF NOT EXISTS idx_monthly_status_retry  ON monthly_charges(status, retry_at);
CREATE INDEX IF NOT EXISTS idx_plaid_user            ON plaid_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_user_np     ON connected_customers(user_id, nonprofit_id);
