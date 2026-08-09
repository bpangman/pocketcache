import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import Sheet from '../Sheet';
import { safeBottomAtLeast } from '../../lib/safeArea';
import { LARGE_DONATION_THRESHOLD, processingCoverFor } from '../../lib/billing';
import { fmtMoney } from '../../lib/format';
import { CheckCircle } from 'lucide-react';

const BOOST_PRESETS = [1, 5, 10, 25];

/**
 * REAL vs DEMO (see the demoActive doc in store/AppContext.jsx): with
 * `demoActive` true this sheet keeps the original flashy simulated flow -
 * instant confirm, BoostToast, fee-breakdown table with "Total charged".
 * With it false, `onSubmitReal(amount)` (async, resolves { ok } or
 * { ok:false, error }) posts a REAL pledge to the give-extra edge function.
 * A real pledge is NOT charged on the spot - it joins the donor's next
 * monthly round-up charge (locked on the 1st, billed on the 11th) - so the
 * real flow's success copy is "Added to your next monthly charge" and the
 * demo fee table (whose "Total charged" today framing would be a lie here)
 * is replaced by that plain sentence.
 */
export default function GiveExtraSheet({ show, onClose, onConfirm, nonprofit, brand, demoActive = true, onSubmitReal }) {
  const [selected, setSelected] = useState(5);
  const [custom, setCustom] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  // Real-path lifecycle: 'idle' | 'sending' | 'done', plus a friendly error
  // sentence when the pledge could not be saved. Demo never leaves 'idle'.
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  // DELIBERATELY LOCAL, and deliberately NOT seeded from the donor's persisted
  // `coverProcessing` setting in AppContext. That setting is a standing consent
  // about the recurring monthly round-up charge; a one-off "give extra" gift is
  // a separate decision made in the moment, and silently carrying the monthly
  // preference onto an ad-hoc gift would be putting words in the donor's mouth.
  // It resets to checked every time the sheet opens (see the effect below).
  // Please do not "fix" this by wiring it to useApp().
  const [coverProcessing, setCoverProcessing] = useState(true);
  const inputRef = useRef(null);
  const amount = custom ? parseFloat(custom) : selected;
  const valid = amount > 0 && !isNaN(amount);
  const isLarge = valid && amount >= LARGE_DONATION_THRESHOLD;

  // Card-processing cost comes from lib/billing, the single source of the rate.
  // This file used to carry its own hardcoded copy of the rate-plus-fixed formula.
  const processingFee = valid ? processingCoverFor(amount) : 0;
  const total = valid ? parseFloat((amount + 1.00 + (coverProcessing ? processingFee : 0)).toFixed(2)) : 0;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      setSelected(5);
      setCustom('');
      setShowConfirm(false);
      setCoverProcessing(true);
      setPhase('idle');
      setError(null);
    }, 0);
    return () => clearTimeout(id);
  }, [show]);

  async function submitReal() {
    setError(null);
    setPhase('sending');
    const res = await onSubmitReal(amount);
    if (res?.ok) {
      setPhase('done');
    } else {
      setPhase('idle');
      setError(res?.error || 'Could not save your gift right now. Please try again.');
    }
  }

  function handlePrimaryTap() {
    if (!valid || phase === 'sending') return;
    if (isLarge) { setShowConfirm(true); return; }
    if (demoActive) {
      onConfirm(amount);
      onClose();
      return;
    }
    submitReal();
  }

  function handleConfirmedLarge() {
    setShowConfirm(false);
    if (demoActive) {
      onConfirm(amount);
      onClose();
      return;
    }
    submitReal();
  }

  const displayAmount = valid
    ? (Number.isInteger(amount) ? amount : amount.toFixed(2))
    : '--';

  const orgShort = nonprofit?.shortName ?? 'the nonprofit';

  if (phase === 'done') {
    return (
      <Sheet show={show} onClose={onClose} title="Give Extra Now">
        <div className="px-6 pt-5">
          <div className="text-center py-8" data-testid="give-extra-real-done">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: '#ecfdf5' }}>
              <CheckCircle size={30} style={{ color: '#059669' }} />
            </div>
            <p className="font-bold text-gray-900 text-lg">Added to your next monthly charge</p>
            <p className="text-gray-500 text-sm mt-2">
              Your ${displayAmount} gift to {orgShort} will be included when your round-ups are charged on the 11th.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="mt-6 w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: brand.gradient }}
            >
              Done
            </motion.button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet show={show} onClose={onClose} title="Give Extra Now">
      {/* No bottom padding here - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        <p className="text-gray-500 text-sm mb-5">
          Make a one-time donation to{' '}
          <span className="font-semibold text-gray-900">{orgShort}</span>{' '}
          on top of your round-ups.
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {BOOST_PRESETS.map(p => (
            <motion.button
              key={p}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setSelected(p); setCustom(''); }}
              className="py-3 rounded-2xl font-bold text-sm transition-all"
              style={selected === p && !custom
                ? { background: brand.gradient, color: '#fff' }
                : { background: '#f3f4f6', color: '#374151' }}
            >
              ${p}
            </motion.button>
          ))}
        </div>

        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-4 border-2 transition-colors"
          style={{ background: '#f9fafb', borderColor: custom ? brand.primary : 'transparent' }}
        >
          <span className="text-gray-400 font-semibold">$</span>
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Custom amount"
            value={custom}
            onChange={e => { setCustom(e.target.value); setSelected(null); }}
            className="flex-1 bg-transparent text-gray-900 text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        {/* Fee breakdown - DEMO ONLY. The simulated flow "charges" the total
            today, so it itemizes the $1 fee and the processing cover. A real
            pledge stores just the gift amount and joins the next monthly
            charge, so the honest real-mode version is the one sentence
            below, not a "Total charged today" table. */}
        {valid && !demoActive && (
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 mb-4">
            <p className="text-gray-600 text-sm leading-relaxed">
              Your ${displayAmount} gift joins your next monthly round-up charge - nothing is charged today.
            </p>
          </div>
        )}
        {valid && demoActive && (
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700">Gift to {orgShort}</span>
              <span className="font-semibold text-gray-900">${displayAmount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">App fee (required)</span>
              <span className="text-gray-500">$1.00</span>
            </div>
            {/* Processing cover toggle */}
            <label
              className="flex items-start gap-2.5 cursor-pointer py-1"
              onClick={() => setCoverProcessing(v => !v)}
            >
              <div
                className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                style={{ borderColor: coverProcessing ? '#059669' : '#d1d5db', background: coverProcessing ? '#059669' : '#fff' }}
              >
                {coverProcessing && <CheckCircle size={10} className="text-white" />}
              </div>
              <span className="text-xs text-gray-500 leading-relaxed flex-1">
                Cover {orgShort}&apos;s card processing (~${fmtMoney(processingFee)})  -  goes to them, counts as part of your gift
              </span>
            </label>
            <div className="h-px bg-gray-200" />
            <div className="flex justify-between text-sm font-bold">
              <span className="text-gray-900">Total charged</span>
              <span style={{ color: brand.primary ?? '#003865' }}>${fmtMoney(total)}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 mb-4" data-testid="give-extra-error">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handlePrimaryTap}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ background: brand.gradient, opacity: valid && phase !== 'sending' ? 1 : 0.4 }}
        >
          {phase === 'sending' ? 'Adding your gift…' : `Give $${displayAmount} Now`}
        </motion.button>

        <AnimatePresence>
          {/* Pinned to the sheet's bottom edge, so it needs the same inset the
              Sheet applies to its scroll container - `bottom-8` sat on top of
              the home indicator on notched devices. */}
          {showConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-x-6 bg-white border-2 border-amber-200 rounded-3xl p-5 shadow-xl"
              style={{ background: '#fffbeb', bottom: safeBottomAtLeast(32, 12) }}
            >
              <p className="font-bold text-amber-900 text-base mb-1">Just to confirm…</p>
              <p className="text-amber-700 text-sm mb-4">
                You&apos;re about to donate <span className="font-bold">${displayAmount}</span> to{' '}
                {orgShort}. Was that intentional?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-amber-200 text-amber-700 font-semibold text-sm"
                >
                  Go back
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConfirmedLarge}
                  className="flex-1 py-3 rounded-2xl text-white font-bold text-sm"
                  style={{ background: brand.gradient }}
                >
                  Yes, give ${displayAmount}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
