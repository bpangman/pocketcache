-- On-demand round-up sync (roundups-me) support: a cooldown timestamp on
-- plaid_items so the on-demand path does not hammer Plaid's sandbox API,
-- and a per-donor multiplier column moved server-side out of localStorage.
--
-- Applied to project yeptifozaytoglfwxksz via the Supabase management API on
-- 2026-08-04. Kept here so the schema is in version control.

-- plaid_items.last_synced_at: stamped with the server time at the MOMENT a
-- sync starts (not the time Plaid's response comes back), so a slow Plaid
-- call cannot make the cooldown window shorter than intended. roundups-me
-- skips calling Plaid entirely when this is set and less than 20 minutes
-- old, serving cached numbers from `roundups` instead - the anti-hammering
-- guard for a donor who keeps reopening their dashboard.
alter table public.plaid_items add column if not exists last_synced_at timestamptz;

-- LINKING A SIGNED-IN DONOR TO THEIR plaid_items ROW(S): the normal signup
-- order in Onboarding.jsx is sign-in (real Supabase Auth) BEFORE the Plaid
-- bank-connect step, so plaid-exchange already has a Supabase session to
-- resolve and stamps user_id (and email) on the row at connect time in the
-- common case - no schema change needed for that path.
--
-- The gap: a donor who links a bank before ever signing in (or whose link
-- happened in a session plaid-exchange could not verify) gets a plaid_items
-- row with user_id null and possibly email null too. roundups-me matches a
-- signed-in donor's plaid_items rows by user_id first, falling back to
-- email - the same two-step precedence roundups-sync already uses in the
-- other direction (plaid_items -> stripe_donors). A row with BOTH user_id
-- and email null cannot be linked after the fact by any means this schema
-- has, and that is an accepted, pragmatic gap for this pass rather than a
-- backfill migration: it only affects a donor who links a bank ahead of
-- ever creating an account, which the product's own step order (signup
-- happens first) makes the uncommon path, not the default one. If this
-- turns out to matter in practice, the fix is a "claim this bank connection"
-- step at sign-up time, not a blind backfill guess - out of scope here.

-- stripe_donors.multiplier: the donor's round-up multiplier (1x/2x/3x),
-- previously 100% client-side (AppContext's pc_multiplier in localStorage).
-- roundups-me applies this at DISPLAY time only when summing a month's
-- pending+locked roundup_cents - never stored back into `roundups` itself,
-- matching the same storage discipline cycle-lock's multiplier section
-- documents (see supabase/functions/cycle-lock/index.ts).
alter table public.stripe_donors add column if not exists multiplier smallint not null default 1;
