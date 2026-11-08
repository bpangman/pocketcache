import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Lock } from 'lucide-react';
import { formatCardNumber, cardDigits, isValidCardNumber, last4, formatExpiry, isValidExpiry, isValidCvv } from '../lib/manualCard';
import { INK } from '../lib/webTheme';

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
 * NO CARDHOLDER NAME FIELD. The three originals collected a name and threw it
 * away (the payload hardcoded 'My Card'); the field was pure friction on a demo
 * form, so it is gone. `applyEnteredName` and the hook's name/setName stay for
 * API compatibility with a caller that passes its own `entry` and sets a name
 * programmatically - the form itself never asks for one.
 *
 * Every payload carries `source: 'manual', kind: 'card'` so downstream code
 * (BankPaymentAuth, the payment step) can tell a typed-in demo card apart from
 * a real Plaid connection without guessing from the shape.
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
  const { name, number, setNumber, connecting, setConnecting } = entry;
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
            ? { name: resolved, last4: last4(digits), brand: 'Card', institution: 'Manual', source: 'manual', kind: 'card' }
            : { id: 'manual', name: resolved, emoji: '💳', last4: last4(digits), source: 'manual', kind: 'card' },
      );
    }, delayMs);
  }

  if (variant === 'web') {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: WEB_INK.secondary }}>
          This is the card we <strong>watch</strong> for round-ups - it is never charged.
        </p>
        <div>
          <label style={WEB_LABEL} htmlFor="manual-card-number">Card number</label>
          <input
            id="manual-card-number"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="XXXX XXXX XXXX XXXX"
            value={number}
            onChange={e => setNumber(formatCardNumber(e.target.value))}
            style={{ ...WEB_INPUT, letterSpacing: '0.1em' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={WEB_LABEL} htmlFor="manual-card-expiry">Expiration</label>
            <input
              id="manual-card-expiry"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="MM/YY"
              maxLength={5}
              value={expiry}
              onChange={e => setExpiry(formatExpiry(e.target.value))}
              style={WEB_INPUT}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={WEB_LABEL} htmlFor="manual-card-cvv">CVV</label>
            <input
              id="manual-card-cvv"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123"
              maxLength={4}
              value={cvv}
              onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={WEB_INPUT}
            />
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: WEB_INK.subtle, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <Lock size={12} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <span>{REASSURANCE}</span>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="pc-btn"
              style={{ flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-pill)', border: '1px solid var(--line)', background: 'var(--white)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}
            >Cancel</button>
          )}
          <button
            type="button"
            onClick={handleConnect}
            aria-disabled={!ready ? 'true' : undefined}
            aria-busy={connecting ? 'true' : undefined}
            className="pc-btn"
            style={{
              flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-pill)', border: 'none', cursor: ready ? 'pointer' : 'not-allowed',
              background: ready ? 'var(--grad-primary)' : 'var(--disabled-bg)',
              color: ready ? 'var(--white)' : 'var(--disabled-text)', fontSize: 14, fontWeight: 600,
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
      style={{ background: 'var(--white)', border: '1px solid var(--teal-200)' }}
    >
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--slate)' }}>Enter card details</p>
      <p className="text-xs" style={{ color: 'var(--slate)' }}>This is the card we <strong>watch</strong> for round-ups - it is never charged.</p>
      <div>
        <label className={APP_LABEL} style={{ color: 'var(--slate)' }} htmlFor="manual-card-number-app">Card number</label>
        <input
          id="manual-card-number-app"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="XXXX XXXX XXXX XXXX"
          value={number}
          onChange={e => setNumber(formatCardNumber(e.target.value))}
          className={`${APP_INPUT} tracking-wider`}
          style={APP_INPUT_STYLE}
        />
      </div>
      <div className="flex gap-2.5">
        <div className="flex-1">
          <label className={APP_LABEL} style={{ color: 'var(--slate)' }} htmlFor="manual-card-expiry-app">Expiration</label>
          <input
            id="manual-card-expiry-app"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="MM/YY"
            maxLength={5}
            value={expiry}
            onChange={e => setExpiry(formatExpiry(e.target.value))}
            className={APP_INPUT}
            style={APP_INPUT_STYLE}
          />
        </div>
        <div className="flex-1">
          <label className={APP_LABEL} style={{ color: 'var(--slate)' }} htmlFor="manual-card-cvv-app">CVV</label>
          <input
            id="manual-card-cvv-app"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="123"
            maxLength={4}
            value={cvv}
            onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className={APP_INPUT}
            style={APP_INPUT_STYLE}
          />
        </div>
      </div>
      <div className="flex items-start gap-2" style={{ color: 'var(--slate)' }}>
        <Lock size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs leading-relaxed">{REASSURANCE}</p>
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-2xl text-sm font-semibold"
            style={{ color: 'var(--navy)', border: '1px solid var(--line)', background: 'var(--white)' }}
          >Cancel</button>
        )}
        <motion.button
          type="button"
          whileTap={ready ? { scale: 0.98 } : {}}
          onClick={handleConnect}
          aria-disabled={!ready ? 'true' : undefined}
          aria-busy={connecting ? 'true' : undefined}
          className="flex-1 min-h-[44px] rounded-2xl text-sm font-semibold"
          style={{
            background: ready ? 'var(--grad-primary)' : 'var(--disabled-bg)',
            color: ready ? 'var(--white)' : 'var(--disabled-text)',
            cursor: ready ? 'pointer' : 'not-allowed',
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

// Copy shared by both variants. Honest about what this form is: a demo entry
// that keeps the last 4 digits and nothing else. (The old line claimed Plaid
// encryption for a form that never talks to Plaid.)
const REASSURANCE = 'Demo only - we keep just the last 4 digits. Real accounts link a card through Plaid.';

// Portal ink from lib/webTheme.js (presentational constants only, no page
// bundle). `subtle` is the helper-text value that clears 4.5:1 on white;
// `muted` is decorative only.
const WEB_INK = INK;

const WEB_LABEL = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: WEB_INK.subtle,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

// Inputs per DESIGN.md: 44px on the web, 48px on the phone, 16px text (stops
// iOS zooming on focus), radius 12, 1px --line. Focus ring is the global
// input:focus-visible rule in index.css.
const WEB_INPUT = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
  padding: '10px 12px', fontSize: 16, fontFamily: 'ui-monospace, monospace', outline: 'none', background: 'var(--white)', color: WEB_INK.primary,
};
const APP_LABEL = 'text-xs font-semibold mb-1 block';
const APP_INPUT = 'w-full rounded-xl px-3 min-h-12 text-base outline-none font-mono';
const APP_INPUT_STYLE = { border: '1px solid var(--line)', background: 'var(--white)', color: 'var(--ink)' };

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
