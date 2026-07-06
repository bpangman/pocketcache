# PRELAUNCH Playbook — item-by-item analysis & marching orders

*Written 2026-07-02. Companion to `PRELAUNCH.md` (the Launch Gate list). Every item below
was analyzed individually: what's real, what's stale, what's done, and — where it can't be
done yet — exact instructions for the agent that picks it up later. Items are grouped by
who can move them: **DONE today · BLAKE (only he can) · AGENT-READY (buildable now) ·
BLOCKED (needs something first) · NATIVE-PHASE (not before the iOS build).***

---

## Must-be-made-real flows

### EIN verification — ⅔ done, rest BLOCKED on backend deploy
**Analysis:** The demo now attempts a real ProPublica lookup in the browser, but ProPublica
sends no CORS headers, so browser calls are blocked and the demo gracefully falls back to
labeled sample data. That is fine for the demo and *cannot* be fixed client-side. The REAL
path already exists: the rebuilt backend has a server-side ProPublica endpoint
(`backend/src/routes/nonprofits.js`).
**Agent brief (after backend deploy):** point the app's EIN step at `POST /api/nonprofits`
instead of the direct ProPublica fetch; add the IRS auto-revocation check (ProPublica
returns `revocation_date` — reject if set); keep the graceful-failure UX. Then implement
the impersonation bar per Blake's pending decision #6 (recommended: Stripe-Connect KYC
must match the EIN's legal name + admin-email domain match + manual review queue for
household-name orgs).

### Stripe Connect onboarding — BLAKE first, then AGENT-READY
**Analysis:** Blocked on two things only Blake can create: (1) a Stripe account for
PocketCache, LLC with **Connect (Standard)** enabled (~30 min at dashboard.stripe.com,
needs EIN + bank account), and (2) a deployed backend (see Database item). The backend
endpoint scaffold (`connect-stripe` + callback) is already written.
**Agent brief (after both):** create the Connect platform settings (branding, redirect
URIs), wire the app's "Connect with Stripe" button to the backend's account-link URL,
handle the return redirect, store `acct_...`, and gate "You're live" on
`charges_enabled=true`. Test with a Stripe test-mode connected account end to end.

---

## Legal / ops (launch-blocking)

### E&O + cyber insurance — BLAKE (shortlist prepared)
**Analysis:** Nothing to build; this is a purchase. At pre-revenue with our architecture
(no card data, no custody, SSO-only, encrypted Plaid tokens) expect roughly $2–4K/yr for
both policies combined.
**Blake's 30-minute version:** get quotes from **Vouch** (startup-native, fast online),
**Embroker** (tech E&O + cyber bundle), and a local broker for comparison. Ask for: Tech
E&O $1M/$1M with fintech services endorsement; Cyber with third-party liability +
regulatory defense; disclose "software vendor to nonprofits; funds flow donor→charity via
Stripe; we never hold funds." The security-review doc in `~/pocketcache-strategy/` is the
underwriting story — share it if asked about controls.

### Nathan (lawyer) review — READY TO SEND
**Analysis:** The review scope grew today in a good way: fee mechanics changed (donor
covers both fees by default; fee rides the charge as an application fee; final settle-up
at cancel with donor-choice fee coverage). Both legal pages carry `PENDING NATHAN REVIEW`
markers at the changed sections.
**Action taken:** a complete ready-to-forward engagement email is at
`~/pocketcache-strategy/nathan-engagement-draft-2026-07-02.md` (also sent to Blake in
chat). It lists all 9 review points including the three new ones (application-fee
mechanics, cancel-flow wording, ACH variable-amount authorization language).

### Liability caps — CONFIRMED PRESENT, Nathan to bless
**Analysis:** Checked today: both the donor Terms and the Nonprofit License contain
Limitation of Liability sections. Nothing to draft; adequacy review is point #6 in the
Nathan letter.

### Plaid token security — DONE in code; key management on deploy
**Analysis:** AES-256-GCM at rest, key in env, never sent to the frontend. Remaining work
moves to the deployment task: secret store + a documented key-rotation script
(`backend/README.md` notes it).

### California exclusion — DONE
State picker blocks CA at signup (server-side check too); Terms §15, license, landing
footer all disclose it. Nothing left.

---

## Production readiness 1–17

**#1 Edge-case/money-flow testing — plan DONE, verification BLOCKED on staging.**
`EDGE-CASES.md` has all 56 cases + the manual protocol (Stripe test mode + Plaid sandbox,
kill-tests for the charge job). Agent brief: stand up staging per the Database item, then
work the checklist top to bottom, initialing each box. Budget a full day. The four ⚖️
policy cases were decided by Blake on 2026-07-02 except refund-after-charge (#4 in the
decision queue — recommend no-clawback).

**#2 Auth — code DONE; two prod tasks remain.** Agent brief (with deploy): swap the dev
JWT for real Apple/Google identity-token verification at the marked plug-in point in
`backend/src/middleware/auth.js`, and add nonprofit-admin role scoping so a dashboard
session can only read ITS org's donors/charges. Small, well-marked job.

**#3 Database/deployment — AGENT-READY NOW (biggest unblocken).** Analysis: SQLite is
genuinely fine for a pilot (hundreds of donors, one write path); don't buy Postgres
complexity yet. Recommendation: **Railway or Fly.io**, one small instance + persistent
volume, secrets in the platform store, nightly encrypted volume snapshot, `/health`
uptime check via UptimeRobot. Agent brief: deploy `backend/`, set env
(SESSION_SECRET, PLAID_TOKEN_KEY, Stripe/Plaid test keys), point a `api.pocketcache.app`
subdomain at it, verify webhooks with `stripe listen`/dashboard test events, then hand off
to #1's verification pass. ~Half a day. **This one task unblocks five others.**

**#4 API rate limits — write with deploy, not before.** One `express-rate-limit`
middleware: tight on `by-code` lookup + EIN signup + auth; loose elsewhere. Noted in the
deploy brief; not a separate task.

**#5 No-double-charge — code DONE (idempotency + retry + webhooks); staging kill-test is
part of #1.**

**#6 Analytics — AGENT-READY after one 5-minute Blake step.** Analysis: we need funnel
numbers for the BGCA pitch (visit → code entered → signup → card linked → confirmed), not
surveillance. Recommendation: **GoatCounter** (free, no cookies, no consent banner
needed). Blake: create the account (goatcounter.com, 5 min) and drop the site code in
chat. Agent brief: add the script to landing + demo, fire custom events at the five
funnel steps + `np_signup_complete`, verify events appear, add a "numbers for the pitch"
note to the dashboard docs. Keep it out of the nonprofit dashboard itself (their data is
theirs).

**#7 App Store — NATIVE-PHASE, with one standing rule decided now.** The listing copy is
a solicitation surface: it must pitch the *tool to nonprofits*, never "donate!" language
(legal memo, Part 1.4). Also planned: deferred deep links so a QR scan → App Store →
auto-binds the right org on first open; alternate app icons only for anchor partners.

*Deferred deep-link plan (decided 2026-07-04, prompted by Blake's QR question).* iOS
does NOT pass any link context through an App Store install by default — a QR that
points straight at the store produces a cold first open and the donor re-enters the
code. The fix is layered, and our QR URLs already point at our own domain
(pocketcache.app/…?org=CODE), which is the prerequisite for all of it:
1. **Universal Links** (apple-app-site-association on pocketcache.app): app already
   installed → the same QR/text/email link opens the app directly with the org bound.
   Zero ambiguity; ship with the first native build.
2. **App Clip** (Apple's built-for-this path): QR scan opens a lightweight branded
   slice of the app INSTANTLY — no install — with the full invocation URL, so the org
   is bound from second one; donor can even finish signup in the Clip, then "Get the
   full app" hands the bound org + session over via shared app group. Best-in-class
   experience; Apple explicitly designed App Clips for the printed-QR use case.
3. **Deferred attribution fallback** for store-first installs (e.g. Branch free tier,
   NOT Firebase Dynamic Links — sunset Aug 2025): landing-page visit fingerprint
   matched on first app open; ~90-95% accurate. Decide at native phase whether the
   dependency is worth it vs 4.
4. **Clipboard handoff + code-under-QR**: the smart landing page (org micro-site)
   offers "copy my code" before bouncing to the store; first open checks the
   pasteboard (iOS shows its standard paste prompt) and offers "Join BGCA?". The
   printed code below every QR stays as the always-works manual path.
Note: the current web app has NO install gap at all — scan → branded experience in
one step. That's a real advantage of piloting web-first with BGCA.

**#7b Go-live launch-kit email — part of the backend deploy (added 2026-07-06, Blake).**
When a nonprofit completes signup, the backend auto-sends a welcome email to the
VERIFIED admin address: micro-site link, donor join code, giving link, the widget
snippet, the QR as an attached PNG, and admin sign-in instructions. Demo today: a
prefilled "Email me my launch kit" mailto on the You're-Live page (labeled). Needs the
same transactional-email provider as the OTP codes (Resend/Postmark). The widget itself
is REAL as of 2026-07-06: `pocketcache.app/widget.js` (repo `widget/widget.js`, copied
to site root by deploy.yml) — self-contained, no tracking, links to /CODE/give; live
preview in dashboard → Grow. No API keys for nonprofits by design — links, QR, and
widget are copy-paste; their micro-site stats come from the public stats endpoint
automatically once the backend ships. Widget supports data-color/data-width/data-label.
WIDGET TRACKING (Blake, 2026-07-06): widget clicks already carry ?src=widget on the
giving URL — once GoatCounter is wired (task #6) clicks/conversions are attributable
per source; per-org widget-click counts on the Grow tab come with the backend
(impression ping + click beacon, aggregate-only, no donor tracking). Grow tab shows
the customization controls (color/width/label → live snippet) + a Demo-labeled
performance tile that switches to real counts at launch. JOIN CODES (2026-07-06):
settable at signup (validated + uniqueness), editable in Grow for custom orgs with a
printed-QR warning; established orgs change codes via support. LAUNCH-KIT SENDER:
demo/sample emails come from info@pocketcache.app (Workspace service account). The
production transactional sender (default suggestion: hello@pocketcache.app) MUST be a
god-mode setting — add "launch-kit sender address + reply-to" to the god-mode panel
spec. AUTO-SEND STATUS: the trigger (fire kit email when signup completes / You're
Live renders) is specified here but NOT executable from the static demo — it is wired
server-side during the backend deploy. Do not represent it as live before then.

**#8 Privacy/terms/license — LIVE + updated today; Nathan is the only remaining step.**

**#9 Push notifications — NATIVE-PHASE.** Weekly feel-good summary only ("Your round-ups
sent $4.17 to BGCA this week"); templates go through Nathan once (charity-voice rule).
MANAGEMENT (Blake asked 2026-07-06): opted-in audiences, template editing, send
scheduling, and per-message opt-out counts all live in the GOD-MODE panel (add to its
spec alongside the launch-kit sender setting) — nothing notification-related is managed
from the nonprofit dashboards; orgs never blast donors directly (charity-voice +
anti-spam posture). The donor-side toggles (push / charge reminder / comms) are consent
flags the god-mode audience queries respect. Charge-review UX shipped 2026-07-06:
in-product pop-up alert every visit during the 1st–4th window (ChargeReviewAlert, both
surfaces, ?review=1 to preview) with inline one-time adjust; production pairs it with
the locked-amount email/push on the 1st.

**#10 Performance with real data — cheap AGENT task, not blocking.** Brief: extend
`src/data/transactions.js` generator with a `?fixture=heavy` mode (600 transactions / 18
months), check Activity scroll + Dashboard chart render on a mid-tier phone profile,
virtualize the list only if it actually janks.

**#11 State management / #12 caching / #15 older devices — NATIVE-PHASE.** Confirmed
still-valid but premature; nothing carried from the old architecture.

**#13 Offline message — cheap AGENT task.** Brief: `navigator.onLine` listener + a small
"You're offline — your round-ups are safe, this screen may be stale" banner in AppShell +
NpShell. An hour of work; bundle with #10.

**#14 Responsive — VERIFIED today.** Live site screenshotted at iPhone 12 Pro viewport
(390×844 @3x): layout correct, new copy renders, tap targets fine. Desktop verified
throughout the day. Android spot-check can ride along with #10.

**#16 CI/CD — DONE (unchanged).** Deploys on push to main; internal dashboard removed
from the pipeline 2026-07-01.

**#17 Architecture evolution — no action; the "we never touch money" shape held through
today's fee-model change, which is the point.**

---

## Platform admin ("god mode") — added 2026-07-03 per Blake

**Analysis:** Blake needs unilateral control: refunds, editing/deleting any account (donor
or nonprofit), fixing botched org setups — without depending on anyone. Three phases:
1. **Now (demo):** nothing needed — all demo state is localStorage; nothing real to fix.
2. **Staging/pilot:** (a) Refunds — the platform can refund any charge it created on a
   connected account via the Stripe API; add an auth'd `POST /api/admin/refund` that
   calls `stripe.refunds.create({charge}, {stripeAccount})`, and note Blake can also see
   every platform-created charge + application fee in HIS Stripe dashboard's Connect
   view. (b) Account edits — auth'd `/api/admin/*` endpoints (search/edit/pause/delete
   donors and orgs, edit org branding/minimum) gated by a `platform_admin` role bound to
   Blake's identity ONLY, with an append-only audit log of every admin action (also the
   E&O story).
3. **Launch:** a simple internal web panel at an unlisted admin URL (Blake sign-in only)
   over those endpoints: donor/org search, charge history w/ one-click refund,
   edit-org, pause/cancel, resend receipts. Half-day agent brief once the backend is
   deployed; endpoints spec above is the contract.
**Agent brief pointer:** build phase-2 endpoints in the same pass as the staging deploy
(#3 above); the panel is a fast follow.
**Scope additions (2026-07-03):** god mode must also manage the org MICRO-SITES
(pocketcache.app/CODE landing pages): edit/reset any org's landing content and branding,
reassign or retire vanity slugs, and take a page offline. Note for the demo era: all
"edits" a user makes live only in THAT device's localStorage — nothing is shared or
server-side until the backend exists, so "resetting" a played-with org = visiting
/demo/?reset=1 on that device. Production = org data server-side, admin CRUD applies.

## Corporate match monetization (researched + decided 2026-07-03)
Never a percentage of match dollars — same classification poison as donation cuts
(platforms that take %, like Benevity, are registered foundations/DAFs; the clean comp,
Double the Donation, charges flat SaaS). PocketCache's model: the CORPORATE SPONSOR pays
a flat campaign-tooling fee (plain B2B SaaS to a company — no charitable regulation);
match dollars flow sponsor → nonprofit directly, never through PocketCache. Pricing TBD
at first real sponsor (comps suggest low hundreds/campaign/month). In-app copy reflects
this; add sponsor-fee terms to Nathan's docket when the first match campaign is real.

## The one-screen version

| Now (this week) | Owner |
|---|---|
| Stripe account with Connect enabled | **Blake** (~30 min) |
| Insurance quotes (Vouch/Embroker) | **Blake** (~30 min) |
| Send Nathan the engagement email | **Blake** (2 min — draft is ready) |
| GoatCounter account for analytics | **Blake** (5 min) |
| Deploy backend to staging (#3) | Agent — brief above, unblocks everything |
| Refund-after-charge decision (#4 queue) | **Blake** (recommend: no clawback) |

| Then (next 2 weeks) | |
|---|---|
| Wire Connect + real EIN endpoint | Agent (briefs above) |
| Real SSO verification + role scoping | Agent |
| Work all 56 edge-case boxes in staging | Agent + Blake reviews results |
| Analytics events + offline banner + heavy-data check | Agent (bundle) |

| Native app phase (after BGCA pilot proves demand) | |
|---|---|
| iOS build, App Store (tool-not-donations copy), push, deep links, device testing | Future team |

*Everything in this file assumes the Launch Gate: no real users or real money until
PRELAUNCH.md is fully satisfied — including every checkbox in EDGE-CASES.md.*
