import { AnimatePresence, motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';

export default function Sheet({ show, onClose, title, children }) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black z-10"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-20 max-h-[85%] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
              <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 scrollable">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
