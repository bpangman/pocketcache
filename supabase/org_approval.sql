-- Nonprofit approval gate (2026-08-08).
--
-- Every new self-serve nonprofit starts as 'pending_review' and only goes
-- donor-visible after the platform owner approves it (org-approve edge
-- function, one-click link emailed by org-signup). Applied to the live
-- project via the Supabase management API; kept here as the record of what
-- ran.

-- 1. Status column. Existing rows predate the gate and were approved in
--    practice (they were donor-visible already), so they backfill as
--    'approved' before the default starts applying to new rows. This also
--    covers the BGCA seed if it ever gets a server row.
alter table public.orgs
  add column if not exists status text not null default 'approved';

update public.orgs set status = 'approved' where status is distinct from 'approved';

alter table public.orgs alter column status set default 'pending_review';

alter table public.orgs drop constraint if exists orgs_status_check;
alter table public.orgs
  add constraint orgs_status_check check (status in ('pending_review', 'approved'));

-- 2. Owner-alert idempotency stamp: org-signup sends the "awaiting your
--    approval" email to the owner exactly once per org, guarded by this.
alter table public.orgs
  add column if not exists approve_alert_sent_at timestamptz;

-- 3. Expose status through the public read view (anon-readable; used by the
--    donor-side resolver and the platform admin console's pending list).
create or replace view public.orgs_public as
  select id, name, join_code, brand_color, mission, apple_approval,
         stripe_connected, status
  from public.orgs;
