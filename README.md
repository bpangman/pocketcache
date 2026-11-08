# PocketCache

Round-up giving software for nonprofits. Donors link a card, their everyday purchases round up to the next dollar, and once a month the total is charged on the nonprofit's own Stripe account. PocketCache is a technology vendor: it never holds donation money and never takes a percentage.

The product is pre-launch. Nothing goes live to real users or real money until every item in [PRELAUNCH.md](PRELAUNCH.md) is satisfied.

## What is in this repo

| Path | What it is |
|---|---|
| `src/` | The React app: the donor phone app, the donor web portal and the nonprofit admin. Served at `/demo/`. |
| `supabase/functions/` | The backend: Supabase edge functions (Deno, TypeScript) for Plaid linking and round-up sync, the monthly cycle lock and charge run, Stripe card saving and Connect onboarding, and nonprofit signup. |
| `supabase/*.sql` | Database tables, policies and scheduled jobs. |
| `landing/` | The static marketing site (pocketcache.app). |
| `legal/` | Terms of Service, Privacy Policy and the Nonprofit Software License. |
| `widget/widget.js` | The embeddable "round up for us" card for nonprofit websites. |
| `app/` | The iOS shell (Capacitor). See [app/APPSTORE.md](app/APPSTORE.md). |
| `scripts/` | Small generators (iOS icon, app QR code) and the local staging script. |
| `backend/` | A legacy Express prototype. Not deployed; kept for reference only. |

Design and brand rules: [DESIGN.md](DESIGN.md) and [BRANDING.md](BRANDING.md). The money-flow test plan: [EDGE-CASES.md](EDGE-CASES.md).

## Stack

React 19, Vite 8, Tailwind CSS 4, framer-motion, recharts and lucide icons on the front end; Stripe (Elements, SetupIntents, Connect Standard) and Plaid Link for payments and bank linking; Supabase (Postgres, Auth, edge functions) on the back end; Capacitor 8 for the iOS shell. Everything runs in Stripe test mode and Plaid sandbox today.

## Scripts

```bash
npm install
npm run dev        # local dev server (the app is at /demo/)
npm run build      # production build into dist/
npm run lint       # ESLint over src (dist, dist-pages, backend and the iOS folders are ignored)
npm run preview    # serve the production build locally
npm run gen:app-qr # regenerate the QR code that points at pocketcache.app/app/
```

To browse the whole site the way it is served (landing, `/demo/`, legal pages, widget):

```bash
npm run build && bash scripts/stage-local.sh
python3 -m http.server 8787 -d dist-pages
```

## Deploys

Every push to `main` builds the site and deploys it to GitHub Pages at pocketcache.app (see `.github/workflows/deploy.yml`). The iOS shell loads the live `/demo/` site, so a web deploy also updates the installed app. Supabase functions and SQL are deployed separately with the Supabase CLI; they are not part of the Pages deploy.
