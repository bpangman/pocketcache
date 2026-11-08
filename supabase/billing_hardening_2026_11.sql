-- billing_hardening_2026_11.sql
-- Backend-billing overhaul, 2026-11-07. NOT YET APPLIED to project
-- yeptifozaytoglfwxksz - written to the repo only; the orchestrator applies it.
--
-- DEPLOY-NOTES (do these in this order):
--   1. Apply THIS file first (Supabase SQL editor or management API, as the
--      earlier *.sql files were). Every statement is idempotent: ADD COLUMN IF
--      NOT EXISTS, CREATE TABLE IF NOT EXISTS, constraints dropped by name
--      before being recreated, the cron job unscheduled by name before being
--      rescheduled. Re-running it is safe.
--   2. Deploy the edge functions that read the new columns (all with
--      --no-verify-jwt, like the rest of the project), in this order so a
--      shared module is never older than its consumer:
--        supabase functions deploy cycle-lock        --no-verify-jwt
--        supabase functions deploy charge-cycles-run --no-verify-jwt
--        supabase functions deploy stripe-charge-run --no-verify-jwt
--        supabase functions deploy roundups-sync     --no-verify-jwt
--        supabase functions deploy roundups-me       --no-verify-jwt
--        supabase functions deploy donor-close       --no-verify-jwt   (new)
--      Deploying the functions BEFORE step 1 would make cycle-lock /
--      charge-cycles-run fail on the first unknown column; the reverse order
--      (SQL first) is harmless because the old code ignores new columns.
--   3. Secrets: nothing new is REQUIRED. For the sandbox / pilot only, set
--      ALLOW_TEST_CONNECTED_FALLBACK=1 so donors without an approved,
--      Stripe-connected nonprofit still bill into STRIPE_TEST_CONNECTED_ACCT.
--      Leave it UNSET in production: a donor whose nonprofit does not resolve
--      is parked as 'held_no_org' and listed in the owner's lock summary
--      instead of being charged into the wrong account.
--   4. Section 6 schedules the 14th's retry run by COPYING the existing 11th
--      job's command (pg_cron job 'pocketcache-charge-cycles-run', whose
--      definition was created outside this repo). If that job name differs,
--      the DO block raises a NOTICE and schedules nothing - check
--      `select jobname, schedule, command from cron.job;` and re-run with the
--      right name. Verify afterwards with the same select.
--   5. Section 7 (events scrub) rewrites existing rows; it assumes
--      events.detail is json or jsonb (the code writes an object there). If
--      it is `text`, swap `detail::jsonb` for `detail::text::jsonb`.
--   6. Section 8 is a one-time data clean-up that is COMMENTED OUT on
--      purpose. Read it, run its SELECT preview, and only then run the UPDATE
--      by hand.
--
-- WHAT THIS CHANGES, in plain terms: the donor's billing controls (skip a
-- month, monthly cap, lower a locked amount, cover processing) move out of
-- the browser and onto stripe_donors where the 1st's lock job can honor them;
-- cancelling or deleting an account is recorded server-side; charge cycles
-- get a retry state, an attempt counter, an adjusted figure and the list of
-- months they cover; a service-role-only charge_log keeps the Stripe ids that
-- used to leak into the anon-readable events feed; and the 14th gets a retry
-- cron run.

-- 1. stripe_donors: billing controls + cancellation state ------------------
-- Written by roundups-me (settings) and donor-close (cancellation). Read by
-- cycle-lock, charge-cycles-run, roundups-sync, roundups-me.
alter table public.stripe_donors add column if not exists skip_month_key text;          -- 'YYYY-MM' the donor chose to skip
alter table public.stripe_donors add column if not exists monthly_cap_cents int;        -- null = no cap; 500..1000000
alter table public.stripe_donors add column if not exists charge_adjustment_cents int;  -- a lower figure for adjustment_month_key (0 or 500..1000000)
alter table public.stripe_donors add column if not exists adjustment_month_key text;    -- the month that adjustment is for
alter table public.stripe_donors add column if not exists cover_processing boolean not null default true; -- add the 2.2% + 30c gross-up
alter table public.stripe_donors add column if not exists cancelled_at timestamptz;     -- set by donor-close; giving ends here
alter table public.stripe_donors add column if not exists close_final text;             -- 'donate' | 'waive': what happens to the accrued balance
alter table public.stripe_donors add column if not exists giving_started_at timestamptz; -- explicit pre-link floor; null = the plaid_items row's created_at

alter table public.stripe_donors drop constraint if exists stripe_donors_close_final_check;
alter table public.stripe_donors add constraint stripe_donors_close_final_check
  check (close_final is null or close_final in ('donate', 'waive'));

-- 2. charge_cycles: controls applied, retries, adjustment, months covered ---
alter table public.charge_cycles add column if not exists fee_months int not null default 0;        -- $1-fee months recorded (NOT charged); clamped at 12
alter table public.charge_cycles add column if not exists cover_cents int not null default 0;       -- processing cover inside total_cents
alter table public.charge_cycles add column if not exists base_after_controls_cents int;            -- R*mult after cap/adjustment + rollover + pledges, before cover
alter table public.charge_cycles add column if not exists adjusted_total_cents int;                 -- the donor lowered it in the 1st-10th window
alter table public.charge_cycles add column if not exists adjusted_at timestamptz;                  -- once per cycle
alter table public.charge_cycles add column if not exists attempts int not null default 0;          -- charge attempts so far (max 2)
alter table public.charge_cycles add column if not exists last_error text;
alter table public.charge_cycles add column if not exists next_retry_at timestamptz;                -- set with status 'retry'; the 14th picks it up
alter table public.charge_cycles add column if not exists months_included text[];                   -- this month plus every month absorbed via the chain
alter table public.charge_cycles add column if not exists email_message_id text;                    -- Gmail id of the lock email (audit)
alter table public.charge_cycles add column if not exists card_update_emailed_at timestamptz;       -- the one "update your card" email after a give-up

-- Status vocabulary (no constraint existed before; one is added now so a
-- typo cannot invent a state). Lifecycle:
--   rolled_forward  under the $5 floor at lock, balance carries (also: a locked
--                   cycle charge-cycles-run gave up on - locked_at stays set)
--   held_no_org     could not resolve the donor's nonprofit to a connected
--                   Stripe account at lock; parked, nothing emailed or charged
--   skipped         the donor skipped this month (lock time or in-window)
--   locked          amount fixed on the 1st, charged on the 11th
--   retry           first attempt declined retryably; next_retry_at set
--   charged         done
--   failed          legacy terminal state (pre-2026-11 runs); no longer written
--   waived          cancelled donor, nothing charged
--   rolled_over     a carry row the next month's cycle absorbed
alter table public.charge_cycles drop constraint if exists charge_cycles_status_check;
alter table public.charge_cycles add constraint charge_cycles_status_check
  check (status in ('rolled_forward', 'held_no_org', 'skipped', 'locked', 'retry', 'charged', 'failed', 'waived', 'rolled_over'));

create index if not exists charge_cycles_customer_month_idx
  on public.charge_cycles (stripe_customer_id, month_key desc);
create index if not exists charge_cycles_retry_idx
  on public.charge_cycles (status, next_retry_at);

-- 3. roundups: status vocabulary ------------------------------------------
--   pending   accrued, not yet in a cycle
--   rolled    its month rolled forward; still owed, waits for the next lock
--   locked    inside a locked cycle
--   charged   paid
--   skipped   the donor skipped its month
--   waived    the donor cancelled and waived the balance
--   void      a purchase from before the bank link (one-time clean-up, s. 8)
alter table public.roundups drop constraint if exists roundups_status_check;
alter table public.roundups add constraint roundups_status_check
  check (status in ('pending', 'rolled', 'locked', 'charged', 'skipped', 'waived', 'void'));

-- 4. give_extras: a pledge a cancelling donor waived ----------------------
alter table public.give_extras drop constraint if exists give_extras_status_check;
alter table public.give_extras add constraint give_extras_status_check
  check (status in ('pending', 'charged', 'cancelled'));

-- 5. charge_log: the audit trail with the Stripe ids -----------------------
-- One row per charge attempt outcome (charged / failed / connect_blocked /
-- record_failed). RLS on, NO policies: service role only. This is where the
-- Stripe customer, PaymentIntent and connected-account ids live now; the
-- anon-readable events feed gets only cycle_id, month_key and total_cents.
create table if not exists public.charge_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  cycle_id bigint references public.charge_cycles (id) on delete set null,
  stripe_customer_id text,
  payment_intent_id text,
  connected_account text,
  amount_cents int not null default 0,
  status text not null,
  error text
);
alter table public.charge_log enable row level security;
create index if not exists charge_log_cycle_idx on public.charge_log (cycle_id);

-- 6. pg_cron: the 14th's retry run ------------------------------------------
-- charge-cycles-run marks a retryable decline 'retry' with next_retry_at =
-- attempt + 3 days; the same function run on the 14th at 15:10 UTC picks
-- those up (its selector is status in (locked, retry) with next_retry_at
-- null or due, so an 11th-run that was skipped is also caught). The command
-- is copied verbatim from the existing 11th job so the URL, headers and
-- x-charge-key stay in one place.
do $$
declare
  existing_cmd text;
  existing_retry int;
begin
  select command into existing_cmd from cron.job where jobname = 'pocketcache-charge-cycles-run' limit 1;
  if existing_cmd is null then
    raise notice 'billing_hardening: cron job pocketcache-charge-cycles-run not found; retry job NOT scheduled. Check cron.job and re-run section 6.';
    return;
  end if;
  select jobid into existing_retry from cron.job where jobname = 'pocketcache-charge-cycles-retry' limit 1;
  if existing_retry is not null then
    perform cron.unschedule('pocketcache-charge-cycles-retry');
  end if;
  perform cron.schedule('pocketcache-charge-cycles-retry', '10 15 14 * *', existing_cmd);
  raise notice 'billing_hardening: scheduled pocketcache-charge-cycles-retry at 10 15 14 * * (UTC)';
end $$;

-- 7. events: scrub the Stripe ids older runs wrote into the public feed -----
-- charge-cycles-run used to write stripe_customer_id, payment_intent_id and
-- connected_account into events.detail, and events_anon_select lets the anon
-- key read that table (see security_hardening_2026_11.sql section 8). Strip
-- those keys from every existing row; new rows never carry them.
update public.events
set detail = ((detail::jsonb) - 'stripe_customer_id' - 'payment_intent_id' - 'connected_account')
where event in ('charge_cycle_charged', 'charge_cycle_failed')
  and detail is not null
  and (
    (detail::jsonb) ? 'stripe_customer_id'
    or (detail::jsonb) ? 'payment_intent_id'
    or (detail::jsonb) ? 'connected_account'
  );

-- 8. ONE-TIME CLEAN-UP, NOT APPLIED BY THIS FILE ----------------------------
-- Pending round-ups on purchases dated BEFORE the donor's bank was linked
-- (roundups-sync used to pull Plaid's full history and round up all of it).
-- The engine now refuses such rows; the ones already in the table should be
-- voided so the next lock does not charge months of pre-link spending.
-- Preview first:
--   select r.id, r.stripe_customer_id, r.txn_date, p.created_at::date as linked, r.roundup_cents
--   from public.roundups r
--   join public.plaid_items p on p.item_id = r.plaid_item_id
--   where r.status = 'pending' and r.txn_date < p.created_at::date
--   order by r.stripe_customer_id, r.txn_date;
-- Then, by hand:
--   update public.roundups r
--   set status = 'void'
--   from public.plaid_items p
--   where p.item_id = r.plaid_item_id
--     and r.status = 'pending'
--     and r.txn_date < p.created_at::date;
-- Rows whose plaid_item_id is null (very early rows) are not touched; look at
-- them separately.
