import { useState } from 'react';
import { useApp } from '../store/AppContext';
import {
  chargeTotal, currentMonthName, effectiveCharge, inReviewWindow, monthKey, nextChargeLabel,
} from '../lib/billing';
import { Z, scrim, centered } from '../lib/overlay';

// ─── Charge review alert (the 1st-10th window) ───────────────────────────────
// The cycle locks on the 1st; the charge runs on the 11th (10 full days'
// notice  -  the classic Reg E timing). During that window,
// every fresh visit pops this alert with the exact amount and the one-time
// "adjust this charge" control  -  donors always see it before money moves.
// Production also sends the same thing by email/push on the 1st.
// Demo: add ?review=1 to the URL to preview the alert on any calendar day.
//
// All dates and amounts come from src/lib/billing.js - the window, the charge
// label, the effective round-ups and the total. This file used to do that math
// itself; it happened to be the only one that got the "this month's 11th, not
// next month's" rule right, and lib/billing.js is that rule, extracted.

// Acknowledgment persists for the WHOLE review month: once the donor clicks
// "Looks good", the alert stays gone on every later visit until next cycle.
// The month key is billing's canonical cycle id.
const ACK_KEY = 'pc_review_ack';

export default function ChargeReviewAlert({ surface = 'app' }) {
  const {
    hasAccount, accountStatus, skipNextCharge, selectedNonprofit,
    pendingRoundUps, feeMonths, chargeAdjustment, setChargeAdjustment,
  } = useApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(ACK_KEY) === monthKey(); } catch { return false; }
  });
  // ?review=1 preview flag  -  captured ONCE at mount (the pretty-URL rewrite
  // strips query params later; the alert must not vanish mid-interaction).
  // ?review=force re-shows it even after "Looks good" (demo convenience).
  const [preview] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('review'); } catch { return null; }
  });
  const [adjusting, setAdjusting] = useState(false);
  const [closedNow, setClosedNow] = useState(false); // this-render dismissal (covers review=force)
  const roundUps = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  const [value, setValue] = useState(chargeAdjustment ?? roundUps);

  const acknowledged = closedNow || (dismissed && preview !== 'force');
  const show = !acknowledged && hasAccount && accountStatus === 'active'
    && !skipNextCharge && selectedNonprofit && (!!preview || inReviewWindow());
  if (!show) return null;

  const npShort = selectedNonprofit.shortName ?? selectedNonprofit.name;
  const effective = effectiveCharge({ pendingRoundUps: roundUps, chargeAdjustment });
  const total = chargeTotal({ pendingRoundUps: roundUps, chargeAdjustment, feeMonths }).toFixed(2);
  const monthName = currentMonthName();
  const chargeDay = nextChargeLabel();

  function dismiss() {
    try { localStorage.setItem(ACK_KEY, monthKey()); } catch { /* noop */ }
    setDismissed(true);
    setClosedNow(true);
  }
  function confirmAdjust() {
    setChargeAdjustment(value);
    setAdjusting(false);
  }

  const card = (
    <div style={{ background: '#fff', borderRadius: 24, padding: 22, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 34 }}>🔔</div>
        <p style={{ margin: '6px 0 2px', fontWeight: 800, fontSize: 17, color: '#0f172a' }}>
          Your {monthName} charge is ready to review
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
          Locked on the 1st · charges {chargeDay}  -  10 full days to review or adjust
        </p>
      </div>

      <div style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5', borderRadius: 14, padding: 14, marginBottom: 12, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span style={{ color: '#475569' }}>Round-ups for {npShort}</span>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>
            {chargeAdjustment !== null && chargeAdjustment !== undefined
              ? <><s style={{ color: '#94a3b8', fontWeight: 400 }}>${roundUps.toFixed(2)}</s> ${effective.toFixed(2)}</>
              : `$${roundUps.toFixed(2)}`}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#64748b' }}>
          <span>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''}</span>
          <span>+${feeMonths.toFixed(2)}</span>
        </div>
        <div style={{ height: 1, background: '#cbd5e1', margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>Charging on {chargeDay}</span>
          <span style={{ fontWeight: 800, color: '#003865' }}>${total}</span>
        </div>
      </div>

      {adjusting ? (
        <div style={{ marginBottom: 12 }}>
          <p style={{ textAlign: 'center', margin: '0 0 4px' }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>${value.toFixed(2)}</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}> of ${roundUps.toFixed(2)} round-ups</span>
          </p>
          <input
            type="range" min={0} max={roundUps} step={0.25} value={value}
            onChange={e => setValue(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#0D9488' }}
          />
          <p style={{ margin: '4px 0 10px', fontSize: 11.5, color: '#94a3b8', textAlign: 'center' }}>
            One-time change for this month only  -  the $1 × {feeMonths} app fee still applies.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <button onClick={confirmAdjust}
              style={{ padding: '11px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #0d9488, #003865)', color: '#fff', fontWeight: 700, fontSize: 13.5 }}>
              Set this month&apos;s round-ups to ${value.toFixed(2)}
            </button>
            <button onClick={() => setAdjusting(false)}
              style={{ padding: '9px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#0f172a', fontWeight: 600, fontSize: 13 }}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <button onClick={dismiss}
            style={{ padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #003865, #001a33)', color: '#fff', fontWeight: 700, fontSize: 14 }}>
            Looks good  -  charge ${total} on {chargeDay}
          </button>
          <button onClick={() => { setValue(chargeAdjustment ?? roundUps); setAdjusting(true); }}
            style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #cbd5e1', cursor: 'pointer', background: '#fff', color: '#003865', fontWeight: 700, fontSize: 13 }}>
            Adjust this charge
          </button>
        </div>
      )}
    </div>
  );

  // One gate, two surfaces: identical scrim on both (the app used to dim to 0.55
  // + blur and the web to 0.45 with none, which was copy-paste drift, not a
  // design decision). `fixed` is the only genuine difference.
  if (surface === 'app') {
    return (
      <div style={{ ...scrim('blocking'), ...centered(20), zIndex: Z.blockingScrim }}>
        {card}
      </div>
    );
  }
  return (
    <div style={{ ...scrim('blocking', { fixed: true }), ...centered(16), zIndex: Z.blockingScrim }}>
      {card}
    </div>
  );
}
