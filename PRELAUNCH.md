# PocketCache — Pre-Launch Checklist (Demo → Production)

---
> ### LAUNCH GATE — Core Principle (declared 2026-06-30)
>
> **PocketCache does not go live to real users or real money until every item in this file is satisfied.**
> This is a hard gate, not a wish list. No exceptions, no partial credit.
---

A living list of things that are **simulated/stubbed in the demo** and must be made real before we
go live, plus launch-blocking legal/ops items. Updated as we review the app batch by batch.

> The public demo at `pocketcache.app/demo/` is a static, front-end-only prototype. Several flows
> *look* complete but are simulated client-side. Each one below notes what's fake now and what
> production actually requires.

## Must be made real before launch

### 1. EIN / "Verify your nonprofit" — real IRS lookup
- **Now (demo):** typing any EIN waits ~1.5s and always returns "Boys & Girls Clubs of America."
  The org name, address, and logo on the confirm screen are hardcoded.
- **Production:** look the EIN up against IRS-sourced data in real time and fill in the org's legal
  name, address, and 501(c)(3) status. Free option: **ProPublica Nonprofit Explorer API**
  (`https://projects.propublica.org/nonprofits/api/v2/organizations/{EIN}.json`); IRS Tax-Exempt
  Org Search / Pub 78 are the official sources. **The logo is NOT in IRS data** — it comes from the
  org's own upload (the Customize step already supports this) or a logo service.
- **Action:** wire the live lookup with a graceful fallback so it never breaks on stage.

### 2. "Connect with Stripe" — real Stripe Connect onboarding
- **Now (demo):** the button waits ~1.5s and flips to "connected." It does nothing real.
- **Production:** send the nonprofit to Stripe's hosted **Stripe Connect Standard** onboarding, then
  handle the redirect back and store their connected account id (`acct_...`). Requires: (a) our
  registered Stripe **platform** account, (b) a deployed backend endpoint to create the account/OAuth
  link, (c) the site being more than a static page. Backend scaffold exists for charging/Plaid but
  **not** for this Connect hand-off, and the backend is not deployed.
- **Action:** build when the live backend + Stripe platform account are in place.

## Launch-blocking legal / ops (see also memory: project_pocketcache_prelaunch_checklist)
- E&O + cyber insurance in place.
- Nathan (lawyer) review of the Nonprofit Software License Agreement.
- Liability caps confirmed in the license.
- Secure the Plaid access tokens (no plaintext storage).
- California: confirmed blocked at signup until availability is confirmed.

## Production readiness (demo → real product)

The demo at `pocketcache.app/demo` is a polished front-end prototype. Below is every gap between
"demo that looks done" and "real product safe to put in front of real users handling real money."
Each item notes where PocketCache stands today and what "done" looks like.

### 1. Edge-case / money-flow testing
- **Status:** ✍️ The written test plan now EXISTS — `EDGE-CASES.md` (56 scenarios, added
  2026-07-01). Manual verification of each case against Stripe test mode / Plaid sandbox
  is still pending — the gate is NOT satisfied until every box in that file is checked.
- **Why it matters:** This is the **MOST IMPORTANT item on this list.** A money bug is not
  cosmetic — it can charge the wrong amount, charge twice, or fail silently. We need a written
  checklist of every "what if the user does X" scenario: failed charge, $0 bank balance,
  double-tap on the donate button, bad EIN entered, Plaid bank link dropped mid-flow, and so on.
- **Done when:** A written screen-by-screen test plan exists and every edge case has been
  manually verified.

### 2. Authentication / login security
- **Status:** Apple/Google/Facebook SSO is already the plan — no passwords stored by us, which is
  the right call. But the current backend has **no security on its data routes**; anyone who knew
  the URL could read or write data.
- **Biometric unlock (added 2026-07-05):** Face ID / Touch ID unlock ships in the demo via
  WebAuthn platform credentials — the OS really verifies the user's face/finger, but the check
  is client-side only. Production must issue the challenge from the backend and verify the
  assertion server-side (standard passkey flow) before the session is trusted.
- **Admin auth model (DECIDED by Blake 2026-07-05): passwordless, org-domain email.**
  Nonprofit admins sign UP by verifying a work email on the org's own domain (free-mail
  domains rejected; known orgs must match their exact domain) with a 6-digit emailed code —
  that address IS the admin username. Admins sign IN the same way: an emailed one-time code
  per login (optionally + passkey after first login). NO passwords are ever created or
  stored — preserves the zero-password-liability posture that motivated SSO-only. The demo
  step is live (code shown on screen, labeled Demo); production needs: transactional email
  provider (Resend/Postmark), server-side code generation with expiry + attempt limits +
  rate limiting, and org-domain cross-check against IRS/Stripe-KYC records. Donor sign-in
  remains Apple/Google/Facebook SSO, unchanged.
- **Account separation (hard requirement, per Blake 2026-07-05):** admin and donor are
  fully separate accounts. An admin session must expose ONLY the org's aggregate/donor-list
  data appropriate to the dashboard — never any individual's personal donor account, giving
  history, or payment method. A colleague signing in with the shared org admin email sees
  nothing personal about anyone. Verify this explicitly during the backend auth-scoping
  task (playbook #2) and add it to EDGE-CASES.md.
- **Why it matters:** Must be locked before a real user's data ever touches the backend.
- **Done when:** Every backend route requires a valid signed-in session token before returning any
  data.

### 3. Database setup
- **Status:** No production database exists yet. The backend is a skeleton, not deployed.
- **Why it matters:** We need to store only what's necessary (Plaid bank token, email, running
  donation tallies). The Plaid bank token is the **crown jewel** — if it leaks, someone can read
  a user's full transaction history. It must be encrypted before storage, never stored as plain
  text.
- **Done when:** A real database is running in production and Plaid tokens are encrypted at rest.

### 4. API rate limits (Plaid / Stripe)
- **Status:** Not a concern at demo scale.
- **Why it matters:** At volume, transaction syncs need to be batched sensibly so we don't hit
  Plaid or Stripe API limits.
- **Done when:** Batch sync logic is in place. Lower priority — this is a scale concern, not a
  day-one blocker.

### 5. Error handling / server-down resilience
- **Status:** Not implemented in the demo.
- **Why it matters:** Critical for a money app. Every charge must be safe to retry (technically:
  idempotent) so a network hiccup never double-charges a user. If something goes wrong, the user
  should see a clear "you weren't charged — we'll retry" message, not a spinner or a blank screen.
  This also ties directly to E&O insurance requirements.
- **Done when:** Charge operations are idempotent; all failure states surface a user-friendly
  message with accurate charge status.

### 6. Analytics
- **Status:** None. We have no visibility into whether users complete signup, link a card, or drop
  off.
- **Why it matters:** Helps us know what's working and gives concrete data for the BGCA pitch
  ("X% of users who sign up link a bank account within 24 hours").
- **Done when:** Basic, privacy-respecting analytics are in place tracking key funnel events:
  signup completion, card-link rate, first donation.

### 7. App Store optimization (screenshots / description / ratings)
- **Status:** No native app exists yet. This belongs entirely to the iOS build phase.
- **Why it matters:** Real, but not blocking the web/BGCA launch.
- **Done when:** Native app is built and submitted to the App Store.

### 8. Privacy policy / terms / data compliance
- **Status:** **ALREADY LIVE** — Terms of Service, Privacy Policy, and the nonprofit click-through
  Software License Agreement are all published.
- **Remaining:** Nathan Thomas (lawyer) review (~$4,500) and confirming liability caps are in the
  license language. Tracked in the legal/ops section above.
- **Done when:** Nathan's review is complete and liability caps are confirmed in the final docs.

### 9. Push notifications
- **Status:** Native-app feature only; not relevant to the web launch.
- **Design intent:** A weekly feel-good summary ("Your round-ups donated $4.17 to BGCA this week")
  — not nagging or promotional.
- **Done when:** Native app is built.

### 10. Performance with real data
- **Status:** Demo uses hardcoded fake data. A real user with months of transactions and a busy
  activity feed has not been tested.
- **Why it matters:** Real-world concern; not blocking an initial small launch, but should be
  addressed before scale.
- **Done when:** Dashboard and activity feed are tested with a realistic data set (hundreds of
  real transactions).

### 11. State management
- **Status:** Fine for the demo. A real-app concern.
- **Done when:** Addressed during the native app build.

### 12. Caching strategy
- **Status:** Lower priority. Relevant when the app has meaningful traffic.
- **Done when:** Addressed during the native app or scaling phase.

### 13. Offline support
- **Status:** Low priority for a finance app — users expect live data.
- **Done when:** A graceful "you're offline" message is shown when there's no connection. Full
  offline mode is not needed.

### 14. Responsive design
- **Status:** The web demo should work on phone and desktop, but needs a quick spot-check on a few
  real phone screen sizes.
- **Why it matters:** Quick win — many BGCA contacts will open the link on their phone.
- **Done when:** Looks correct on a standard iPhone and Android viewport, plus desktop.

### 15. Older-device testing
- **Status:** Low priority. Do a quick check once a real native app exists.
- **Done when:** Verified on a device a couple of OS versions behind current.

### 16. CI/CD pipeline
- **Status:** **ALREADY DONE.** The site auto-deploys to `pocketcache.app` on every push to main.
- **Done when:** Already handled.

### 17. Feature requests / architecture evolution
- **Status:** Good problem to have. The architecture is deliberately simple (we never touch money
  directly — Stripe Connect means funds go from user's bank to the nonprofit, never through us),
  which keeps adding features manageable.
- **Done when:** N/A — ongoing; not a launch gate.

---

## Priority order

**MUST be done before any real users or real money:**
- **#1** — Money-flow edge-case test plan (written checklist of every failure scenario)
- **#2 + #3** — Backend security (lock every route) + encrypt the Plaid bank token in the database
- **Legal/ops** — E&O + cyber insurance, Nathan's license review, liability caps confirmed
- **#5** — No double-charge guarantee (idempotent charges, clear failure messages to users)
- **#6** — Basic analytics (funnel visibility + concrete numbers for the BGCA pitch)

**Lower priority / native-app-only (not blocking the web/BGCA launch):**
- #4 (API rate limits at scale), #7 (App Store), #9 (push notifications), #10 (performance at
  scale), #11 (state management), #12 (caching), #13 (offline mode), #15 (older-device testing)

**Already handled — no action needed:**
- #8 (legal docs live), #16 (auto-deploy on push to main), SSO/no-passwords design,
  money-never-touches-us architecture

---
_Last updated: 2026-06-30 — this batch added the Launch Gate core principle (hard gate, not a
wish list) and the full production-readiness checklist (17 categories with current status, done
criteria, and priority groupings). Previous entry: landing-page copy, building emoji, mission
char limit, broader brand colors, and admin-contact email field._

---
_2026-07-01 — full-app stress test + overhaul (branch `overhaul/stress-test-2026-07-01`):_
- _Backend REBUILT to the approved tech-vendor model: direct charges on the nonprofit's own
  Stripe Connect account, flat $0.50 application fee (the old 5%/10% percentage-fee /
  Endaoment / Treasury code is gone). Money bugs fixed: webhook metadata mismatch, missing
  idempotency (double-charge risk), retry-that-never-retried, refund handling, pending→posted
  double-count, sweep race. Added: JWT auth on all routes (#2), Plaid token encryption at
  rest (#3 partial), retry job, nonprofit table + dashboard/EIN/Connect endpoints. 22/22
  tests pass. Still NOT deployed — see backend/README.md for what remains._
- _`EDGE-CASES.md` created — the written money-flow test plan required by item #1._
- _New NONPROFIT DASHBOARD in the demo app (Overview / Donors / Charges / Grow / Settings)
  and the gate screen reordered nonprofit-first per Blake's direction._
- _~35 donor-app defects fixed (double-counted totals, fabricated stats, dead buttons,
  rollover warning, fee + tax-receipt disclosures, referral copy legal fix, never-stale
  demo dates). EIN verify now does a real IRS/ProPublica lookup with demo fallback._
- _Public site: internal strategy doc removed from deployment, waitlist email leak plugged,
  dead tunnel URL removed, "bank-grade security" claim fixed, $10-minimum rollover added to
  Terms §7, CA note in footer._
