// "Suggest a Match Sponsor" sheet  -  reachable from MyCause.
// Closure bug fix: company name is captured at submit time in a separate state
// variable (submittedCompany) so the success message can't show a stale value.
import { useState } from 'react';
import Sheet from '../Sheet';
import Button from '../ui/Button';

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
    // Capture company at submit time  -  avoids stale-closure bug in the timeout
    const captured = company;
    setTimeout(() => {
      setSubmittedCompany(captured);
      setSubmitted(true);
    }, 600);
  }

  const orgName = nonprofit?.shortName ?? 'this organization';

  return (
    <Sheet show={show} onClose={handleClose} title="Suggest a Match Sponsor">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#127962;</div>
            <p className="font-bold text-ink text-lg">Inquiry Sent!</p>
            <p className="text-ink-2 text-sm mt-2">
              {orgName}&apos;s corporate partnerships team will follow up with{' '}
              <span className="font-semibold">{submittedCompany}</span> about sponsoring the monthly match.
            </p>
          </div>
        ) : (
          <>
            <p className="text-ink-2 text-sm mb-5">
              Know a company that should be matching round-ups for {orgName}? Let us know  - {' '}
              {orgName}&apos;s corporate partnerships team will reach out to them.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Company you'd like to suggest"
                value={company}
                onChange={e => setCompany(e.target.value)}
                required
                aria-label="Company you'd like to suggest"
                className="w-full rounded-input px-4 text-ink outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, minHeight: 48 }}
              />
              <Button type="submit" disabled={!company.trim()} style={company.trim() ? { background: brand.gradient } : undefined}>
                Send Suggestion
              </Button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}
