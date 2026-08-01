import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Z, scrim } from '../lib/overlay';
import { safeBottom } from '../lib/safeArea';
import AppleLogo from './AppleLogo';

/**
 * Simulated Apple Pay payment sheet - the one place "choosing Apple Pay"
 * actually behaves like Apple Pay, used by every payment-method surface in
 * the app (donor onboarding, web signup, Settings, the web portal).
 *
 * SIMULATED, same theatre level as connectStripe() in lib/npSignup.js: there
 * is no real PassKit session and no card is added to any device wallet. It
 * looks and behaves like the real sheet - payee, a masked card line, a
 * "Confirm with Side Button" affordance, ~1.2s processing, a success check -
 * so the demo reads honestly as what Apple Pay would feel like, without
 * pretending to be a production Apple Pay integration. Production needs real
 * Stripe + Apple Pay merchant/domain setup - see PRELAUNCH.md.
 *
 * @param {boolean}  show
 * @param {string}   payee          Who the charge is going to (org name).
 * @param {string}   [contextLine]  Small line under the card details, e.g. a
 *                                  monthly-total estimate.
 * @param {Function} onCancel       Tap outside / Cancel.
 * @param {Function} onSuccess      Called once with
 *                                  { type: 'apple_pay', label: 'Apple Pay', last4: null }
 *                                  after the simulated confirm finishes.
 * @param {boolean}  [fixed=false]  position:fixed (a real webpage) vs
 *                                  position:absolute (inside the phone frame)
 *                                  - same convention as AppDownloadQRModal.
 */
export default function ApplePaySheet({ show, payee, contextLine, onCancel, onSuccess, fixed = false }) {
  const [phase, setPhase] = useState('confirm'); // 'confirm' | 'processing' | 'success'

  function reset() {
    setPhase('confirm');
  }

  function handleConfirm() {
    if (phase !== 'confirm') return;
    setPhase('processing');
    // SIMULATED: no real PassKit session, no real charge - just the shape of one.
    setTimeout(() => {
      setPhase('success');
      setTimeout(() => {
        onSuccess?.({ type: 'apple_pay', label: 'Apple Pay', last4: null });
        reset();
      }, 650);
    }, 1200);
  }

  function handleCancel() {
    if (phase !== 'confirm') return;
    reset();
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
            style={{ ...scrim('blocking', { fixed }), zIndex: Z.blockingScrim }}
            onClick={handleCancel}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            style={{
              position: fixed ? 'fixed' : 'absolute',
              left: 0, right: 0, bottom: 0, zIndex: Z.blocking,
              background: '#1c1c1e', borderRadius: '20px 20px 0 0',
              padding: '20px 20px 0', paddingBottom: safeBottom(20),
              boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Apple Pay"
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.25)', margin: '0 auto 18px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
              <AppleLogo size={18} color="#fff" />
              <span style={{ color: '#fff', fontSize: 19, fontWeight: 700, letterSpacing: '-0.3px' }}>Pay</span>
            </div>

            {phase === 'success' ? (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 0 22px' }}
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
                  data-testid="apple-pay-confirm"
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
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
                  ) : 'Confirm with Side Button'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={phase === 'processing'}
                  style={{
                    width: '100%', marginTop: 10, padding: '10px 0', border: 'none', background: 'transparent',
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
