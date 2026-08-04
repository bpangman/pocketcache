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

### 2b. Real card saving + monthly charge run (built 2026-08-04, TEST MODE) - remaining gates
- **Now:** the card step on both surfaces saves a REAL card via Stripe SetupIntents (edge functions
  stripe-setup-intent / stripe-setup-complete, table stripe_donors), and stripe-charge-run implements
  the 11th-of-month direct charge onto a connected account - all against Stripe TEST keys.
- [ ] **Stripe Connect platform enablement.** The platform account is not enabled for Connect yet, so
  the charge run stops with `{blocked: "connect_not_enabled"}` before any money moves. Once Blake
  enables Connect (and the test connected account is linked to the platform), re-run
  `/Users/jarvis/.config/pocketcache/retry-charge-run.sh` to prove the full loop.
- [ ] **Charge-run scheduling.** Once Connect works, schedule stripe-charge-run for the 11th of each
  month (Supabase pg_cron calling the function with the x-charge-key header) over every saved donor,
  computing each donor's real round-up total. Today it is manual and single-donor by design.
- [ ] **Fee routing - awaiting legal decision #1 (Nathan).** stripe-charge-run charges the donation
  amount ONLY. No application fee, no $1 fee, nothing, until the fee treatment decision is in
  writing. The code has a marked comment where it would go.
- [ ] **Swap test keys for live keys - behind this launch gate.** The publishable key lives in
  `src/lib/stripeKey.js` (test key, committed on purpose); the secret key lives only in Supabase
  function secrets. Both switch to live-mode values only when every item in this file clears.

### 3. Custom app icon for anchor partners - needs a native build, not a web push
- **Now (demo):** Settings > App Icon shows the PocketCache icon and the BGCA anchor-partner icon
  side by side. It is a PREVIEW and is labelled as one ("Preview" pill on the row, "Not available
  yet" banner in the sheet, "Current" / "Coming soon" badges on the two tiles). Nothing is
  selectable. It previously offered a radio choice that moved a dot and did nothing else - the
  home-screen icon never changed, which Blake confirmed on his own phone.
- **Why it cannot be done from here:** iOS only swaps a home-screen icon through
  `UIApplication.setAlternateIconName`, and every alternate icon must be compiled into the app
  bundle. The app remote-loads its web bundle from `/demo/`, so no JavaScript we push can deliver
  this. It ships with an App Store / TestFlight build or not at all.
- **Production needs all four:**
  1. Alternate icon assets (every required size) added to the iOS project's asset catalogue.
  2. `CFBundleAlternateIcons` declared in `Info.plist` under `CFBundleIcons`, one entry per
     partner icon, with `UIPrerenderedIcon` set as appropriate.
  3. A Capacitor plugin or a small native shim exposing `UIApplication.setAlternateIconName` to
     the web layer (with the "you have changed your icon" system alert handled), so the sheet's
     tiles can become real selectable options.
  4. A new TestFlight/App Store build. A web push to `/demo/` cannot deliver any of the above.
- **Also decide:** whether a per-tenant icon set is even viable at scale (every partner icon has
  to be bundled into the single shipped app), or whether this stays an anchor-partner-only perk.
  The sheet's copy currently promises the latter.
- **Action:** build it into the native project during the iOS build phase; until then the UI must
  keep saying it is a preview.

### [TESTING MODE] Native fresh-start wipe on every cold launch
- **Now (demo):** src/main.jsx clears all localStorage/sessionStorage on every native cold launch so Blake can re-test onboarding from scratch each time.
- **Production:** This block MUST be removed before the official launch. It is marked with "TESTING MODE - REMOVE BEFORE LAUNCH" in the code.
- **Action:** Delete the testing-mode block in src/main.jsx before any TestFlight or App Store submission.

### 4. Candid Seal of Transparency check - real Candid API lookup
- **Now (demo):** the nonprofit signup wizard runs a simulated ~1.2s "seal lookup" (src/lib/npSignup.js
  `determineCandidSeal`). The result is deterministic, not a real API call: BGCA and anything that fell
  back to the BGCA sample data (an EIN lookup that could not reach ProPublica) always comes back "seal
  found"; every org resolved live from ProPublica comes back "not found," which routes it to the
  Benevity path below.
- **Production:** call the real Candid API to check whether the organization holds a current Seal of
  Transparency, with the same graceful-fallback behavior the EIN lookup already has.
- **Action:** wire the live lookup once Candid API access is set up; keep the fallback path (route to
  Benevity registration) for orgs the API cannot confirm.

### 5. Benevity registration - real completion tracking, not a self-reported toggle
- **Now (demo):** the app-listing signup step and the dashboard's "iPhone app listing" card
  (nonprofit/tabs/Overview.jsx) let the admin click "I have registered," which just flips
  `appleApproval.status` to `benevity_submitted` in localStorage (store/orgStore.js
  `setOrgAppleApproval`). Nothing verifies the org actually completed Benevity's Causes Portal
  registration.
- **Why it matters:** this is an Apple requirement, not a PocketCache preference - every nonprofit
  listed INSIDE the iPhone app must be verified (a Candid Seal, or Benevity registration). A
  self-reported checkbox is fine for the demo but is not a real approval gate.
- **Production:** either poll/receive a real status callback from Benevity, or manually confirm each
  org's registration before flipping its status to `benevity_submitted` and, once Benevity actually
  approves it, to `approved`. Until every listed nonprofit clears this, do not list it in the iPhone
  app's org picker.
- **Action:** build the real verification path once the Benevity integration (or a manual review
  process) exists. Note this never touches the web: the org's PocketCache webpage and website widget
  are not gated by Apple at all, only the iPhone-app listing is.

### 6. Real Apple Pay via Stripe - replacing the simulated sheet
- **Now (demo):** src/components/ApplePaySheet.jsx is a fully simulated Apple Pay sheet (dark card,
  payee, a masked "Visa •••• 4242" line, ~1.2s fake processing, a success check). No PassKit session is
  created and no card is ever added to a real wallet. It is wired into every payment-method surface:
  donor onboarding (app and web), Settings, and the web portal.
- **Production needs:** a real Stripe + Apple Pay merchant account, domain verification for the web
  surfaces, and - because round-ups are billed monthly rather than at the moment of consent - an
  off-session / merchant-initiated payment setup (Stripe's Apple Pay + SetupIntent flow) so later
  monthly charges do not require the donor to reopen the sheet each time.
- **Action:** build once Stripe's Apple Pay merchant setup is complete; swap ApplePaySheet's simulated
  confirm for the real PassKit + Stripe flow, keeping the same success payload shape
  (`{ type: 'apple_pay', label: 'Apple Pay', last4: null }`) so nothing downstream has to change.

## Launch-blocking legal / ops (see also memory: project_pocketcache_prelaunch_checklist)
- E&O + cyber insurance in place.
- Nathan (lawyer) review of the Nonprofit Software License Agreement.
- Liability caps confirmed in the license.
- Plaid access tokens (added 2026-08-04): bank linking now runs on REAL Plaid Link, in
  SANDBOX mode only, backed by Supabase edge functions (`supabase/functions/plaid-link-token`,
  `supabase/functions/plaid-exchange`). Access tokens are exchanged and stored server-side only,
  in the `plaid_items` table (Postgres, RLS enabled, zero policies - only the service role used
  by the edge functions can read or write it; the anon/browser key has no access at all). The
  access token itself is never returned to the browser or logged. Before real launch: (a) swap
  the sandbox Plaid keys for production keys, which requires Plaid's production access approval
  (a request/review process with Plaid, not just a config change), (b) have someone independently
  review the token handling end to end (this closes out the token-security half of that review,
  not the whole item), and (c) confirm production Plaid webhooks/error handling if added later.
- California: confirmed blocked at signup until availability is confirmed.
- Confirm with Apple how the $1/month app fee is treated before launch. The fee is currently charged
  to the donor outside the app, on the nonprofit's Stripe account (see lib/billing.js) - that
  structure is the one most likely to avoid Apple's In-App Purchase (IAP) rules entirely, since no
  purchase happens inside the app itself. If that ever changes to a donor-facing in-app charge, it
  risks being treated as a digital purchase subject to Apple's IAP cut (up to 15-30%). Get this in
  writing from Apple (or counsel familiar with App Review's charity/donation guidelines) before
  launch, and before any change to where or how the $1 fee is collected.
- Before launch, point the /app/ page (QR target) at the real App Store listing. `app/index.html`
  still ships the placeholder badge and carries two `TODO: Replace ... with the real App Store
  badge + link when the listing goes live` comments (one on the `.store-placeholder` CSS rule,
  one on the `<span class="store-placeholder">Coming to the App Store</span>` block). Swap in the
  real badge image and App Store URL, drop the "coming soon" copy, then delete both TODOs.

### Nathan (lawyer) review queue - specific clauses in the live legal pages
Every item below was tracked as a `PENDING NATHAN REVIEW` HTML comment inside the published legal
pages. Those comments were removed from the shipped HTML on 2026-07-23 (invisible on the rendered
page, but plainly visible to anyone who views source on a live legal document, which advertises
that the legal copy is not final). The tracking lives here instead. Nothing on this list has been
reviewed or approved by counsel.

- [ ] `legal/terms/index.html`, Section 4a "Communications" - communications consent and data
  sharing with the Nonprofit: the pre-checked marketing + data-sharing election, and the rule that
  donors cannot opt out of transactional service messages while their account is active.
  Original note: added 2026-07-03.
- [ ] `legal/terms/index.html`, Sections 7 and 8 - fee mechanics: mandatory $1/mo donor fee; the
  processing-cover toggle is a separate election that goes to the Nonprofit as a donation and is
  tax-deductible; nonprofits are never billed. Original note: updated 2026-07-03.
- [ ] `legal/terms/index.html`, Section 12a "Refunds" - refund handling (Nonprofit decides as
  merchant of record; PocketCache may refund its own fee at its discretion).
  Original note: 2026-07-03.
- [ ] `legal/nonprofit-license/index.html`, Section 2 "Fee Schedule" - fee mechanics: mandatory
  $1/mo donor fee; the processing-cover toggle is a separate election that goes to the Nonprofit
  as a donation and is tax-deductible; nonprofits are never billed under any circumstances.
  Original note: updated 2026-07-03.
- [ ] `legal/nonprofit-license/index.html`, Section 3 - the refund-handling paragraph at the end
  of Nonprofit Responsibilities. Original note: 2026-07-03.
- [ ] `legal/nonprofit-license/index.html`, Section 7a "Changes to This Agreement and to Fees" -
  the amendment clause (60 days' written notice, fee/tier/feature changes, the Nonprofit's
  penalty-free termination right, no retroactive application). Original note: added 2026-07-03.
- [ ] **NEW, drafted 2026-07-23, not reviewed:** `legal/terms/index.html`, Section 7 - the
  billing-mechanics language. Covers monthly accrual, the amount locking on the 1st, the 1st-10th
  review window with one adjustment, the charge running on the 11th, the $5 monthly minimum,
  the monthly cap (overflow never charged, never owed), skip-a-month (that month's round-ups are
  never charged and never roll over, but the $1 fee still accrues and rolls), and that the
  Nonprofit is merchant of record and issues receipts. Drafted to match what the app already
  promises donors; it is a draft for counsel, not approved language. This is the ONLY
  `PENDING NATHAN REVIEW` marker deliberately left in the shipped HTML (as a `BEGIN`/`END`
  comment pair around the new paragraphs) because the text is brand new and unreviewed; remove
  the marker when Nathan signs off. **If Nathan clears question #11 and the charge day moves from
  the 11th to the 5th, this Terms text, the app and web copy, the backend charge job, and the
  reminder email templates all have to change together.**
- [ ] **Fee terminology, changed 2026-07-23:** the legal docs called the flat $1/month charge a
  "service fee" while every product surface (app, web portal, landing page, BGCA pitch) calls it
  the "app fee", so a donor reading the Terms met a term that appears nowhere in the product.
  Both docs now bridge the names: Terms Section 8 is retitled `Service Fee (shown in the app as
  the "app fee")` and states that the two names are one and the same $1.00/month charge, the
  plain-English summary carries the same parenthetical, and the license's Section 2 Fee Schedule
  says the donor app shows it as the "app fee". Substance unchanged. Confirm Nathan is comfortable
  with the dual naming, or pick a single term and use it everywhere.

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
- **Duplicate-account detection (added 2026-07-19, raised by Blake):** the demo has NO
  "account already exists" checks anywhere except join-code availability. Production must add:
  (a) donor signup via real SSO detects an existing account for that Apple/Google/Facebook
  identity and routes to sign-in instead of creating a duplicate; (b) nonprofit signup checks
  the EIN against registered orgs and blocks or routes duplicates ("this organization already
  has a PocketCache account - ask your admin to invite you"); (c) admin work-email signup
  detects an existing admin account for that address and offers sign-in. All three need the
  real backend account store - impossible client-side.
- **Nonprofit page transfer (added 2026-07-26):** one admin email per org (`adminEmail` on the org
  record; admin sign-in resolves the org by that address) means that when the person who signed the
  organization up leaves, the nonprofit is locked out of its own page permanently. The account
  sheet now offers "Transfer nonprofit page" to anyone holding an admin role, and it is
  SIMULATED - labelled "Demo" before and after confirming, nothing is written to the org record and
  no email is sent. Production needs: (a) verification that the new address is on the
  organization's own domain (same domain rule and same source of truth as admin signup: free-mail
  domains rejected, cross-checked against IRS/Stripe-KYC records), (b) an email to BOTH parties -
  an accept link to the incoming admin and a "your page is being transferred" notice to the
  outgoing one, with the handover only completing when the new address confirms, and (c) a
  reversal window during which the outgoing admin can cancel the transfer before their access
  ends (and a support path after it, since a departing admin's mailbox may already be closed).
  Decide the window length with Nathan alongside the license terms. Until all three exist the
  demo must keep saying it is a demo.
- **Billing schedule (DECIDED by Blake 2026-07-06, rev 2 same day): lock on the 1st,
  charge on the 11th.** Round-ups accrue through the last calendar day of the month. On the
  1st the cycle CLOSES: the exact amount is locked and emailed to the donor ("here's your
  charge"). The charge runs on the 11th — 10 FULL DAYS' notice, deliberately matching the
  classic Reg E §1005.10(d) timing for varying preauthorized debits, plus a generous
  reconciliation buffer. Donors can adjust the locked charge any day from the 1st–10th
  (in-product pop-up on every visit + the notice email). Blake PREFERS charging on the 5th:
  Nathan question #11 asks whether range-based consent (our $5 minimum + optional cap
  bounds every charge) permits the shorter window — if he clears it, move charge day to the
  5th and shrink the window copy accordingly. Demo copy app+web says the 11th; backend
  charge job, Terms §7, and reminder templates must mirror whichever Nathan blesses.
  SKIP-A-MONTH (Blake 2026-07-06, corrected same day): a donor may skip their next
  charge. The skipped month's ROUND-UPS ARE SIMPLY NEVER CHARGED (same mechanic as
  monthly-cap overflow — never collected, not owed later), but the $1/active-month fee
  still accrues and rolls: the next bill shows "App fee — $1 × 2 months". The nonprofit
  forgoes that month; PocketCache's fee is deferred, not waived. The charge-review pop-up acknowledgment ("Looks good") persists for the
  whole review month; the alert reappears each new cycle.
- **Account separation (hard requirement, per Blake 2026-07-05):** admin and donor are
  fully separate accounts. An admin session must expose ONLY the org's aggregate/donor-list
  data appropriate to the dashboard — never any individual's personal donor account, giving
  history, or payment method. A colleague signing in with the shared org admin email sees
  nothing personal about anyone. Verify this explicitly during the backend auth-scoping
  task (playbook #2) and add it to EDGE-CASES.md.
- **Why it matters:** Must be locked before a real user's data ever touches the backend.
- **Done when:** Every backend route requires a valid signed-in session token before returning any
  data.
- **Donor sign-in is now real (added 2026-08-03):** donor signup runs on Supabase Auth - email
  code is live end to end, Apple and Google buttons are wired but stay in a friendly "almost
  ready" state until Blake configures those providers in Google Cloud Console / Apple Developer.
  Supabase's built-in email sender is rate-limited to a handful of emails per hour (fine for this
  testing, not for launch volume) - configure custom SMTP in the Supabase Auth settings before
  real signup volume.

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

---
_2026-07-23 - public-page copy + legal-doc traceability pass:_
- _Em/en dashes purged from `landing/index.html` (21) and `public/pitch.html` (27). The earlier
  purge only caught literal characters; these were all HTML entities (`&mdash;`, one `&ndash;`).
  Replacements were chosen per sentence (period, comma, colon, semicolon, or parentheses), not
  swapped blindly for hyphens._
- _Fee naming bridged: the legal docs' "service fee" is now explicitly tied to the product's
  "app fee" in both Terms §8 (and the plain-English summary) and the license's §2 Fee Schedule.
  See the Nathan review queue above._
- _Terms §7 now documents the real billing schedule (lock on the 1st, 1st-10th review window,
  charge on the 11th, $5 minimum, monthly cap, skip-a-month, merchant of record). DRAFT, pending
  Nathan. See the Nathan review queue above._
- _Six `PENDING NATHAN REVIEW` HTML comments removed from the two shipped legal pages and
  converted into the checklist above, so nothing is lost and nothing leaks via view-source._

---
_2026-08-04 - real Plaid Link (sandbox) replaces the simulated bank list:_
- _Donor bank linking on both signup surfaces (app `Onboarding.jsx`, web `WebOnboarding.jsx`,
  shared through the new `src/components/PlaidBankConnect.jsx`) now opens real Plaid Link in
  SANDBOX mode instead of a fake bank-tile timer. Backed by two new Supabase edge functions
  (`plaid-link-token`, `plaid-exchange`) and a new RLS-locked `plaid_items` table. Verified
  end to end: real link token issued, real Plaid Link UI opens on both surfaces, a full
  sandbox login (`user_good` / `pass_good`) was driven through Playwright, and the resulting
  `pc_tracked_card` and the `plaid_items` row both carry real Plaid metadata._
- _Offline/function-down fallback keeps the old simulated bank list working (labeled "Practice
  mode") so signup never breaks, and a small "Test mode: use user_good / pass_good" hint shows
  next to the real Connect button._
- _See the Plaid access-tokens item in Launch-blocking legal/ops above for what's still needed
  before this can go live with real banks and real money._
