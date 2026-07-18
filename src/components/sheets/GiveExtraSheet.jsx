import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import Sheet from '../Sheet';
import { CheckCircle } from 'lucide-react';

const BOOST_PRESETS = [1, 5, 10, 25];
const LARGE_DONATION_THRESHOLD = 1000;

export default function GiveExtraSheet({ show, onClose, onConfirm, nonprofit, brand }) {
  const [selected, setSelected] = useState(5);
  const [custom, setCustom] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [coverProcessing, setCoverProcessing] = useState(true);
  const inputRef = useRef(null);
  const amount = custom ? parseFloat(custom) : selected;
  const valid = amount > 0 && !isNaN(amount);
  const isLarge = valid && amount >= LARGE_DONATION_THRESHOLD;

  const processingFee = valid ? parseFloat((amount * 0.022 + 0.30).toFixed(2)) : 0;
  const total = valid ? parseFloat((amount + 1.00 + (coverProcessing ? processingFee : 0)).toFixed(2)) : 0;

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      setSelected(5);
      setCustom('');
      setShowConfirm(false);
      setCoverProcessing(true);
    }, 0);
    return () => clearTimeout(id);
  }, [show]);

  function handlePrimaryTap() {
    if (!valid) return;
    if (isLarge) { setShowConfirm(true); return; }
    onConfirm(amount);
    onClose();
  }

  function handleConfirmedLarge() {
    onConfirm(amount);
    setShowConfirm(false);
    onClose();
  }

  const displayAmount = valid
    ? (Number.isInteger(amount) ? amount : amount.toFixed(2))
    : '--';

  const orgShort = nonprofit?.shortName ?? 'the nonprofit';

  return (
    <Sheet show={show} onClose={onClose} title="Give Extra Now">
      <div className="px-6 py-5 pb-8">
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

        {/* Fee breakdown */}
        {valid && (
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
                Cover {orgShort}&apos;s card processing (~${processingFee.toFixed(2)})
              </span>
            </label>
            <div className="h-px bg-gray-200" />
            <div className="flex justify-between text-sm font-bold">
              <span className="text-gray-900">Total charged</span>
              <span style={{ color: brand.primary ?? '#003865' }}>${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handlePrimaryTap}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ background: brand.gradient, opacity: valid ? 1 : 0.4 }}
        >
          Give ${displayAmount} Now
        </motion.button>

        <AnimatePresence>
          {showConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-x-6 bottom-8 bg-white border-2 border-amber-200 rounded-3xl p-5 shadow-xl"
              style={{ background: '#fffbeb' }}
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
