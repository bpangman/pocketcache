# PocketCache Backend

Backend for PocketCache — round-up micro-donations for nonprofits.

## Business Model (important — this shapes everything)

PocketCache is a **pure tech vendor**. We are white-label SaaS software; we are **not** a charity, fundraiser, or payment processor.

- The **nonprofit is the merchant of record** on its **own Stripe Connect Standard account**.
- PocketCache **never holds, receives, or controls donation funds**.
- PocketCache **never takes a percentage** of donations.
- PocketCache **never issues tax receipts** — the nonprofit does.
- Revenue is **flat accrual-based fees** (approved 2026-07-01):
  - **A.** Per-donor-per-active-month service fee, routed via Stripe `application_fee_amount` on each monthly direct charge
  - **B.** $0.50/active-user/month owed by the nonprofit as SaaS software fee (invoiced separately — invoice automation is a TODO; see `fee_accruals` rows where `covered=0`)

## How Money Flows

```
Donor's card/bank
      │  one charge on the 1st (round-ups + accrued fees if donor covers)
      ▼
Nonprofit's own Stripe Connect account   ← nonprofit is merchant of record
      │
      └── accrued fee amount routes to PocketCache's platform Stripe balance
```

**Fee accrual scheme (approved 2026-07-01):** For each calendar month in which a donor accrued at least one round-up ("active month"), one `fee_accruals` row is written. These fees settle in the monthly charge alongside the round-ups (`application_fee_amount` = sum of swept `fee_accruals`).

Cover-fee choice (set by the donor at onboarding; default = covers):

| Setting | `cover_fee` | Fee per active month | What donor pays | Nonprofit gets | Nonprofit owes separately |
|---|---|---|---|---|---|
| Donor covers (default, pre-checked) | `1` | $1.00 | round-ups + $1.00×months | full round-ups | $0 |
| Donor opts out | `0` | $0.50 | round-ups only | round-ups − $0.50×months | $0.50×months via SaaS invoice |

All money is stored and computed as **integer cents** — never floats.

## Key Rules

- Donors bind to exactly **one nonprofit** via join code / QR.
- Nonprofit switches are **staged** and applied at the 12:01am daily job (clean day boundary); round-ups are locked to the nonprofit at accrual time.
- Per-nonprofit configurable **monthly minimum** (default $10.00 = 1000 cents). Balances below it **roll over** to next month — no charge. Exception: **3-month settle-up floor** — if the oldest unswept round-up is 3+ calendar months old, the charge fires regardless of minimum (caps Plaid float exposure).
- **California donors are blocked at signup** (server-side enforced, `CA_BLOCKED`).
- Only **posted** Plaid transactions generate round-ups — pending transactions are skipped.
- Plaid access tokens are stored **encrypted at rest** (AES-256-GCM, `src/lib/crypto.js`).

## Job Schedule

| Time | Job | What it does |
|---|---|---|
| 12:01am daily | `src/jobs/daily-roundups.js` | Apply staged nonprofit switches, sync Plaid transactions (added/modified/removed), log round-ups; zombie auto-disconnect (90-day inactivity) |
| 6:00am on the 1st | `src/jobs/monthly-charge.js` | Write `fee_accruals` for all active months; charge each eligible donor (minimum or 3-month floor); sweep roundups + fees atomically |
| 7:00am daily | `src/jobs/retry-charges.js` | Retry charges that failed 3+ days ago; second failure pauses the donor |

Jobs are idempotent — `monthly_charges.idempotency_key` (`charge_{userId}_{period}` or `charge_{userId}_final`, UNIQUE) plus Stripe idempotency keys make re-runs safe. The `charge_roundups` and `charge_fee_accruals` join tables record exactly which rows each charge swept, so async (ACH) webhook confirmations mark only the right rows.

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
- `POST /api/users/me/cancel` — final settle-up charge + account cancellation + Plaid disconnect (auth)
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
- **SaaS invoicing (fee B)**: `fee_accruals` rows with `covered=0` now track the per-donor per-month $0.50 owed by each nonprofit, but the invoice generation job is not yet automated (TODO).
- **Self-charge filter limitation**: our own monthly charge is detected by amount+date matching (documented trade-off in `daily-roundups.js`); revisit with better transaction metadata.
- **Managed database + backups** (currently local SQLite), secrets management, monitoring/alerting.
- Legal/ops items: E&O + cyber insurance, license review, liability caps — see PRELAUNCH.md.
