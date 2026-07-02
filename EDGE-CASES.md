# PocketCache — Money-Flow Edge-Case Test Plan

**Launch Gate item #1.** PRELAUNCH.md says this gate is satisfied when (a) a written
screen-by-screen checklist of every failure scenario exists, and (b) every case has been
manually verified. This document is (a). Each case has a checkbox for (b) — nothing ships
until every box is checked against the real (staging) system.

**How to read each case:** *Scenario* → *What must happen* → *Status* (✅ handled in code ·
🔧 code exists but unverified · 🏗️ needs building · ⚖️ needs a policy decision first).

Legend for money invariants that can NEVER be violated:
- **INV-1: Never charge twice for the same round-ups.**
- **INV-2: Never charge without a recorded, matching accrual trail.**
- **INV-3: Every charge lands on the NONPROFIT's Stripe — PocketCache's balance only ever
  receives the flat $0.50 application fee.**
- **INV-4: A donor can always see an accurate answer to "was I charged, and how much?"**

---

## A. Linking the bank / card (Plaid)

- [ ] **A1. Bank not supported by Plaid.** Donor searches, finds nothing. → Clear "we can't
  connect this bank yet" message + way out (try another card). No half-created account state.
- [ ] **A2. Donor abandons Plaid Link mid-flow** (closes the modal at the credential screen).
  → App returns to the connect screen cleanly; no connection row saved; donor can retry.
- [ ] **A3. Plaid Link succeeds but our token exchange call fails** (network blip between
  Plaid and our backend). → Donor sees an honest "connection didn't finish — try again";
  no orphaned "linked" state showing a card that isn't actually monitored. 🔧
- [ ] **A4. Bank re-auth required later** (donor changes bank password; Plaid fires
  `ITEM_LOGIN_REQUIRED`). Round-up tracking silently stops. → We must (1) detect it via
  webhook, (2) flag the donor's app ("reconnect your bank"), (3) email them, (4) show the
  nonprofit dashboard a "disconnected donor" count. **A donor who thinks they're giving but
  isn't is the #1 quiet trust-killer.** 🏗️
- [ ] **A5. Donor revokes access at the bank** (Plaid item removed). → Same as A4 plus stop
  sync attempts; keep already-accrued round-ups; do NOT charge if the payment method is
  also gone.
- [ ] **A6. Donor links an account with zero card activity** (e.g. a savings account). →
  Accrues $0 forever. App should notice 30 days of zero round-ups and suggest tracking a
  different card. 🏗️
- [ ] **A7. Same card linked by two different accounts** (spouses sharing a card; or one
  person double-signed-up via Apple + Google SSO). → ⚖️ policy: allow (both round up the
  same purchases = double donations from one purchase stream) or block by Plaid item
  dedup? Must be decided; today nothing prevents it.
- [ ] **A8. Plaid outage on sync night.** → Job logs failure, cursor unchanged, next night
  catches up from the same cursor. Verify no gap and no double-count after recovery. ✅
  (cursor-based sync is built for this) — verify anyway.
- [ ] **A9. Plaid cursor invalidated / history reset** (Plaid re-baselines an item). → Sync
  returns previously-seen transactions again. Dedup by `plaid_txn_id` must absorb the
  replay with zero new round-ups. ✅ dedup exists — needs a forced test.

## B. Turning purchases into round-ups (the accrual math)

- [ ] **B1. Pending transaction posts later with a different amount and a NEW Plaid id**
  (restaurant: $20.00 pending → $24.00 with tip). Plaid pending ids ≠ posted ids, so naive
  dedup double-counts. → We only process POSTED transactions and cross-check
  `pending_transaction_id`. ✅ in rebuilt backend — must be tested with a live pending txn.
- [ ] **B2. Refund BEFORE the monthly charge** (buy $43.18 → +$0.82 accrued → return the
  item). → Round-up must be reversed; pending total drops. ✅ rebuilt backend consumes
  Plaid `removed`/`modified` — verify.
- [ ] **B3. Refund AFTER the monthly charge** (bought in June, charged July 1, refunded
  July 3). → ⚖️ policy: no clawback (donation stands — industry standard, cleanest legally
  since the nonprofit already has the money). Must be stated in donor Terms. 🏗️ copy.
- [ ] **B4. Exact-dollar purchase ($25.00).** → $0.00 round-up: no row, no effect on counts.
  ✅ — verify no $0 rows appear.
- [ ] **B5. NON-PURCHASE debits: rent transfer, credit-card bill payment from checking,
  Venmo transfer, ACH to savings.** Today the code rounds up EVERY debit — paying a $1,432.55
  rent would "donate" $0.45, and paying off your credit card counts the same purchases
  TWICE (once on the card, once on the checking payment). → Must filter by Plaid
  category/payment_channel (exclude transfers, loan payments, bank fees). 🏗️ **This one
  produces visible wrong charges fast.**
- [ ] **B6. Foreign-currency purchase.** → Round up the settled USD amount only. Verify
  Plaid returns USD for the account currency; exclude non-USD accounts at link time. 🔧
- [ ] **B7. PocketCache's own monthly charge appears on the tracked card** (donor tracks
  the same card they donate with) → the donation itself must NEVER generate a round-up
  (self-feeding loop). The old filter compared the wrong fields and never matched. ✅ fixed
  (amount+date-window match) — but the filter is heuristic; verify with a real charge, and
  add the nonprofit's statement descriptor to the match once live.
- [ ] **B8. Round-up multiplier (2×/3×) changed mid-month.** → Applies to FUTURE
  transactions only; already-accrued rows keep their multiplier. Charged amount must equal
  the sum of row-level accruals, never `base × multiplier` recomputed at charge time. 🏗️
  (today the demo multiplies the whole pending balance retroactively).
- [ ] **B9. Clock/timezone edges.** Purchase at 11:58pm on the 30th (bank timezone) syncs
  on the 1st after the charge job ran. → It simply lands in next month's accrual. Verify no
  transaction is ever lost between "period" boundaries — the roundup's `included_in`
  linkage (not date math) decides which charge sweeps it. ✅ by design — verify.

## C. The monthly charge (1st of the month) — the highest-stakes 60 seconds

- [ ] **C1. Below the minimum** ($4.63 accrued, $10 minimum). → NO charge; balance rolls
  over; app shows "building toward your $10 minimum," not "ready to send." Nonprofit is
  NOT billed the $0.50 SaaS fee for that donor that month (⚖️ confirm "active user"
  definition = charged users, else nonprofits pay fees on donors generating $0). 
- [ ] **C2. Rollover then success** ($4.63 June + $6.10 July = $10.73 charged Aug 1). →
  One charge; both months' rows marked; receipt math exact. 
- [ ] **C3. Insufficient funds on charge day.** → One retry 3 days later; second failure
  pauses the donor + honest email ("you weren't charged — update your card"); accruals
  keep rolling. ✅ retry job now exists (the old code set "retrying" and nothing ever
  retried) — verify both failure legs.
- [ ] **C4. Card expired/canceled (permanent decline).** → Don't burn the retry on a
  permanent decline code; go straight to paused + "update payment method." 🏗️ decline-code
  branching.
- [ ] **C5. Job crashes halfway through 500 donors.** → Re-running must skip everyone
  already charged (idempotency key per donor+period, enforced BOTH in our DB and as the
  Stripe idempotency key). INV-1. ✅ rebuilt — needs a kill-test in staging.
- [ ] **C6. Server dies AFTER Stripe accepts the charge but BEFORE our DB records it.** →
  On restart the idempotency key makes the "second" attempt return the SAME PaymentIntent
  (no double charge), and the webhook independently records the outcome. INV-1/INV-4. 🔧
- [ ] **C7. Stripe webhook arrives twice** (Stripe retries deliveries). → Handler is
  idempotent (status already 'succeeded' → no-op). ✅ — verify.
- [ ] **C8. Webhook signature invalid / replay attack.** → 400, logged, no state change. ✅
- [ ] **C9. ACH charge "succeeds" then RETURNS days later** (R01 insufficient funds — ACH
  is not final for ~4 business days). → Must handle `payment_intent.payment_failed` /
  charge.refunded arriving AFTER we marked success: un-mark? No — mark the charge
  'returned', do NOT un-sweep round-ups silently; surface to donor + nonprofit dashboards.
  ⚖️ + 🏗️ **Most teams miss this one.**
- [ ] **C10. Chargeback/dispute.** Nonprofit is merchant of record → the dispute is theirs,
  but WE must pause the donor (fraud signal) and show it in their dashboard. 🏗️
- [ ] **C11. Donor cancels on the 29th with $14 accrued.** → ⚖️ policy: final charge on the
  1st for what's accrued (recommended — they authorized those round-ups), or forfeit?
  Cancel screen must say which. Today the demo cancel flow charges nothing and says nothing.
- [ ] **C12. Donor switches nonprofits mid-month with $7 accrued.** → Accrued rows are
  locked to the OLD nonprofit (charged to old org's Stripe next 1st); new purchases accrue
  to the new one. Statement will show the OLD charity's name after the switch — the switch
  confirmation must disclose this. ✅ backend locks at accrual · 🏗️ disclosure copy.
- [ ] **C13. "Cover the fee" toggled mid-month.** → The setting at CHARGE TIME governs the
  whole charge (one flag per charge, recorded on the charge row). Verify no half-states.
- [ ] **C14. Donor has round-ups but their nonprofit's Stripe account is restricted/
  disconnected on charge day** (Stripe holds/offboards the org). → Charges for that org
  must fail SOFT: skip, don't retry-spam, alert the nonprofit admin, tell donors nothing
  was charged. INV-3 means we cannot "hold it for them." 🏗️
- [ ] **C15. Nonprofit deactivates their page with 40 donors accruing.** → ⚖️ policy: stop
  accrual immediately + notify donors (recommended), define what happens to sub-minimum
  balances (evaporate — they were never charged). Must be in the nonprofit license + donor
  terms.
- [ ] **C16. The $0.50 application fee when round-ups are tiny** (donor accrued exactly
  $10.00, doesn't cover fee → nonprofit nets $9.50 minus Stripe's ~$0.59 = $8.91). → Verify
  the receipt/dashboard math shows this honestly. Also verify fee is $0.50 — never a
  percentage anywhere in code, copy, or receipts. INV-3.
- [ ] **C17. Charge on Jan 1 / DST-shift nights / leap day.** → Cron fires once and only
  once; period labels correct across year boundary ('2026-12' → '2027-01').
- [ ] **C18. Zero eligible donors.** → Job completes cleanly, logs "0 charged," no crash.

## D. Sign-up, EIN, and nonprofit onboarding

- [ ] **D1. EIN malformed** (8 digits, letters). → Inline validation before any API call. ✅
- [ ] **D2. EIN valid format, not in IRS/ProPublica data.** → "We couldn't verify this EIN"
  + manual-review path (email us). No way to proceed unverified. 
- [ ] **D3. EIN belongs to a REVOKED 501(c)(3)** (IRS auto-revocation list). → Must check
  revocation status, not just existence. 🏗️
- [ ] **D4. Anyone can claim any EIN.** Nothing stops a stranger from registering BGCA's
  EIN and collecting "BGCA" donations into their own Stripe. → **Launch blocker.**
  Mitigations: Stripe Connect onboarding itself KYCs the entity (name must match the
  charity's legal entity to receive charity rates), plus admin-email domain check and/or
  a letter/officer verification for big orgs. ⚖️ decide the verification bar before any
  real org onboards. 🏗️
- [ ] **D5. ProPublica API down during onboarding.** → Graceful "try again later," never a
  fake auto-pass. (Demo falls back to sample data with a label — production must NOT.) 
- [ ] **D6. Nonprofit finishes EIN + branding but never completes Stripe Connect.** → Page
  must NOT go live; donors must not be able to accrue toward an org that can't be charged.
  Today's demo flips "live" regardless. 🏗️ gate on `stripe_account_id` + charges_enabled.
- [ ] **D7. Stripe declines to onboard the org** (Connect rejection). → Clear status page +
  support path; org never appears live.
- [ ] **D8. Join-code collision & guessing.** Two orgs both want "BGCA"; codes are
  enumerable by bots. → Uniqueness check at creation; rate-limit `GET /by-code`; codes are
  not secrets (public QR anyway) but binding to a WRONG org must be hard: show org name +
  logo confirmation before binding. ✅ confirm screen exists — verify rate limiting. 🏗️
- [ ] **D9. California donor.** Picks CA → blocked. Lies about state → ⚖️ accepted risk with
  self-attestation + ToS language (lawyer confirmed approach); revisit geolocation later.
  VPN/moved-to-CA-later: same posture. Verify the block can't be bypassed by going back.
- [ ] **D10. Donor under 18.** → Self-attestation checkbox exists; ToS states 18+. Verify
  checkbox is required on every path (SSO fast-path included). ✅ — verify.
- [ ] **D11. Deep link `?org=BADCODE`** → falls through to the normal gate with a clear
  error, not a crash or silent BGCA default. 🔧 verify (today's demo may silently ignore).
- [ ] **D12. QR scanned while already bound to another nonprofit.** → Ask, don't silently
  rebind: "Switch your giving from X to Y? Accrued round-ups stay with X." 🏗️
- [ ] **D13. New phone / cleared storage.** → SSO sign-in restores account server-side
  (nonprofit binding, card link, totals). Demo is localStorage-only; production requires
  the backend session. 🏗️ (known — backend not deployed)

## E. Money display honesty (the app must never lie)

- [ ] **E1. "Total donated" NEVER includes pending/un-charged amounts.** (Demo bug fixed:
  it double-counted $4.63.) Verify against Stripe records exactly.
- [ ] **E2. Pending shows the rollover state when below minimum** — never "ready to send"
  for an amount that won't be sent. (Fixed in overhaul — verify.)
- [ ] **E3. The $0.50 fee appears before the charge happens** (checkout + monthly-charge
  card + cancel flow), not just in Settings fine print. (Reg E-style disclosure hygiene.)
- [ ] **E4. Tax-receipt attribution appears at checkout and in billing copy** ("BGCA emails
  your receipt directly") — PocketCache never implies it issues receipts.
- [ ] **E5. After a failed charge, the app says exactly what happened** ("Your July 1 charge
  of $12.40 didn't go through — we'll retry July 4. You have not been charged."). INV-4. 🏗️
- [ ] **E6. Donor-facing numbers equal nonprofit-dashboard numbers equal Stripe.** One
  source of truth (charge rows), three views. Build a reconciliation check that runs after
  every charge run and alerts on any mismatch. 🏗️ **This check is cheap and catches
  everything else on this list in production.**

---

## Manual verification protocol (how to check the boxes)

1. Stand up the backend against **Stripe test mode + Plaid sandbox** (both support forcing
   failures: Plaid sandbox can simulate ITEM_LOGIN_REQUIRED, returns, pending→posted;
   Stripe test cards simulate declines, disputes, ACH returns).
2. For each case: perform the scenario, then check all four invariants (INV-1..4), then
   check the case's "what must happen."
3. Kill-tests for C5/C6: literally `kill -9` the job mid-run in staging, restart, re-run.
4. Record date + initials next to each checked box. The Launch Gate needs every box.

*Authored 2026-07-01 as part of the full-app stress test. Cases marked ⚖️ need Blake's
policy call before they can be built or verified — they are listed in the decision queue
in the stress-test report.*
