import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';

export default function BoostToast({ amount, nonprofit, onClose }) {
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      className="absolute top-20 left-4 right-4 z-30 bg-white rounded-3xl p-4 shadow-2xl flex items-center gap-3"
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
