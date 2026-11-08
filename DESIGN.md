# PocketCache design direction

This is the one visual contract for every PocketCache surface: the phone app, the web portal, the nonprofit admin and the marketing site. The tokens live in `src/index.css` (`:root` variables plus a Tailwind 4 `@theme inline` block that exposes them as utilities such as `text-navy`, `bg-surface`, `border-line`, `shadow-2`, `rounded-card` and `rounded-pill`) and mirror `landing/assets/shared.css` one to one. Tenant colors stay runtime values written by `src/store/ThemeContext.jsx` as `--brand-primary`, `--brand-secondary`, `--brand-accent-light`, `--brand-text-accent` and `--brand-tint`; components read `brand.*` or those variables, never a hard-coded nonprofit color. The utility names in the theme block are deliberately our own (`rounded-card`, not `rounded-md`; `bg-teal-wash`, not `bg-teal-50`) so Tailwind's stock scales keep their values on the pages that still use them. The shared primitives that implement the rules below are `src/components/ui/Button.jsx`, `src/components/ui/Toggle.jsx` and `src/components/AppVersion.jsx`; the text below is the direction verbatim as agreed on 2026-11-07.

---

PocketCache design system for this pass: polish and consistency only, inside BRANDING.md. Do not move, reorder, resize or restructure any section, flow or screen, and do not rewrite copy beyond what a finding specifies. Tenant colors stay runtime values (brand.primary / secondary / textAccent / accentLight through ThemeContext --brand-*); the static tokens below are PocketCache chrome and neutrals.

TOKENS (src/index.css :root, values mirrored 1:1 from landing/assets/shared.css, also exposed through a Tailwind 4 @theme block):
- Navy: --navy #0B2A4A, --navy-deep #003865, --navy-900 #001A33.
- Gold: --gold #FBBF24 (primary action on dark only), --gold-deep #E5A800 (hover), --gold-700 #D97706 (gold text on white), --gold-50 #FEF3C7.
- Teal: --teal-ui #0D9488 (UI accent, focus ring, toggles), --teal-700 #0F766E (teal text), --teal-50 #E8FBF7, --teal-100 #CCFBF1, --teal-logo #5EEAD4 (logo arrow, the word Cache and accents on navy only, never on white).
- Green: --green #059669 (every positive money amount), --green-700 #047857, --green-50 #ECFDF5.
- Text: --ink #0F172A (headings, amounts), --ink-2 #475569 (body), --slate #5B6B80 (helper text; 4.5:1 on #F6F8FB; marketing --slate moves to the same value), --muted #94A3B8 (decorative and disabled only, never body text).
- Surfaces: --line #E6EBF2, --surface #F6F8FB, --cream #FFFBF5 (only where already used), white #FFFFFF.
- Status: --danger #DC2626 with --danger-50 #FEF2F2 (errors and destructive only); --warning #B45309 with --warning-50 #FFFBEB (skip, cap, failed payment and below-minimum states only).
- Debits and neutral money use --slate.
- BGCA red #E8192C is logo and secondary accent only: never UI accent text, nav state or tint. BGCA seed: textAccent #003865, accentLight #00386514.

SHADOWS (navy-tinted only; remove Tailwind black shadow-lg/xl/2xl):
- --shadow-1: 0 1px 2px rgba(11,42,74,0.05)
- --shadow-2: 0 2px 6px rgba(11,42,74,0.05), 0 14px 36px rgba(11,42,74,0.09)
- --shadow-3: 0 8px 20px rgba(11,42,74,0.10), 0 32px 72px rgba(11,42,74,0.18)
- .card-shadow = var(--shadow-2). Web cards use the webTheme CARD (1px --line + 0 1px 2px / 0 8px 24px navy at 0.05). Toasts, sheets and modals use --shadow-3.

RADII: --r-xs 8 (chips, category squares), --r-sm 12 (inputs, icon chips), --r-md 16 (cards, app buttons), --r-lg 22 (panels, sheet top corners, hero cards), --r-xl 28 (marketing hero, large modals), --r-pill 999 (pills, badges, web and marketing buttons). When touching a value, snap strays: 6 to 8, 10 to 12, 14 to 16, 20 or 24 to 22. Marketing keeps 16/22/28.

SPACING: 4px grid only (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Card padding 16 on mobile and 24 on web; section gap 24 on mobile and 32 on web. Keep existing gutters (no relayout).

TYPE: Poppins 400/500/600/700/800 only (no 900, no font-black; map to 800). Scale in px:
- 11 caps label (uppercase, 600, 0.06em tracking)
- 12 caption / stat sub-label
- 13 mobile helper and explanatory copy
- 14 mobile body / web helper
- 15 web body
- 16 inputs (prevents iOS zoom) and button labels
- 18 card titles
- 22 section titles
- 26 page titles
- 34 hero money
No half pixels: 14.5/15.5 become 15, 12.5/13.5 become 13, 16.5 becomes 16, 23 becomes 22, 33 becomes 34. Tab-bar labels stay 10px but as 0.625rem. Money uses tabular-nums in ink at weight 600-700; positive amounts green. Headings: ink, weight 700 (hero/page 800), line-height 1.2, text-wrap: balance on hero titles; white on navy.

BUTTONS (one component, src/components/ui/Button.jsx):
- Variants: primary, secondary, tertiary (text), plus tone danger. Sizes: lg 52px, md 44px; label 16px, weight 600-700.
- Primary on light: linear-gradient(135deg,#003865,#0B2A4A) with white text. Primary on navy or dark: #FBBF24 with #0B2A4A text, hover #E5A800.
- Secondary: white, 1px --line border, navy text. Tertiary: navy-deep text with a 44px hit area.
- Danger: white with --danger text and a 1px #FECACA border; filled #DC2626 only for the final destructive confirm.
- Radius per surface: phone app 16; web portal and marketing pill 999. Apply it to buttons you touch; do not sweep untouched screens.
- Disabled (one token everywhere): bg #E6EBF2, text #94A3B8, no gradient, no shadow, cursor not-allowed, aria-disabled='true'. Keep tap-to-show-hint where it exists.
- Focus-visible: 3px solid #0D9488 outline, 3px offset (gold #FBBF24 on navy). Pressed: scale 0.98 over 120ms.

INPUTS: min height 48 on mobile and 44 on web, 16px text, radius 12, 1px --line border, white bg, placeholder --muted. Focus: border #0D9488 plus a 3px rgba(13,148,136,0.18) ring. Error: --danger border and 13px --danger helper text under the field. Every input and select has a visible label or an aria-label. Custom checkboxes use a visually hidden native input inside the label.

CARDS AND CALLOUTS: white cards, radius 16 (web panels 16-22), shadow-2 in the app or CARD on web, padding 16/24. No card inside a card: inner groups become rows split by 1px --line. At most one tinted callout per screen, reserved for status that matters (failed payment, sample-data disclosure, below-minimum when relevant). Neutral explanations (rollover, fee rolls, always free) are 13px --slate helper text.

TOGGLES (one component, src/components/ui/Toggle.jsx): 51x31 with a 27px knob. On = #0D9488 (or brand.primary on tenant-themed screens), off = #E2E8F0. role=switch, aria-checked, aria-label from the row label. The whole row is tappable and the toggle stops propagation.

ICONS: lucide only for function (ScanLine for scan, Calendar for month, Hourglass and AlertTriangle in amber for status, Coffee/ShoppingCart/Car for categories in 32px radius-8 tinted squares). Emoji only in celebration copy (milestones, greetings). Icon chips: 36px, radius 12, one tint family per list (`${brand.primary}14` bg, brand.primary icon).

NAV AND DEMO: the active tab is a `${brand.primary}14` fill or a 2px underline with brand.primary text at 700, never accentLight red. Demo: one DEMO pill in the header, plus at most one sample label per section outside demo mode (amber-50 bg, amber-700 text).

MOTION:
- framer-motion wrapped in MotionConfig reducedMotion='user' at the root.
- Enter 200-250ms with ease-out [0.16,1,0.3,1]; exit 150ms ease-in; sheets slide over 250ms. No layout-shifting animation.
- No infinite pings or pulses (pulse only while actively loading or scanning).
- Toasts auto-dismiss at about 5s; their X is a 44x44 button labeled Dismiss.
- The splash honors reduced motion with a 300ms fade.

TOUCH: every tappable element has at least a 44x44 hit area (use padding or negative margin to keep the visual size); inline pills are at least 36px visually.

DO:
- Use tokens and helpers instead of literals; fmtMoney for all money.
- Use green for positive money, navy for chrome, gold only for the primary action on dark.
- Keep tenant theming through brand.*.
- Check AA contrast (4.5:1 for text, 3:1 for large text and UI) in both DEFAULT_BRAND and BGCA.

DON'T:
- Light text on light backgrounds, #5EEAD4 on white, or BGCA red for UI text, tints or nav.
- Weight 900, half-pixel sizes, or black Tailwind shadows.
- New gradients: the only gradients are the navy primary and the existing hero/header gradients, and the onboarding slides all use linear-gradient(135deg,#003865,#0B2A4A).
- Nested tinted boxes or emoji as icons.
- Moving, reordering or resizing sections; changing the gate order or CTA placement; restyling untouched screens.
