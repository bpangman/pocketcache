import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import Sheet from '../Sheet';
import Button from '../ui/Button';
import { safeBottomAtLeast } from '../../lib/safeArea';
import { LARGE_DONATION_THRESHOLD, processingCoverFor } from '../../lib/billing';
import { fmtMoney, fmtMoneyWhole } from '../../lib/format';
import { CheckCircle } from 'lucide-react';

const BOOST_PRESETS = [1, 5, 10, 25];

/** What the sheet says when there is no signed-in session to attach a pledge to. */
const NO_SESSION_ERROR = 'Sign in to add a real gift.';

/**
 * REAL vs DEMO (see the demoActive doc in store/AppContext.jsx): with
 * `demoActive` true this sheet keeps the original simulated flow - instant
 * confirm, BoostToast, a local-only pledge. With it false,
 * `onSubmitReal(amount)` (async, resolves { ok } or { ok:false, reason, error })
 * posts a REAL pledge to the give-extra edge function. A real pledge is NOT
 * charged on the spot - it joins the donor's next monthly round-up charge
 * (locked on the 1st, billed on the 11th) - so both flows now say "Added to
 * your next monthly charge": the old demo table itemised a $1 app fee and a
 * "Total charged" as if the gift were billed today, which is not how a gift
 * is collected in either mode.
 *
 * With no session the edge-function helper resolves reason 'no-session'; the
 * sheet shows "Sign in to add a real gift." and records nothing.
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
  // No $1 app fee here: the fee belongs to the monthly charge, not to a gift.
  const processingFee = valid ? processingCoverFor(amount) : 0;
  const total = valid ? parseFloat((amount + (coverProcessing ? processingFee : 0)).toFixed(2)) : 0;

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
      setError(res?.reason === 'no-session'
        ? NO_SESSION_ERROR
        : (res?.error || 'Could not save your gift right now. Please try again.'));
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

  const displayAmount = valid ? fmtMoneyWhole(amount) : '--';

  const orgShort = nonprofit?.shortName ?? 'the nonprofit';
  const primaryDisabled = !valid || phase === 'sending';

  if (phase === 'done') {
    return (
      <Sheet show={show} onClose={onClose} title="Give Extra Now">
        <div className="px-6 pt-5">
          <div className="text-center py-8" data-testid="give-extra-real-done">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(5,150,105,0.08)' }}>
              <CheckCircle size={30} style={{ color: 'var(--green)' }} />
            </div>
            <p className="font-bold text-ink text-lg">Added to your next monthly charge</p>
            <p className="text-ink-2 text-sm mt-2 leading-relaxed">
              Your ${displayAmount} gift to {orgShort} will be included when your round-ups are charged on the 11th.
            </p>
            <div className="mt-6">
              <Button onClick={onClose} style={{ background: brand.gradient }}>Done</Button>
            </div>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet show={show} onClose={onClose} title="Give Extra Now">
      {/* No bottom padding here - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        <p className="text-ink-2 text-sm mb-5">
          Make a one-time donation to{' '}
          <span className="font-semibold text-ink">{orgShort}</span>{' '}
          on top of your round-ups.
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4" role="group" aria-label="Gift amount">
          {BOOST_PRESETS.map(p => (
            <motion.button
              key={p}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => { setSelected(p); setCustom(''); }}
              aria-pressed={selected === p && !custom}
              className="min-h-[44px] rounded-input font-bold text-sm transition-all"
              style={selected === p && !custom
                ? { background: brand.gradient, color: '#fff' }
                : { background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
            >
              ${p}
            </motion.button>
          ))}
        </div>

        <label
          className="flex items-center gap-2 rounded-input px-4 mb-4 transition-colors"
          style={{ background: 'var(--surface)', border: `1px solid ${custom ? brand.primary : 'var(--line)'}`, minHeight: 48 }}
        >
          <span className="text-slate font-semibold">$</span>
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Custom amount"
            aria-label="Custom amount"
            value={custom}
            onChange={e => { setCustom(e.target.value); setSelected(null); }}
            className="flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
            style={{ fontSize: 16, minHeight: 46 }}
          />
        </label>

        {/* Where the gift lands. A real pledge stores just the gift amount and
            joins the next monthly charge; demo keeps the itemised gift-plus-
            cover view with the same "next monthly charge" framing. */}
        {valid && !demoActive && (
          <div className="rounded-input p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <p className="text-ink-2 text-sm leading-relaxed">
              Your ${displayAmount} gift joins your next monthly round-up charge - nothing is charged today.
            </p>
          </div>
        )}
        {valid && demoActive && (
          <div className="rounded-input p-4 mb-4 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div className="flex justify-between text-sm">
              <span className="text-ink-2">Gift to {orgShort}</span>
              <span className="font-semibold text-ink tabular-nums">${displayAmount}</span>
            </div>
            {/* Processing cover toggle - a real checkbox (visually hidden) so
                it is keyboard- and screen-reader-operable. */}
            <label className="flex items-start gap-2.5 cursor-pointer py-1 min-h-[44px]">
              <input
                type="checkbox"
                className="sr-only"
                checked={coverProcessing}
                onChange={e => setCoverProcessing(e.target.checked)}
              />
              <span
                aria-hidden="true"
                className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                style={{ borderColor: coverProcessing ? 'var(--green)' : 'var(--muted)', background: coverProcessing ? 'var(--green)' : '#fff' }}
              >
                {coverProcessing && <CheckCircle size={12} className="text-white" />}
              </span>
              <span className="text-[13px] text-ink-2 leading-relaxed flex-1">
                Cover {orgShort}&apos;s card processing (~${fmtMoney(processingFee)}) - goes to them, counts as part of your gift
              </span>
            </label>
            <div className="h-px bg-line" />
            <div className="flex justify-between text-sm font-bold">
              <span className="text-ink">Added to your next monthly charge</span>
              <span className="tabular-nums" style={{ color: brand.primary ?? 'var(--navy-deep)' }}>${fmtMoneyWhole(total)}</span>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-input px-4 py-3 mb-4" style={{ background: 'var(--danger-50)', border: '1px solid rgba(220,38,38,0.25)' }} data-testid="give-extra-error">
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

        <Button
          onClick={handlePrimaryTap}
          disabled={primaryDisabled}
          loading={phase === 'sending'}
          style={primaryDisabled ? undefined : { background: brand.gradient }}
          data-testid="give-extra-primary"
        >
          {phase === 'sending' ? 'Adding your gift…' : `Give $${displayAmount} Now`}
        </Button>

        <AnimatePresence>
          {/* Pinned to the sheet's bottom edge, so it needs the same inset the
              Sheet applies to its scroll container - `bottom-8` sat on top of
              the home indicator on notched devices. */}
          {showConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              role="alertdialog"
              aria-label="Confirm your gift"
              className="absolute inset-x-6 bg-white rounded-panel p-5"
              style={{ bottom: safeBottomAtLeast(32, 12), boxShadow: 'var(--shadow-3)', border: '1px solid var(--line)' }}
            >
              <p className="font-bold text-ink text-base mb-1">Just to confirm…</p>
              <p className="text-ink-2 text-sm mb-4">
                You&apos;re about to donate <span className="font-bold text-ink">${displayAmount}</span> to{' '}
                {orgShort}. Was that intentional?
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" size="md" onClick={() => setShowConfirm(false)}>Go back</Button>
                <Button size="md" onClick={handleConfirmedLarge} style={{ background: brand.gradient }}>
                  Yes, give ${displayAmount}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
