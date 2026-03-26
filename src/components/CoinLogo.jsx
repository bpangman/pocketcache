/**
 * CoinLogo — animated two-coins-rubbing-together logo for Spare.
 * Used on the splash screen (full animated) and subtly throughout the app (static/mini).
 *
 * Props:
 *   size      — pixel width of the overall SVG viewport (default 180)
 *   animate   — whether to play the rub animation (default true)
 *   showName  — whether to render the "Spare" cursive wordmark below (default true)
 *   className — extra CSS classes
 */
export default function CoinLogo({ size = 180, animate = true, showName = true, className = '' }) {
  const scale = size / 180;

  return (
    <div
      className={`inline-flex flex-col items-center select-none ${className}`}
      style={{ width: size, gap: showName ? Math.round(12 * scale) : 0 }}
    >
      {/* ── SVG coins ── */}
      <svg
        width={size}
        height={Math.round(90 * scale)}
        viewBox="0 0 180 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        overflow="visible"
      >
        <defs>
          {/* Left coin gradient */}
          <radialGradient id="lcg" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="40%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          {/* Right coin gradient */}
          <radialGradient id="rcg" cx="60%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="40%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#92400e" />
          </radialGradient>
          {/* Shine overlay */}
          <radialGradient id="shine" cx="35%" cy="30%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          {/* Edge stroke */}
          <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#78350f" stopOpacity="0.4" />
          </linearGradient>
          {/* Spark burst */}
          <radialGradient id="spark" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>

          {animate && (
            <>
              {/* Left coin: slight counter-clockwise tilt, then back */}
              <animateTransform
                xlinkHref="#leftCoin"
                attributeName="transform"
                type="rotate"
                values="0 55 45; -6 55 45; 4 55 45; -3 55 45; 0 55 45"
                keyTimes="0; 0.2; 0.5; 0.75; 1"
                dur="1.4s"
                repeatCount="indefinite"
              />
              {/* Right coin: slight clockwise tilt */}
              <animateTransform
                xlinkHref="#rightCoin"
                attributeName="transform"
                type="rotate"
                values="0 125 45; 6 125 45; -4 125 45; 3 125 45; 0 125 45"
                keyTimes="0; 0.2; 0.5; 0.75; 1"
                dur="1.4s"
                repeatCount="indefinite"
              />
            </>
          )}
        </defs>

        {/* ── Left coin ── */}
        <g id="leftCoin">
          {animate && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 55 45; -6 55 45; 4 55 45; -3 55 45; 0 55 45"
              keyTimes="0; 0.2; 0.5; 0.75; 1"
              dur="1.4s"
              repeatCount="indefinite"
            />
          )}
          {/* Coin body */}
          <circle cx="55" cy="45" r="40" fill="url(#lcg)" />
          {/* Rim */}
          <circle cx="55" cy="45" r="40" stroke="url(#edge)" strokeWidth="2" fill="none" />
          {/* Knurling lines (decorative edge ticks) */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * Math.PI * 2;
            const x1 = 55 + Math.cos(angle) * 36;
            const y1 = 45 + Math.sin(angle) * 36;
            const x2 = 55 + Math.cos(angle) * 40;
            const y2 = 45 + Math.sin(angle) * 40;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#b45309" strokeWidth="1" opacity="0.4" />
            );
          })}
          {/* Inner ring */}
          <circle cx="55" cy="45" r="32" stroke="#b45309" strokeWidth="0.8" fill="none" opacity="0.3" />
          {/* Dollar sign */}
          <text x="55" y="52" textAnchor="middle" fontSize="22" fontWeight="700"
            fill="#78350f" opacity="0.85" fontFamily="Georgia, serif">$</text>
          {/* Shine */}
          <circle cx="55" cy="45" r="40" fill="url(#shine)" />
        </g>

        {/* ── Right coin ── */}
        <g id="rightCoin">
          {animate && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 125 45; 6 125 45; -4 125 45; 3 125 45; 0 125 45"
              keyTimes="0; 0.2; 0.5; 0.75; 1"
              dur="1.4s"
              repeatCount="indefinite"
            />
          )}
          <circle cx="125" cy="45" r="40" fill="url(#rcg)" />
          <circle cx="125" cy="45" r="40" stroke="url(#edge)" strokeWidth="2" fill="none" />
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * Math.PI * 2;
            const x1 = 125 + Math.cos(angle) * 36;
            const y1 = 45 + Math.sin(angle) * 36;
            const x2 = 125 + Math.cos(angle) * 40;
            const y2 = 45 + Math.sin(angle) * 40;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#92400e" strokeWidth="1" opacity="0.4" />
            );
          })}
          <circle cx="125" cy="45" r="32" stroke="#92400e" strokeWidth="0.8" fill="none" opacity="0.3" />
          <text x="125" y="52" textAnchor="middle" fontSize="22" fontWeight="700"
            fill="#78350f" opacity="0.85" fontFamily="Georgia, serif">¢</text>
          <circle cx="125" cy="45" r="40" fill="url(#shine)" />
        </g>

        {/* ── Spark burst at contact point ── */}
        {animate && (
          <g>
            {/* Center glow */}
            <ellipse cx="90" cy="45" rx="8" ry="8" fill="url(#spark)">
              <animate attributeName="rx" values="4; 12; 4" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="ry" values="4; 10; 4" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0; 0.8; 0" dur="1.4s" repeatCount="indefinite" />
            </ellipse>
            {/* Spark rays */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const x2 = 90 + Math.cos(rad) * 14;
              const y2 = 45 + Math.sin(rad) * 14;
              return (
                <line key={i} x1="90" y1="45" x2={x2} y2={y2}
                  stroke="#fef08a" strokeWidth="1.2" strokeLinecap="round">
                  <animate attributeName="opacity"
                    values={`0; ${0.3 + (i % 3) * 0.2}; 0`}
                    dur="1.4s"
                    begin={`${i * 0.06}s`}
                    repeatCount="indefinite" />
                  <animate attributeName="x2"
                    values={`90; ${x2}; 90`}
                    dur="1.4s"
                    begin={`${i * 0.06}s`}
                    repeatCount="indefinite" />
                  <animate attributeName="y2"
                    values={`45; ${y2}; 45`}
                    dur="1.4s"
                    begin={`${i * 0.06}s`}
                    repeatCount="indefinite" />
                </line>
              );
            })}
          </g>
        )}
      </svg>

      {/* ── "Spare" cursive wordmark ── */}
      {showName && (
        <svg
          width={Math.round(130 * scale)}
          height={Math.round(48 * scale)}
          viewBox="0 0 130 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="wordGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          </defs>
          <text
            x="65"
            y="38"
            textAnchor="middle"
            fontSize="38"
            fontFamily="'Brush Script MT', 'Segoe Script', 'Dancing Script', cursive"
            fontStyle="italic"
            fill="url(#wordGrad)"
            letterSpacing="1"
          >
            Spare
          </text>
        </svg>
      )}
    </div>
  );
}
