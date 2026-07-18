# PocketCache iOS App - App Store Build Guide

## What Was Built

A Capacitor 8.4.1 iOS wrapper for PocketCache.

- Bundle ID: app.pocketcache
- App Name: PocketCache
- Remote loading mode: the wrapper points to https://pocketcache.app via `server.url` in capacitor.config.json. Every push to main on the web repo instantly updates what all installed apps see - no new build needed.
- Plugins: @capacitor/app, @capacitor/splash-screen, @capacitor/status-bar
- Target: iPhone only (TARGETED_DEVICE_FAMILY = 1), portrait only
- CocoaPods dependency management (NOT Swift Package Manager)

## Important - Remote URL vs App Review

Remote-URL-only wrappers get rejected by App Review for App Store distribution. TestFlight is fine with it.

The plan before real App Store submission: switch to bundled www + Capgo live updates (Capacitor's OTA update service). Capgo lets you push JS/HTML/CSS updates without a new binary submission.

See /Users/jarvis/.claude/projects/-Users-jarvis/memory/project_pocketcache_appstore_plan.md for the full plan (Capacitor wrapper + Capgo live updates, wrap near launch).

## ASC State (as of 2026-07-18)

- Bundle ID "app.pocketcache" registered in ASC - resource id: ZXX65YX62W
- Provisioning profile created: id WZNX25RT49, name "PocketCache App Store", UUID 2faedd2d-003d-4a6f-9f1a-5e073d04976d
- Profile installed at: ~/Library/MobileDevice/Provisioning Profiles/2faedd2d-003d-4a6f-9f1a-5e073d04976d.mobileprovision
- App record: DOES NOT EXIST YET

## Blake's Manual Step Required

Before uploading an IPA to TestFlight, create the app record at appstoreconnect.apple.com:

1. Go to appstoreconnect.apple.com
2. My Apps -> + -> New App
3. iOS, Name: PocketCache, Bundle ID: app.pocketcache, SKU: pocketcache-2026
4. Click Create
5. Copy the Apple ID (numeric) from the App Information page

## How to Rebuild the Simulator Build

```bash
# From the app/ directory:
security unlock-keychain -p "$(cat /Users/jarvis/nasty-game/server/ci-keychain-pass.txt)" nasty-ci.keychain-db

cd /Users/jarvis/wt-1485067307129503834/pocketchange/app
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
# Step 1: Unlock CI keychain
security unlock-keychain -p "$(cat /Users/jarvis/nasty-game/server/ci-keychain-pass.txt)" nasty-ci.keychain-db

# Step 2: Sync web assets
cd /Users/jarvis/wt-1485067307129503834/pocketchange/app
npm run sync

# Step 3: Archive
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath ios/DerivedData/pocketcache-archive.xcarchive \
  archive \
  OTHER_CODE_SIGN_FLAGS="--keychain nasty-ci.keychain-db"

# Step 4: Export IPA
xcodebuild -exportArchive \
  -archivePath ios/DerivedData/pocketcache-archive.xcarchive \
  -exportPath ios/DerivedData/export \
  -exportOptionsPlist ios/DerivedData/ExportOptions.plist
```

IPA lands at: ios/DerivedData/export/App.ipa

## How to Upload to TestFlight (after Blake creates the app record)

```bash
# Copy .p8 key to expected location
mkdir -p ~/.appstoreconnect/private_keys/
cp /Users/jarvis/nasty-game/server/AuthKey_4JZ244TV94.p8 \
   ~/.appstoreconnect/private_keys/AuthKey_4JZ244TV94.p8
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_4JZ244TV94.p8

# Upload
cd /Users/jarvis/wt-1485067307129503834/pocketchange/app
xcrun altool --upload-app \
  -f ios/DerivedData/export/App.ipa \
  -t ios \
  --apiKey 4JZ244TV94 \
  --apiIssuer 8e4b9c40-3dfe-4cbf-8b12-0e6d6c585cdf
```

## Signing Details

- Apple Distribution cert SHA-1: CE6D6E0EE784A14C7433C8CC7022B32580623C33
- Apple Team: YJU5U6VX8V (Individual, Blake Pangman)
- CI keychain: nasty-ci.keychain-db (pass in /Users/jarvis/nasty-game/server/ci-keychain-pass.txt)
- ASC API Key ID: 4JZ244TV94
- ASC Issuer ID: 8e4b9c40-3dfe-4cbf-8b12-0e6d6c585cdf

## Polish Notes

- The 1024x1024 icon was upscaled from the existing 512x512 icon via sips. It will look fine but should be re-rendered natively at 1024x1024 before App Store submission for best quality.
- The splash screen is a solid navy (#0B2A4A) 2732x2732 PNG. Add a centered logo before submission.
