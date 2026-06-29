# PocketCache — Pre-Launch Checklist (Demo → Production)

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

---
_Last updated: this batch covered landing-page copy, the building emoji, mission char limit,
broader brand colors, and the admin-contact email field (all live-ready visual edits, held locally
for batch deploy)._
