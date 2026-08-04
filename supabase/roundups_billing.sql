-- Server-side round-up billing: three new tables plus a cursor column on
-- plaid_items. Written ONLY by the roundups-sync / cycle-lock /
-- charge-cycles-run edge functions with the service role key.
--
-- RLS is ON with NO policies at all on all three new tables, same posture as
-- stripe_donors and plaid_items: the anon key can neither read nor write
-- this data. Donor amounts, cycle totals and Stripe ids stay server-side.
--
-- Applied to project yeptifozaytoglfwxksz via the Supabase management API on
-- 2026-08-04. Kept here so the schema is in version control.

-- plaid_items needs a place to persist each item's /transactions/sync
-- cursor so a re-run only asks Plaid for what changed since last time.
alter table public.plaid_items add column if not exists cursor text;

-- roundups: one row per outflow transaction's round-up, before it is
-- grouped into a monthly charge_cycles row. txn_id is unique so a re-sync
-- of the same Plaid transaction (e.g. pending -> posted) updates in place
-- instead of double-counting.
create table if not exists public.roundups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  stripe_customer_id text not null,
  plaid_item_id text,
  txn_id text not null unique,
  txn_date date,
  merchant text,
  amount_cents int not null,
  roundup_cents int not null,
  month_key text not null,
  status text not null default 'pending'
);
alter table public.roundups enable row level security;

create index if not exists roundups_customer_month_status_idx
  on public.roundups (stripe_customer_id, month_key, status);

-- charge_cycles: one row per donor per calendar month once cycle-lock has
-- looked at it. Below the nonprofit's minimum it stays 'rolled_forward' and
-- the balance carries to the next month via rollover_in_cents; at or above
-- the minimum it becomes 'locked' (total_cents set) and later 'charged' or
-- 'failed' by charge-cycles-run.
create table if not exists public.charge_cycles (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  stripe_customer_id text not null,
  month_key text not null,
  roundup_total_cents int not null default 0,
  rollover_in_cents int not null default 0,
  total_cents int not null default 0,
  status text not null default 'rolled_forward',
  locked_at timestamptz,
  charged_at timestamptz,
  payment_intent_id text,
  connected_account text,
  unique (stripe_customer_id, month_key)
);
alter table public.charge_cycles enable row level security;

create index if not exists charge_cycles_status_idx
  on public.charge_cycles (status);

-- connected_customers: the permanent fix for Stripe's single-use card
-- copies. A donor's card is cloned onto a nonprofit's connected account
-- ONCE and reused every month after that. Re-cloned only when the donor's
-- platform payment method changes (source_payment_method_id no longer
-- matches stripe_donors.payment_method_id).
create table if not exists public.connected_customers (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  stripe_customer_id text not null,
  connected_account text not null,
  connected_customer_id text not null,
  cloned_payment_method_id text,
  source_payment_method_id text,
  unique (stripe_customer_id, connected_account)
);
alter table public.connected_customers enable row level security;
