import { useState, useEffect } from 'react';
import Sheet from '../Sheet';
import Button from '../ui/Button';
import { useApp } from '../../store/AppContext';
import { submitOrgContact } from '../../lib/engagement';

/**
 * REAL vs DEMO (same split as GiveExtraSheet): demoActive keeps the original
 * simulated flow - a 600ms pretend-submit and "Interest Noted!". A real
 * account POSTs the org-contact edge function, which emails the nonprofit's
 * admin address (resolved server-side by join code) - so the real flow also
 * collects the donor's name and email (prefilled from their account), because
 * that is what the nonprofit replies to. Success copy is the honest
 * "Sent to {org name}. They will reach out to you directly."
 */
export default function VolunteerSheet({ show, onClose, nonprofit, brand }) {
  const { demoActive, hasAccount } = useApp();
  const [interest, setInterest] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sentOrgName, setSentOrgName] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Prefill the contact fields from the signed-in identity each time the
  // sheet opens - the donor can still edit them before sending.
  useEffect(() => {
    if (!show) return;
    // Deferred a tick, same pattern as GiveExtraSheet's open-reset effect
    // (and the react-hooks/set-state-in-effect rule).
    const id = setTimeout(() => {
      setName(hasAccount?.name ?? '');
      setEmail(hasAccount?.email ?? '');
      setError(null);
    }, 0);
    return () => clearTimeout(id);
  }, [show, hasAccount]);

  function handleClose() {
    onClose();
    setSubmitted(false);
    setSentOrgName(null);
    setInterest('');
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
      kind: 'volunteer',
      fields: { name, email, message: interest },
    });
    setSending(false);
    if (res?.ok) {
      setSentOrgName(res.org_name || nonprofit?.name);
      setSubmitted(true);
    } else {
      setError(res?.error || 'Could not send your message right now. Please try again.');
    }
  }

  const inputCls = 'w-full rounded-input px-4 py-3 text-ink outline-none';
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, minHeight: 48 };
  const canSend = !!interest.trim() && (demoActive || !!(name.trim() && email.trim()));

  return (
    <Sheet show={show} onClose={handleClose} title="Volunteer Opportunities">
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        {submitted ? (
          <div className="text-center py-8" data-testid="volunteer-done">
            <div className="text-5xl mb-4">&#128588;</div>
            {demoActive ? (
              <>
                <p className="font-bold text-ink text-lg">Interest Noted!</p>
                <p className="text-ink-2 text-sm mt-2">
                  {nonprofit?.shortName} will reach out about volunteer opportunities near you.
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
            <p className="text-ink-2 text-sm mb-5">
              Express your interest in volunteering with {nonprofit?.shortName}.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              {!demoActive && (
                <>
                  <input type="text" placeholder="Your name" aria-label="Your name" value={name}
                    onChange={e => setName(e.target.value)} required
                    className={inputCls} style={inputStyle} />
                  <input type="email" placeholder="Your email" aria-label="Your email" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className={inputCls} style={inputStyle} />
                </>
              )}
              <textarea
                placeholder="Tell us how you'd like to help..."
                aria-label="How you'd like to help"
                value={interest}
                onChange={e => setInterest(e.target.value)}
                required
                rows={3}
                className={`${inputCls} resize-none`}
                style={inputStyle}
              />
              {error && (
                <div role="alert" className="rounded-input bg-danger-wash px-4 py-3" style={{ border: '1px solid rgba(220,38,38,0.25)' }} data-testid="volunteer-error">
                  <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
                </div>
              )}
              <Button type="submit" disabled={!canSend} loading={sending}
                style={canSend && !sending ? { background: brand.gradient } : undefined}>
                {sending ? 'Sending…' : 'Express Interest'}
              </Button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}
