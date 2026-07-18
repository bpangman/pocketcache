import { useState, useEffect } from 'react';

// ─── Admin change verification ───────────────────────────────────────────────
// Any persistent change on the Grow / Settings admin pages must be confirmed
// with a one-time code sent to the org's admin email  -  the same passwordless
// protocol as sign-in, so a walk-by on an unlocked screen can't quietly
// rewire the org. Demo: the code auto-fills (labeled); production emails it.

export function AdminVerifyModal({ show, adminEmail, warning, onConfirm, onCancel }) {
  const [code, setCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      const c = String(Math.floor(100000 + Math.random() * 900000));
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
    <div
      className="absolute inset-0 z-50 flex items-center justify-center px-5"
      style={{ background: 'rgba(11,42,74,0.55)', backdropFilter: 'blur(6px)' }}
    >
      <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl">
        <p className="font-bold text-gray-900 text-base mb-1">Confirm your changes</p>
        <p className="text-gray-500 text-sm mb-3">
          We sent a 6-digit code to <strong className="text-gray-900">{adminEmail}</strong>  - 
          enter it to lock in these changes.
        </p>
        {warning && (
          <div className="rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 mb-3">
            <p className="text-xs text-amber-700 font-semibold">⚠️ {warning}</p>
          </div>
        )}
        <div className="rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 mb-3">
          <p className="text-xs text-amber-700">Demo: we filled the code in for you  -  the live version emails it.</p>
        </div>
        <form onSubmit={confirm} className="space-y-3">
          <input
            type="text" inputMode="numeric" maxLength={6} value={codeInput}
            onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '')); setError(null); }}
            className="w-full bg-gray-50 rounded-2xl px-4 py-3 outline-none border border-gray-200 focus:border-teal-400 font-mono text-center text-lg tracking-[0.4em]"
            style={{ borderColor: error ? '#ef4444' : '#e5e7eb' }}
          />
          {error && <p className="text-red-500 text-xs px-1">{error}</p>}
          <div className="grid gap-2">
            <button type="submit"
              className="w-full py-3 rounded-2xl text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #0d9488, #003865)', opacity: codeInput.length === 6 ? 1 : 0.4 }}>
              Confirm changes
            </button>
            <button type="button" onClick={onCancel}
              className="w-full py-2.5 rounded-2xl font-semibold text-sm bg-gray-100 text-gray-600">
              Cancel
            </button>
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
        className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
        style={{ background: '#0B2A4A', color: '#fff', boxShadow: '0 10px 30px rgba(11,42,74,0.45)' }}
      >
        <span className="text-xs font-semibold">{label}</span>
        <button
          onClick={onSave}
          className="px-4 py-2 rounded-xl text-xs font-black shrink-0"
          style={{ background: '#FBBF24', color: '#0B2A4A' }}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
