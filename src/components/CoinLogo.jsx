/**
 * CoinLogo — logo image + optional "Cacheable" wordmark.
 *
 * Props:
 *   size      — pixel width of the logo image (default 180)
 *   animate   — unused (kept for API compatibility)
 *   showName  — whether to render the "Cacheable" cursive wordmark below (default true)
 *   className — extra CSS classes
 */
import logo from '../assets/logo.png';

export default function CoinLogo({ size = 180, animate = true, showName = true, className = '' }) {
  return (
    <div
      className={`inline-flex flex-col items-center select-none ${className}`}
      style={{ gap: showName ? Math.round(size * 0.02) : 0 }}
    >
      <img
        src={logo}
        alt="Cacheable logo"
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
        draggable={false}
      />
      {showName && (
        <span
          style={{
            fontFamily: "'Pacifico', cursive",
            fontSize: Math.round(size * 0.22),
            color: '#fff',
            lineHeight: 1,
          }}
        >
          Cacheable
        </span>
      )}
    </div>
  );
}
