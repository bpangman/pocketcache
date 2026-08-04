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
  setup_status text not null default 'pending'
);

alter table public.stripe_donors enable row level security;
