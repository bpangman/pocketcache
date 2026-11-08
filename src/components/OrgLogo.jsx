import { useState } from 'react';

// Maps the rounded prop to a pixel value so Tailwind purging can't remove it.
// Snapped to the DESIGN.md radius scale (8 / 12 / 16 / 22 / 28); `sm` stays 4
// for the tiny inline logos where 8 would read as a circle.
const RADIUS_MAP = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '22px',
  full: '9999px',
};

// Shows the real logo, falls back through multiple sources, then emoji.
export default function OrgLogo({ nonprofit, size = 14, className = '', rounded = '2xl' }) {
  const px = size * 4;
  const pad = Math.round(px * 0.12);
  const [urlIndex, setUrlIndex] = useState(0);
  const borderRadius = RADIUS_MAP[rounded] ?? '16px';

  // Build fallback chain
  const urls = [
    nonprofit.logoUrl,
    nonprofit.logoFallbackUrl,
  ].filter(Boolean);

  if (urls.length > 0 && urlIndex < urls.length) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden ${className}`}
        style={{ width: px, height: px, minWidth: px, padding: pad, borderRadius, background: 'var(--white)' }}
      >
        <img
          src={urls[urlIndex]}
          alt={nonprofit.name}
          style={{ width: px - pad * 2, height: px - pad * 2, objectFit: 'contain', display: 'block' }}
          onError={() => setUrlIndex(i => i + 1)}
        />
      </div>
    );
  }

  // Emoji fallback
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      role="img"
      aria-label={nonprofit.name}
      style={{ width: px, height: px, minWidth: px, background: nonprofit.brand?.accentLight ?? 'var(--surface)', borderRadius }}
    >
      <span aria-hidden="true" style={{ fontSize: px * 0.45 }}>{nonprofit.logo}</span>
    </div>
  );
}
