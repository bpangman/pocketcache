import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Z, scrim, centered } from '../../lib/overlay';
import Button from '../../components/ui/Button';
import { useNpLayout } from './NpLayout';
import { generateOneTimeCode } from '../../lib/npSignup';
import { useSheetHistory } from '../../lib/stepHistory';

// ─── Admin change verification ───────────────────────────────────────────────
// Any persistent change on the Grow / Settings admin pages must be confirmed
// with a one-time code sent to the org's admin email  -  the same passwordless
// protocol as sign-in, so a walk-by on an unlocked screen can't quietly
// rewire the org. Demo: the code auto-fills (labeled); production emails it.

export function AdminVerifyModal({ show, adminEmail, warning, onConfirm, onCancel }) {
  const { web } = useNpLayout();
  const [code, setCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState(null);

  // Hardware/browser back cancels this gate the same way the Cancel button
  // already does - see src/lib/stepHistory.js.
  useSheetHistory(show, onCancel);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      const c = generateOneTimeCode();
      setCode(c);
      setCodeInput(c); // DEMO: auto-filled; live version emails it
      setError(null);
    }, 0);
    return () => clearTimeout(id);
  }, [show]);

  if (!show) return null;

  function confirm(e) {
    e?.preventDefault?.();
    if (codeInput.trim() !== code) { setError("That code doesn't match  -  check the email and try again."); return; }
    onConfirm();
  }

  return (
    // A blocking gate, not a dismissible sheet: nothing else on the page may be
    // touched until the code is confirmed or cancelled. Shared tokens, and
    // position:fixed on the web shell (which is not inside a scaled container).
    <div style={{ ...scrim('blocking', { fixed: web }), ...centered(20), zIndex: Z.blockingScrim }}>
      <div className="bg-white rounded-panel p-5 w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="admin-verify-title" style={{ zIndex: Z.blocking, boxShadow: 'var(--shadow-3)' }}>
        <p id="admin-verify-title" className="font-bold text-ink text-base mb-1">Confirm your changes</p>
        <p className="text-ink-2 text-sm mb-2">
          We ask for this every time a setting changes, so we can confirm it&apos;s really your organization&apos;s admin making the change, not just anyone with this screen open.
        </p>
        <p className="text-ink-2 text-sm mb-3">
          We sent a 6-digit code to <strong className="text-ink">{adminEmail}</strong>  -
          enter it to lock in these changes.
        </p>
        {/* The one tinted callout in this dialog: the consequence warning
            (QR codes and widgets stop working). The demo note is helper text. */}
        {warning && (
          <div className="rounded-input px-3 py-2 mb-3 flex items-start gap-2" style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} aria-hidden />
            <p className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>{warning}</p>
          </div>
        )}
        <p className="text-[13px] text-slate mb-3">Demo: we filled the code in for you  -  the live version emails it.</p>
        <form onSubmit={confirm} className="space-y-3">
          <input
            type="text" inputMode="numeric" maxLength={6} value={codeInput}
            onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setError(null); }}
            aria-label="6-digit confirmation code"
            aria-invalid={!!error}
            className="w-full bg-surface rounded-input px-4 py-3 outline-none border font-mono text-center text-lg tracking-[0.4em]"
            style={{ borderColor: error ? 'var(--danger)' : 'var(--line)', minHeight: 48, color: 'var(--ink)' }}
          />
          {error && <p className="text-xs px-1" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="grid gap-2">
            <Button type="submit" size="md" surface={web ? 'web' : 'app'} disabled={codeInput.length !== 6}>
              Confirm changes
            </Button>
            <Button type="button" variant="secondary" size="md" surface={web ? 'web' : 'app'} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Floating "Save changes" bar  -  pinned at the top of the scroll area, hovers
// over the page, and stays pinned while scrolling until changes are saved.
export function SaveBar({ show, onSave, label = 'You have unsaved changes' }) {
  if (!show) return null;
  return (
    <div className="sticky top-2 z-40" style={{ margin: '0 0 4px' }}>
      <div
        className="flex items-center justify-between gap-3 rounded-card px-4 py-2 pc-on-dark"
        style={{ background: 'var(--navy)', color: '#fff', boxShadow: 'var(--shadow-3)' }}
      >
        <span className="text-xs font-semibold">{label}</span>
        <button
          type="button"
          onClick={onSave}
          className="px-4 rounded-input text-xs font-extrabold shrink-0"
          style={{ background: 'var(--gold)', color: 'var(--navy)', minHeight: 40 }}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
