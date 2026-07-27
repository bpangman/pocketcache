import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { AlertTriangle, CheckCircle } from 'lucide-react';
import Sheet from '../Sheet';
import { getCustomOrg } from '../../store/orgStore';

/**
 * Hand a nonprofit page to a colleague.
 *
 * WHY THIS EXISTS
 * The product model is ONE admin email per nonprofit: the org record carries a
 * single `adminEmail` and admin sign-in resolves the org by that address
 * (see store/orgStore.js, resolveAdminOrgByEmail). That is a deliberate,
 * simple model - but with no way to change the address, the day the person who
 * signed the org up leaves, the nonprofit is locked out of its own page for
 * good. This is that way.
 *
 * DEMO HONESTY
 * The handover is simulated and labelled as such at every step, in the same
 * "Demo: ..." wording the rest of the app uses for simulated steps (admin code
 * entry, Stripe connect, EIN lookup). Nothing is written to the org record, no
 * email is sent, and the current admin keeps their access - because a demo that
 * really moved control would strand the person testing it, and a demo that
 * merely LOOKED like it moved control would be the same lie the app-icon
 * picker was. What the real version needs is written down in PRELAUNCH.md.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Free-mail domains are rejected for the same reason admin signup rejects them:
// a nonprofit page must belong to an address on the organisation's own domain.
// Production checks this server-side against the org's verified domain; this
// list is only enough to make the demo behave honestly.
const FREE_MAIL = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com'];

export default function TransferNonprofitSheet({ show, onClose, adminRole, brand }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('form'); // 'form' | 'confirm' | 'done'

  const joinCode = adminRole?.joinCode ?? 'your nonprofit';
  const currentAdminEmail = getCustomOrg(adminRole?.orgId)?.adminEmail || null;

  useEffect(() => {
    if (show) return;
    // Reset after the close animation so the sheet does not visibly rewind.
    const id = setTimeout(() => { setEmail(''); setError(null); setStage('form'); }, 250);
    return () => clearTimeout(id);
  }, [show]);

  function handleContinue() {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address.');
      return;
    }
    const domain = value.split('@')[1].toLowerCase();
    if (FREE_MAIL.includes(domain)) {
      setError('Use a work email on your organization\'s own domain, not a personal address.');
      return;
    }
    if (currentAdminEmail && value.toLowerCase() === currentAdminEmail.toLowerCase()) {
      setError('That is the address already administering this page.');
      return;
    }
    setError(null);
    setStage('confirm');
  }

  return (
    <Sheet show={show} onClose={onClose} title="Transfer nonprofit page">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        {stage === 'done' ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#fef3c7' }}>
              <CheckCircle size={26} style={{ color: '#92400e' }} />
            </div>
            <p className="font-bold text-gray-900 text-lg">Demo: transfer simulated</p>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
              Nothing actually changed. You still administer {joinCode} and no email was sent to {email}.
            </p>
            <div className="rounded-2xl px-4 py-3 mt-4 text-left" style={{ background: '#fef3c7', border: '1.5px solid #fde68a' }}>
              <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
                In the live version we check the new address is on your organization&apos;s domain, email them a link to accept, email you a copy, and give you a window to reverse it before your access ends.
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm mt-5"
              style={{ background: brand.gradient }}
            >
              Done
            </motion.button>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              PocketCache gives each nonprofit one admin address, and right now that is
              {currentAdminEmail ? <> <span className="font-semibold text-gray-900">{currentAdminEmail}</span></> : ' yours'}.
              Moving on? Hand {joinCode} to a colleague so your organization keeps its page.
            </p>

            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2" htmlFor="transfer-email">
              Colleague&apos;s work email
            </label>
            <input
              id="transfer-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="name@yourorg.org"
              value={email}
              disabled={stage === 'confirm'}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border-2 transition-colors"
              style={{ borderColor: error ? '#ef4444' : email ? brand.primary : '#e5e7eb' }}
            />
            {error && <p className="text-red-500 text-xs mt-1.5 px-1">{error}</p>}

            <div className="rounded-2xl px-4 py-3 mt-4 flex items-start gap-3" style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
              <p className="text-xs leading-relaxed" style={{ color: '#b91c1c' }}>
                This hands over control of {joinCode}. They get the donor list, the payout settings, and the page itself. You lose your admin access, and you will not be able to take it back yourself - only the new admin can transfer it again.
              </p>
            </div>

            <p className="text-gray-400 text-xs mt-3 leading-relaxed">
              Demo: this transfer is simulated. Nothing is handed over, no email is sent, and you keep your admin access.
            </p>

            <AnimatePresence initial={false}>
              {stage === 'confirm' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-2xl p-4 mt-4" style={{ background: '#fff7ed', border: '2px solid #fed7aa' }}>
                    <p className="font-bold text-sm mb-1" style={{ color: '#9a3412' }}>
                      Give {joinCode} to {email.trim()}?
                    </p>
                    <p className="text-xs leading-relaxed mb-3" style={{ color: '#9a3412' }}>
                      They become the only admin for {joinCode}. Your own admin access ends. Confirm only if this person works at your organization and is expecting it.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setStage('form')}
                        className="flex-1 py-3 rounded-2xl bg-white border border-orange-200 font-semibold text-sm"
                        style={{ color: '#9a3412' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setStage('done')}
                        className="flex-1 py-3 rounded-2xl text-white font-semibold text-sm"
                        style={{ background: '#c2410c' }}
                      >
                        Yes, transfer control
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {stage === 'form' && (
              <motion.button
                whileTap={email.trim() ? { scale: 0.97 } : {}}
                onClick={handleContinue}
                className="w-full py-4 rounded-2xl text-white font-bold text-base mt-5"
                style={{
                  background: email.trim() ? brand.gradient : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
                  cursor: email.trim() ? 'pointer' : 'default',
                }}
              >
                Continue
              </motion.button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
