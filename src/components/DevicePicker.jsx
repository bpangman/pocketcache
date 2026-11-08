// eslint-disable-next-line react-refresh/only-export-components
export const DEVICES = [
  { id: 'se',       label: 'iPhone SE',          width: 375, height: 667 },
  { id: '13mini',   label: 'iPhone 13 mini',      width: 375, height: 812 },
  { id: '15',       label: 'iPhone 15',           width: 393, height: 852 },
  { id: '17pro',    label: 'iPhone 17 Pro',        width: 402, height: 874 },
  { id: '17promax', label: 'iPhone 17 Pro Max',    width: 440, height: 956 },
  { id: 'pixel9',   label: 'Pixel 9',             width: 412, height: 915 },
  { id: 's24',      label: 'Galaxy S24',           width: 360, height: 780 },
];

const STORAGE_KEY = 'pc_demo_device';
const DEFAULT_ID = '15';

// eslint-disable-next-line react-refresh/only-export-components
export function loadDevice() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return DEVICES.some(d => d.id === v) ? v : DEFAULT_ID;
  } catch { return DEFAULT_ID; }
}

// eslint-disable-next-line react-refresh/only-export-components
export function saveDevice(id) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* noop */ }
}

// Chips sit on the navy demo backdrop. Each chip is a 36px pill inside a 44px
// tap target (the -4px vertical margin keeps the row at the pill's height, so
// the bigger target does not push the phone frame down); the gold ring (.pc-on-dark) is the keyboard focus, and the
// pressed scale comes from .pc-btn (src/index.css).
export default function DevicePicker({ selected, onChange }) {
  const device = DEVICES.find(d => d.id === selected) ?? DEVICES[2];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <p style={{
        color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 500,
        margin: 0, fontFamily: 'Poppins, sans-serif',
      }}>
        See how the app fits any phone - pick one.
      </p>
      <div role="group" aria-label="Preview device" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {DEVICES.map(d => {
          const isActive = d.id === selected;
          return (
            <button
              key={d.id}
              type="button"
              className="pc-btn pc-on-dark"
              title={`${d.label} · ${d.width}×${d.height}`}
              aria-pressed={isActive}
              onClick={() => onChange(d.id)}
              style={{
                minHeight: 44, padding: '4px 0', margin: '-4px 0', border: 'none', background: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--r-pill)',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 36, padding: '0 12px',
                borderRadius: 'var(--r-pill)', fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 12,
                background: isActive ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                color: isActive ? 'var(--navy)' : 'rgba(255,255,255,0.88)',
                transition: 'background 0.18s, color 0.18s',
              }}>
                {d.label}
              </span>
            </button>
          );
        })}
      </div>
      <p style={{
        color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 400,
        margin: 0, fontFamily: 'Poppins, sans-serif',
      }}>
        {device.label} · {device.width}×{device.height}
      </p>
    </div>
  );
}
