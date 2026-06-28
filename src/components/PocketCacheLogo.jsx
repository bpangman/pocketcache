import CoinMark from './CoinMark';

export default function PocketCacheLogo({ size = 40, className = '', onDark = false }) {
  // coin diameter matches roughly the cap height of the font
  // at size=40, font is ~40px, lowercase ~0.7x = 28px coin
  const coinSize = Math.round(size * 0.72);
  const fontSize = size;
  const darkTextColor = onDark ? '#FFFFFF' : '#0B2A4A';

  return (
    <div
      className={`inline-flex items-center select-none ${className}`}
      style={{
        fontFamily: "'Poppins', sans-serif",
        fontWeight: 800,
        fontSize: fontSize,
        lineHeight: 1,
        letterSpacing: '-0.5px',
        maxWidth: '100%',
        overflow: 'visible',
      }}
    >
      <span style={{ color: darkTextColor }}>P</span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        // nudge coin down slightly to align with lowercase o baseline
        position: 'relative',
        top: Math.round(size * 0.05),
        marginLeft: 1,
        marginRight: 1,
      }}>
        <CoinMark size={coinSize} />
      </span>
      <span style={{ color: darkTextColor }}>cket</span>
      <span style={{ color: '#5EEAD4' }}>Cache</span>
    </div>
  );
}
