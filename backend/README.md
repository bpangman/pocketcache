# PocketCache Backend

Backend for PocketCache — round-up micro-donations for nonprofits.

## Business Model (important — this shapes everything)

PocketCache is a **pure tech vendor**. We are white-label SaaS software; we are **not** a charity, fundraiser, or payment processor.

- The **nonprofit is the merchant of record** on its **own Stripe Connect Standard account**.
- PocketCache **never holds, receives, or controls donation funds**.
- PocketCache **never takes a percentage** of donations.
- PocketCache **never issues tax receipts** — the nonprofit does.
- Revenue is exactly two **flat fees**:
  - **A.** $0.50 application fee per monthly donor charge (via Stripe `application_fee_amount` on direct charges)
  - **B.** $0.50 per active linked user per month, invoiced to the nonprofit as SaaS

## How Money Flows

```
Donor's card/bank
      │  one charge on the 1st of the month (round-ups, if >= nonprofit's minimum)
      ▼
Nonprofit's own Stripe Connect account   ← nonprofit is merchant of record
      │
      └── $0.50 application fee routes to PocketCache's platform Stripe balance
```

Cover-fee choice (set by the donor):
- **Donor covers the fee** (`cover_fee = 1`): charge = round-ups + $0.50 → nonprofit receives the full round-up amount (minus Stripe processing fees).
- **Donor doesn't cover** (`cover_fee = 0`): charge = round-ups only → nonprofit receives round-ups − $0.50 (minus Stripe processing fees).

In both cases the application fee is always exactly 50 cents. All money is stored and computed as **integer cents** — never floats.

## Key Rules

- Donors bind to exactly **one nonprofit** via join code / QR.
- Nonprofit switches are **staged** and applied at the 12:01am daily job (clean day boundary); round-ups are locked to the nonprofit at accrual time.
- Per-nonprofit configurable **monthly minimum** (default $10.00 = 1000 cents). Balances below it **roll over** to next month — no charge.
- **California donors are blocked at signup** (server-side enforced, `CA_BLOCKED`).
- Only **posted** Plaid transactions generate round-ups — pending transactions are skipped.
- Plaid access tokens are stored **encrypted at rest** (AES-256-GCM, `src/lib/crypto.js`).

## Job Schedule

| Time | Job | What it does |
|---|---|---|
| 12:01am daily | `src/jobs/daily-roundups.js` | Apply staged nonprofit switches, sync Plaid transactions (added/modified/removed), log round-ups |
| 6:00am on the 1st | `src/jobs/monthly-charge.js` | Charge each eligible donor once (sum ≥ nonprofit minimum), direct charge on the nonprofit's Stripe account |
| 7:00am daily | `src/jobs/retry-charges.js` | Retry charges that failed 3+ days ago; second failure pauses the donor |

Jobs are idempotent — `monthly_charges.idempotency_key` (`charge_{userId}_{period}`, UNIQUE) plus Stripe idempotency keys make re-runs safe. The `charge_roundups` join table records exactly which round-ups each charge swept, so async (ACH) webhook confirmations mark the right rows.

## Setup

```bash
npm install
cp .env.example .env        # fill in real values
sqlite3 pocketcache.db < src/db/schema.sql
npm start
```

Run tests (no live APIs needed):

```bash
npm test
```

## Environment Variables

See `.env.example` for the full list. Highlights:

| Var | Purpose |
|---|---|
| `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` | Plaid API (sandbox/development/production) |
| `PLAID_TOKEN_KEY` | 64-hex-char (32-byte) key for AES-256-GCM encryption of Plaid access tokens |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | Stripe platform keys |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_CLIENT_ID` | Connect application client_id (`ca_...`) for Standard OAuth onboarding |
| `STRIPE_CONNECT_REDIRECT_URI` | Where Stripe redirects nonprofits after OAuth |
| `SESSION_SECRET` | JWT signing secret for donor session tokens |
| `PORT` / `DATABASE_PATH` / `FRONTEND_URL` | App config / CORS origin |

Generate random keys: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## API Overview

- `POST /api/users/register` — donor signup (public; CA blocked)
- `GET /api/nonprofits/by-code/:code` — public branding for the join/gate screen
- `POST /api/plaid/link-token`, `POST /api/plaid/exchange` — card linking (auth required)
- `POST /api/stripe/setup-intent`, `financial-session`, `save-payment-method` — payment setup (auth)
- `POST /api/users/:id/switch-nonprofit`, `cover-fee`; `GET .../nonprofit`, `.../roundups` (auth, own record only)
- `POST /api/nonprofits`, `POST /api/nonprofits/:id/connect-stripe`, `GET .../summary`, `.../donors`, `.../charges` (auth)
- `POST /api/webhooks/stripe` — Stripe events (signature-verified, raw body)
- `GET /health` — unauthenticated uptime check

Auth is a JWT Bearer token (`src/middleware/auth.js`); route handlers use `req.userId` from the verified token — never from the request body.

## What Remains Before Production (Launch Gate)

This backend is **not production-ready**. Per PRELAUNCH.md at the repo root, PocketCache does not go live to real users or real money until every item there is satisfied. Backend-specific gaps include:

- **Real identity auth**: replace symmetric HS256 dev tokens with Apple/Google sign-in verification against their public keys.
- **Nonprofit admin roles**: nonprofit dashboard routes currently only require a valid user token — they need admin-scoped authorization.
- **Failed-payment notifications**: users are paused after a second failure but not yet emailed.
- **SaaS invoicing (fee B)**: the $0.50/active-user/month invoice to nonprofits is not yet automated.
- **Self-charge filter limitation**: our own monthly charge is detected by amount+date matching (documented trade-off in `daily-roundups.js`); revisit with better transaction metadata.
- **Managed database + backups** (currently local SQLite), secrets management, monitoring/alerting.
- Legal/ops items: E&O + cyber insurance, license review, liability caps — see PRELAUNCH.md.
