import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { fmtMoney } from '../lib/format';
import { nextChargeLabel } from '../lib/billing';
import { monthsGiving, sinceLabel } from '../data/derived';
import { greetingNameFor } from '../lib/donorAuth';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import AppleLogo from '../components/AppleLogo';
import { ChangePaymentModal } from './WebPortalPages';

// ─── Web-native closed account / reactivation ────────────────────────────────
// The last desktop donor journey that still rendered the PHONE UI inside a
// 440px column (App.jsx's WebPortal wrapping AppContent's CancelledOverlay and
// ReactivateCheckinCard). It is a real webpage now, in the same language as the
// signup wizard: top nav, left rail, one panel, footer.
//
// SAME TWO STATES, SAME RULES AS THE PHONE
//   'closed'  - App.jsx CancelledOverlay (~195): what happened, that the history
//               and the settings survived, and the way back.
//   'checkin' - App.jsx ReactivateCheckinCard (~234): the MANDATORY re-link of
//               the tracked card, the payment-method review, and a restart
//               action that stays disabled until the re-link lands.
//
// WHY THE RE-LINK IS NOT OPTIONAL. Cancelling removes the Plaid item, so there
// is nothing watching the card and round-ups physically cannot resume until it
// is re-linked. That is a product rule, not a nicety, so the restart button
// carries a real `disabled` (not just a grey gradient) and says what is missing.
//
// TWO THINGS THIS DOES BETTER THAN THE PHONE, because the web can.
//   1. "Change" opens the portal's own ChangePaymentModal right here. The phone
//      has no room for it, so it reactivates FIRST and deep-links into Settings
//      (App.jsx handleChangePaymentFromCheckin) - which quietly reopens the
//      account just to edit a card. On web the donor changes the method inside
//      the check-in and the account reopens only when they say so.
//   2. The closed state shows the history it is promising is still there
//      (total, months, the card we used to watch) instead of asserting it.
//
// "BACK TO START" HAS NO WEB EQUIVALENT - see the secondary actions below.

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';
const PANEL = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid #e5e7eb',
  boxShadow: '0 16px 48px rgba(11,42,74,0.08), 0 2px 8px rgba(11,42,74,0.05)',
};

const PAYMENT_TYPE_ICON = { ach: '🏦', apple_pay: <AppleLogo size={16} />, card: '💳' };

function PanelTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>{title}</h2>
      {sub && <p style={{ margin: '5px 0 0', fontSize: 13.5, color: INK.secondary, lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, testId }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        width: '100%', padding: '13px 16px', borderRadius: 14, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: disabled ? 'linear-gradient(135deg, #d1d5db, #9ca3af)' : `linear-gradient(135deg, ${NAVY}, #001a33)`,
        color: '#fff', fontWeight: 700, fontSize: 15,
      }}
    >
      {children}
    </button>
  );
}

// One fact about the account that is still intact. Three of these across the
// width is the thing a phone modal cannot do: prove the reassurance.
function StatTile({ label, value, sub, testId }) {
  return (
    <div data-testid={testId} style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 14, padding: '14px 16px' }}>
      <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>{value}</p>
      {sub && <p style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.45, color: INK.muted }}>{sub}</p>}
    </div>
  );
}

// A labelled review block: the two things the check-in asks the donor to look
// at. Full page width, label above, detail and action on one row - the desktop
// version of the phone's stacked grey cards.
function ReviewBlock({ label, icon, title, meta, note, action, testId }) {
  return (
    <div data-testid={testId} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 180 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, color: INK.primary }}>{title}</span>
          {meta && <span style={{ display: 'block', fontSize: 12.5, color: INK.muted, marginTop: 1 }}>{meta}</span>}
          {note && <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: '#b45309', marginTop: 4 }}>{note}</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>{action}</span>
      </div>
    </div>
  );
}

function RailFact({ tone, children }) {
  const teal = tone === 'kept';
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '5px 0' }}>
      <span style={{
        width: 17, height: 17, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
        background: teal ? '#0D9488' : '#e2e8f0', color: teal ? '#fff' : INK.muted,
      }}>
        {teal ? '✓' : '–'}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: teal ? INK.secondary : INK.muted }}>{children}</span>
    </li>
  );
}

export default function WebReactivate() {
  const {
    selectedNonprofit, trackedCard, paymentMethod, setPaymentMethod,
    totalDonated, reactivateAccount, setPage, setLastMode, signOut, hasAccount,
  } = useApp();
  const brand = useTheme();

  // 'closed' → 'checkin'. The phone swaps one blocking scrim for another; on a
  // page these are two states of the same panel, which is also what gives the
  // check-in a real "back" (the closed state) instead of a dead one.
  const [stage, setStage] = useState('closed');
  const [relinking, setRelinking] = useState(false);
  const [relinked, setRelinked] = useState(false);
  const [changePayment, setChangePayment] = useState(false);

  const org = selectedNonprofit;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';
  const card = trackedCard ?? { name: 'Chase Sapphire', last4: '4242' };
  const pay = paymentMethod ?? { type: 'card', label: 'Credit or Debit Card', last4: '4242' };
  const chargeOn = nextChargeLabel();

  function handleRelink() {
    setRelinking(true);
    // production: the Plaid item was removed at cancellation  -  this is a real
    // Plaid Link re-authentication, and nothing can round up until it returns.
    setTimeout(() => { setRelinking(false); setRelinked(true); }, 1200);
  }

  function handleRestart() {
    if (!relinked) return;
    reactivateAccount(`Welcome back  -  tracking restarted today. Your first new charge comes on ${chargeOn}.`);
    // The phone leaves `page` alone because AppContent renders the app behind
    // the scrim either way. On web the route IS the page: cancelAccount parked
    // it at 'onboarding', so without this a reactivated donor lands back in the
    // signup wizard instead of their dashboard.
    setLastMode('giving');
    setPage('home');
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb', display: 'flex', flexDirection: 'column' }} data-testid="web-reactivate">
      <ChangePaymentModal
        show={changePayment}
        onClose={() => setChangePayment(false)}
        onChanged={m => setPaymentMethod(m)}
      />

      {/* Top nav  -  same webpage chrome as the wizard and the dashboard */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {org ? <OrgLogo nonprofit={org} size={9} rounded="lg" /> : <CoinMark size={30} />}
            <div style={{ lineHeight: 1.15 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary }}>{brand.appName ?? 'PocketCache'}</p>
              <p style={{ margin: 0, fontSize: 10.5, color: INK.muted }}>powered by PocketCache</p>
            </div>
          </div>
          {org && (
            <a href={`/demo/?orgpage=${encodeURIComponent(org.shortName || org.id.toUpperCase())}`}
              style={{ fontSize: 13, fontWeight: 600, color: NAVY, textDecoration: 'none' }}>
              About {npShort} →
            </a>
          )}
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 980, margin: '0 auto', padding: '36px 24px 48px' }}>
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr]" style={{ display: 'grid', gap: 36, alignItems: 'start' }}>
          {/* ── Rail: the same geometry as the wizard's, carrying the status ── */}
          <aside style={{ position: 'sticky', top: 90 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              {org ? <OrgLogo nonprofit={org} size={12} rounded="xl" /> : <CoinMark size={44} />}
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary, lineHeight: 1.25 }}>
                  {org?.name ?? 'Your giving'}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>
                  {stage === 'closed' ? 'Your account is closed.' : 'One check and you are back.'}
                </p>
              </div>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.6, color: INK.secondary }}>
              {stage === 'closed'
                ? `You closed your round-up giving to ${npShort}. Nothing was deleted  -  reactivating picks up exactly where you left off.`
                : `Reactivating restarts tracking today. Round-ups total through the end of the month, and one charge from ${npShort} follows on ${chargeOn}.`}
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
              While it is closed
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
              <RailFact>Nothing is tracked and nothing rounds up.</RailFact>
              <RailFact>No charge runs, this month or any month.</RailFact>
              <RailFact tone="kept">Your donation history, receipts and settings stay exactly as they were.</RailFact>
            </ul>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: INK.muted }}>
              🔒 We disconnected your card from Plaid the day you closed the account, so re-linking it is the one step reactivation cannot skip.
            </p>
          </aside>

          {/* ── Panel ── */}
          <section style={{ ...PANEL, padding: 28 }}>
            {stage === 'closed' ? (
              <div data-testid="web-reactivate-closed">
                <PanelTitle
                  title="Your account is closed"
                  sub="Everything below is still on your account. Turn round-ups back on whenever you are ready  -  it takes about a minute."
                />
                <div className="grid grid-cols-1 sm:grid-cols-3" style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
                  <StatTile
                    testId="web-reactivate-total"
                    label="Total donated"
                    value={`$${fmtMoney(totalDonated)}`}
                    sub={`${sinceLabel} · kept in full`}
                  />
                  <StatTile
                    label="Months giving"
                    value={monthsGiving}
                    sub="every receipt still on file"
                  />
                  <StatTile
                    label="Card we watched"
                    value={`····${card.last4 ?? '4242'}`}
                    sub={`${card.name ?? 'Your card'} · disconnected at closure`}
                  />
                </div>
                <PrimaryButton testId="web-reactivate-start" onClick={() => setStage('checkin')}>
                  Reactivate my account
                </PrimaryButton>

                {/* ── The secondary action ──
                    The phone's "Back to start" only changes what sits BEHIND the
                    scrim, because CancelledOverlay renders over whatever page is
                    loaded. On web the route is the page, and a cancelled donor
                    routes here from every page, so "back" has literally nowhere
                    to go - it would re-render this exact screen. The two honest
                    ways out of a closed account are the two below: leave this
                    device (sign out, which is also the dashboard's own wording),
                    or leave for the marketing site. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 14px' }}>
                  <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: INK.muted, whiteSpace: 'nowrap' }}>Not now?</span>
                  <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                </div>
                <button
                  onClick={() => signOut()}
                  data-testid="web-reactivate-signout"
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 14, border: 'none', cursor: 'pointer', background: '#f1f5f9', color: INK.primary, fontWeight: 700, fontSize: 14.5 }}
                >
                  Sign out{greetingNameFor(hasAccount) ? ` of ${greetingNameFor(hasAccount)}'s account` : ''}
                </button>
                <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: INK.muted, textAlign: 'center' }}>
                  Your account stays closed either way  -  signing out just closes this browser session.{' '}
                  <a href="/" style={{ color: NAVY, fontWeight: 600 }}>Return to pocketcache.app</a>
                </p>
              </div>
            ) : (
              <div data-testid="web-reactivate-checkin">
                <PanelTitle
                  title="Welcome back 👋"
                  sub="Two quick things before your round-ups start again."
                />

                {/* ── 1. The mandatory re-link ── */}
                <ReviewBlock
                  testId="web-reactivate-card-block"
                  label="Card we track"
                  icon="🏦"
                  title={card.name ?? 'Your card'}
                  meta={`····${card.last4 ?? '4242'}`}
                  note={relinked ? null : 'We disconnected this from Plaid when you left, so nothing can round up until it is re-linked.'}
                  action={relinked ? (
                    <span data-testid="web-reactivate-relinked" style={{ fontSize: 13, fontWeight: 700, color: '#0f766e' }}>Connected ✓</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '4px 9px' }}>
                        Required
                      </span>
                      <button
                        onClick={handleRelink}
                        disabled={relinking}
                        data-testid="web-reactivate-relink"
                        style={{
                          border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, color: '#fff',
                          background: relinking ? '#9ca3af' : 'linear-gradient(135deg, #0d9488, #003865)',
                          cursor: relinking ? 'default' : 'pointer',
                        }}
                      >
                        {relinking ? 'Linking…' : 'Re-link'}
                      </button>
                    </>
                  )}
                />

                {/* ── 2. The payment review ── */}
                <ReviewBlock
                  testId="web-reactivate-payment-block"
                  label="How you pay"
                  icon={PAYMENT_TYPE_ICON[pay.type] ?? '💳'}
                  title={pay.label ?? 'Credit or Debit Card'}
                  meta={pay.last4 ? `····${pay.last4}` : 'One charge a month, collected by ' + npShort}
                  action={(
                    <>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f766e' }}>Keep</span>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <button
                        onClick={() => setChangePayment(true)}
                        data-testid="web-reactivate-change-payment"
                        style={{ border: '1px solid #dbe3ec', background: '#fff', borderRadius: 12, padding: '9px 14px', fontSize: 13.5, fontWeight: 700, color: NAVY, cursor: 'pointer' }}
                      >
                        Change
                      </button>
                    </>
                  )}
                />

                <p style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.6, color: INK.muted }}>
                  Tracking restarts the moment you confirm. Your round-ups total through the last day of the
                  month, we email the exact amount on the 1st, and {npShort} charges you on {chargeOn}. Nothing
                  from while you were away is ever charged.
                </p>

                {/* production: Plaid item removed at cancellation  -  a real
                    disabled button, so the gate holds for keyboard and script
                    just as it does for a mouse. */}
                <PrimaryButton testId="web-reactivate-restart" disabled={!relinked} onClick={handleRestart}>
                  Restart my round-ups
                </PrimaryButton>
                {!relinked && (
                  <p data-testid="web-reactivate-gate-note" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#b45309', textAlign: 'center' }}>
                    Re-link {card.name ?? 'your card'} first  -  round-ups cannot resume without it.
                  </p>
                )}
                <button
                  onClick={() => setStage('closed')}
                  data-testid="web-reactivate-back"
                  style={{ width: '100%', marginTop: 10, padding: '10px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: INK.muted }}
                >
                  ← Not yet, leave my account closed
                </button>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer style={{ padding: '0 24px 20px', textAlign: 'center' }}>
        <p style={{ color: INK.muted, fontSize: 12, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
