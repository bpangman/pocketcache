import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import Sheet from '../Sheet';
import { useApp } from '../../store/AppContext';
import { submitOrgContact } from '../../lib/engagement';

/**
 * REAL vs DEMO (same split as VolunteerSheet): demoActive keeps the original
 * simulated 600ms flow and "Application Sent!". A real account POSTs the
 * org-contact edge function (kind 'match_sponsor'), which emails the form to
 * the nonprofit's admin address resolved server-side by join code. The form
 * already collects everything org-contact needs (company, contact name,
 * email, budget), so the real path is the same fields with an honest
 * "Sent to {org name}. They will reach out to you directly."
 */
export default function BecomeMatchSponsorSheet({ show, onClose, nonprofit, brand }) {
  const { demoActive } = useApp();
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sentOrgName, setSentOrgName] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  function handleClose() {
    onClose();
    setSubmitted(false);
    setSentOrgName(null);
    setCompanyName('');
    setContactName('');
    setEmail('');
    setBudget('');
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (demoActive) {
      setTimeout(() => { setSubmitted(true); }, 600);
      return;
    }
    if (sending) return;
    setError(null);
    setSending(true);
    const res = await submitOrgContact({
      orgCode: nonprofit?.shortName,
      kind: 'match_sponsor',
      fields: { name: contactName, email, company: companyName, budget },
    });
    setSending(false);
    if (res?.ok) {
      setSentOrgName(res.org_name || nonprofit?.name);
      setSubmitted(true);
    } else {
      setError(res?.error || 'Could not send your message right now. Please try again.');
    }
  }

  const orgName = nonprofit?.shortName ?? 'the nonprofit';

  return (
    <Sheet show={show} onClose={handleClose} title="Become a Match Sponsor">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        {submitted ? (
          <div className="text-center py-8" data-testid="sponsor-done">
            <div className="text-5xl mb-4">🤝</div>
            {demoActive ? (
              <>
                <p className="font-bold text-gray-900 text-lg">Application Sent!</p>
                <p className="text-gray-500 text-sm mt-2">
                  {orgName}&apos;s corporate partnerships team will be in touch within 2 business days.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-gray-900 text-lg">Sent to {sentOrgName}.</p>
                <p className="text-gray-500 text-sm mt-2">
                  They will reach out to you directly.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-2">
              Partner with {orgName} this month. Your company sponsors the monthly round-up match  -  donors see your logo, you get a community impact report.
            </p>
            <p className="text-xs text-gray-400 mb-4 font-medium">
              Flat campaign fee. 100% of your match goes to {orgName}.
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
              <input type="text" placeholder="Budget (e.g. $10,000-$50,000)" value={budget}
                onChange={e => setBudget(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              {error && (
                <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3" data-testid="sponsor-error">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: companyName && email && !sending ? 1 : 0.4 }}>
                {sending ? 'Sending…' : `Submit to ${orgName} Partnerships`}
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}
