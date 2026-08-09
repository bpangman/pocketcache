-- donor_profiles: one row per donor identity, the SERVER-SIDE home of the
-- two things that used to live only in the device's localStorage and were
-- therefore lost on every fresh browser/phone (round-3 donor fixes, items
-- 4 and 7c):
--
--   display_name   - what the donor asked to be called ("What should we
--                    call you?" at signup, or the one-time dashboard
--                    prompt). Greetings on both surfaces read this instead
--                    of the email local part, so an Apple private-relay
--                    address never greets anyone as "safjbdwkfbd".
--   org_join_code  - the donor's bound cause (the nonprofit's join code,
--                    e.g. "BGCA"). A returning donor signing in on a brand
--                    new device fetches this via roundups-me and lands
--                    straight on a populated dashboard - no code entry, no
--                    gate - instead of being routed to pick a nonprofit
--                    again.
--
-- Kept separate from stripe_donors on purpose: a donor has a profile the
-- moment they sign up, but a stripe_donors row only exists once a card
-- save started (and its stripe_customer_id is NOT NULL) - binding a cause
-- or storing a name must not depend on Stripe having been touched.
--
-- Written ONLY by the roundups-me edge function with the service role key.
-- RLS is ON with NO policies at all, same posture as stripe_donors and
-- plaid_items: the anon key can neither read nor write this table.
--
-- Applied to project yeptifozaytoglfwxksz via the Supabase management API
-- on 2026-08-09. Kept here so the schema is in version control.

create table if not exists public.donor_profiles (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid unique,
  email text,
  display_name text,
  org_join_code text,
  org_bound_at timestamptz
);

create index if not exists donor_profiles_email_idx
  on public.donor_profiles (lower(email));

alter table public.donor_profiles enable row level security;
