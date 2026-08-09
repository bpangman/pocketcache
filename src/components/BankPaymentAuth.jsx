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
// If the donor already linked a bank for tracking, they can authorize that
// same account in one explicit confirm step ("Use your linked {institution}
// account"); otherwise they connect one here through the real Plaid sandbox
// Link, clearly framed as authorizing payments, before the option counts as
// set.
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

/**
 * @param {object}   props
 * @param {'app'|'web'} [props.variant='app']
 * @param {?object}  props.linkedBank  The tracking connection, if one exists:
 *                                     { name, last4, institution } - offered
 *                                     as the one-tap source.
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

  const ink = { primary: web ? '#0f172a' : undefined, muted: web ? '#94a3b8' : undefined };

  if (authorized) {
    if (web) {
      return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 14, padding: 14, marginBottom: 14 }} data-testid="bank-auth-done">
          <CheckCircle size={20} color="#0D9488" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: '#134e4a' }}>
              {authorized.institution} ····{authorized.last4} authorized
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>Your monthly round-up charge debits this account.</p>
          </div>
          <button
            onClick={() => { setMode('offer'); onClear?.(); }}
            style={{ border: '1px solid #99f6e4', background: '#fff', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#0f766e', cursor: 'pointer', flexShrink: 0 }}
          >Change</button>
        </div>
      );
    }
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#f0fdfa', border: '1px solid #99f6e4' }} data-testid="bank-auth-done">
        <CheckCircle size={22} className="shrink-0" style={{ color: '#0D9488' }} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: '#134e4a' }}>{authorized.institution} ····{authorized.last4} authorized</p>
          <p className="text-xs mt-0.5" style={{ color: '#0f766e' }}>Your monthly round-up charge debits this account.</p>
        </div>
        <button
          onClick={() => { setMode('offer'); onClear?.(); }}
          className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ border: '1px solid #99f6e4', background: '#fff', color: '#0f766e' }}
        >Change</button>
      </div>
    );
  }

  const intro = web ? (
    <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.55, color: '#475569' }}>
      Paying by bank means one monthly debit from an account you authorize here.
      This is separate from the card we <em>track</em>  -  that one is read-only and never charged.
    </p>
  ) : (
    <p className="text-gray-500 text-xs leading-relaxed mb-2 px-1">
      Paying by bank means one monthly debit from an account you authorize here.
      This is separate from the card we <em>track</em>  -  that one is read-only and never charged.
    </p>
  );

  // Explicit confirm step for the linked tracking bank.
  if (mode === 'confirm-linked' && linkedBank) {
    const confirmBody = (
      <>
        <p style={web
          ? { margin: '0 0 10px', fontSize: 13, color: '#0f172a', fontWeight: 600 }
          : undefined}
          className={web ? undefined : 'text-gray-900 text-sm font-semibold mb-2 px-1'}>
          Authorize {linkedBank.institution ?? linkedBank.name} ····{linkedBank.last4} for your monthly charge?
        </p>
        <p style={web
          ? { margin: '0 0 12px', fontSize: 12, lineHeight: 1.55, color: '#64748b' }
          : undefined}
          className={web ? undefined : 'text-gray-400 text-xs leading-relaxed mb-3 px-1'}>
          One debit a month, on the 11th, for the round-ups you reviewed  -  nothing else, and nothing today. Sandbox demo: no real mandate is filed.
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
        <div style={{ border: '1.5px solid #99f6e4', borderRadius: 14, padding: 16, marginBottom: 14 }} data-testid="bank-auth-confirm">
          {confirmBody}
          <button
            onClick={authorize}
            data-testid="bank-auth-authorize"
            style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #0d9488, #003865)', color: '#fff', fontWeight: 700, fontSize: 14 }}
          >
            Authorize this account
          </button>
          <button
            onClick={() => setMode('offer')}
            style={{ width: '100%', marginTop: 8, padding: '8px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}
          >
            ← Back
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1.5px solid #99f6e4' }} data-testid="bank-auth-confirm">
        {confirmBody}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={authorize}
          data-testid="bank-auth-authorize"
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm"
          style={{ background: 'linear-gradient(135deg, #0d9488, #003865)' }}
        >
          Authorize this account
        </motion.button>
        <button onClick={() => setMode('offer')} className="w-full text-center py-2 text-xs text-gray-400 font-semibold">
          ← Back
        </button>
      </div>
    );
  }

  // Connect a (different) bank through the real Plaid sandbox Link, framed
  // as payment authorization. onConnected treats the connection as the
  // explicit authorization: Plaid Link's own flow IS the confirm gesture.
  if (mode === 'connect' || !linkedBank) {
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
        {linkedBank && (
          web ? (
            <button
              onClick={() => setMode('offer')}
              style={{ width: '100%', marginTop: 8, padding: '8px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}
            >
              ← Back
            </button>
          ) : (
            <button onClick={() => setMode('offer')} className="w-full text-center py-2 text-xs text-gray-400 font-semibold">
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
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 14,
            border: '1.5px solid #99f6e4', background: '#f0fdfa', cursor: 'pointer', textAlign: 'left',
            fontWeight: 700, fontSize: 13.5, color: ink.primary,
          }}
        >
          <Landmark size={16} color="#0d9488" /> {offerLinkedLabel}
        </button>
        <button
          onClick={() => setMode('connect')}
          data-testid="bank-auth-connect-other"
          style={{ width: '100%', marginTop: 8, padding: '10px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: ink.muted, fontWeight: 600 }}
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
        whileTap={{ scale: 0.97 }}
        onClick={() => setMode('confirm-linked')}
        data-testid="bank-auth-use-linked"
        className="w-full flex items-center gap-3 p-4 rounded-2xl text-left"
        style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}
      >
        <Landmark size={18} className="shrink-0" style={{ color: '#0d9488' }} />
        <span className="flex-1 font-bold text-sm text-gray-900">{offerLinkedLabel}</span>
      </motion.button>
      <button
        onClick={() => setMode('connect')}
        data-testid="bank-auth-connect-other"
        className="w-full text-center py-2 text-xs text-gray-400 font-semibold"
      >
        Pay from a different bank account →
      </button>
    </div>
  );
}
