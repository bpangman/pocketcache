import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';
import { Z, scrim } from '../lib/overlay';
import CoinMark from './CoinMark';

// Web only - the native app never shows this popup. Completion handlers also
// use this to skip straight to the next screen instead of waiting for a
// dismiss that would never come (the modal renders null on native).
// eslint-disable-next-line react-refresh/only-export-components
export const isNative = () => !!(window.Capacitor?.isNativePlatform?.());

// The demo deploys under /demo/ - resolve the QR asset against Vite's base
// so it loads in production, dev, and the native bundle alike.
const QR_SRC = `${import.meta.env.BASE_URL ?? '/'}app-qr.svg`;

export default function AppDownloadQRModal({ show, onDismiss, fixed = false }) {
  if (isNative()) return null;

  // Shared overlay tokens: same dim + same step on both surfaces, `fixed` is
  // the only real difference between the web window and the phone frame.
  const backdropStyle = { ...scrim('dim', { fixed }), zIndex: Z.modalScrim };

  const cardStyle = fixed
    ? {
        position: 'fixed',
        top: '50%',
        left: '50%',
        zIndex: Z.modal,
        background: '#fff',
        borderRadius: 'var(--r-lg)',
        padding: '28px 24px 24px',
        width: 'min(320px, 90vw)',
        boxShadow: 'var(--shadow-3)',
        textAlign: 'center',
      }
    : {
        position: 'absolute',
        top: '50%',
        left: '50%',
        zIndex: Z.modal,
        background: '#fff',
        borderRadius: 'var(--r-lg)',
        padding: '28px 24px 24px',
        width: 'min(320px, 88%)',
        boxShadow: 'var(--shadow-3)',
        textAlign: 'center',
      };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={backdropStyle}
            onClick={onDismiss}
          />
          {/* Centering translate lives in framer-motion's x/y props, NOT style.transform:
              framer-motion owns the transform property during the scale animation and
              would overwrite a hand-written translate(-50%, -50%). */}
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            style={cardStyle}
          >
            {/* 44x44 hit area; the visible circle stays 30px */}
            <button
              type="button"
              onClick={onDismiss}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                background: 'none',
                border: 'none',
                padding: 0,
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Close"
            >
              <span aria-hidden style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="var(--slate)" />
              </span>
            </button>
            <CoinMark size={40} className="" />
            <div style={{ height: 12 }} />
            <img
              src={QR_SRC}
              alt="QR code to download PocketCache"
              width={160}
              height={160}
              style={{ display: 'block', margin: '0 auto 16px' }}
            />
            <h2 style={{
              margin: '0 0 8px',
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.2px',
            }}>
              Download the App
            </h2>
            <p style={{
              margin: '0 0 20px',
              fontSize: 13,
              color: 'var(--slate)',
              lineHeight: 1.55,
            }}>
              Prefer to manage this on our app? Scan the QR to download now!
            </p>
            <button
              type="button"
              onClick={onDismiss}
              style={{
                background: 'var(--surface)',
                border: 'none',
                borderRadius: 'var(--r-pill)',
                padding: '0 28px',
                minHeight: 44,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              Maybe later
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// One-shot flag: set at donor-signup completion (non-native only), consumed by
// AppDownloadPrompt when the donor lands on their dashboard. Mirrors
// WebPortalLinkModal's queueWebPortalPrompt/WebPortalPrompt pair (the native
// inverse of this one) - the modal has to survive the wizard unmounting the
// moment `page` flips to 'home', so it can no longer live as local state
// inside the checkout-confirm screen.
const PROMPT_KEY = 'pc_app_download_prompt';

// eslint-disable-next-line react-refresh/only-export-components
export function queueAppDownloadPrompt() {
  try { localStorage.setItem(PROMPT_KEY, '1'); } catch { /* storage unavailable - skip */ }
}

// Self-managing wrapper: shows the modal once when the dashboard mounts with the
// flag set (non-native only), clears the flag on dismiss. Render inside a
// position:relative app container - the modal uses position:absolute.
export function AppDownloadPrompt({ fixed = false }) {
  // Queued at signup, shown a beat later so the person sees their own page
  // before being asked to download the app.
  const [show, setShow] = useState(false);
  useEffect(() => {
    let queued = false;
    try { queued = !isNative() && localStorage.getItem(PROMPT_KEY) === '1'; } catch { queued = false; }
    if (!queued) return undefined;
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, []);
  function dismiss() {
    try { localStorage.removeItem(PROMPT_KEY); } catch { /* ignore */ }
    setShow(false);
  }
  return <AppDownloadQRModal show={show} onDismiss={dismiss} fixed={fixed} />;
}
