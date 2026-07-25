import { AnimatePresence, motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';
import { safeBottomAtLeast } from '../lib/safeArea';
import { Z, scrim } from '../lib/overlay';

/**
 * Shared bottom sheet. Public API is exactly { show, onClose, title, children }
 * and must stay that way - it is consumed all over the app.
 *
 * BOTTOM SAFE AREA - owned HERE, once.
 * The sheet is position:absolute; bottom:0, so its bottom edge sits under the
 * home indicator on every notched device. Every consumer used to remember its
 * own `pb-8` / `pb-10`, which is 32-40px of static padding: fine on a
 * home-button iPhone, and colliding with the ~34px indicator everywhere else.
 * The scroll container now carries safeBottomAtLeast(32, 12):
 *   no inset (desktop, older iPhone) -> 32px, byte-for-byte the old `pb-8`
 *   34px inset (iPhone 12..16)       -> 46px, clearing the indicator by 12px
 * Consumers must therefore pass content with NO bottom padding of its own -
 * an extra pb-8 in a child now stacks on top of this and double-pads. A child
 * that pins something absolutely inside the sheet (GiveExtraSheet's confirm
 * card) should call safeBottomAtLeast(32, 12) itself to line up with this.
 */
const SHEET_PAD = safeBottomAtLeast(32, 12);

export default function Sheet({ show, onClose, title, children }) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ ...scrim('dim'), zIndex: Z.sheetScrim }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85%] flex flex-col"
            style={{ zIndex: Z.sheet }}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
              <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onClose}><X size={20} className="text-gray-400" /></motion.button>
            </div>
            <div className="flex-1 scrollable pc-scrollbar" style={{ paddingBottom: SHEET_PAD }}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
