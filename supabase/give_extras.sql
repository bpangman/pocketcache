-- give_extras: a donor's one-off "Give Extra" pledges. Each row is a pledge
-- that JOINS THE MONTHLY FLOW rather than being charged on the spot:
-- cycle-lock (the 1st-of-the-month job) folds every still-'pending' pledge
-- into the donor's cycle total, stamps cycle_month on the rows it locked in,
-- and charge-cycles-run (the 11th) flips them to 'charged' alongside the
-- round-ups they were billed with. A pledge that lands in an under-$5
-- rolled-forward month stays 'pending' with cycle_month null and simply
-- counts again next month - the row itself is the carry mechanism, so the
-- rolled-forward cycle's total_cents deliberately does NOT bake it in (see
-- cycle-lock's GIVE EXTRAS section for the double-count math).
--
-- RLS is ON with NO policies at all, same posture as stripe_donors /
-- roundups / charge_cycles: written and read only by the edge functions with
-- the service role key. Inserts come from the give-extra function (donor
-- auth JWT or the same email fallback roundups-me accepts).
--
-- Applied to project yeptifozaytoglfwxksz via the Supabase management API on
-- 2026-08-08. Kept here so the schema is in version control.
create table if not exists public.give_extras (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  stripe_customer_id text not null,
  email text,
  org_id uuid,
  amount_cents int not null,
  status text not null default 'pending', -- 'pending' | 'charged'
  cycle_month text
);
alter table public.give_extras enable row level security;

create index if not exists give_extras_customer_status_idx
  on public.give_extras (stripe_customer_id, status);
