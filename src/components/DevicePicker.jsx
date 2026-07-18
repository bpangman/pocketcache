// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';

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

export default function DevicePicker({ selected, onChange }) {
  const device = DEVICES.find(d => d.id === selected) ?? DEVICES[2];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <p style={{
        color: 'rgba(148,163,184,0.85)', fontSize: 11, fontWeight: 500,
        margin: 0, letterSpacing: 0.2, fontFamily: 'Poppins, sans-serif',
      }}>
        See how the app fits any phone  -  pick one.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {DEVICES.map(d => {
          const isActive = d.id === selected;
          return (
            <motion.button
              key={d.id}
              whileTap={{ scale: 0.93 }}
              title={`${d.label} · ${d.width}×${d.height}`}
              onClick={() => onChange(d.id)}
              style={{
                padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 11.5,
                letterSpacing: 0.1,
                background: isActive ? '#FBBF24' : 'rgba(255,255,255,0.1)',
                color: isActive ? '#0B2A4A' : 'rgba(255,255,255,0.85)',
                transition: 'background 0.18s, color 0.18s', outline: 'none',
              }}
            >
              {d.label}
            </motion.button>
          );
        })}
      </div>
      <p style={{
        color: 'rgba(148,163,184,0.55)', fontSize: 10.5, fontWeight: 400,
        margin: 0, fontFamily: 'Poppins, sans-serif',
      }}>
        {device.label} · {device.width}×{device.height}
      </p>
    </div>
  );
}
