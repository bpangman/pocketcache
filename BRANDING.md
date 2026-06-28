# PocketCache — Branding & Re-Theming Guide

This is the single reference for how the app's look is wired, and exactly what to change if you ever want to switch to a different brand kit. Last full rollout: 2026-06-28.

---

## TL;DR

**~80% of the app re-themes from one place:** the `brand` objects in `src/data/nonprofits.js`. Change the colors there and most screens update automatically.

The remaining ~20% is **hardcoded** in a few specific files (the logo art, the onboarding/signup flow, and the demo frame). Those are listed in the "Manual spots" section — a complete re-theme must sweep them too.

---

## How theming works

```
src/data/nonprofits.js   →   src/store/ThemeContext.jsx   →   useTheme() in any page
   (brand objects)            (injects CSS variables)          (reads brand.primary, etc.)
```

- Each nonprofit has a `brand` object. `DEFAULT_BRAND` is the PocketCache white-label used before a nonprofit is chosen.
- `ThemeContext` reads the active brand and injects `--brand-primary`, `--brand-secondary`, `--brand-accent-light`, `--brand-text-accent` onto the page root, and exposes the whole brand object via the `useTheme()` hook.
- Pages call `const brand = useTheme()` and use `brand.primary`, `brand.gradient`, etc. Change the object, the pages follow.

### The brand object fields

| Field | What it controls |
|---|---|
| `appName` | The product name shown in headers (e.g. "BGCA Round-Up") |
| `tagline` | Sub-headline under the app name |
| `primary` | Main brand color — headers, charts, primary fills/icons |
| `secondary` | Accent color — secondary buttons, some icons |
| `gradient` | Card/banner gradient (uses primary shades) |
| `headerGradient` | Top-of-page header gradient |
| `accentLight` | Pale tint background for soft cards/pills |
| `textAccent` | Accent **text** color — must be dark enough to read on white |
| `logoEmoji` | Fallback emoji if no logo image (`null` = use the SVG logo) |
| `brandLogoUrl` / `logoUrl` | The nonprofit's OWN logo image (shown on their cards) |

---

## The approved PocketCache palette (current)

| Name | Hex | Use |
|---|---|---|
| Cream | `#FFFBF5` | Page background tint |
| Navy | `#0B2A4A` | Primary dark, body text on light |
| Navy deep | `#003865` | Gradients, BGCA primary |
| Navy 900 | `#001A33` | Darkest gradient stop |
| Gold | `#FBBF24` | PocketCache primary (fills/coin) |
| Gold hover | `#E5A800` | Gold gradient end |
| Gold 700 | `#D97706` | Gold used as **text** (dark enough to read) |
| Gold 50 | `#FEF3C7` | Pale gold background |
| UI teal | `#0D9488` | UI accents, "Active" pills |
| Logo teal | `#5EEAD4` | **Logo only** — coin arrow + the word "Cache" |
| Positive green | `#059669` | Positive money amounts (semantic — see rules) |
| BGCA red | `#E8192C` | BGCA brand secondary |
| Ink | `#111827` | Default text |

Font: **Poppins** (imported in `src/index.css`).

---

## Color rules (follow these — they prevent the bugs we fixed on 2026-06-28)

1. **Never put gold or any light color as TEXT on a white/cream/light background** — it's invisible. For accent text on light, use `textAccent` (a dark shade like gold-700 `#D97706`), navy, or teal.
2. **Positive money is GREEN `#059669`** — round-ups, "ready to send", "↑ 12%". This is a *semantic* color, NOT a brand color. Keep it green across all brands; do not recolor positive amounts to the brand accent (red on a positive amount reads as a loss — that was the exact bug we fixed).
3. **Debits/purchase amounts stay gray.** Accents/highlights use the brand color.
4. **On a dark (navy) background, text is white** (`#FFFFFF` / `text-white`).
5. **`accentLight` must be pale** (a low-alpha tint of the secondary, e.g. `#E8192C22`, or a pale tint like `#FEF3C7`) — it's a background, so dark text sits on it.
6. **The nonprofit's own logo** comes from their `logoUrl` image — never substitute PocketCache's logo on a nonprofit's card.

---

## Switching to a different brand kit — step by step

### Step 1 — Update the brand objects (covers most of the app)
Edit `src/data/nonprofits.js`:
- `DEFAULT_BRAND` = the PocketCache white-label palette.
- Each nonprofit's `brand` object = that nonprofit's palette, plus their `logoUrl` (drop the new logo image into `src/assets/` and import it).
Set `primary`, `secondary`, `gradient`, `headerGradient`, `accentLight`, `textAccent`. Keep `textAccent` dark enough to read on white (rule 1).

### Step 2 — Update the PocketCache logo art (only if PocketCache's OWN logo changes)
The logo is hand-built SVG in three files:
- `src/components/CoinMark.jsx` — coin gold `#E5A800`/`#FBBF24`, up-arrow `#5EEAD4`.
- `src/components/PocketCacheLogo.jsx` — the word "Cache" `#5EEAD4`, dark text `#0B2A4A`.
- `src/components/Logo.jsx` — gradient stops (`#E5A800`, `#FBBF24`, `#D97706`).
(Skip this step when only swapping which nonprofit is featured — that's just Step 1 + a logo image.)

### Step 3 — Update the demo frame / global backgrounds
- `src/App.jsx` — the navy backdrop behind the phone (`linear-gradient(... #0B2A4A ... #003865 ...)`).
- `src/index.css` — body `background` (navy) and the `.gradient-text` fallback colors.

### Step 4 — Sweep the onboarding/signup flow (the big manual surface)
`src/pages/Onboarding.jsx` runs BEFORE a nonprofit is chosen, so it uses **hardcoded** brand hexes rather than the brand object (~40 spots). Find/replace each old hex with its new-brand equivalent:

| Find (old brand) | Meaning |
|---|---|
| `#003865` / `#001a33` / `#0B2A4A` | navy shades |
| `#0d9488` / `#0D9488` | UI teal |
| `#FBBF24` / `#E5A800` / `#D97706` / `#FEF3C7` | gold shades |
| `#e8f0fa` | pale navy background tint |

Leave `#059669` (positive green), `#7c3aed` (a color-picker swatch option), `#111827`/grays, and `#ef4444` (error) as-is.

### Step 5 — Misc hardcoded UI accents
- `src/pages/Settings.jsx` — "Active"/"On" status pills (`#0D9488` text on `#f0fdfa`).
- `src/components/MatchBadge.jsx` — gold tones (`#fef3c7` / `#92400e`).

### Step 6 — Fonts
Change the `@import` (Google Fonts) and `body { font-family }` in `src/index.css`. (The brand kit's `tokens.css` mirrors this if you keep that in sync.)

### Step 7 — Verify before shipping
1. `npm run dev`, open `/demo/`, enter a code (e.g. `BGCA`).
2. Walk every screen — Gate, Onboarding, Dashboard, Activity, My Cause, Share, Settings — in BOTH the default brand and a nonprofit brand.
3. Check contrast: no invisible text, positive amounts green, dark text on light, white text on dark.
4. `npm run build` must pass.
5. Push to `main` → auto-deploys to pocketcache.app (≈30s).

---

## What controls each screen (change map)

| File | Controls | Re-themes from brand object? |
|---|---|---|
| `src/data/nonprofits.js` | All brand palettes | **This is the source** |
| `src/store/ThemeContext.jsx` | Injects brand CSS vars | n/a (plumbing) |
| `src/pages/Dashboard.jsx` | Home screen | Mostly yes |
| `src/pages/Activity.jsx` | Giving history | Mostly yes |
| `src/pages/MyCause.jsx` | Cause detail | Mostly yes |
| `src/pages/Share.jsx` | Share screen | Mostly yes |
| `src/pages/Settings.jsx` | Settings | Mostly yes (a few hardcoded pills) |
| `src/pages/Onboarding.jsx` | Gate + signup flow | **No — hardcoded (Step 4)** |
| `src/components/CoinMark.jsx`, `PocketCacheLogo.jsx`, `Logo.jsx` | PocketCache logo | **No — hardcoded (Step 2)** |
| `src/components/TabBar.jsx` | Bottom tab bar | Yes (uses `textAccent`) |
| `src/App.jsx`, `src/index.css` | Demo frame / global bg | **No — hardcoded (Step 3)** |

---

## Revert

The pre-rebrand version is preserved as the git tag/branch `backup/pre-rebrand-2026-06-28` (commit `f18e341`) and as a zip at `/Users/jarvis/pocketcache-backups/pocketcache-pre-rebrand-2026-06-28.zip`. To roll back: reset `main` to that tag and push.
