import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { isNative } from './AppDownloadQRModal';

export default function WebPortalLinkModal({ show, onDismiss }) {
  const [copied, setCopied] = useState(false);

  // Inverse of AppDownloadQRModal - web users never see this; native users do.
  if (!isNative()) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText('https://pocketcache.app');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById('pc-web-link-text');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      }
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            key="web-link-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }}
            onClick={onDismiss}
          />
          <motion.div
            key="web-link-card"
            initial={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.92, x: '-50%', y: '-50%' }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              zIndex: 51,
              background: '#fff',
              borderRadius: 24,
              padding: '28px 24px 24px',
              width: 'min(320px, 88%)',
              boxShadow: '0 24px 64px rgba(11,42,74,0.25)',
              textAlign: 'center',
            }}
          >
            <button
              onClick={onDismiss}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: '#f1f5f9', border: 'none', borderRadius: '50%',
                width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Close"
            >
              <X size={16} color="#64748b" />
            </button>

            <div style={{ fontSize: 28, marginBottom: 12 }}>&#127760;</div>

            <h2 style={{
              margin: '0 0 8px', fontSize: 17, fontWeight: 700,
              color: '#0B2A4A', letterSpacing: '-0.2px',
            }}>
              Prefer to manage this on the web?
            </h2>

            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>
              Your account is also accessible at:
            </p>

            <p
              id="pc-web-link-text"
              style={{
                margin: '0 0 16px', fontSize: 22, fontWeight: 800,
                color: '#0d9488', letterSpacing: '-0.5px',
              }}
            >
              pocketcache.app
            </p>

            <button
              onClick={handleCopy}
              style={{
                display: 'block', width: '100%',
                background: copied ? '#d1fae5' : '#f0fdfa',
                border: `1.5px solid ${copied ? '#6ee7b7' : '#5EEAD4'}`,
                borderRadius: 20, padding: '10px 28px',
                fontSize: 13, fontWeight: 600,
                color: copied ? '#065f46' : '#0d9488',
                cursor: 'pointer', marginBottom: 10,
                transition: 'all 0.2s',
              }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>

            <button
              onClick={onDismiss}
              style={{
                display: 'block', width: '100%',
                background: '#f1f5f9', border: 'none',
                borderRadius: 20, padding: '10px 28px',
                fontSize: 13, fontWeight: 600, color: '#475569',
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
