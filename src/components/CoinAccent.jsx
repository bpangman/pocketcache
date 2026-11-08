import { useId } from 'react';

/**
 * CoinAccent - a small, subtle single-coin icon for brand continuity throughout the app.
 * Used as decorative accents, section dividers, empty states, etc. Purely
 * decorative (aria-hidden), so it never needs a label.
 *
 * Colors are the brand gold tokens (DESIGN.md) with hex fallbacks for any
 * surface that renders it before src/index.css is loaded.
 *
 * Props:
 *   size      - diameter in px (default 20)
 *   opacity   - 0 to 1 (default 0.18, very subtle)
 *   className - extra CSS classes
 */
export default function CoinAccent({ size = 20, opacity = 0.18, className = '' }) {
  // Two coins of the same size on one screen used to share a gradient id,
  // so the second one painted with the first one's defs. useId is unique
  // per instance.
  const gradientId = `cag-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gradientId} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="var(--gold-50, #FEF3C7)" />
          <stop offset="50%" stopColor="var(--gold, #FBBF24)" />
          <stop offset="100%" stopColor="var(--gold-700, #D97706)" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${gradientId})`} />
      <circle cx="20" cy="20" r="19" stroke="var(--gold-700, #D97706)" strokeWidth="1.2" fill="none" opacity="0.4" />
      <circle cx="20" cy="20" r="14" stroke="var(--gold-700, #D97706)" strokeWidth="0.6" fill="none" opacity="0.25" />
      <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="700"
        fill="var(--warning, #B45309)" opacity="0.7" fontFamily="Poppins, system-ui, sans-serif">$</text>
    </svg>
  );
}
