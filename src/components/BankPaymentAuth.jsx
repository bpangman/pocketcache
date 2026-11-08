// Bank-account PAYMENT authorization (round-3 item 2), shared by both signup
// surfaces the way PlaidBankConnect/StripeCardForm are: one component, a
// `variant` prop for visual language only.
//
// WHY THIS EXISTS
// Picking "Bank account" as the payment method used to just select the radio
// - no bank chosen, nothing authorized. That conflated the two bank
// relationships in this product:
//
//   TRACKING (the earlier Plaid step) - read-only, watches purchases for
//   round-ups, never charged.
//   PAYING (this component) - the account the monthly charge actually debits.
//   Choosing it requires a SOURCE and an explicit authorization.
//
// If the donor already linked a REAL bank account for tracking (a Plaid
// depository account - see isDebitableBank in lib/plaid.js), they can
// authorize that same account in one explicit confirm step ("Use your linked
// {institution} account"). A tracked CARD, a practice-mode bank or a typed-in
// demo card is not something a debit can come from, so in those cases - and
// when nothing is linked at all - the donor connects a bank here through the
// real Plaid sandbox Link, clearly framed as authorizing payments, before the
// option counts as set.
//
// SANDBOX-HONEST: the Plaid Link flow is the real sandbox Link; the
// authorization itself is simulated (no mandate is filed anywhere).
// PRODUCTION NOTE: real ACH debits will be authorized through STRIPE
// FINANCIAL CONNECTIONS (bank-account SetupIntent + mandate), per the launch
// checklist in PRELAUNCH.md - Plaid here stays the tracking rail only.

import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { CheckCircle, Landmark } from 'lucide-react';
import PlaidBankConnect from './PlaidBankConnect';
import { isDebitableBank } from '../lib/plaid';

// Teal wash + line for the "authorized" states; helper text sits on --slate so
// it clears 4.5:1 on white.
const TEAL_WASH = { background: 'var(--teal-50)', border: '1px solid var(--teal-200)' };
const BACK_WEB = {
  width: '100%', marginTop: 4, minHeight: 44, padding: '0 12px', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: 14, color: 'var(--slate)', fontWeight: 600, borderRadius: 'var(--r-sm)',
};
const BACK_APP = 'w-full text-center min-h-[44px] text-sm font-semibold';

/**
 * @param {object}   props
 * @param {'app'|'web'} [props.variant='app']
 * @param {?object}  props.linkedBank  The tracking connection, if one exists:
 *                                     { name, last4, institution, source,
 *                                     accountType }. Offered as the one-tap
 *                                     source only when it is a real Plaid
 *                                     depository account.
 * @param {?object}  props.authorized  The already-authorized source, or null.
 * @param {Function} props.onAuthorized Called with { institution, name, last4 }
 *                                     once a source is explicitly authorized.
 * @param {Function} [props.onClear]   Donor wants to pick a different source.
 */
export default function BankPaymentAuth({ variant = 'app', linkedBank, authorized, onAuthorized, onClear }) {
  // 'offer' -> 'confirm-linked' (explicit confirm for the linked bank), or
  // 'connect' (Plaid Link for a new bank).
  const [mode, setMode] = useState('offer');
  const web = variant === 'web';
  // Null-safe: a tracked card / practice bank / nothing at all never reaches
  // the "use your linked account" branches below.
  const canUseLinked = !!linkedBank && isDebitableBank(linkedBank);

  if (authorized) {
    if (web) {
      return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', ...TEAL_WASH, borderRadius: 'var(--r-md)', padding: 14, marginBottom: 14 }} data-testid="bank-auth-done">
          <CheckCircle size={20} style={{ color: 'var(--teal-ui)' }} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--teal-900)' }}>
              {authorized.institution} ····{authorized.last4} authorized
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--teal-700)' }}>Your monthly round-up charge debits this account.</p>
          </div>
          <button
            onClick={() => { setMode('offer'); onClear?.(); }}
            style={{ border: '1px solid var(--teal-200)', background: 'var(--white)', borderRadius: 'var(--r-xs)', minHeight: 44, padding: '0 12px', fontSize: 13, fontWeight: 700, color: 'var(--teal-700)', cursor: 'pointer', flexShrink: 0 }}
          >Change</button>
        </div>
      );
    }
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3" style={TEAL_WASH} data-testid="bank-auth-done">
        <CheckCircle size={22} className="shrink-0" style={{ color: 'var(--teal-ui)' }} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: 'var(--teal-900)' }}>{authorized.institution} ····{authorized.last4} authorized</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--teal-700)' }}>Your monthly round-up charge debits this account.</p>
        </div>
        <button
          onClick={() => { setMode('offer'); onClear?.(); }}
          className="shrink-0 px-3 min-h-[44px] rounded-lg text-xs font-bold"
          style={{ border: '1px solid var(--teal-200)', background: 'var(--white)', color: 'var(--teal-700)' }}
        >Change</button>
      </div>
    );
  }

  const intro = web ? (
    <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>
      Paying by bank means one monthly debit from an account you authorize here.
      This is separate from the card we <em>track</em> - that one is read-only and never charged.
    </p>
  ) : (
    <p className="text-xs leading-relaxed mb-2 px-1" style={{ color: 'var(--slate)' }}>
      Paying by bank means one monthly debit from an account you authorize here.
      This is separate from the card we <em>track</em> - that one is read-only and never charged.
    </p>
  );

  // Explicit confirm step for the linked tracking bank.
  if (mode === 'confirm-linked' && canUseLinked) {
    const confirmBody = (
      <>
        <p style={web
          ? { margin: '0 0 10px', fontSize: 14, color: 'var(--ink)', fontWeight: 600 }
          : undefined}
          className={web ? undefined : 'text-gray-900 text-sm font-semibold mb-2 px-1'}>
          Authorize {linkedBank.institution ?? linkedBank.name} ····{linkedBank.last4} for your monthly charge?
        </p>
        <p style={web
          ? { margin: '0 0 12px', fontSize: 13, lineHeight: 1.55, color: 'var(--slate)' }
          : { color: 'var(--slate)' }}
          className={web ? undefined : 'text-xs leading-relaxed mb-3 px-1'}>
          One debit a month, on the 11th, for the round-ups you reviewed - nothing else, and nothing today. Sandbox demo: no real mandate is filed.
        </p>
      </>
    );
    const authorize = () => onAuthorized?.({
      institution: linkedBank.institution ?? linkedBank.name,
      name: linkedBank.name,
      last4: linkedBank.last4,
    });
    if (web) {
      return (
        <div style={{ border: '1px solid var(--teal-200)', borderRadius: 'var(--r-md)', padding: 16, marginBottom: 14 }} data-testid="bank-auth-confirm">
          {confirmBody}
          <button
            onClick={authorize}
            data-testid="bank-auth-authorize"
            className="pc-btn"
            style={{ width: '100%', minHeight: 44, padding: '0 16px', borderRadius: 'var(--r-pill)', border: 'none', cursor: 'pointer', background: 'var(--grad-primary)', color: 'var(--white)', fontWeight: 600, fontSize: 15 }}
          >
            Authorize this account
          </button>
          <button onClick={() => setMode('offer')} style={BACK_WEB}>
            ← Back
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-2xl p-4" style={{ background: 'var(--white)', border: '1px solid var(--teal-200)' }} data-testid="bank-auth-confirm">
        {confirmBody}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={authorize}
          data-testid="bank-auth-authorize"
          className="w-full min-h-[52px] rounded-2xl text-white font-semibold text-base"
          style={{ background: 'var(--grad-primary)' }}
        >
          Authorize this account
        </motion.button>
        <button onClick={() => setMode('offer')} className={BACK_APP} style={{ color: 'var(--slate)' }}>
          ← Back
        </button>
      </div>
    );
  }

  // Connect a (different) bank through the real Plaid sandbox Link, framed
  // as payment authorization. onConnected treats the connection as the
  // explicit authorization: Plaid Link's own flow IS the confirm gesture.
  // This is also the ONLY path when the tracked source cannot be debited.
  if (mode === 'connect' || !canUseLinked) {
    return (
      <div data-testid="bank-auth-connect">
        {intro}
        <PlaidBankConnect
          variant={variant}
          onConnected={bank => onAuthorized?.({
            institution: bank.institution ?? bank.name,
            name: bank.name,
            last4: bank.last4,
          })}
        />
        {canUseLinked && (
          web ? (
            <button onClick={() => setMode('offer')} style={BACK_WEB}>
              ← Back
            </button>
          ) : (
            <button onClick={() => setMode('offer')} className={BACK_APP} style={{ color: 'var(--slate)' }}>
              ← Back
            </button>
          )
        )}
      </div>
    );
  }

  // Offer: the linked tracking bank as the one-tap source, or connect another.
  const offerLinkedLabel = (
    <>Use your linked {linkedBank.institution ?? linkedBank.name} account ····{linkedBank.last4}</>
  );
  if (web) {
    return (
      <div style={{ marginBottom: 14 }} data-testid="bank-auth-offer">
        {intro}
        <button
          onClick={() => setMode('confirm-linked')}
          data-testid="bank-auth-use-linked"
          className="pc-btn"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '12px 14px', borderRadius: 'var(--r-md)',
            ...TEAL_WASH, cursor: 'pointer', textAlign: 'left',
            fontWeight: 700, fontSize: 14, color: 'var(--ink)',
          }}
        >
          <Landmark size={16} style={{ color: 'var(--teal-ui)' }} aria-hidden="true" /> {offerLinkedLabel}
        </button>
        <button
          onClick={() => setMode('connect')}
          data-testid="bank-auth-connect-other"
          style={BACK_WEB}
        >
          Pay from a different bank account →
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="bank-auth-offer">
      {intro}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setMode('confirm-linked')}
        data-testid="bank-auth-use-linked"
        className="w-full flex items-center gap-3 p-4 rounded-2xl text-left"
        style={TEAL_WASH}
      >
        <Landmark size={18} className="shrink-0" style={{ color: 'var(--teal-ui)' }} aria-hidden="true" />
        <span className="flex-1 font-bold text-sm text-ink">{offerLinkedLabel}</span>
      </motion.button>
      <button
        onClick={() => setMode('connect')}
        data-testid="bank-auth-connect-other"
        className={BACK_APP}
        style={{ color: 'var(--slate)' }}
      >
        Pay from a different bank account →
      </button>
    </div>
  );
}
