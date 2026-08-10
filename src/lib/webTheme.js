// ─── Web portal design tokens ────────────────────────────────────────────────
// The one place the browser-native surfaces (WebDashboard, WebOnboarding,
// WebPortalPages, WebReactivate) get their shared visual vocabulary: ink
// colors, a 3-level shadow scale, a small radius scale, and the two card
// treatments built from them. Purely presentational - no logic, no state.
// The marketing site's landing/assets/shared.css mirrors the same scale, so
// the funnel and the portal read as one product family.

export const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
export const NAVY = '#003865';
export const TEAL_INK = '#0f766e';

// Depth scale: exactly three levels, used everywhere on the web surfaces.
export const SHADOW = {
  sm: '0 1px 2px rgba(11,42,74,0.05)',
  md: '0 2px 6px rgba(11,42,74,0.05), 0 14px 36px rgba(11,42,74,0.09)',
  lg: '0 8px 20px rgba(11,42,74,0.10), 0 32px 72px rgba(11,42,74,0.18)',
};

export const RADIUS = { md: 16, lg: 20, xl: 28, pill: 999 };

// Standard dashboard card: quiet at rest, one soft ambient layer so the cards
// sit ON the page instead of being flat white rectangles drawn on it.
export const CARD = {
  background: '#fff',
  borderRadius: RADIUS.md,
  border: '1px solid #E6EBF2',
  boxShadow: '0 1px 2px rgba(11,42,74,0.05), 0 8px 24px rgba(11,42,74,0.05)',
};

// Elevated panel: the onboarding / reactivation focal card.
export const PANEL = {
  background: '#fff',
  borderRadius: RADIUS.lg,
  border: '1px solid #E6EBF2',
  boxShadow: SHADOW.md,
};

// A faint dot-grid texture for hero tiles (very low alpha white, meant for
// dark gradient backgrounds only).
export const HERO_TEXTURE =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'22\' height=\'22\'%3E%3Ccircle cx=\'2\' cy=\'2\' r=\'1\' fill=\'%23ffffff\' fill-opacity=\'0.10\'/%3E%3C/svg%3E")';

// Tabular figures for any money/number that sits in a column or headline.
export const NUMS = { fontVariantNumeric: 'tabular-nums' };
