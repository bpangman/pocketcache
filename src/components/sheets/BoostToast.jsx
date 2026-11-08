import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';
import { safeBottomAtLeast } from '../../lib/safeArea';
import { Z } from '../../lib/overlay';
import { fmtMoneyWhole } from '../../lib/format';

/**
 * Where an in-page toast sits: just above the tab bar, 12px clear of it.
 *
 * The tab bar is 4px top padding + a 55px tab + max(12px, safe-bottom - 6px)
 * of bottom padding (TabBar.jsx), so its top edge is 71px up on a device with
 * no inset and safe-bottom + 53px on a notched one; add the 12px gap. Toasts
 * used to hang under the header instead, where on first open they painted
 * over the hero's "Total donated" figure (Dashboard) or the Mission card (My
 * Cause) until dismissed. Down here they cover nothing the screen is for and
 * stay clear of the global avatar button. Shared with Dashboard's
 * MilestoneToast so the two toasts land in the same place.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const TOAST_BOTTOM = safeBottomAtLeast(83, 65);

export default function BoostToast({ amount, nonprofit, onClose }) {
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      role="status"
      className="absolute left-4 right-4 bg-white rounded-panel p-4 flex items-center gap-3"
      // Z.pageToast is the in-page celebration step: this confirmation belongs
      // to the page, so it sits BELOW an open bottom sheet rather than
      // painting over its card.
      style={{ bottom: TOAST_BOTTOM, zIndex: Z.pageToast, boxShadow: 'var(--shadow-3)' }}
    >
      {/* Celebration emoji - copy, not an icon. */}
      <div className="text-3xl">💚</div>
      <div className="flex-1">
        <p className="font-bold text-ink text-sm">
          Extra ${fmtMoneyWhole(amount)} sent!
        </p>
        <p className="text-slate text-[13px]">Added to your {nonprofit?.shortName} donation</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="w-11 h-11 -mr-2 flex items-center justify-center rounded-input shrink-0"
      >
        <X size={18} className="text-gray-400" />
      </button>
    </motion.div>
  );
}
