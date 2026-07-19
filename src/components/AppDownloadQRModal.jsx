import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

const isNative = () => !!(window.Capacitor?.isNativePlatform?.());

// The demo deploys under /demo/ - resolve the QR asset against Vite's base
// so it loads in production, dev, and the native bundle alike.
const QR_SRC = `${import.meta.env.BASE_URL ?? '/'}app-qr.svg`;

export default function AppDownloadQRModal({ show, onDismiss, fixed = false }) {
  if (isNative()) return null;

  const backdropStyle = fixed
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }
    : { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 };

  const cardStyle = fixed
    ? {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 51,
        background: '#fff',
        borderRadius: 24,
        padding: '28px 24px 24px',
        width: 'min(320px, 90vw)',
        boxShadow: '0 24px 64px rgba(11,42,74,0.25)',
        textAlign: 'center',
      }
    : {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 51,
        background: '#fff',
        borderRadius: 24,
        padding: '28px 24px 24px',
        width: 'min(320px, 88%)',
        boxShadow: '0 24px 64px rgba(11,42,74,0.25)',
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
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            style={cardStyle}
          >
            <button
              onClick={onDismiss}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Close"
            >
              <X size={16} color="#64748b" />
            </button>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#129689;</div>
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
              color: '#0B2A4A',
              letterSpacing: '-0.2px',
            }}>
              Download the App
            </h2>
            <p style={{
              margin: '0 0 20px',
              fontSize: 13,
              color: '#64748b',
              lineHeight: 1.55,
            }}>
              Prefer to manage this on our app? Scan the QR to download now!
            </p>
            <button
              onClick={onDismiss}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: 20,
                padding: '10px 28px',
                fontSize: 13,
                fontWeight: 600,
                color: '#475569',
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
