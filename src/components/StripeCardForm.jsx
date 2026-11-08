import { useEffect, useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Lock } from 'lucide-react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripePromise, saveCardWithSetupIntent, currentDonorEmail, prettyBrand } from '../lib/stripeSetup';
import { INK, DANGER } from '../lib/webTheme';

/**
 * StripeCardForm - the ONE "Credit or Debit Card" capture form, surface-aware.
 *
 * WHY THIS EXISTS
 * Real card details were only ever collected on the app surface:
 *   src/pages/Onboarding.jsx  CardEntryForm / CardEntryScreen  (~1316-1432)
 *   src/pages/Settings.jsx    AddCardForm / AddCardSheet       (~164-227)
 * The web portal had no Stripe form at all - WebPortalPages.jsx's
 * ChangePaymentModal invented a last4 with Math.random() for every option
 * (including `card`), and WebOnboarding always stored `last4: null`. Same
 * account, two portals, two completely different levels of honesty about what
 * had been collected. This component is the single form both surfaces use.
 *
 * STRIPE INITIALISATION GOES THROUGH ONE SHARED LOADER
 *   getStripePromise()   // src/lib/stripeSetup.js
 * It is lazy (Stripe.js is only fetched once a card form mounts, never at
 * import time on pages that have no card step) and it never rejects - when
 * js.stripe.com is unreachable it resolves to null and this form shows its
 * practice-mode note instead of the page throwing an unhandled "Failed to
 * load Stripe.js" rejection. Do NOT call loadStripe() anywhere else. When an
 * app screen adopts this component it should delete its local
 * `stripePromise`, CARD_ELEMENT_OPTIONS and CARD_BRANDS and import this
 * instead - the component mounts its own <Elements> provider, so an adopting
 * screen only has to render <StripeCardForm variant="app" onSuccess={...} />
 * where its <form> used to be.
 *
 * WHAT onSuccess RECEIVES
 *   { id, last4, brand, name, simulated }
 * A superset of what the two app call sites already consume - Onboarding reads
 * `last4`, Settings reads `{ id, last4, brand, name }` - so neither needs to
 * change shape to adopt this.
 *
 * `last4` and `brand` are verified SERVER-SIDE by the stripe-setup-complete
 * edge function after a real SetupIntent save (see lib/stripeSetup.js), which
 * is the point of this file: nobody downstream should ever fabricate a last4
 * again. If our backend or Stripe cannot answer at all the form falls back to
 * the prototype's simulated save, flags it with `simulated: true`, and shows
 * the donor a practice-mode note (same pattern as the Plaid bank fallback).
 * Genuine card problems (declines, bad numbers) are shown to the donor
 * instead of being swallowed by the fallback.
 *
 * @param {object}   props
 * @param {'app'|'web'} [props.variant='app']  Visual language only. Payload is
 *                                             identical on both surfaces.
 * @param {Function} props.onSuccess           Called with the card object.
 * @param {Function} [props.onCancel]          Renders a Cancel button. Hidden if absent.
 * @param {string}   [props.submitLabel='Add Card']
 * @param {string}   [props.loadingLabel='Saving card securely…']
 * @param {string}   [props.appName='PocketCache']  Used in the reassurance line.
 * @param {object}   [props.brand]             App-surface gradient (useTheme()).
 */
export default function StripeCardForm(props) {
  // One promise per mount: <Elements> must not see its `stripe` prop change,
  // and the shared loader forgets a failed attempt so a remount retries.
  const [stripeLoad] = useState(() => getStripePromise());
  // true once the loader settled without a Stripe instance (script
  // unreachable), or has not settled within STRIPE_LOAD_TIMEOUT_MS: the
  // stripe-js loader can hang forever when it finds a script tag another
  // entry injected that already failed. CardFields drops back to the real
  // form the moment useStripe() does hand over an instance.
  const [stripeUnavailable, setStripeUnavailable] = useState(false);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => { if (alive) setStripeUnavailable(true); }, STRIPE_LOAD_TIMEOUT_MS);
    stripeLoad.then(stripe => {
      if (!alive) return;
      clearTimeout(timer);
      if (!stripe) setStripeUnavailable(true);
    });
    return () => { alive = false; clearTimeout(timer); };
  }, [stripeLoad]);
  return (
    <Elements stripe={stripeLoad}>
      <CardFields {...props} stripeUnavailable={stripeUnavailable} />
    </Elements>
  );
}

// How long a mounted form waits for Stripe.js before offering practice mode.
const STRIPE_LOAD_TIMEOUT_MS = 8000;

// Stripe draws the CardElement inside its own iframe, so CSS variables cannot
// reach it: the colors are the JS mirrors of --ink / --muted / --danger from
// lib/webTheme. Same options as the card forms in Onboarding.jsx and Settings.jsx.
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: INK.primary,
      fontFamily: '"Inter", system-ui, sans-serif',
      '::placeholder': { color: INK.muted },
    },
    invalid: { color: DANGER },
  },
  hidePostalCode: false,
};

// Fallback-only. Stripe tells us the real brand when it answers.
const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Discover'];

/**
 * Save whatever is in the CardElement for real: SetupIntent from our
 * stripe-setup-intent edge function, confirmCardSetup in the browser (the
 * card number goes donor -> Stripe directly), then stripe-setup-complete
 * verifies server-side and hands back the true brand/last4.
 *
 * @returns {Promise<{card?: object, error?: string, practice?: boolean}>}
 *   card.simulated / practice are true only when our backend or Stripe was
 *   unreachable and the save fell back to the prototype's simulated path.
 */
async function saveCard(stripe, elements) {
  // stripe/elements are null when Stripe.js itself could not load - go
  // straight to the simulated save below (the form already told the donor).
  if (stripe && elements) {
    const element = elements.getElement(CardElement);
    if (!element) return { error: 'Card details are not ready yet - try again.' };

    try {
      const email = await currentDonorEmail();
      const result = await saveCardWithSetupIntent(stripe, element, email);
      if (result.error) return { error: result.error }; // decline / bad number - donor retries
      const brand = prettyBrand(result.card.brand);
      return { card: { ...result.card, brand, name: `My ${brand}` } };
    } catch {
      // Backend or Stripe unreachable BEFORE the card was involved. Fall back to
      // the prototype's simulated save so signup never dead-ends - flagged
      // simulated, and shown to the donor as practice mode (same pattern as the
      // Plaid bank-connect fallback).
    }
  }

  await new Promise(r => setTimeout(r, 1200));
  const brand = CARD_BRANDS[Math.floor(Math.random() * CARD_BRANDS.length)];
  return {
    practice: true,
    card: {
      id: Date.now(),
      last4: String(Math.floor(1000 + Math.random() * 9000)),
      brand,
      name: `My ${brand}`,
      simulated: true,
    },
  };
}

function CardFields({
  variant = 'app',
  onSuccess,
  onCancel,
  submitLabel = 'Add Card',
  loadingLabel = 'Saving card securely…',
  appName = 'PocketCache',
  brand,
  stripeUnavailable: stripeUnavailableProp = false,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [practice, setPractice] = useState(false);

  // Practice mode only while Stripe.js is genuinely missing: a late load
  // brings the real CardElement back.
  const stripeUnavailable = stripeUnavailableProp && !stripe;
  // With Stripe.js unreachable there is no CardElement to complete, so the
  // button is live right away and the save runs the simulated path.
  const ready = !loading && (stripeUnavailable || (cardComplete && !!stripe));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ready) return;
    if (!stripeUnavailable && (!stripe || !elements)) return;
    setLoading(true);
    setError(null);
    const result = await saveCard(stripeUnavailable ? null : stripe, stripeUnavailable ? null : elements);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    if (result.practice) {
      // Let the donor see the practice-mode note for a beat before advancing.
      setPractice(true);
      await new Promise(r => setTimeout(r, 1400));
    }
    onSuccess?.(result.card);
  }

  const practiceNote = (practice || stripeUnavailable)
    ? 'Practice mode - we could not reach the real card service right now, so this step is simulated.'
    : null;

  const reassurance = (
    <>Card details secured by <span style={{ fontWeight: 700 }}>Stripe</span>. {appName} never sees your card number.</>
  );

  if (variant === 'web') {
    return (
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }} data-testid="stripe-card-form">
        {!stripeUnavailable && (
          <div style={{ background: 'var(--white)', border: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}`, borderRadius: 12, padding: '14px 14px 12px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--slate)' }}>
              Card details
            </p>
            <CardElement
              options={CARD_ELEMENT_OPTIONS}
              onChange={ev => { setCardComplete(ev.complete); setError(ev.error?.message ?? null); }}
            />
          </div>
        )}
        {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>}
        {practiceNote && (
          <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 12, padding: '8px 10px' }}>
            {practiceNote}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.5 }}>
          <Lock size={12} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <span>{reassurance}</span>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button
              type="button" onClick={onCancel}
              className="pc-btn"
              style={{ flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--white)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}
            >Cancel</button>
          )}
          <button
            type="submit" disabled={!ready}
            aria-busy={loading ? 'true' : undefined}
            className="pc-btn"
            style={{
              flex: 2, minHeight: 44, padding: '0 16px', borderRadius: 999, border: 'none', cursor: ready ? 'pointer' : 'not-allowed',
              background: ready ? 'var(--grad-primary)' : 'var(--disabled-bg)',
              color: ready ? 'var(--white)' : 'var(--disabled-text)', fontSize: 14, fontWeight: 600,
            }}
          >{loading ? loadingLabel : submitLabel}</button>
        </div>
      </form>
    );
  }

  // variant "app" - the Onboarding / Settings visual, Tailwind classes verbatim.
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!stripeUnavailable && (
        <div className="bg-white rounded-2xl px-4 py-4 border" style={{ borderColor: error ? 'var(--danger)' : 'var(--line)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--slate)' }}>Card details</p>
          <CardElement
            options={CARD_ELEMENT_OPTIONS}
            onChange={ev => { setCardComplete(ev.complete); setError(ev.error?.message ?? null); }}
          />
        </div>
      )}

      {error && <p role="alert" className="text-xs px-1" style={{ color: 'var(--danger)' }}>{error}</p>}
      {practiceNote && (
        <p role="status" className="text-xs rounded-xl px-3 py-2" style={{ color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)' }}>
          {practiceNote}
        </p>
      )}

      <div className="flex items-start gap-2 px-1" style={{ color: 'var(--slate)' }}>
        <Lock size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs leading-relaxed">{reassurance}</p>
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 min-h-[52px] rounded-2xl text-base font-semibold" style={{ color: 'var(--navy)', border: '1px solid var(--line)', background: 'var(--white)' }}>
            Cancel
          </button>
        )}
        <motion.button
          type="submit"
          whileTap={ready ? { scale: 0.98 } : {}}
          disabled={!ready}
          aria-busy={loading ? 'true' : undefined}
          className="flex-1 min-h-[52px] rounded-2xl font-semibold text-base"
          style={{
            background: ready ? (brand?.gradient ?? 'var(--grad-primary)') : 'var(--disabled-bg)',
            color: ready ? 'var(--white)' : 'var(--disabled-text)',
            cursor: ready ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? loadingLabel : submitLabel}
        </motion.button>
      </div>
    </form>
  );
}
