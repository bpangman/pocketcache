-- PocketChange database schema
-- Run once to initialize: sqlite3 pocketchange.db < src/db/schema.sql

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                      TEXT PRIMARY KEY,  -- UUID
  email                   TEXT UNIQUE NOT NULL,
  name                    TEXT,
  cause_org_id            TEXT NOT NULL,     -- Endaoment org ID — ACTIVE cause
  pending_cause_org_id    TEXT,              -- staged cause change, applied at next 2am job
  payment_method          TEXT,              -- 'ach' | 'apple_pay' | 'card'
  status                  TEXT DEFAULT 'active',  -- 'active' | 'paused' | 'cancelled'
  created_at              INTEGER DEFAULT (unixepoch())
);

-- ── Plaid connections (one per user — the card they're tracking) ──────────────
CREATE TABLE IF NOT EXISTS plaid_connections (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  access_token    TEXT NOT NULL,             -- NEVER expose this to frontend
  item_id         TEXT NOT NULL,             -- Plaid item ID
  institution     TEXT,                      -- e.g. "Chase"
  last4           TEXT,                      -- last 4 of tracked card (for loop prevention)
  account_id      TEXT NOT NULL,             -- Plaid account ID for the tracked card
  cursor          TEXT,                      -- Plaid transactions cursor for incremental sync
  connected_at    INTEGER DEFAULT (unixepoch()),
  last_synced_at  INTEGER
);

-- ── Stripe payment methods (how we charge the user) ───────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id       TEXT NOT NULL,    -- Stripe customer object
  stripe_payment_method_id TEXT NOT NULL,    -- pm_... (card) or ba_... (ACH)
  type                     TEXT NOT NULL,    -- 'ach' | 'apple_pay' | 'card'
  last4                    TEXT,
  is_default               INTEGER DEFAULT 1,
  created_at               INTEGER DEFAULT (unixepoch())
);

-- ── Round-ups (one row per purchase that generated a round-up) ────────────────
CREATE TABLE IF NOT EXISTS roundups (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  plaid_txn_id    TEXT UNIQUE NOT NULL,      -- Plaid transaction_id (dedup key)
  merchant        TEXT,
  amount          REAL NOT NULL,             -- original purchase amount
  roundup         REAL NOT NULL,             -- ceiling(amount) - amount
  date            TEXT NOT NULL,             -- YYYY-MM-DD
  cause_org_id    TEXT NOT NULL,             -- cause active at time of accumulation
                                             -- IMPORTANT: cause switches only affect future
                                             -- round-ups, not ones already logged here
  included_in     TEXT,                      -- monthly_charges.id once swept
  created_at      INTEGER DEFAULT (unixepoch())
);

-- ── Monthly charges (one row per monthly sweep per user) ──────────────────────
CREATE TABLE IF NOT EXISTS monthly_charges (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id),
  period                   TEXT NOT NULL,    -- 'YYYY-MM'
  gross_amount             REAL NOT NULL,    -- total round-ups charged to user
  platform_fee             REAL NOT NULL,    -- 5% or 10% depending on method
  net_amount               REAL NOT NULL,    -- gross - fee (goes to Treasury)
  stripe_payment_intent_id TEXT,
  status                   TEXT DEFAULT 'pending',  -- pending | succeeded | failed | retrying
  retry_count              INTEGER DEFAULT 0,
  charged_at               INTEGER,
  created_at               INTEGER DEFAULT (unixepoch())
);

-- ── Stripe Treasury balance log (for tracking float interest) ─────────────────
CREATE TABLE IF NOT EXISTS treasury_log (
  id          TEXT PRIMARY KEY,
  event       TEXT NOT NULL,                -- 'deposit' | 'withdrawal' | 'interest'
  amount      REAL NOT NULL,
  balance     REAL,                         -- balance after event
  reference   TEXT,                         -- monthly_charges.id or quarterly_disbursements.id
  recorded_at INTEGER DEFAULT (unixepoch())
);

-- ── Quarterly disbursements to Endaoment ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS quarterly_disbursements (
  id                   TEXT PRIMARY KEY,
  period               TEXT NOT NULL,       -- 'YYYY-QN' e.g. '2026-Q1'
  total_amount         REAL NOT NULL,       -- total swept from Treasury
  endaoment_grant_id   TEXT,               -- grant ID from Endaoment API response
  status               TEXT DEFAULT 'pending',  -- pending | submitted | confirmed | failed
  submitted_at         INTEGER,
  confirmed_at         INTEGER,
  created_at           INTEGER DEFAULT (unixepoch())
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_roundups_user_period ON roundups(user_id, date);
CREATE INDEX IF NOT EXISTS idx_roundups_included ON roundups(included_in);
CREATE INDEX IF NOT EXISTS idx_monthly_user_period ON monthly_charges(user_id, period);
CREATE INDEX IF NOT EXISTS idx_plaid_user ON plaid_connections(user_id);
