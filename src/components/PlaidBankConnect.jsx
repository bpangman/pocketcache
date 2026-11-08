import { useEffect, useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { ArrowRight, Landmark, Loader2 } from 'lucide-react';
import { fetchPlaidLinkToken, loadPlaidLinkScript, openPlaidLinkWithToken } from '../lib/plaid';
import { BANKS } from '../pages/Onboarding';
import { useShowDemoAffordances } from '../lib/demo';
import { useApp } from '../store/AppContext';

/**
 * PlaidBankConnect - real Plaid Link (sandbox) for the donor "which card
 * should we track" step. Shared by both signup surfaces (Onboarding.jsx's
 * ConnectCardScreen and WebOnboarding.jsx's card step) the same way
 * StripeCardForm.jsx is shared for card capture: one component, a `variant`
 * prop for visual language only, identical behaviour underneath.
 *
 * WHAT IT REPLACES
 * The old flow let a donor pick from four hardcoded bank tiles and faked a
 * 1.1-1.2s "Connecting..." timer before making up a random last4. This opens
 * Plaid's real hosted bank-search Link flow in sandbox mode - the donor picks
 * their real bank from Plaid's own 12,000+ institution list and, in sandbox,
 * signs in with Plaid's test credentials.
 *
 * PHASES
 *   idle       - one "Connect your bank" button, plus the sandbox test hint.
 *   connecting - button shows a spinner while the link token loads and Plaid
 *                Link opens.
 *   error      - Plaid Link opened but closed with an error, or the donor's
 *                sandbox attempt failed - friendly message, Try again button.
 *   fallback   - the link-token request itself could not be reached (offline,
 *                function down). Falls back to the old simulated bank list so
 *                signup never breaks, clearly labeled "Practice mode" so it
 *                is never mistaken for a real connection.
 *
 * @param {object}   props
 * @param {'app'|'web'} [props.variant='app']
 * @param {boolean}  [props.showDemo]   Show the sandbox test-credential hint. Defaults to
 *                                     lib/demo's useShowDemoAffordances(demoMode), so
 *                                     real donors never see "user_good / pass_good".
 * @param {Function} props.onConnected  Called once with { name, last4, brand, institution,
 *                                     source, accountType, accountSubtype } from the real
 *                                     Plaid flow, or { name, last4, brand, institution,
 *                                     source: 'practice' } from the practice-mode list.
 *                                     `source` lets BankPaymentAuth tell a real depository
 *                                     account from a simulated one (lib/plaid.js isDebitableBank).
 */
export default function PlaidBankConnect({ variant = 'app', onConnected, showDemo }) {
  const [phase, setPhase] = useState('idle'); // 'idle' | 'connecting' | 'error' | 'fallback'
  // Rendered inside AppProvider everywhere today; the optional chain keeps a
  // bare mount (tests, harnesses) from throwing.
  const demoMode = useApp()?.demoMode;
  const showTestHint = useShowDemoAffordances(showDemo || demoMode);
  const [fallbackConnecting, setFallbackConnecting] = useState(null);

  // Load Plaid's Link script as soon as this step mounts, not on click - so
  // the real flow opens instantly the moment the donor taps Connect.
  useEffect(() => {
    loadPlaidLinkScript().catch(() => {
      // Quiet - a failed preload just means the click handler's own fetch
      // (which also needs the network) will surface the fallback path.
    });
  }, []);

  async function handleConnect() {
    setPhase('connecting');
    let linkToken;
    try {
      linkToken = await fetchPlaidLinkToken();
    } catch {
      setPhase('fallback');
      return;
    }
    try {
      const card = await openPlaidLinkWithToken(linkToken);
      setPhase('idle');
      onConnected?.(card);
    } catch (err) {
      if (err?.message === 'cancelled') {
        setPhase('idle'); // donor just closed the window - let them try again quietly
      } else {
        setPhase('error');
      }
    }
  }

  function handleFallbackSelect(bank) {
    if (fallbackConnecting) return;
    setFallbackConnecting(bank.id);
    setTimeout(() => {
      const last4 = String(Math.floor(1000 + Math.random() * 9000));
      setFallbackConnecting(null);
      // Tagged 'practice' so no downstream step mistakes it for a real,
      // debitable Plaid connection.
      onConnected?.({ name: bank.name, last4, brand: bank.name, institution: bank.name, source: 'practice' });
    }, 1100);
  }

  if (variant === 'web') {
    return (
      <div>
        {phase === 'fallback' ? (
          <>
            <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 'var(--r-sm)', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', fontSize: 13, color: 'var(--warning-800)', fontWeight: 600 }}>
              Practice mode - we could not reach the real bank connection right now, so this step is simulated.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
              {BANKS.map(bank => (
                <button key={bank.id} type="button" onClick={() => handleFallbackSelect(bank)}
                  aria-busy={fallbackConnecting === bank.id ? 'true' : undefined}
                  className="pc-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '12px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--white)', cursor: 'pointer', textAlign: 'left', opacity: fallbackConnecting && fallbackConnecting !== bank.id ? 0.5 : 1 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 'var(--r-xs)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Landmark size={18} style={{ color: 'var(--navy)' }} aria-hidden="true" />
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{bank.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)' }}>{bank.sub}</span>
                  </span>
                  {fallbackConnecting === bank.id
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-ui)' }}>Connecting…</span>
                    : <ArrowRight size={15} style={{ color: 'var(--muted)' }} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleConnect}
              disabled={phase === 'connecting'}
              aria-busy={phase === 'connecting' ? 'true' : undefined}
              data-testid="web-plaid-connect"
              className="pc-btn"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                minHeight: 52, padding: '0 16px', borderRadius: 'var(--r-pill)', border: 'none', cursor: phase === 'connecting' ? 'progress' : 'pointer',
                background: 'var(--grad-primary)',
                color: 'var(--white)', fontWeight: 600, fontSize: 16, marginBottom: 10,
              }}
            >
              {phase === 'connecting'
                ? <><Loader2 size={18} className="animate-spin" /> Opening your bank's sign-in…</>
                : <><Landmark size={18} /> Connect your bank</>}
            </button>
            {showTestHint && (
              <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--slate)', textAlign: 'center' }}>
                Test mode: use <strong>user_good</strong> / <strong>pass_good</strong>
              </p>
            )}
            {phase === 'error' && (
              <div role="alert" style={{ marginTop: 8, padding: '9px 12px', borderRadius: 'var(--r-sm)', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', fontSize: 13, color: 'var(--danger-700)' }}>
                That didn't go through. No harm done - tap Connect your bank to try again.
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // variant "app" - Onboarding.jsx ConnectCardScreen's teal palette.
  return (
    <div>
      {phase === 'fallback' ? (
        <>
          <div className="rounded-xl px-3 py-2.5 mb-1" style={{ background: 'var(--warning-50)', border: '1px solid var(--warning-200)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--warning-800)' }}>
              Practice mode - we couldn&apos;t reach the real bank connection right now, so this step is simulated.
            </p>
          </div>
          {BANKS.map(bank => (
            <motion.button
              key={bank.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleFallbackSelect(bank)}
              aria-busy={fallbackConnecting === bank.id ? 'true' : undefined}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left"
              style={{ background: 'var(--white)', border: '1px solid var(--line)', opacity: fallbackConnecting && fallbackConnecting !== bank.id ? 0.5 : 1 }}
            >
              <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface)' }}>
                <Landmark size={20} style={{ color: 'var(--navy)' }} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-ink text-sm">{bank.name}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>{bank.sub}</p>
              </div>
              {fallbackConnecting === bank.id
                ? <span className="text-xs font-semibold" style={{ color: 'var(--teal-ui)' }}>Connecting…</span>
                : <ArrowRight size={16} className="shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />}
            </motion.button>
          ))}
        </>
      ) : (
        <>
          <motion.button
            whileTap={phase === 'connecting' ? {} : { scale: 0.98 }}
            onClick={handleConnect}
            disabled={phase === 'connecting'}
            aria-busy={phase === 'connecting' ? 'true' : undefined}
            className="w-full flex items-center justify-center gap-2 min-h-[52px] px-4 rounded-2xl text-white font-semibold text-base"
            style={{
              background: 'var(--grad-primary)',
              cursor: phase === 'connecting' ? 'progress' : 'pointer',
            }}
          >
            {phase === 'connecting'
              ? <><Loader2 size={18} className="animate-spin" /> Opening your bank's sign-in…</>
              : <><Landmark size={18} /> Connect your bank</>}
          </motion.button>
          {showTestHint && (
            <p className="text-xs text-center px-1 pt-2" style={{ color: 'var(--slate)' }}>
              Test mode: use <strong>user_good</strong> / <strong>pass_good</strong>
            </p>
          )}
          {phase === 'error' && (
            <div role="alert" className="rounded-xl px-3 py-2.5 mt-2" style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-200)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--danger-700)' }}>
                That didn&apos;t go through. No harm done - tap Connect your bank to try again.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
