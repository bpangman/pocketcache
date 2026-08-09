// Web-styled Apple Pay confirmation (round-3 item 1).
//
// The WEB surfaces must never show the phone's Apple Pay bottom sheet (its
// "Confirm with Side Button" affordance describes hardware a desktop browser
// does not have). On the web, Apple Pay is only real where Safari's
// ApplePaySession API exists - Safari on a Mac or iPhone - so:
//
//   - webApplePayAvailable() is the capability gate. Callers grey the Apple
//     Pay option out on other browsers with the honest line
//     APPLE_PAY_UNAVAILABLE_NOTE instead of simulating what could not work.
//   - <WebApplePayConfirm> is the confirmation used where it IS available: a
//     centered web dialog (payee, masked card, one Confirm button) - no side
//     button imagery, no bottom-sheet theatre.
//
// SIMULATED at the same theatre level as ApplePaySheet (the app keeps that
// sheet): no real ApplePaySession is ever created and no card is charged.
// Production needs real Stripe + Apple Pay merchant/domain validation - see
// PRELAUNCH.md.

import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Z, scrim } from '../lib/overlay';
import AppleLogo from './AppleLogo';

/** Where web Apple Pay could actually exist: Safari on Apple hardware.
 *  ApplePaySession's presence IS the check (Apple only ships it there); the
 *  UA sniff is a fallback for older Safari builds that hide the API behind
 *  a flag. */
// eslint-disable-next-line react-refresh/only-export-components
export function webApplePayAvailable() {
  if (typeof window === 'undefined') return false;
  if (typeof window.ApplePaySession !== 'undefined') return true;
  const ua = window.navigator?.userAgent ?? '';
  const isSafari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg\/|OPR\//.test(ua);
  const isApple = /Macintosh|iPhone|iPad|iPod/.test(ua);
  return isSafari && isApple;
}

/** The one honest line for browsers where Apple Pay cannot exist. */
 
export const APPLE_PAY_UNAVAILABLE_NOTE = 'Apple Pay is available in Safari on Apple devices';

/**
 * @param {boolean}  show
 * @param {string}   payee         Who the charge goes to (org name).
 * @param {string}   [contextLine] Small explainer under the card details.
 * @param {Function} onCancel
 * @param {Function} onSuccess     Called once with
 *                                 { type: 'apple_pay', label: 'Apple Pay', last4: null }.
 */
export default function WebApplePayConfirm({ show, payee, contextLine, onCancel, onSuccess }) {
  const [phase, setPhase] = useState('confirm'); // 'confirm' | 'processing' | 'success'

  function handleConfirm() {
    if (phase !== 'confirm') return;
    setPhase('processing');
    // SIMULATED: no real ApplePaySession, no real charge - just the shape of one.
    setTimeout(() => {
      setPhase('success');
      setTimeout(() => {
        onSuccess?.({ type: 'apple_pay', label: 'Apple Pay', last4: null });
        setPhase('confirm');
      }, 650);
    }, 1100);
  }

  function handleCancel() {
    if (phase !== 'confirm') return;
    setPhase('confirm');
    onCancel?.();
  }

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ ...scrim('blocking', { fixed: true }), zIndex: Z.blockingScrim }}
            onClick={handleCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="Apple Pay"
            data-testid="web-apple-pay-confirm-modal"
            style={{
              position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              width: 420, maxWidth: 'calc(100vw - 32px)', zIndex: Z.blocking,
              background: '#1c1c1e', borderRadius: 20, padding: 24,
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
              <AppleLogo size={18} color="#fff" />
              <span style={{ color: '#fff', fontSize: 19, fontWeight: 700, letterSpacing: '-0.3px' }}>Pay</span>
            </div>

            {phase === 'success' ? (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0 16px' }}
              >
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#30d158', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={28} color="#0b2a12" strokeWidth={3} />
                </div>
                <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 15 }}>Done</p>
              </motion.div>
            ) : (
              <>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, flexShrink: 0 }}>Pay to</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {payee || 'this nonprofit'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5 }}>Card</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>Visa •••• 4242</span>
                  </div>
                </div>
                {contextLine && (
                  <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
                    {contextLine}
                  </p>
                )}
                <button
                  onClick={handleConfirm}
                  disabled={phase === 'processing'}
                  data-testid="web-apple-pay-confirm"
                  style={{
                    width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                    cursor: phase === 'processing' ? 'default' : 'pointer',
                    background: '#fff', color: '#000', fontWeight: 700, fontSize: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {phase === 'processing' ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                        style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', display: 'inline-block' }}
                      />
                      Processing…
                    </>
                  ) : 'Use Apple Pay'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={phase === 'processing'}
                  style={{
                    width: '100%', marginTop: 10, padding: '9px 0', border: 'none', background: 'transparent',
                    cursor: phase === 'processing' ? 'default' : 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <p style={{ margin: '14px 0 0', color: 'rgba(255,255,255,0.35)', fontSize: 10.5, textAlign: 'center' }}>
                  Simulated for this demo  -  no real Apple Pay session is created.
                </p>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
