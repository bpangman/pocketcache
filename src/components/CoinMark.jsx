export default function CoinMark({ size = 64, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Outer rim — dark gold */}
      <circle cx="50" cy="50" r="50" fill="#E5A800" />
      {/* Coin face — bright gold */}
      <circle cx="50" cy="50" r="44" fill="#FBBF24" />
      {/* Bulky block up-arrow — teal with white halo (matches approved Block Arrow) */}
      <polygon
        points="50,17 24,43 37,43 37,77 63,77 63,43 76,43"
        fill="#5EEAD4"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
