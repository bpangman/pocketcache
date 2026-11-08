import { useState } from 'react';
import { Bell, Hourglass } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { fmtMoney } from '../lib/format';
import {
  APP_FEE_LIVE, MONTHLY_FLOOR, chargeTotal, effectiveCharge, inReviewWindow, isBelowFloor,
  monthKey, nextChargeLabel, processingCoverFor, roundUpMonthName,
} from '../lib/billing';
import { PREVIEW_NOTE, ROLL_FORWARD_NOTE, adjustBounds, appFeePendingLine } from '../lib/donorContent';
import { Z, scrim, centered } from '../lib/overlay';
import { loadKey, saveKey } from '../store/identityStore';
import Button from './ui/Button';

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

/** One itemised row: label left, figure right. */
function Row({ label, value, muted, strong, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 13, color: muted ? 'var(--slate)' : 'var(--ink-2)' }}>
      <span>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{children ?? value}</span>
    </div>
  );
}

export default function ChargeReviewAlert({ surface = 'app' }) {
  const {
    hasAccount, accountStatus, skipNextCharge, setSkipNextCharge, selectedNonprofit,
    pendingRoundUps, feeMonths, monthlyCap, chargeAdjustment, setChargeAdjustment,
    coverProcessing, demoMode, giveExtraPending,
    // Server-side truth (state-core): the cycle that locked on the 1st and
    // whether the server honors donor settings yet. Both may be undefined
    // until that layer lands, so every read below is defensive.
    realProjection, serverCaps,
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
  const extras = typeof giveExtraPending === 'number' ? giveExtraPending : 0;
  // The slider opens on the amount that would ACTUALLY be charged (an existing
  // adjustment, else the cap, else the raw round-ups) - never on a figure the
  // donor would not be billed. Same rule as Dashboard's AdjustChargeSheet.
  const [value, setValue] = useState(
    () => effectiveCharge({ pendingRoundUps: roundUps, monthlyCap, chargeAdjustment }),
  );

  // The cycle that locked on the 1st, when the server has told us about it.
  // roundups-me only ever returns the CURRENT month's accrual, so without this
  // the alert can only describe today's running figure (the old behavior).
  const locked = realProjection?.lockedCycle ?? null;
  const lockedAmount = locked ? ((locked.adjustedTotalCents ?? locked.totalCents ?? 0) / 100) : null;
  const lockedRolled = !!locked && locked.status === 'rolled_forward';

  const acknowledged = closedNow || (dismissed && preview !== 'force');
  // roundUps > 0: a brand-new real account has accrued NOTHING, so there is
  // no amount to review and no threshold to be under - popping "your round-ups
  // aren't quite there yet" at $0.00 right after signup was both confusing and
  // wrong. The alert only exists once real money has actually accrued (or the
  // server has handed us a locked cycle to review).
  //
  // !demoMode: with demo mode on, pendingRoundUps is the fake dataset - this
  // alert is about the donor's REAL upcoming charge, so quoting demo figures
  // in it would misinform. It comes back the moment demo mode is off.
  const show = !acknowledged && hasAccount && accountStatus === 'active'
    && !skipNextCharge && selectedNonprofit && (roundUps > 0 || !!locked) && !demoMode
    && (!!preview || inReviewWindow());
  if (!show) return null;

  const npShort = selectedNonprofit.shortName ?? selectedNonprofit.name;
  // monthlyCap goes through BOTH calls. Leaving it out here was how this alert
  // came to offer "charge $14.89" while both dashboards said $11.00 for the same
  // $13.89 pending against a $10 cap: one number, computed two ways.
  const effective = locked ? lockedAmount : effectiveCharge({ pendingRoundUps: roundUps, monthlyCap, chargeAdjustment });
  // The donor's standing processing-cover consent (pre-checked at signup, stored
  // in AppContext) is part of what actually leaves their account, so this alert -
  // the last screen before money moves - must both include it in the total and
  // itemise it. It is computed on `effective`, the round-ups after cap and
  // adjustment, because that is all the processor ever sees.
  const processingCover = coverProcessing ? processingCoverFor(effective) : 0;
  // This alert only ever renders for a REAL account, and the $1 app fee is
  // not collected by the server yet (billing.APP_FEE_LIVE): it stays out of
  // the total and appears as its own not-yet-charged line below.
  const total = fmtMoney(locked
    ? lockedAmount + extras + processingCover
    : chargeTotal({
      pendingRoundUps: roundUps, monthlyCap, chargeAdjustment, feeMonths, processingCover,
      extras, includeFee: APP_FEE_LIVE,
    }));
  // THE $5 RULE: below the fixed floor, nothing charges this month - same gate
  // the app Dashboard, WebDashboard, Settings and Onboarding all apply, and
  // the same test the server runs: round-ups after cap or adjustment PLUS any
  // Give Extra pledge joining the charge. With a locked cycle in hand the
  // server's own verdict ('rolled_forward') is the answer. This is the fix for
  // the old abolished behavior of capping a below-minimum total down to a
  // quoted (and wrong) figure - this alert used to quote "Charging on Aug 11
  // $2.50" with no minimum check at all, capable of asking a donor to review
  // a charge that would never actually run.
  const belowMinimum = locked ? lockedRolled : isBelowFloor(effective + extras);
  // The round-up month, not the charge month: during the review window (days
  // 1-10) the charge date falls THIS month but the amount locked is LAST
  // month's round-ups, so naming the popup after the charge month would tell
  // a donor reviewing July round-ups on Aug 1 that they have an "August charge".
  const monthName = roundUpMonthName();
  const chargeDay = nextChargeLabel();
  // The cap is doing the trimming (rather than a donor adjustment) - worth
  // saying out loud, so the struck-through figure is not read as a mistake.
  const capTrimmed = !locked && (chargeAdjustment === null || chargeAdjustment === undefined)
    && monthlyCap !== null && monthlyCap !== undefined && roundUps > monthlyCap;
  // ONE set of bounds for this control, shared with Dashboard's sheet. The
  // floor is the fixed $5 minimum: a charge under $5 never runs, so under the
  // floor the only honest control is Skip.
  const bounds = adjustBounds(roundUps);
  // Skip / Adjust only reach the real charge once the server says it honors
  // donor settings. Until then the control still works locally and says so.
  const previewNote = !serverCaps?.donorSettings;

  function dismiss() {
    saveKey(ACK_KEY, monthKey());
    setDismissed(true);
    setClosedNow(true);
  }
  function confirmAdjust() {
    setChargeAdjustment(value);
    setAdjusting(false);
  }
  function skipInstead() {
    setSkipNextCharge(true);
    dismiss();
  }

  const headline = belowMinimum
    ? `Your ${monthName} round-ups aren't quite there yet`
    : `Your ${monthName} round-ups are ready to review`;
  const subline = belowMinimum
    ? `Nothing is charged on ${chargeDay} - the balance carries forward`
    : `Locked on the 1st · charges ${chargeDay} - 10 full days to review or adjust`;

  const card = (
    <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 22, width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-3)' }} role="dialog" aria-modal="true" aria-labelledby="pc-review-title">
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-deep)' }}>
          {belowMinimum ? <Hourglass size={22} /> : <Bell size={22} />}
        </div>
        <p id="pc-review-title" style={{ margin: '8px 0 2px', fontWeight: 700, fontSize: 18, lineHeight: 1.3, color: 'var(--ink)' }}>
          {headline}
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--slate)' }}>{subline}</p>
      </div>

      {belowMinimum ? (
        /* Below the floor, nothing charges this month - so this alert shows the
           rollover story instead of a total that would never actually be
           collected. There is no partial-gap quoting here, only "not yet" or
           the real amount. Same wording as the app Dashboard's below-minimum
           copy (lib/donorContent.ROLL_FORWARD_NOTE). The one tinted callout on
           this card. */
        <div style={{ background: 'var(--warning-50)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 'var(--r-md)', padding: 14, marginBottom: 12 }}>
          <Row label={`Round-ups for ${npShort}`} value={`$${fmtMoney(locked ? lockedAmount : roundUps)}`} strong />
          {extras > 0 && <Row label="Extra gift" value={`+$${fmtMoney(extras)}`} />}
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--warning)' }}>
            {ROLL_FORWARD_NOTE}
          </p>
          {!APP_FEE_LIVE && (
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--slate)' }}>{appFeePendingLine(feeMonths)}</p>
          )}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 12 }}>
          <Row label={`Round-ups for ${npShort}`} strong>
            {/* Strike through the raw figure whenever ANYTHING trimmed it - a
                cap does that just as much as a donor adjustment does. */}
            {!locked && effective !== roundUps
              ? <><s style={{ color: 'var(--muted)', fontWeight: 400 }}>${fmtMoney(roundUps)}</s> ${fmtMoney(effective)}</>
              : `$${fmtMoney(effective)}`}
          </Row>
          {capTrimmed && (
            <div style={{ padding: '2px 0', fontSize: 12, color: 'var(--warning)' }}>
              Capped at ${fmtMoney(monthlyCap)}/month - the rest is never charged.
            </div>
          )}
          {extras > 0 && <Row label="Extra gift" value={`+$${fmtMoney(extras)}`} muted />}
          {APP_FEE_LIVE && (
            <Row label={`App fee - $1 x ${feeMonths} month${feeMonths !== 1 ? 's' : ''}`} value={`+$${fmtMoney(feeMonths)}`} muted />
          )}
          {/* Only rendered when the donor has the cover on: a permanent "+$0.00"
              row is noise, and the total is still correct without it because
              `processingCover` is 0. Wording matches the signup checkout and
              Settings - the point being that this money is part of the donation,
              not a PocketCache charge. */}
          {processingCover > 0 && (
            <Row label={`Processing cover (goes to ${npShort})`} value={`+$${fmtMoney(processingCover)}`} muted />
          )}
          <div style={{ height: 1, background: 'var(--line)', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Charges {chargeDay}</span>
            <span style={{ fontWeight: 700, color: 'var(--navy-deep)', fontVariantNumeric: 'tabular-nums' }}>${total}</span>
          </div>
          {!APP_FEE_LIVE && (
            <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--slate)' }}>{appFeePendingLine(feeMonths)}</p>
          )}
        </div>
      )}

      {belowMinimum ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <Button size="md" onClick={dismiss}>Got it</Button>
        </div>
      ) : adjusting ? (
        <div style={{ marginBottom: 4 }}>
          {bounds.belowFloor ? (
            /* Under the floor there is nothing to adjust - the slider would
               offer a charge that never runs. Skip is the honest control. */
            <>
              <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.55, color: 'var(--slate)', textAlign: 'center' }}>
                ${fmtMoney(roundUps)} in round-ups is under the ${MONTHLY_FLOOR} minimum, so there is nothing to adjust. {ROLL_FORWARD_NOTE}
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <Button size="md" variant="secondary" onClick={skipInstead}>Skip this month instead</Button>
                <Button size="md" variant="tertiary" onClick={() => setAdjusting(false)}>Back</Button>
              </div>
            </>
          ) : (
            <>
              <p style={{ textAlign: 'center', margin: '0 0 4px' }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>${fmtMoney(value)}</span>
                <span style={{ fontSize: 12, color: 'var(--slate)' }}> of ${fmtMoney(roundUps)} round-ups</span>
              </p>
              <input
                type="range"
                aria-label="Charge amount for this month"
                min={bounds.min} max={bounds.max} step={bounds.step}
                value={value}
                onChange={e => setValue(Number(e.target.value))}
                style={{ width: '100%', minHeight: 44, accentColor: 'var(--teal-ui)' }}
              />
              <p style={{ margin: '4px 0 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--slate)', textAlign: 'center' }}>
                One-time change for this month only. {APP_FEE_LIVE ? `The $1 x ${feeMonths} app fee still applies.` : appFeePendingLine(feeMonths)}
                {processingCover > 0 && ' Your processing cover follows the new amount.'}
                {capTrimmed && ` Setting this above your $${fmtMoney(monthlyCap)} cap overrides the cap for this month only.`}
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <Button size="md" onClick={confirmAdjust}>
                  Set this month&apos;s round-ups to ${fmtMoney(value)}
                </Button>
                <Button size="md" variant="tertiary" onClick={() => setAdjusting(false)}>Back</Button>
              </div>
            </>
          )}
          {previewNote && (
            <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--warning)', textAlign: 'center' }} data-testid="preview-note">{PREVIEW_NOTE}</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <Button size="md" onClick={dismiss}>
            Looks good - charge ${total} on {chargeDay}
          </Button>
          <Button size="md" variant="secondary" onClick={() => { setValue(Math.min(Math.max(effective, bounds.min), Math.max(bounds.max, bounds.min))); setAdjusting(true); }}>
            Adjust this charge
          </Button>
          {previewNote && (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--warning)', textAlign: 'center' }} data-testid="preview-note">{PREVIEW_NOTE}</p>
          )}
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
