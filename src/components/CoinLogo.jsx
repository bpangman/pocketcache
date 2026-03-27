/**
 * CoinLogo — logo image + optional "Cache" wordmark.
 *
 * Props:
 *   size      — pixel width of the logo image (default 180)
 *   animate   — unused (kept for API compatibility)
 *   showName  — whether to render the "Cache" cursive wordmark below (default true)
 *   className — extra CSS classes
 */
import logo from '../assets/logo.png';
import wordmark from '../assets/cache-wordmark.png';

export default function CoinLogo({ size = 180, animate = true, showName = true, className = '' }) {
  return (
    <div
      className={`inline-flex flex-col items-center select-none ${className}`}
      style={{ gap: showName ? Math.round(size * 0.08) : 0 }}
    >
      <img
        src={logo}
        alt="Cache logo"
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
        draggable={false}
      />
      {showName && (
        <img
          src={wordmark}
          alt="Cache"
          width={Math.round(size * 0.7)}
          style={{ objectFit: 'contain' }}
          draggable={false}
        />
      )}
    </div>
  );
}
