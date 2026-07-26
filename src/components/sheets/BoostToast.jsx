import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';
import { safeTopAtLeast } from '../../lib/safeArea';
import { Z } from '../../lib/overlay';

// Offset by 60 rather than 12 so the toast clears the global avatar button
// (safe-top + 12px, 40px tall = bottom at safe-top + 52). At the old value the
// toast's X sat underneath the avatar on any notched device, so tapping it
// opened the account sheet instead of dismissing the toast. The floor keeps the
// toast near the top on devices with no inset at all. Z.pageToast is the
// in-page celebration step: this confirmation belongs to the Dashboard, so it
// sits BELOW an open bottom sheet rather than painting over its card.
const TOAST_TOP = safeTopAtLeast(80, 60);

export default function BoostToast({ amount, nonprofit, onClose }) {
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      className="absolute left-4 right-4 bg-white rounded-3xl p-4 shadow-2xl flex items-center gap-3"
      style={{ top: TOAST_TOP, zIndex: Z.pageToast }}
    >
      <div className="text-3xl">💚</div>
      <div className="flex-1">
        <p className="font-bold text-gray-900 text-sm">
          Extra ${typeof amount === 'number' && !Number.isInteger(amount) ? amount.toFixed(2) : amount} sent!
        </p>
        <p className="text-gray-500 text-xs">Added to your {nonprofit?.shortName} donation</p>
      </div>
      <button onClick={onClose}><X size={16} className="text-gray-300" /></button>
    </motion.div>
  );
}
