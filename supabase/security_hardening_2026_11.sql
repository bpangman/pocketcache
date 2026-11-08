-- security_hardening_2026_11.sql
--
-- Schema half of the 2026-11 backend audit fixes (auth + orgs cluster). Pairs
-- with the edge functions listed in DEPLOY-NOTES. Idempotent: every statement
-- is guarded, so re-running it is safe. Nothing here deletes data.
--
-- ============================ DEPLOY-NOTES ==================================
-- ORDER MATTERS. The functions read columns this file adds; deploy them
-- after it, not before.
--
--   1. Apply this whole file to the live project (Supabase SQL editor or the
--      management API), the same way the other supabase/*.sql files were
--      applied. Read section 6 first: the unique index on upper(join_code)
--      fails if two orgs already share a code (case-insensitively). Run the
--      commented duplicate check there and fix any duplicates by hand before
--      applying.
--
--   2. Then redeploy these edge functions (same flags as today unless noted):
--        supabase functions deploy give-extra             --no-verify-jwt
--        supabase functions deploy stripe-setup-intent    --no-verify-jwt
--        supabase functions deploy stripe-setup-complete  --no-verify-jwt
--        supabase functions deploy org-signup             --no-verify-jwt
--        supabase functions deploy org-admin-lookup       --no-verify-jwt
--        supabase functions deploy org-connect-stripe     --no-verify-jwt
--        supabase functions deploy org-connect-status     --no-verify-jwt
--        supabase functions deploy org-contact            --no-verify-jwt
--        supabase functions deploy update-donor-email     --no-verify-jwt
--        supabase functions deploy plaid-link-token       (DROP --no-verify-jwt: JWT verification on)
--        supabase functions deploy plaid-exchange         (DROP --no-verify-jwt: JWT verification on)
--      org-approve and apple-secret-renewal import the changed _shared files
--      but their behaviour is unchanged; redeploy them too so every function
--      runs the same _shared/cors.ts.
--
--   3. Secrets: do NOT set ALLOW_LOCALHOST_ORIGINS on the production
--      project. Set ALLOW_LOCALHOST_ORIGINS=1 only on a local or dev project
--      when http://localhost origins need to call the functions.
--
--   4. The web client must ship in the same window: src/lib/stripeSetup.js
--      should pass setup_intent_id to stripe-setup-complete (the function
--      copes without it, using the id it stored itself), and the nonprofit
--      dashboard clusters read joinCodeTaken / benevity_submitted /
--      logo_url / long_description from org-signup and org-admin-lookup.
--
--   5. Section 7 tightens the browser's INSERT policy on events. Confirm the
--      event-name allowlist still matches every pcBeacon() call in src/
--      (grep "pcBeacon(") whenever a new client event is added, or the new
--      event is silently dropped by RLS.
-- ============================================================================

-- 1. stripe_donors.pending_setup_intent_id --------------------------------
-- stripe-setup-intent records the SetupIntent it minted here instead of
-- flipping setup_status back to 'pending'; stripe-setup-complete checks the
-- confirmed payment method came through exactly this intent, then clears it.
alter table public.stripe_donors
  add column if not exists pending_setup_intent_id text;

-- 2. orgs.admin_user_id ---------------------------------------------------
-- The auth user who administers the org. Stamped by org-signup (create and
-- update) and by org-admin-lookup on the first verified sign-in; required by
-- update-donor-email's admin branch and org-connect-stripe (callerIsOrgAdmin
-- in _shared/org.ts). Backfilled from auth.users by admin_email.
alter table public.orgs
  add column if not exists admin_user_id uuid;

update public.orgs o
   set admin_user_id = u.id
  from auth.users u
 where o.admin_user_id is null
   and lower(u.email) = lower(o.admin_email);

create index if not exists orgs_admin_user_id_idx
  on public.orgs (admin_user_id);

-- 3. orgs.benevity_submitted, logo_url, long_description ------------------
-- benevity_submitted: the admin's self-report that they registered with
-- Benevity (Overview "I have registered"). It never means approved; Apple
-- listing approval stays the platform owner's call. Backfilled from the
-- existing apple_approval JSON when that already says benevity_submitted.
-- logo_url: https URL in this project's own Storage public bucket only
-- (validated by org-signup). long_description: the landing-page story, up
-- to 2000 characters. No monthly_minimum column is added on purpose: the
-- floor is a fixed $5 for every org (cycle-lock MINIMUM_CENTS).
alter table public.orgs
  add column if not exists benevity_submitted boolean not null default false;
alter table public.orgs
  add column if not exists logo_url text;
alter table public.orgs
  add column if not exists long_description text;

do $$
declare
  approval_type text;
begin
  select data_type into approval_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'orgs' and column_name = 'apple_approval';
  if approval_type in ('json', 'jsonb') then
    execute $sql$
      update public.orgs
         set benevity_submitted = true
       where benevity_submitted = false
         and (apple_approval::jsonb ->> 'status') = 'benevity_submitted'
    $sql$;
  end if;
end $$;

-- 4. orgs_public view -----------------------------------------------------
-- Adds logo_url and long_description so donor surfaces and the admin's
-- other devices read them from the server instead of per-device storage.
-- Still excludes admin_email, admin_user_id, ein, stripe_account_id.
-- CREATE OR REPLACE VIEW keeps the existing grants on the view.
create or replace view public.orgs_public as
  select id, name, join_code, brand_color, mission, apple_approval,
         stripe_connected, status, logo_url, long_description
  from public.orgs;

-- 5. contact_submissions --------------------------------------------------
-- Where org-contact now stores every sponsor / volunteer form post and
-- counts its per-org rate limit. Service-role only: RLS on, no policies, and
-- the browser roles are explicitly revoked. Holds submitter PII (their own
-- name and email, typed into the form for the nonprofit), so it must never
-- grow an anon policy.
create table if not exists public.contact_submissions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  org_id uuid,
  org_join_code text not null,
  kind text not null,            -- 'match_sponsor' | 'volunteer'
  name text not null,
  email text not null,
  company text,
  budget text,
  message text,
  emailed_at timestamptz          -- set once the email to the nonprofit went out
);
alter table public.contact_submissions enable row level security;
revoke all on public.contact_submissions from anon, authenticated;

create index if not exists contact_submissions_org_created_idx
  on public.contact_submissions (org_join_code, created_at desc);

-- 6. Join-code uniqueness -------------------------------------------------
-- org-signup checks availability with a GET before writing, which two
-- racing signups can both pass. This index is the real guarantee; the
-- function treats the resulting 23505 as "taken" (update) or regenerates
-- the code (create). Codes are compared case-insensitively everywhere.
--
-- DUPLICATE CHECK - run this first and resolve any rows it returns by hand
-- (the index creation below fails while duplicates exist):
--
--   select upper(join_code) as code, count(*), array_agg(id) as org_ids
--     from public.orgs
--    group by upper(join_code)
--   having count(*) > 1;
--
create unique index if not exists orgs_join_code_upper_uidx
  on public.orgs (upper(join_code));

-- donor_profiles.org_join_code is matched case-insensitively when a code is
-- renamed (org-signup moves the bound donors to the new code).
create index if not exists donor_profiles_org_join_code_idx
  on public.donor_profiles (upper(org_join_code));

-- 7. events: browser INSERT policy ----------------------------------------
-- The browser (src/lib/beacon.js pcBeacon, anon key) may only insert the
-- three product events the client actually fires, with the default source
-- 'site', stamped within a minute of the server clock, and with a small
-- detail payload. Previously with_check was `true`, which let anyone forge
-- owner-feed rows ('nonprofit approved', 'charge_cycle_charged') or set a
-- far-future created_at that pinned org-contact's old events-based rate
-- limiter at 429 for good. Edge functions write events with the service
-- role and are not affected.
--
-- ALLOWLIST (keep in sync with every pcBeacon() call in src/):
--   'nonprofit signup'  - src/lib/npSignup.js
--   'donor signup'      - src/pages/Onboarding.jsx, src/pages/WebOnboarding.jsx
--   'donor cancelled'   - src/store/AppContext.jsx
drop policy if exists events_anon_insert on public.events;
create policy events_anon_insert on public.events
  for insert
  to anon, authenticated
  with check (
    source = 'site'
    and event in ('nonprofit signup', 'donor signup', 'donor cancelled')
    and created_at between now() - interval '1 minute' and now() + interval '1 minute'
    and octet_length(coalesce(detail::text, '')) <= 2000
  );

-- 8. events: browser SELECT policy (unchanged, on purpose) ----------------
-- events_anon_select stays as it is for now: src/pages/PlatformAdmin.jsx
-- reads the owner's live feed straight from this table with the anon key,
-- and backend-billing is scrubbing the Stripe ids and amounts that
-- charge-cycles-run used to write into it.
--
-- TODO (next backend pass): replace events_anon_select with a key-protected
-- owner-feed edge function (x-approve-key, same pattern as org-approve's
-- POST), point PlatformAdmin at it, then `drop policy events_anon_select on
-- public.events` and revoke select from anon. Until then the table must hold
-- nothing a stranger should not read.
