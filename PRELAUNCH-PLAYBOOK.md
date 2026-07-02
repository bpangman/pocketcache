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

**#8 Privacy/terms/license — LIVE + updated today; Nathan is the only remaining step.**

**#9 Push notifications — NATIVE-PHASE.** Weekly feel-good summary only ("Your round-ups
sent $4.17 to BGCA this week"); templates go through Nathan once (charity-voice rule).

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
