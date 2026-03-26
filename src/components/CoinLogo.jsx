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
      style={{ width: size, gap: showName ? Math.round(8 * scale) : 0 }}
    >
      {/* ── SVG coins ── */}
      <svg
        width={size}
        height={Math.round(100 * scale)}
        viewBox="0 0 180 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        overflow="visible"
      >
        {/* ── Left coin ── */}
        <g id="leftCoin">
          {animate && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 55 48; -7 55 48; 5 55 48; -3 55 48; 0 55 48"
              keyTimes="0; 0.2; 0.5; 0.75; 1"
              dur="1.4s"
              repeatCount="indefinite"
            />
          )}
          {/* Drop shadow offset shape */}
          <circle cx="58" cy="51" r="38" fill="#b85c00" opacity="0.35" />
          {/* Coin body — flat warm orange */}
          <circle cx="55" cy="48" r="38" fill="#FF9F43" />
          {/* Bold dark outline */}
          <circle cx="55" cy="48" r="38" stroke="#2D3436" strokeWidth="3.5" fill="none" />
          {/* Dollar sign — bold cartoonish */}
          <text
            x="55"
            y="57"
            textAnchor="middle"
            fontSize="30"
            fontWeight="900"
            fill="#2D3436"
            fontFamily="'Arial Black', 'Arial Bold', Arial, sans-serif"
            letterSpacing="-1"
          >
            $
          </text>
        </g>

        {/* ── Right coin ── */}
        <g id="rightCoin">
          {animate && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 125 48; 7 125 48; -5 125 48; 3 125 48; 0 125 48"
              keyTimes="0; 0.2; 0.5; 0.75; 1"
              dur="1.4s"
              repeatCount="indefinite"
            />
          )}
          {/* Drop shadow offset shape */}
          <circle cx="128" cy="51" r="38" fill="#c8950a" opacity="0.35" />
          {/* Coin body — flat golden yellow */}
          <circle cx="125" cy="48" r="38" fill="#FECA57" />
          {/* Bold dark outline */}
          <circle cx="125" cy="48" r="38" stroke="#2D3436" strokeWidth="3.5" fill="none" />
          {/* Cent sign — bold cartoonish */}
          <text
            x="125"
            y="57"
            textAnchor="middle"
            fontSize="30"
            fontWeight="900"
            fill="#2D3436"
            fontFamily="'Arial Black', 'Arial Bold', Arial, sans-serif"
            letterSpacing="-1"
          >
            ¢
          </text>
        </g>

        {/* ── Spark burst at contact point ── */}
        {animate && (
          <g>
            {/* Simple star sparks — 3 lines at different angles */}
            {[315, 0, 45].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const x2 = 90 + Math.cos(rad) * 18;
              const y2 = 48 + Math.sin(rad) * 18;
              return (
                <line
                  key={i}
                  x1="90"
                  y1="48"
                  x2={x2}
                  y2={y2}
                  stroke="#fff"
                  strokeWidth="3"
                  strokeLinecap="round"
                >
                  <animate
                    attributeName="opacity"
                    values="0; 1; 0"
                    dur="1.4s"
                    begin={`${i * 0.08}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="x2"
                    values={`90; ${x2}; 90`}
                    dur="1.4s"
                    begin={`${i * 0.08}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="y2"
                    values={`48; ${y2}; 48`}
                    dur="1.4s"
                    begin={`${i * 0.08}s`}
                    repeatCount="indefinite"
                  />
                </line>
              );
            })}
            {/* Center flash dot */}
            <circle cx="90" cy="48" r="5" fill="#fff">
              <animate
                attributeName="r"
                values="2; 7; 2"
                dur="1.4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0; 0.9; 0"
                dur="1.4s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        )}
      </svg>

      {/* ── "Spare" thick bubbly cursive wordmark ── */}
      {showName && (
        <svg
          width={Math.round(150 * scale)}
          height={Math.round(54 * scale)}
          viewBox="0 0 150 54"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Shadow layer — offset duplicate for depth */}
          <text
            x="77"
            y="42"
            textAnchor="middle"
            fontSize="42"
            fontWeight="bold"
            fontFamily="'Pacifico', 'Comic Neue', 'Brush Script MT', 'Dancing Script', cursive"
            fill="#c8710a"
            letterSpacing="0.5"
          >
            Spare
          </text>
          {/* Main bubbly text — thick stroke + fill trick for puffy look */}
          <text
            x="75"
            y="40"
            textAnchor="middle"
            fontSize="42"
            fontWeight="bold"
            fontFamily="'Pacifico', 'Comic Neue', 'Brush Script MT', 'Dancing Script', cursive"
            fill="#FF9F43"
            stroke="#2D3436"
            strokeWidth="3"
            strokeLinejoin="round"
            paintOrder="stroke"
            letterSpacing="0.5"
          >
            Spare
          </text>
        </svg>
      )}
    </div>
  );
}
