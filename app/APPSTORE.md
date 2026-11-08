# PocketCache iOS App - App Store Build Guide

## What Was Built

A Capacitor 8.4.1 iOS wrapper for PocketCache.

- Bundle ID: app.pocketcache
- App Name: PocketCache
- Remote loading mode: the wrapper points to https://pocketcache.app/demo/ via `server.url` in capacitor.config.json. Every push to main on the web repo instantly updates what all installed apps see - no new build needed.
- Offline fallback: `server.errorPath` is `index.html`, so a cold launch with no network shows the bundled `www/index.html` stub ("needs an internet connection") instead of WebKit's failed-load state. Ships with the next shell build (run `npm run sync` first).
- Plugins (all pinned to exact versions in app/package.json): @capacitor/app, @capacitor/browser, @capacitor/splash-screen, @capacitor/status-bar. @capacitor/browser is required for native in-app SSO (`nativeSSOAvailable()` in src/lib/donorAuth.js).
- Target: iPhone only (TARGETED_DEVICE_FAMILY = 1), portrait only
- CocoaPods dependency management (NOT Swift Package Manager)
- Splash: `SplashScreen.launchShowDuration` is 0 on purpose. The native launch screen (LaunchScreen.storyboard, solid navy #0B2A4A) covers the gap until the web app paints its own splash animation (src/components/SplashAnimation.jsx), so the plugin splash never shows and the site never calls `SplashScreen.hide()`. The `launchAutoHide` / `backgroundColor` keys in that block are inert while the duration is 0.

## Important - Remote URL vs App Review

Remote-URL-only wrappers get rejected by App Review for App Store distribution. TestFlight is fine with it.

The plan before real App Store submission: switch to bundled www + Capgo live updates (Capacitor's OTA update service). Capgo lets you push JS/HTML/CSS updates without a new binary submission.

See /Users/jarvis/.claude/projects/-Users-jarvis/memory/project_pocketcache_appstore_plan.md for the full plan (Capacitor wrapper + Capgo live updates, wrap near launch).

### Bundled shell before App Store review (launch gate, also in PRELAUNCH.md)

Nothing in the repo implements this yet. When it is done:

1. Add an app/ script that builds the root Vite app with a relative base (`vite build --base ./ --outDir app/www`) and then runs `cap sync`.
2. Drop `server.url` from the Release config (keep it only in a dev config, chosen by `CAPACITOR_CONFIG` or an env-switched `capacitor.config.ts`).
3. Pick the update path: Capgo (`@capgo/capacitor-updater`) or one new binary per release.
4. Before switching, audit everything that keys off the hostname or path. Bundling changes the origin to `capacitor://localhost`, which breaks these silently:
   - `src/lib/biometric.js`: WebAuthn `rp.id = window.location.hostname` would become `localhost`.
   - `src/lib/beacon.js`: events only fire when the hostname is `pocketcache.app`.
   - Absolute `https://pocketcache.app/...` links (Share, Onboarding, OrgLandingPage, WebPortalPages, WebPortalLinkModal, Grow, npSignup).
   - Supabase auth redirect URLs (the web SSO `redirectTo` is built from `window.location.origin`; the native `app.pocketcache://auth-callback` scheme is unaffected) and the Supabase allowed-redirect list.
   - The `/demo/` base path (vite.config.js `base`), which every asset URL and the 404 forwarder assume.

## App Store Connect

The app record exists (created 2026-07-18). Check ASC for the latest uploaded build and use the next number. ASC identifiers, the provisioning profile, the signing certificate, the CI keychain and the upload key are recorded in Blake's private strategy folder (`/Users/jarvis/pocketcache-strategy/APPSTORE-SIGNING.md`), not in this public repo.

## App Privacy questionnaire (answers to record in ASC)

What the app collects today, for the App Store privacy label. Apple asks for data types, purpose, whether the data is linked to the user and whether it is used for tracking; it does not ask you to name the services.

- **Usage Data > Product Interaction.** `pcBeacon` (src/lib/beacon.js) posts signup and cancel events (event name, surface, nonprofit short name and join code; no donor name or email) to ntfy.sh, FormSubmit and the Supabase `events` table. It fires inside the app because the shell loads pocketcache.app. Purpose: Analytics, App Functionality. Linked to the user: No. Used for tracking: No. (The receiving services still see each device's IP address.)
- **Contact Info > Email Address.** Donor sign-in (Supabase Auth email code, Apple or Google sign-in) and nonprofit admin work email. Purpose: App Functionality. Linked: Yes. Tracking: No.
- **Financial Info > Payment Info / Other Financial Info.** Bank and card linking through Plaid (account metadata and transactions, used to compute round-ups) and card saving through Stripe (Stripe holds the card; the app keeps only the last 4). Purpose: App Functionality. Linked: Yes. Tracking: No.
- **Purchases > Purchase History.** Card transactions read through Plaid to calculate round-ups, plus the donor's own monthly charge history. Purpose: App Functionality. Linked: Yes. Tracking: No.
- No camera or Face ID usage strings are needed today: QR codes are scanned by the iOS Camera app, and Face ID runs through WebAuthn in the web view.
- An app-level `PrivacyInfo.xcprivacy` is optional hygiene, not a submission blocker (the Capacitor pods ship their own and AppDelegate.swift uses no required-reason APIs). If one is added later: NSPrivacyTracking false, empty NSPrivacyTrackingDomains, one ProductInteraction entry (not linked, not tracking, purpose Analytics), added to the App target.

## How to Rebuild the Simulator Build

```bash
# Unlock the CI keychain first (command in the private APPSTORE-SIGNING.md).

cd /Users/jarvis/pocketcache/app
npm run sync

xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=iPhone 17,OS=latest" \
  -derivedDataPath ios/DerivedData \
  build
```

## How to Rebuild the Signed IPA

```bash
# Step 1: Unlock the CI keychain (command in the private APPSTORE-SIGNING.md)

# Step 2: Sync web assets
cd /Users/jarvis/pocketcache/app
npm run sync

# Step 3: Archive (add the --keychain code-sign flag from APPSTORE-SIGNING.md)
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath ios/DerivedData/pocketcache-archive.xcarchive \
  archive

# Step 4: Export IPA
xcodebuild -exportArchive \
  -archivePath ios/DerivedData/pocketcache-archive.xcarchive \
  -exportPath ios/DerivedData/export \
  -exportOptionsPlist ios/DerivedData/ExportOptions.plist
```

IPA lands at: ios/DerivedData/export/App.ipa

## How to Upload to TestFlight

Bump the build number above the latest one in ASC, then upload with `xcrun altool --upload-app` from /Users/jarvis/pocketcache/app. The API key setup and the exact command are in the private APPSTORE-SIGNING.md.

## Polish Notes

- The 1024x1024 icon is rendered natively at 1024 by scripts/gen-icon.cjs (master at app/assets/icon-1024-master.png; AppIcon-512@2x.png is a copy of it).
- The launch screen is a solid navy (#0B2A4A) 2732x2732 PNG in six identical copies (light/dark at 1x/2x/3x). Optional: add a centered coin with `npm run assets` before submission if Blake wants the logo on it.

## Device checks still owed (TestFlight, before App Store review)

- Face ID: the unlock uses WebAuthn inside WKWebView, and the shell has no Associated Domains entitlement, so enrollment is likely to fail with "Couldn't set up Face ID on this device." Test on a device first. If it fails: (a) add App.entitlements with `webcredentials:pocketcache.app`, enable Associated Domains on the App ID, regenerate the profile and serve `/.well-known/apple-app-site-association` from the Pages build (make sure the dot-folder reaches the upload artifact); or (b) on native, hide the row unless a native biometric plugin is available and route src/lib/biometric.js through it. Option (a) stops working after the bundled-www switch (hostname becomes localhost).
- `window.open(url, '_blank')` buttons (Onboarding "Open their webpage", npSignup `openBenevityPortal`) and the Stripe Connect return: off-host navigation in a server.url shell is handed to Safari, so the `?npstripe=return` redirect lands in Safari, not the app. Test on TestFlight; if broken, open through the Browser plugin and re-check `org-connect-status` on `browserFinished` / app resume.
- Dynamic Type: the web view ignores the iOS text-size setting. Fix with `@capacitor/text-zoom` (TextZoom.getPreferred() then TextZoom.set() on launch) or rem-based type in the Capacitor build.
