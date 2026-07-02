import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import Sheet from '../Sheet';

export default function VolunteerSheet({ show, onClose, nonprofit, brand }) {
  const [interest, setInterest] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    onClose();
    setSubmitted(false);
    setInterest('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  return (
    <Sheet show={show} onClose={handleClose} title="Volunteer Opportunities">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#128588;</div>
            <p className="font-bold text-gray-900 text-lg">Interest Noted!</p>
            <p className="text-gray-500 text-sm mt-2">
              {nonprofit?.shortName} will reach out about volunteer opportunities near you.
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">
              Express your interest in volunteering with {nonprofit?.shortName}.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                placeholder="Tell us how you'd like to help..."
                value={interest}
                onChange={e => setInterest(e.target.value)}
                required
                rows={3}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400 resize-none"
              />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: interest ? 1 : 0.4 }}>
                Express Interest
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}
