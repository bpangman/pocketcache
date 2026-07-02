import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import Sheet from '../Sheet';

export default function BecomeMatchSponsorSheet({ show, onClose, nonprofit, brand }) {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    onClose();
    setSubmitted(false);
    setCompanyName('');
    setContactName('');
    setEmail('');
    setBudget('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  const orgName = nonprofit?.shortName ?? 'the nonprofit';

  return (
    <Sheet show={show} onClose={handleClose} title="Become a Match Sponsor">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🤝</div>
            <p className="font-bold text-gray-900 text-lg">Application Sent!</p>
            <p className="text-gray-500 text-sm mt-2">
              {orgName}&apos;s corporate partnerships team will be in touch within 2 business days.
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">
              Partner with {orgName} this month. Your company sponsors the monthly round-up match — donors see your logo, you get a community impact report.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="Company name" value={companyName}
                onChange={e => setCompanyName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="text" placeholder="Contact name" value={contactName}
                onChange={e => setContactName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="email" placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="text" placeholder="Budget (e.g. $10,000–$50,000)" value={budget}
                onChange={e => setBudget(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: companyName && email ? 1 : 0.4 }}>
                Submit to {orgName} Partnerships
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}
