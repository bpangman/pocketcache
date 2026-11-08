#!/usr/bin/env bash
# Mirror the GitHub Pages layout from .github/workflows/deploy.yml into a local
# folder so the whole site (landing, /demo/, legal, pitch, widget) can be
# browsed exactly as pocketcache.app serves it. Usage:
#   npm run build && bash scripts/stage-local.sh [out_dir]
# Private build (parallel work): npx vite build --outDir /tmp/x/dist && DIST=/tmp/x/dist bash scripts/stage-local.sh /tmp/x/pages
# Then serve: python3 -m http.server 8787 -d <out_dir>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist-pages}"
DIST="${DIST:-$ROOT/dist}"
rm -rf "$OUT"; mkdir -p "$OUT"
cp "$ROOT/landing/index.html" "$OUT/index.html"
for p in how-it-works nonprofits donors start; do mkdir -p "$OUT/$p"; cp "$ROOT/landing/$p/index.html" "$OUT/$p/index.html"; done
mkdir -p "$OUT/assets"; cp -r "$ROOT/landing/assets/." "$OUT/assets/"
mkdir -p "$OUT/demo"; cp -r "$DIST/"* "$OUT/demo/"
mkdir -p "$OUT/legal/privacy" "$OUT/legal/terms" "$OUT/legal/nonprofit-license"
cp "$ROOT/legal/privacy/index.html" "$OUT/legal/privacy/index.html"
cp "$ROOT/legal/terms/index.html" "$OUT/legal/terms/index.html"
cp "$ROOT/legal/nonprofit-license/index.html" "$OUT/legal/nonprofit-license/index.html"
mkdir -p "$OUT/pitch"; cp "$ROOT/public/pitch.html" "$OUT/pitch/index.html"
mkdir -p "$OUT/app"; cp "$ROOT/app/index.html" "$OUT/app/index.html"
cp "$ROOT/public/logo.png" "$OUT/logo.png"; cp "$ROOT/public/coin.png" "$OUT/coin.png"
cp "$ROOT/public/favicon-32.png" "$OUT/favicon-32.png"; cp "$ROOT/public/favicon-32.png" "$OUT/favicon.ico"
cp "$ROOT/public/apple-touch-icon.png" "$OUT/apple-touch-icon.png"
cp "$ROOT/public/404.html" "$OUT/404.html"; cp "$ROOT/widget/widget.js" "$OUT/widget.js"
echo "staged -> $OUT"
