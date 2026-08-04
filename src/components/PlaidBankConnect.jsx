import { useEffect, useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { ArrowRight, Landmark, Loader2 } from 'lucide-react';
import { fetchPlaidLinkToken, loadPlaidLinkScript, openPlaidLinkWithToken } from '../lib/plaid';
import { BANKS } from '../pages/Onboarding';

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
 * @param {Function} props.onConnected  Called once with { name, last4, brand, institution }.
 */
export default function PlaidBankConnect({ variant = 'app', onConnected }) {
  const [phase, setPhase] = useState('idle'); // 'idle' | 'connecting' | 'error' | 'fallback'
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
      onConnected?.({ name: bank.name, last4, brand: bank.name, institution: bank.name });
    }, 1100);
  }

  if (variant === 'web') {
    return (
      <div>
        {phase === 'fallback' ? (
          <>
            <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e', fontWeight: 600 }}>
              Practice mode - we could not reach the real bank connection right now, so this step is simulated.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
              {BANKS.map(bank => (
                <button key={bank.id} onClick={() => handleFallbackSelect(bank)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', textAlign: 'left', opacity: fallbackConnecting && fallbackConnecting !== bank.id ? 0.4 : 1 }}>
                  <span style={{ fontSize: 22 }}>{bank.emoji}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>{bank.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#94a3b8' }}>{bank.sub}</span>
                  </span>
                  {fallbackConnecting === bank.id
                    ? <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0D9488' }}>Connecting…</span>
                    : <ArrowRight size={15} color="#cbd5e1" />}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={handleConnect}
              disabled={phase === 'connecting'}
              data-testid="web-plaid-connect"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '15px 16px', borderRadius: 14, border: 'none', cursor: phase === 'connecting' ? 'default' : 'pointer',
                background: phase === 'connecting' ? 'linear-gradient(135deg, #94a3b8, #64748b)' : 'linear-gradient(135deg, #003865, #001a33)',
                color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 10,
              }}
            >
              {phase === 'connecting'
                ? <><Loader2 size={18} className="animate-spin" /> Opening your bank's sign-in…</>
                : <><Landmark size={18} /> Connect your bank</>}
            </button>
            <p style={{ margin: '0 0 4px', fontSize: 11.5, color: '#94a3b8', textAlign: 'center' }}>
              Test mode: use <strong>user_good</strong> / <strong>pass_good</strong>
            </p>
            {phase === 'error' && (
              <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12.5, color: '#b91c1c' }}>
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
          <div className="rounded-2xl px-3 py-2.5 mb-1" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p className="text-amber-800 text-xs font-semibold">
              Practice mode  -  we couldn&apos;t reach the real bank connection right now, so this step is simulated.
            </p>
          </div>
          {BANKS.map(bank => (
            <motion.button
              key={bank.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleFallbackSelect(bank)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl text-left"
              style={{ background: '#fff', border: '1.5px solid #99f6e4', opacity: fallbackConnecting && fallbackConnecting !== bank.id ? 0.4 : 1 }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl bg-gray-50">
                {bank.emoji}
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 text-sm">{bank.name}</p>
                <p className="text-gray-400 text-xs">{bank.sub}</p>
              </div>
              {fallbackConnecting === bank.id
                ? <span className="text-xs text-teal-600 font-semibold">Connecting…</span>
                : <ArrowRight size={16} className="text-gray-300 shrink-0" />}
            </motion.button>
          ))}
        </>
      ) : (
        <>
          <motion.button
            whileTap={phase === 'connecting' ? {} : { scale: 0.97 }}
            onClick={handleConnect}
            disabled={phase === 'connecting'}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl text-white font-bold text-base"
            style={{
              background: phase === 'connecting' ? 'linear-gradient(135deg, #94a3b8, #64748b)' : 'linear-gradient(135deg, #0d9488, #003865)',
              cursor: phase === 'connecting' ? 'default' : 'pointer',
            }}
          >
            {phase === 'connecting'
              ? <><Loader2 size={18} className="animate-spin" /> Opening your bank's sign-in…</>
              : <><Landmark size={18} /> Connect your bank</>}
          </motion.button>
          <p className="text-gray-400 text-xs text-center px-1 pt-2">
            Test mode: use <strong>user_good</strong> / <strong>pass_good</strong>
          </p>
          {phase === 'error' && (
            <div className="rounded-2xl px-3 py-2.5 mt-2" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="text-red-600 text-xs font-semibold">
                That didn&apos;t go through. No harm done  -  tap Connect your bank to try again.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
