export default function Logo({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Coin circle */}
      <circle cx="40" cy="40" r="38" fill="url(#coinGradient)" />
      <circle cx="40" cy="40" r="32" fill="url(#innerGradient)" opacity="0.3" />
      {/* Heart cutout */}
      <path
        d="M40 54C40 54 22 43 22 32C22 26.5 26.5 22 32 22C35.2 22 38 23.8 40 26.4C42 23.8 44.8 22 48 22C53.5 22 58 26.5 58 32C58 43 40 54 40 54Z"
        fill="white"
        opacity="0.95"
      />
      {/* Coin edge highlight */}
      <circle cx="40" cy="40" r="38" stroke="url(#edgeGradient)" strokeWidth="1.5" fill="none" />
      <defs>
        <linearGradient id="coinGradient" x1="10" y1="10" x2="70" y2="70">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="innerGradient" x1="10" y1="10" x2="70" y2="70">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#fed7aa" />
        </linearGradient>
        <linearGradient id="edgeGradient" x1="0" y1="0" x2="80" y2="80">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#c2410c" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  );
}
