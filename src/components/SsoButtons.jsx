// src/components/SsoButtons.jsx
// Shared SSO provider buttons used on sign-up, admin sign-in, and gate sign-in screens.
// Extracted here so the SVG icons aren't duplicated across three screens.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';

const APPLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 814 1000" fill="white">
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-42.1-150.3-109.6C27.1 733.7 1 614.9 1 502.1 1 303.7 117.8 197.4 232.8 197.4c68.7 0 125.2 45.8 164.9 45.8 38.1 0 103.7-48.3 181-48.3zm-192-131.9c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
  </svg>
);

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const FACEBOOK_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const SSO_PROVIDERS = [
  { id: 'apple',    label: 'Continue with Apple',    bg: '#000',    color: '#fff',    icon: APPLE_ICON },
  { id: 'google',   label: 'Continue with Google',   bg: '#fff',    color: '#374151', border: '1.5px solid #e5e7eb', icon: GOOGLE_ICON },
  { id: 'facebook', label: 'Continue with Facebook', bg: '#1877f2', color: '#fff',    icon: FACEBOOK_ICON },
];

/**
 * Shared SSO provider button list.
 *
 * @param {function} onPress       - Called with provider id on tap
 * @param {string|null} chosen     - Currently-tapped provider (dims the others)
 * @param {boolean} disabled       - Visually dims all buttons (click still fires — callers handle guard logic)
 * @param {string[]} providers     - Which providers to render (default: all three)
 */
export default function SsoButtons({
  onPress,
  chosen = null,
  disabled = false,
  providers = ['apple', 'google', 'facebook'],
}) {
  const buttons = SSO_PROVIDERS.filter(b => providers.includes(b.id));
  return (
    <div className="space-y-3">
      {buttons.map(btn => (
        <motion.button
          key={btn.id}
          whileTap={{ scale: 0.97 }}
          onClick={() => onPress(btn.id)}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold text-sm transition-all"
          style={{
            background: chosen === btn.id ? '#e0f0ff' : btn.bg,
            color: btn.color,
            border: btn.border ?? 'none',
            opacity: disabled ? 0.4 : chosen && chosen !== btn.id ? 0.5 : 1,
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          {btn.icon}
          {btn.label}
        </motion.button>
      ))}
    </div>
  );
}
