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
      {/* White halo behind arrow */}
      <polygon points="50,16 32,38 40,38 40,64 60,64 60,38 68,38" fill="white" />
      {/* Teal up-arrow */}
      <polygon points="50,22 36,40 43,40 43,62 57,62 57,40 64,40" fill="#0D9488" />
    </svg>
  );
}
