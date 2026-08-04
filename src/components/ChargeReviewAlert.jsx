import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { fmtMoney } from '../lib/format';
import {
  chargeTotal, effectiveCharge, inReviewWindow, monthKey, nextChargeLabel,
  processingCoverFor, roundUpMonthName,
} from '../lib/billing';
import { adjustBounds } from '../lib/donorContent';
import { Z, scrim, centered } from '../lib/overlay';
import { loadKey, saveKey } from '../store/identityStore';

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

// One-time migration: this key used to be written directly with
// localStorage.setItem(ACK_KEY, monthKey()) - a bare, unquoted month string
// like "2026-08" - instead of going through this codebase's loadKey/saveKey
// JSON convention (see store/identityStore.js). A bare string like that is
// not valid JSON, so loadKey()'s own try/catch would silently swallow it and
// read back `null`, which would have made every donor's existing "Looks
// good" acknowledgment reappear as unacknowledged. Read the raw value once,
// and if it is present but not valid JSON, re-save it through saveKey() (so
// it becomes a proper JSON string) and every later read goes through
// loadKey() like the rest of the app.
function migrateReviewAck() {
  let raw;
  try { raw = localStorage.getItem(ACK_KEY); } catch { return; }
  if (raw == null) return;
  try {
    JSON.parse(raw);
    return; // already in the new JSON form - nothing to do
  } catch {
    // legacy bare string - fall through and migrate it below
  }
  saveKey(ACK_KEY, raw);
}
migrateReviewAck();

export default function ChargeReviewAlert({ surface = 'app' }) {
  const {
    hasAccount, accountStatus, skipNextCharge, selectedNonprofit,
    pendingRoundUps, feeMonths, monthlyCap, chargeAdjustment, setChargeAdjustment,
    coverProcessing,
  } = useApp();
  const [dismissed, setDismissed] = useState(() => loadKey(ACK_KEY) === monthKey());
  // ?review=1 preview flag  -  captured ONCE at mount (the pretty-URL rewrite
  // strips query params later; the alert must not vanish mid-interaction).
  // ?review=force re-shows it even after "Looks good" (demo convenience).
  const [preview] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('review'); } catch { return null; }
  });
  const [adjusting, setAdjusting] = useState(false);
  const [closedNow, setClosedNow] = useState(false); // this-render dismissal (covers review=force)
  const roundUps = typeof pendingRoundUps === 'number' ? pendingRoundUps : 0;
  // The slider opens on the amount that would ACTUALLY be charged (an existing
  // adjustment, else the cap, else the raw round-ups) - never on a figure the
  // donor would not be billed. Same rule as Dashboard's AdjustChargeSheet.
  const [value, setValue] = useState(
    () => effectiveCharge({ pendingRoundUps: roundUps, monthlyCap, chargeAdjustment }),
  );

  const acknowledged = closedNow || (dismissed && preview !== 'force');
  const show = !acknowledged && hasAccount && accountStatus === 'active'
    && !skipNextCharge && selectedNonprofit && (!!preview || inReviewWindow());
  if (!show) return null;

  const npShort = selectedNonprofit.shortName ?? selectedNonprofit.name;
  // monthlyCap goes through BOTH calls. Leaving it out here was how this alert
  // came to offer "charge $14.89" while both dashboards said $11.00 for the same
  // $13.89 pending against a $10 cap: one number, computed two ways.
  const effective = effectiveCharge({ pendingRoundUps: roundUps, monthlyCap, chargeAdjustment });
  // The donor's standing processing-cover consent (pre-checked at signup, stored
  // in AppContext) is part of what actually leaves their account, so this alert -
  // the last screen before money moves - must both include it in the total and
  // itemise it. It is computed on `effective`, the round-ups after cap and
  // adjustment, because that is all the processor ever sees.
  const processingCover = coverProcessing ? processingCoverFor(effective) : 0;
  const total = fmtMoney(chargeTotal({
    pendingRoundUps: roundUps, monthlyCap, chargeAdjustment, feeMonths, processingCover,
  }));
  // THE $5 RULE: below the nonprofit's minimum, nothing charges this month -
  // same gate the app Dashboard, WebDashboard, Settings and Onboarding all
  // apply. Measured against the raw pending round-ups, same as Dashboard.jsx:
  // a cap or adjustment only trims what WOULD be charged if there were
  // enough to charge at all. This is the fix for the old abolished behavior
  // of capping a below-minimum total down to a quoted (and wrong) figure -
  // this alert used to quote "Charging on Aug 11 $2.50" with no minimum
  // check at all, capable of asking a donor to review a charge that would
  // never actually run.
  const monthlyMinimum = selectedNonprofit.monthlyMinimum ?? 5;
  const belowMinimum = roundUps < monthlyMinimum;
  // The round-up month, not the charge month: during the review window (days
  // 1-10) the charge date falls THIS month but the amount locked is LAST
  // month's round-ups, so naming the popup after the charge month would tell
  // a donor reviewing July round-ups on Aug 1 that they have an "August charge".
  const monthName = roundUpMonthName();
  const chargeDay = nextChargeLabel();
  // The cap is doing the trimming (rather than a donor adjustment) - worth
  // saying out loud, so the struck-through figure is not read as a mistake.
  const capTrimmed = (chargeAdjustment === null || chargeAdjustment === undefined)
    && monthlyCap !== null && monthlyCap !== undefined && roundUps > monthlyCap;

  function dismiss() {
    saveKey(ACK_KEY, monthKey());
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
        <div style={{ fontSize: 34 }}>{belowMinimum ? '💰' : '🔔'}</div>
        <p style={{ margin: '6px 0 2px', fontWeight: 800, fontSize: 17, color: '#0f172a' }}>
          {belowMinimum ? `Your ${monthName} round-ups aren't quite there yet` : `Your ${monthName} round-ups are ready to review`}
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
          {belowMinimum
            ? `Nothing is charged on ${chargeDay}  -  the balance carries forward`
            : <>Locked on the 1st · charges {chargeDay}  -  10 full days to review or adjust</>}
        </p>
      </div>

      {belowMinimum ? (
        /* Below the nonprofit's minimum, nothing charges this month - so this
           alert shows the rollover story instead of a total that would never
           actually be collected. This is the fix for the old abolished
           behavior of capping a below-minimum total down to a quoted figure:
           there is no partial-gap quoting here, only "not yet" or the real
           amount. Same wording as the app Dashboard's below-minimum copy. */
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: 14, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#475569' }}>Round-ups for {npShort}</span>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>${fmtMoney(roundUps)}</span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.55, color: '#b45309' }}>
            Not quite ${monthlyMinimum} yet  -  your round-ups carry forward. We settle every 3 months at most, so nothing&apos;s ever left behind.
            {' '}&middot; $1/month fee rolls too  -  {feeMonths} month{feeMonths !== 1 ? 's' : ''} so far (${feeMonths})  -  itemized on your charge.
          </p>
        </div>
      ) : (
        <div style={{ background: '#f0f6ff', border: '1.5px solid #cce0f5', borderRadius: 14, padding: 14, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#475569' }}>Round-ups for {npShort}</span>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>
              {/* Strike through the raw figure whenever ANYTHING trimmed it - a
                  cap does that just as much as a donor adjustment does. */}
              {effective !== roundUps
                ? <><s style={{ color: '#94a3b8', fontWeight: 400 }}>${fmtMoney(roundUps)}</s> ${fmtMoney(effective)}</>
                : `$${fmtMoney(roundUps)}`}
            </span>
          </div>
          {capTrimmed && (
            <div style={{ padding: '2px 0', fontSize: 11.5, color: '#b45309' }}>
              Capped at ${fmtMoney(monthlyCap)}/month  -  the rest is never charged.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#64748b' }}>
            <span>App fee  -  $1 × {feeMonths} month{feeMonths !== 1 ? 's' : ''}</span>
            <span>+${fmtMoney(feeMonths)}</span>
          </div>
          {/* Only rendered when the donor has the cover on: a permanent "+$0.00"
              row is noise, and the total is still correct without it because
              `processingCover` is 0. Wording matches the signup checkout and
              Settings - the point being that this money is part of the donation,
              not a PocketCache charge. */}
          {processingCover > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#64748b' }}>
              <span>Processing cover (goes to {npShort})</span>
              <span>+${fmtMoney(processingCover)}</span>
            </div>
          )}
          <div style={{ height: 1, background: '#cbd5e1', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>Charging on {chargeDay}</span>
            <span style={{ fontWeight: 800, color: '#003865' }}>${total}</span>
          </div>
        </div>
      )}

      {belowMinimum ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <button onClick={dismiss}
            style={{ padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #003865, #001a33)', color: '#fff', fontWeight: 700, fontSize: 14 }}>
            Got it
          </button>
        </div>
      ) : adjusting ? (
        <div style={{ marginBottom: 12 }}>
          <p style={{ textAlign: 'center', margin: '0 0 4px' }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>${fmtMoney(value)}</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}> of ${fmtMoney(roundUps)} round-ups</span>
          </p>
          <input
            type="range" {...adjustBounds(roundUps)} value={value}
            onChange={e => setValue(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#0D9488' }}
          />
          <p style={{ margin: '4px 0 10px', fontSize: 11.5, color: '#94a3b8', textAlign: 'center' }}>
            One-time change for this month only  -  the $1 × {feeMonths} app fee still applies.
            {processingCover > 0 && ' Your processing cover follows the new amount.'}
            {capTrimmed && ` Setting this above your $${fmtMoney(monthlyCap)} cap overrides the cap for this month only.`}
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <button onClick={confirmAdjust}
              style={{ padding: '11px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #0d9488, #003865)', color: '#fff', fontWeight: 700, fontSize: 13.5 }}>
              Set this month&apos;s round-ups to ${fmtMoney(value)}
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
          <button onClick={() => { setValue(effective); setAdjusting(true); }}
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
