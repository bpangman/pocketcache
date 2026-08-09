import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Lock } from 'lucide-react';
import { formatCardNumber, cardDigits, isValidCardNumber, last4, formatExpiry, isValidExpiry, isValidCvv } from '../lib/manualCard';

/**
 * ManualCardForm - the "type your card number" form, once instead of three times.
 *
 * Replaces three copies with identical state, identical `digits.length < 13`
 * validation and identical fake-connect setTimeout:
 *   src/pages/Onboarding.jsx      ConnectCardScreen  (~839-1058, form at ~965-1023)
 *   src/pages/Settings.jsx        TrackCardSheet     (~657-830, form at ~718-778)
 *   src/pages/WebPortalPages.jsx  TrackCardModal     (~810-934, form at ~860-903)
 *
 * The card number itself is demo theatre - see the header of lib/manualCard.js
 * before touching any of this.
 *
 * ---------------------------------------------------------------------------
 * USAGE - Onboarding.jsx ConnectCardScreen (variant "app")
 * ---------------------------------------------------------------------------
 * Delete the local formatCardNum(), handleManualConnect(), and the
 * manualName / manualCardNumber / manualConnecting state. Keep showManualEntry
 * and connected. Then the `) : showManualEntry ? (` branch becomes:
 *
 *   <ManualCardForm
 *     variant="app"
 *     onCancel={() => setShowManualEntry(false)}
 *     onConnect={card => { setConnected(card); setShowManualEntry(false); }}
 *   />
 *
 * (The old cancel handler also cleared manualName/manualCardNumber; the form
 * owns those now and unmounting it clears them, so onCancel just hides it.)
 *
 * ---------------------------------------------------------------------------
 * USAGE - Settings.jsx TrackCardSheet (variant "app")
 * ---------------------------------------------------------------------------
 * Delete formatManualCardNumber() (module scope, ~line 652), handleManualConnect(),
 * and the manualName / manualCardNumber / manualConnecting state. The
 * `) : showManualForm ? (` branch becomes:
 *
 *   <ManualCardForm
 *     variant="app"
 *     onCancel={() => setShowManualForm(false)}
 *     onConnect={card => { setConnected(card); setShowManualForm(false); }}
 *   />
 *
 * handleDone() and the Sheet onClose can drop their setManualName('') /
 * setManualCardNumber('') calls.
 *
 * ---------------------------------------------------------------------------
 * USAGE - WebPortalPages.jsx TrackCardModal (variant "web")
 * ---------------------------------------------------------------------------
 * Delete webFormatCardNumber() (module scope, ~line 805), handleManualConnect(),
 * and the manualName / manualCardNumber / manualConnecting state (the show-reset
 * useEffect keeps only setConnecting/setConnected/setShowManualForm). The
 * `) : showManualForm ? (` branch becomes:
 *
 *   <ManualCardForm
 *     variant="web"
 *     onCancel={() => setShowManualForm(false)}
 *     onConnect={card => { setConnected(card); onConnected(card); }}
 *   />
 *
 * ---------------------------------------------------------------------------
 * THE onConnect PAYLOAD IS PER-VARIANT, BECAUSE THE CALL SITES ALREADY WERE
 * ---------------------------------------------------------------------------
 * The two app copies built:   { id: 'manual', name: 'My Card', emoji: '💳', last4 }
 * The web copy built:         { name: 'My Card', last4, brand: 'Card', institution: 'Manual' }
 * Those are consumed by different downstream code (the app shows
 * `{connected.emoji}` and keys off `id`; the web dashboard shows
 * `brand`/`institution`), so unifying them would be a behaviour change, not a
 * refactor. variant picks the matching shape. If you need the other one, pass
 * `cardShape` to override.
 *
 * ---------------------------------------------------------------------------
 * KNOWN QUIRK PRESERVED ON PURPOSE: the cardholder name is collected and thrown
 * away. All three copies rendered a "Cardholder name" input, stored it, and then
 * hardcoded `name: 'My Card'` in the payload anyway. Passing
 * `applyEnteredName` makes the typed name win (falling back to 'My Card' when
 * blank), which is what the field obviously intends - but it changes the visible
 * "<name> ····1234 connected" confirmation text, so it is OFF by default to keep
 * this a pure refactor. Flip it deliberately, in its own change.
 *
 * @param {object}   props
 * @param {'app'|'web'} [props.variant='app']  Visual language + payload shape.
 * @param {Function} props.onConnect           Called with the card object after
 *                                             the simulated connect delay.
 * @param {Function} [props.onCancel]          Cancel button. Hidden if absent.
 * @param {boolean}  [props.applyEnteredName=false]  See KNOWN QUIRK above.
 * @param {string}   [props.fallbackName='My Card']
 * @param {number}   [props.delayMs=1000]      Simulated connect delay. 1000 is
 *                                             what all three copies used.
 * @param {Function} [props.cardShape]         (digits, name) => object. Overrides
 *                                             the per-variant payload shape.
 * @param {object}   [props.entry]             Optional external state from
 *                                             useManualCardEntry(), if a caller
 *                                             needs to read or reset the fields.
 */
export default function ManualCardForm({
  variant = 'app',
  onConnect,
  onCancel,
  applyEnteredName = false,
  fallbackName = 'My Card',
  delayMs = 1000,
  cardShape,
  entry: entryProp,
}) {
  // Always call the hook (rules-of-hooks); prefer the caller's state if given.
  const internal = useManualCardEntry();
  const entry = entryProp ?? internal;
  const { name, setName, number, setNumber, connecting, setConnecting } = entry;
  // Expiry + CVV: newer fields, so an older caller-provided `entry` object
  // without them still works (internal state covers the gap).
  const expiry = entry.expiry ?? internal.expiry;
  const setExpiry = entry.setExpiry ?? internal.setExpiry;
  const cvv = entry.cvv ?? internal.cvv;
  const setCvv = entry.setCvv ?? internal.setCvv;

  // All three fields must look plausible. Still simulated end to end: the
  // number, expiry and CVV never leave this component - only the last4 goes
  // into the payload below.
  const valid = isValidCardNumber(number) && isValidExpiry(expiry) && isValidCvv(cvv);
  const ready = valid && !connecting;

  function handleConnect() {
    if (!ready) return;
    setConnecting(true);
    // SIMULATED. No network call, no tokenisation, nothing is verified. This
    // setTimeout is the entire "connect" - it exists so the prototype can show
    // a spinner for a beat. Production goes through Plaid Link; see
    // lib/manualCard.js.
    //
    // Deliberately NOT cancelled on unmount: the three originals let the timer
    // fire even if their sheet/modal closed mid-connect, so the card still
    // landed. Cancelling here would silently change that.
    setTimeout(() => {
      const digits = cardDigits(number);
      const resolved = applyEnteredName ? (name.trim() || fallbackName) : fallbackName;
      setConnecting(false);
      onConnect?.(
        cardShape
          ? cardShape(digits, resolved)
          : variant === 'web'
            ? { name: resolved, last4: last4(digits), brand: 'Card', institution: 'Manual' }
            : { id: 'manual', name: resolved, emoji: '💳', last4: last4(digits) },
      );
    }, delayMs);
  }

  if (variant === 'web') {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: WEB_INK.secondary }}>
          This is the card we <strong>watch</strong> for round-ups  -  it is never charged. Read-only, encrypted via Plaid.
        </p>
        <div>
          <label style={WEB_LABEL}>Cardholder name</label>
          <input
            type="text"
            placeholder="Name on card"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 13, outline: 'none', background: '#f9fafb' }}
          />
        </div>
        <div>
          <label style={WEB_LABEL}>Card number</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="XXXX XXXX XXXX XXXX"
            value={number}
            onChange={e => setNumber(formatCardNumber(e.target.value))}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'monospace', letterSpacing: '0.1em', outline: 'none', background: '#f9fafb' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={WEB_LABEL}>Expiration</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="MM/YY"
              maxLength={5}
              value={expiry}
              onChange={e => setExpiry(formatExpiry(e.target.value))}
              style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'monospace', outline: 'none', background: '#f9fafb' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={WEB_LABEL}>CVV</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="123"
              maxLength={4}
              value={cvv}
              onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'monospace', outline: 'none', background: '#f9fafb' }}
            />
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: WEB_INK.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
          🔒 {REASSURANCE}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: WEB_INK.secondary }}
            >Cancel</button>
          )}
          <button
            onClick={handleConnect}
            disabled={!ready}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: ready ? 'pointer' : 'default',
              background: ready ? 'linear-gradient(135deg, #0d9488, #003865)' : '#d1d5db',
              color: '#fff', fontSize: 13, fontWeight: 700,
            }}
          >{connecting ? 'Connecting…' : 'Connect'}</button>
        </div>
      </div>
    );
  }

  // variant "app" - the Onboarding / Settings visual, Tailwind classes verbatim.
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 space-y-3"
      style={{ background: '#fff', border: '1.5px solid #99f6e4' }}
    >
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Enter card details</p>
      <p className="text-xs text-gray-500">This is the card we <strong>watch</strong> for round-ups  -  it is never charged.</p>
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Cardholder name</label>
        <input
          type="text"
          placeholder="Name on card"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200 focus:border-teal-400"
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Card number</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="XXXX XXXX XXXX XXXX"
          value={number}
          onChange={e => setNumber(formatCardNumber(e.target.value))}
          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200 focus:border-teal-400 font-mono tracking-wider"
        />
      </div>
      <div className="flex gap-2.5">
        <div className="flex-1">
          <label className="text-xs text-gray-400 font-semibold mb-1 block">Expiration</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/YY"
            maxLength={5}
            value={expiry}
            onChange={e => setExpiry(formatExpiry(e.target.value))}
            className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200 focus:border-teal-400 font-mono"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400 font-semibold mb-1 block">CVV</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123"
            maxLength={4}
            value={cvv}
            onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200 focus:border-teal-400 font-mono"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Lock size={12} className="text-gray-400 shrink-0" />
        <p className="text-gray-400 text-xs">{REASSURANCE}</p>
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200"
          >Cancel</button>
        )}
        <motion.button
          whileTap={ready ? { scale: 0.97 } : {}}
          onClick={handleConnect}
          disabled={!ready}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{
            background: ready
              ? 'linear-gradient(135deg, #0d9488, #003865)'
              : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
          }}
        >
          {connecting ? (
            <span className="flex items-center justify-center gap-2">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white" />
              Connecting…
            </span>
          ) : 'Connect'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// Copy shared by both variants, byte-for-byte what the three forms rendered.
// The double-space-hyphen-double-space is the repo's house dash; HTML collapses
// it to a single spaced hyphen on screen.
const REASSURANCE = 'Encrypted via Plaid  -  PocketCache never stores your full card number';

// WebPortalPages.jsx keeps its INK palette module-private, so the three values
// are mirrored here. Keep them in sync with WebPortalPages.jsx:20.
const WEB_INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };

const WEB_LABEL = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: WEB_INK.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

/**
 * Shared field state for a manual card entry. ManualCardForm creates its own
 * instance, so callers only need this when they have to read or clear the
 * fields from outside (e.g. a sheet that resets everything on close).
 *
 *   const entry = useManualCardEntry();
 *   ...
 *   <ManualCardForm variant="app" entry={entry} onConnect={...} />
 *   <button onClick={entry.reset}>Start over</button>
 *
 * @returns {{ name: string, setName: Function, number: string,
 *             setNumber: Function, connecting: boolean, setConnecting: Function,
 *             digits: string, valid: boolean, last4: string, reset: Function }}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useManualCardEntry() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [connecting, setConnecting] = useState(false);

  function reset() {
    setName('');
    setNumber('');
    setExpiry('');
    setCvv('');
    setConnecting(false);
  }

  return {
    name, setName,
    number, setNumber,
    expiry, setExpiry,
    cvv, setCvv,
    connecting, setConnecting,
    digits: cardDigits(number),
    valid: isValidCardNumber(number) && isValidExpiry(expiry) && isValidCvv(cvv),
    last4: last4(number),
    reset,
  };
}
