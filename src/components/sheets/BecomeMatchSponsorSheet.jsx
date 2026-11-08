import { useState } from 'react';
import Sheet from '../Sheet';
import Button from '../ui/Button';
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
                <p className="font-bold text-ink text-lg">Application Sent!</p>
                <p className="text-ink-2 text-sm mt-2">
                  {orgName}&apos;s corporate partnerships team will be in touch within 2 business days.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-ink text-lg">Sent to {sentOrgName}.</p>
                <p className="text-ink-2 text-sm mt-2">
                  They will reach out to you directly.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-ink-2 text-sm mb-2">
              Partner with {orgName} this month. Your company sponsors the monthly round-up match - donors see your logo, you get a community impact report.
            </p>
            <p className="text-[13px] text-slate mb-4 font-medium">
              Flat campaign fee. 100% of your match goes to {orgName}.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="Company name" aria-label="Company name" value={companyName}
                onChange={e => setCompanyName(e.target.value)} required
                className="w-full rounded-input px-4 text-ink outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, minHeight: 48 }} />
              <input type="text" placeholder="Contact name" aria-label="Contact name" value={contactName}
                onChange={e => setContactName(e.target.value)} required
                className="w-full rounded-input px-4 text-ink outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, minHeight: 48 }} />
              <input type="email" placeholder="Email" aria-label="Email" value={email}
                onChange={e => setEmail(e.target.value)} required
                className="w-full rounded-input px-4 text-ink outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, minHeight: 48 }} />
              <input type="text" placeholder="Budget (e.g. $10,000-$50,000)" aria-label="Budget" value={budget}
                onChange={e => setBudget(e.target.value)}
                className="w-full rounded-input px-4 text-ink outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, minHeight: 48 }} />
              {error && (
                <div role="alert" className="rounded-input bg-danger-wash px-4 py-3" style={{ border: '1px solid rgba(220,38,38,0.25)' }} data-testid="sponsor-error">
                  <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
                </div>
              )}
              <Button type="submit" disabled={!(companyName && email)} loading={sending}
                style={companyName && email && !sending ? { background: brand.gradient } : undefined}>
                {sending ? 'Sending…' : `Submit to ${orgName} Partnerships`}
              </Button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}
