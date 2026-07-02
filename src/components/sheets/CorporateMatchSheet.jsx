// "Suggest a Match Sponsor" sheet — reachable from MyCause.
// Closure bug fix: company name is captured at submit time in a separate state
// variable (submittedCompany) so the success message can't show a stale value.
import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import Sheet from '../Sheet';

export default function CorporateMatchSheet({ show, onClose, nonprofit, brand }) {
  const [company, setCompany] = useState('');
  const [submittedCompany, setSubmittedCompany] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    onClose();
    setSubmitted(false);
    setCompany('');
    setSubmittedCompany('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Capture company at submit time — avoids stale-closure bug in the timeout
    const captured = company;
    setTimeout(() => {
      setSubmittedCompany(captured);
      setSubmitted(true);
    }, 600);
  }

  const orgName = nonprofit?.shortName ?? 'this organization';

  return (
    <Sheet show={show} onClose={handleClose} title="Suggest a Match Sponsor">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#127962;</div>
            <p className="font-bold text-gray-900 text-lg">Inquiry Sent!</p>
            <p className="text-gray-500 text-sm mt-2">
              {orgName}&apos;s corporate partnerships team will follow up with{' '}
              <span className="font-semibold">{submittedCompany}</span> about sponsoring the monthly match.
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">
              Know a company that should be matching round-ups for {orgName}? Let us know —{' '}
              {orgName}&apos;s corporate partnerships team will reach out to them.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Company you'd like to suggest"
                value={company}
                onChange={e => setCompany(e.target.value)}
                required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400"
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: company ? 1 : 0.4 }}
              >
                Send Suggestion
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}
