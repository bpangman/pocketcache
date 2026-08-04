import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Lock } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { STRIPE_PUBLISHABLE_KEY } from '../lib/stripeKey';
import { saveCardWithSetupIntent, currentDonorEmail, prettyBrand } from '../lib/stripeSetup';

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
 * STRIPE INITIALISATION IS DELIBERATELY THE SAME ONE-LINER THE APP ALREADY USES
 * (Onboarding.jsx and Settings.jsx are byte-identical):
 *   loadStripe(STRIPE_PUBLISHABLE_KEY)   // src/lib/stripeKey.js
 * Do NOT add a second initialisation pattern. When the two app screens adopt
 * this component they should delete their local `stripePromise`,
 * CARD_ELEMENT_OPTIONS and CARD_BRANDS and import this instead - the component
 * mounts its own <Elements> provider, so an adopting screen only has to render
 * <StripeCardForm variant="app" onSuccess={...} /> where its <form> used to be.
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
  return (
    <Elements stripe={stripePromise}>
      <CardFields {...props} />
    </Elements>
  );
}

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Byte-identical to Onboarding.jsx:1302 and Settings.jsx:23.
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#111827',
      fontFamily: '"Inter", system-ui, sans-serif',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#ef4444' },
  },
  hidePostalCode: false,
};

// Fallback-only. Stripe tells us the real brand when it answers.
const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex', 'Discover'];

const WEB_INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';

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
  const element = elements.getElement(CardElement);
  if (!element) return { error: 'Card details are not ready yet  -  try again.' };

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
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [practice, setPractice] = useState(false);

  const ready = cardComplete && !loading && !!stripe;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements || !ready) return;
    setLoading(true);
    setError(null);
    const result = await saveCard(stripe, elements);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    if (result.practice) {
      // Let the donor see the practice-mode note for a beat before advancing.
      setPractice(true);
      await new Promise(r => setTimeout(r, 1400));
    }
    onSuccess?.(result.card);
  }

  const practiceNote = practice
    ? 'Practice mode  -  we could not reach the real card service right now, so this step is simulated.'
    : null;

  const reassurance = (
    <>Card details secured by <span style={{ fontWeight: 700 }}>Stripe</span>. {appName} never sees your card number.</>
  );

  if (variant === 'web') {
    return (
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }} data-testid="stripe-card-form">
        <div style={{ background: '#fff', border: `1.5px solid ${error ? '#ef4444' : '#e5e7eb'}`, borderRadius: 12, padding: '14px 14px 12px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: WEB_INK.muted }}>
            Card details
          </p>
          <CardElement
            options={CARD_ELEMENT_OPTIONS}
            onChange={ev => { setCardComplete(ev.complete); setError(ev.error?.message ?? null); }}
          />
        </div>
        {error && <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{error}</p>}
        {practiceNote && (
          <p style={{ margin: 0, fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 10px' }}>
            {practiceNote}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 11.5, color: WEB_INK.muted, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.5 }}>
          <Lock size={12} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{reassurance}</span>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button
              type="button" onClick={onCancel}
              style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: WEB_INK.secondary }}
            >Cancel</button>
          )}
          <button
            type="submit" disabled={!ready}
            style={{
              flex: 2, padding: '11px 0', borderRadius: 12, border: 'none', cursor: ready ? 'pointer' : 'default',
              background: ready ? `linear-gradient(135deg, ${NAVY}, #001a33)` : '#d1d5db',
              color: '#fff', fontSize: 13.5, fontWeight: 700,
            }}
          >{loading ? loadingLabel : submitLabel}</button>
        </div>
      </form>
    );
  }

  // variant "app" - the Onboarding / Settings visual, Tailwind classes verbatim.
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl px-4 py-4 border" style={{ borderColor: error ? '#ef4444' : '#e5e7eb' }}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Card details</p>
        <CardElement
          options={CARD_ELEMENT_OPTIONS}
          onChange={ev => { setCardComplete(ev.complete); setError(ev.error?.message ?? null); }}
        />
      </div>

      {error && <p className="text-red-500 text-xs px-1">{error}</p>}
      {practiceNote && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a' }}>
          {practiceNote}
        </p>
      )}

      <div className="flex items-center gap-2 px-1">
        <Lock size={13} className="text-gray-400 shrink-0" />
        <p className="text-gray-400 text-xs">{reassurance}</p>
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-4 rounded-2xl text-sm font-semibold text-gray-500 border border-gray-200">
            Cancel
          </button>
        )}
        <motion.button
          type="submit"
          whileTap={ready ? { scale: 0.97 } : {}}
          disabled={!ready}
          className="flex-1 py-4 rounded-2xl text-white font-bold text-base"
          style={{
            background: ready ? (brand?.gradient ?? `linear-gradient(135deg, ${NAVY}, #001a33)`) : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          {loading ? loadingLabel : submitLabel}
        </motion.button>
      </div>
    </form>
  );
}
