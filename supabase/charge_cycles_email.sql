-- Donor amount emails (cycle-lock): once a cycle is locked (or rolled
-- forward under the $5 minimum) for a donor, cycle-lock sends them a
-- plain-text email saying so via Gmail SMTP. `emailed_at` is the idempotency
-- guard - cycle-lock is otherwise safely re-runnable for the same month_key
-- (see the on_conflict upsert in index.ts), and without this a re-run would
-- re-send the same donor the same email every time the job runs again.
--
-- Applied to project yeptifozaytoglfwxksz via the Supabase management API on
-- 2026-08-08. Kept here so the schema is in version control.
alter table public.charge_cycles add column if not exists emailed_at timestamptz;

-- 2026-11-07: cycle-lock now sends through the Gmail API (not SMTP) and also
-- stores the message id it gets back in charge_cycles.email_message_id
-- (added by billing_hardening_2026_11.sql) so a donor's "I never got it" can
-- be checked against Gmail's own record. emailed_at stays the re-send guard.
