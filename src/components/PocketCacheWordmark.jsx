// The marketing site's brand-kit wordmark, as a React component (round-3
// item 3a): "P<coin>cketCache" with the coin-arrow mark standing in for the
// first "o", "Pocket" in brand navy (or white on dark), "Cache" in the logo
// teal #5EEAD4. Mirrors landing/assets/shared.css's .wordmark / .coin /
// .wordmark-cache treatment exactly, so the web portal's top bars carry the
// same brand as pocketcache.app's header.
//
// When this wordmark is shown, no "powered by PocketCache" caption is needed
// beside it - the logo IS the brand. Keep the plain caption only where a
// NONPROFIT's name is the primary brand and PocketCache needs attribution
// (in that case pair the caption with this wordmark via the `poweredBy`
// variant below).

import CoinMark from './CoinMark';

const NAVY = '#0B2A4A';
const TEAL = '#5EEAD4';

/**
 * @param {number} size  Font size in px (default 21, the marketing nav's).
 * @param {'dark'|'light'} tone  'dark' = navy "Pocket" for light bars;
 *   'light' = white "Pocket" for dark/navy surfaces. "Cache" is always teal.
 */
export default function PocketCacheWordmark({ size = 21, tone = 'dark' }) {
  return (
    <span
      aria-label="PocketCache"
      style={{
        fontWeight: 800,
        whiteSpace: 'nowrap',
        letterSpacing: '-0.5px',
        display: 'inline-flex',
        alignItems: 'center',
        lineHeight: 1,
        fontSize: size,
        color: tone === 'light' ? '#fff' : NAVY,
      }}
    >
      P
      {/* Same optical correction as landing's .coin rule: 0.8em wide, a
          hair of side margin, nudged down so it reads as the "o". */}
      <span style={{ display: 'inline-flex', position: 'relative', top: Math.round(size * 0.04), margin: '0 1px' }}>
        <CoinMark size={Math.round(size * 0.8)} />
      </span>
      cket
      <span style={{ color: TEAL }}>Cache</span>
    </span>
  );
}

/**
 * Attribution row for nonprofit-branded contexts: the org's name is the
 * primary brand, so PocketCache appears as "powered by" + the wordmark -
 * never as a second plain-text caption next to a PocketCache logo.
 */
export function PoweredByWordmark({ size = 12, tone = 'dark' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: Math.round(size * 0.9), color: tone === 'light' ? 'rgba(255,255,255,0.7)' : '#94a3b8', fontWeight: 500 }}>
        powered by
      </span>
      <PocketCacheWordmark size={size} tone={tone} />
    </span>
  );
}
