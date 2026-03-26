/**
 * CoinAccent — a small, subtle single-coin icon for brand continuity throughout the app.
 * Used as decorative accents, section dividers, empty states, etc.
 *
 * Props:
 *   size      — diameter in px (default 20)
 *   opacity   — 0–1 (default 0.18, very subtle)
 *   className — extra CSS classes
 */
export default function CoinAccent({ size = 20, opacity = 0.18, className = '' }) {
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
        <radialGradient id={`cag-${size}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#cag-${size})`} />
      <circle cx="20" cy="20" r="19" stroke="#b45309" strokeWidth="1.2" fill="none" opacity="0.4" />
      <circle cx="20" cy="20" r="14" stroke="#b45309" strokeWidth="0.6" fill="none" opacity="0.25" />
      <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="700"
        fill="#78350f" opacity="0.7" fontFamily="Georgia, serif">$</text>
    </svg>
  );
}
