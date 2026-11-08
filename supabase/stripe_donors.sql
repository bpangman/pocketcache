-- stripe_donors: one row per Stripe Customer we have saved (or started
-- saving) a card for. Written ONLY by the stripe-* edge functions with the
-- service role key.
--
-- RLS is ON with NO policies at all: the anon key can neither read nor write
-- this table. That is deliberate - Stripe customer and payment method ids
-- stay server-side, same posture as plaid_items.
--
-- Applied to project yeptifozaytoglfwxksz via the Supabase management API on
-- 2026-08-04. Kept here so the schema is in version control.

create table if not exists public.stripe_donors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  email text,
  stripe_customer_id text not null unique,
  payment_method_id text,
  setup_status text not null default 'pending' -- 'pending' | 'saved' | 'closed' (donor-close detached the card)
);

-- Later columns live in their own files: multiplier (roundups_realtime.sql);
-- skip_month_key, monthly_cap_cents, charge_adjustment_cents,
-- adjustment_month_key, cover_processing, cancelled_at, close_final,
-- giving_started_at (billing_hardening_2026_11.sql - the donor's billing
-- controls and cancellation state, written by roundups-me / donor-close).

alter table public.stripe_donors enable row level security;
