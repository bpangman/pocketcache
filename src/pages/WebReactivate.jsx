import { useState } from 'react';
import { Check, CreditCard, Landmark, Lock } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { useNp } from '../store/NpContext';
import { fmtMoney, memberSinceLabel } from '../lib/format';
import { nextChargeLabel } from '../lib/billing';
import { monthsGiving } from '../data/derived';
import { greetingNameFor } from '../lib/donorAuth';
import OrgLogo from '../components/OrgLogo';
import CoinMark from '../components/CoinMark';
import AppleLogo from '../components/AppleLogo';
import PlaidBankConnect from '../components/PlaidBankConnect';
import Button from '../components/ui/Button';
import { ChangePaymentModal } from './WebPortalPages';
import { INK, NAVY, PANEL, RADIUS } from '../lib/webTheme';

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

// Ink, panel and depth tokens come from the shared web design vocabulary
// (lib/webTheme), imported above with the other libs.

const ICON_PROPS = { size: 26, color: 'var(--navy)', 'aria-hidden': 'true' };
const PAYMENT_TYPE_ICON = {
  ach: <Landmark {...ICON_PROPS} />,
  apple_pay: <AppleLogo size={16} />,
  card: <CreditCard {...ICON_PROPS} />,
};

function PanelTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>{title}</h2>
      {sub && <p style={{ margin: '5px 0 0', fontSize: 15, color: INK.secondary, lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}

// One fact about the account that is still intact. Three of these across the
// width is the thing a phone modal cannot do: prove the reassurance.
function StatTile({ label, value, sub, testId }) {
  return (
    <div data-testid={testId} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: RADIUS.md, padding: '14px 16px' }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.subtle }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', color: INK.primary }}>{value}</p>
      {sub && <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.45, color: INK.subtle }}>{sub}</p>}
    </div>
  );
}

// A labelled review block: the two things the check-in asks the donor to look
// at. Full page width, label above, detail and action on one row - the desktop
// version of the phone's stacked grey cards.
function ReviewBlock({ label, icon, title, meta, note, action, below, testId }) {
  return (
    <div data-testid={testId} style={{ border: '1px solid var(--line)', borderRadius: RADIUS.md, padding: 16, marginBottom: 12 }}>
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.subtle }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 44, height: 44, borderRadius: RADIUS.sm, background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 180 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 16, color: INK.primary }}>{title}</span>
          {meta && <span style={{ display: 'block', fontSize: 14, color: INK.subtle, marginTop: 1 }}>{meta}</span>}
          {note && <span style={{ display: 'block', fontSize: 14, lineHeight: 1.5, color: 'var(--warning)', marginTop: 4 }}>{note}</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>{action}</span>
      </div>
      {below && <div style={{ marginTop: 14 }}>{below}</div>}
    </div>
  );
}

function RailFact({ tone, children }) {
  const teal = tone === 'kept';
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '5px 0' }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
        background: teal ? 'var(--teal-ui)' : 'var(--line)', color: teal ? '#fff' : INK.subtle,
      }}>
        {teal ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : '-'}
      </span>
      <span style={{ fontSize: 15, lineHeight: 1.5, color: teal ? INK.secondary : INK.subtle }}>{children}</span>
    </li>
  );
}

export default function WebReactivate() {
  const {
    selectedNonprofit, trackedCard, setTrackedCard, paymentMethod, setPaymentMethod,
    totalDonated, reactivateAccount, setPage, setLastMode, signOut, hasAccount, demoActive,
  } = useApp();
  const brand = useTheme();
  const np = useNp();

  // 'closed' → 'checkin'. The phone swaps one blocking scrim for another; on a
  // page these are two states of the same panel, which is also what gives the
  // check-in a real "back" (the closed state) instead of a dead one.
  const [stage, setStage] = useState('closed');
  const [relinking, setRelinking] = useState(false);
  const [relinked, setRelinked] = useState(false);
  const [changePayment, setChangePayment] = useState(false);

  const org = selectedNonprofit;
  const npShort = org?.shortName ?? org?.name ?? 'your nonprofit';
  // No stored card or payment method means exactly that - the tiles say so
  // instead of inventing a Chase ····4242 that the donor never had.
  const card = trackedCard;
  const pay = paymentMethod;
  const chargeOn = nextChargeLabel();
  // The two history tiles: the join month is real for every account; the
  // months-giving count is a demo-dataset figure, so a real account reads "--".
  const since = memberSinceLabel(hasAccount, demoActive);
  const monthsGivingLabel = demoActive ? String(monthsGiving) : '--';

  // Demo mode keeps the short simulated re-link so the pitch flow still
  // completes offline. A real account re-authenticates through Plaid Link
  // (PlaidBankConnect, below) - the item was removed at cancellation and
  // nothing can round up until it returns.
  function handleRelink() {
    setRelinking(true);
    setTimeout(() => { setRelinking(false); setRelinked(true); }, 1200);
  }

  function handleConnected(nextCard) {
    setRelinked(true);
    setTrackedCard?.(nextCard);
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

  // Sign out clears the nonprofit admin context too (the last admin's org
  // record and tab), which AppContext.signOut cannot reach on its own.
  function handleSignOut() {
    np?.resetNpContent?.();
    signOut();
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }} data-testid="web-reactivate">
      <ChangePaymentModal
        show={changePayment}
        onClose={() => setChangePayment(false)}
        onChanged={m => setPaymentMethod(m)}
      />

      {/* Top nav  -  same webpage chrome as the wizard and the dashboard */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px', height: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {org ? <OrgLogo nonprofit={org} size={9} rounded="lg" /> : <CoinMark size={30} />}
            <div style={{ lineHeight: 1.15 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: INK.primary }}>{brand.appName ?? 'PocketCache'}</p>
              <p style={{ margin: 0, fontSize: 12, color: INK.subtle }}>powered by PocketCache</p>
            </div>
          </div>
          {org && (
            <a href={`/demo/?orgpage=${encodeURIComponent(org.shortName || org.id.toUpperCase())}`}
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 15, fontWeight: 600, color: NAVY, textDecoration: 'none' }}>
              About {npShort} →
            </a>
          )}
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1040, margin: '0 auto', padding: '44px 32px 56px' }}>
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr]" style={{ display: 'grid', gap: 36, alignItems: 'start' }}>
          {/* ── Rail: the same geometry as the wizard's, carrying the status ── */}
          <aside style={{ position: 'sticky', top: 90 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              {org ? <OrgLogo nonprofit={org} size={12} rounded="xl" /> : <CoinMark size={44} />}
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: INK.primary, lineHeight: 1.25 }}>
                  {org?.name ?? 'Your giving'}
                </p>
                <p style={{ margin: 0, fontSize: 14, color: INK.subtle }}>
                  {stage === 'closed' ? 'Your account is closed.' : 'One check and you are back.'}
                </p>
              </div>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6, color: INK.secondary }}>
              {stage === 'closed'
                ? `You closed your round-up giving to ${npShort}. Nothing was deleted  -  reactivating picks up exactly where you left off.`
                : `Reactivating restarts tracking today. Round-ups total through the end of the month, and one charge from ${npShort} follows on ${chargeOn}.`}
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.subtle }}>
              While it is closed
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
              <RailFact>Nothing is tracked and nothing rounds up.</RailFact>
              <RailFact>No charge runs, this month or any month.</RailFact>
              <RailFact tone="kept">Your donation history, receipts and settings stay exactly as they were.</RailFact>
            </ul>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: INK.subtle, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Lock size={16} color={INK.subtle} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
              <span>We disconnected your card from Plaid the day you closed the account, so re-linking it is the one step reactivation cannot skip.</span>
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
                    sub={`Since ${since} · kept in full`}
                  />
                  <StatTile
                    label="Months giving"
                    value={monthsGivingLabel}
                    sub={demoActive ? 'every receipt still on file' : 'receipts stay on file'}
                  />
                  <StatTile
                    label="Card we watched"
                    value={card ? `····${card.last4 ?? '????'}` : 'No card linked yet'}
                    sub={card ? `${card.name ?? 'Your card'} · disconnected at closure` : 'Link one when you reactivate'}
                  />
                </div>
                <Button variant="primary" size="lg" surface="web" data-testid="web-reactivate-start" onClick={() => setStage('checkin')}>
                  Reactivate my account
                </Button>

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
                  <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: INK.subtle, whiteSpace: 'nowrap' }}>Not now?</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                </div>
                <Button
                  variant="secondary" size="lg" surface="web"
                  onClick={handleSignOut}
                  data-testid="web-reactivate-signout"
                >
                  Sign out{greetingNameFor(hasAccount) ? ` of ${greetingNameFor(hasAccount)}'s account` : ''}
                </Button>
                <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: INK.subtle, textAlign: 'center' }}>
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

                {/* ── 1. The mandatory re-link ──
                    Demo mode: the simulated Re-link button. Real account: the
                    embedded Plaid Link flow, whose connected card becomes the
                    new tracked card. */}
                <ReviewBlock
                  testId="web-reactivate-card-block"
                  label="Card we track"
                  icon={<Landmark {...ICON_PROPS} />}
                  title={card?.name ?? (relinked ? 'Your card' : 'No card linked yet')}
                  meta={card ? `····${card.last4 ?? '????'}` : 'Connect the card you want us to round up'}
                  note={relinked ? null : 'We disconnected this from Plaid when you left, so nothing can round up until it is re-linked.'}
                  action={relinked ? (
                    <span data-testid="web-reactivate-relinked" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: 'var(--teal-700)' }}>
                      Connected <Check size={16} strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--warning)', background: 'var(--warning-50)', border: '1px solid #fde68a', borderRadius: RADIUS.pill, padding: '4px 9px' }}>
                        Required
                      </span>
                      {demoActive && (
                        <Button
                          variant="primary" size="md" surface="web" fullWidth={false}
                          onClick={handleRelink}
                          loading={relinking}
                          data-testid="web-reactivate-relink"
                        >
                          {relinking ? 'Linking…' : 'Re-link'}
                        </Button>
                      )}
                    </>
                  )}
                  below={!relinked && !demoActive ? (
                    <div data-testid="web-reactivate-relink">
                      <PlaidBankConnect variant="web" onConnected={handleConnected} />
                    </div>
                  ) : null}
                />

                {/* ── 2. The payment review ── */}
                <ReviewBlock
                  testId="web-reactivate-payment-block"
                  label="How you pay"
                  icon={PAYMENT_TYPE_ICON[pay?.type] ?? <CreditCard {...ICON_PROPS} />}
                  title={pay ? (pay.label ?? 'Credit or Debit Card') : 'No payment method yet'}
                  meta={pay?.last4 ? `····${pay.last4}` : 'One charge a month, collected by ' + npShort}
                  action={(
                    <>
                      {pay && <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--teal-700)' }}>Keep</span>}
                      {pay && <span style={{ color: INK.muted }}>·</span>}
                      <Button
                        variant="secondary" size="md" surface="web" fullWidth={false}
                        onClick={() => setChangePayment(true)}
                        data-testid="web-reactivate-change-payment"
                      >
                        {pay ? 'Change' : 'Add'}
                      </Button>
                    </>
                  )}
                />

                <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: INK.subtle }}>
                  Tracking restarts the moment you confirm. Your round-ups total through the last day of the
                  month, we email the exact amount on the 1st, and {npShort} charges you on {chargeOn}. Nothing
                  from while you were away is ever charged.
                </p>

                {/* production: Plaid item removed at cancellation  -  a real
                    disabled state (aria-disabled, no gradient), so the gate holds
                    for keyboard and script just as it does for a mouse. */}
                <Button variant="primary" size="lg" surface="web" data-testid="web-reactivate-restart" disabled={!relinked} onClick={handleRestart}>
                  Restart my round-ups
                </Button>
                {!relinked && (
                  <p data-testid="web-reactivate-gate-note" style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--warning)', textAlign: 'center' }}>
                    Re-link {card?.name ?? 'your card'} first  -  round-ups cannot resume without it.
                  </p>
                )}
                <Button
                  variant="tertiary" size="md" surface="web"
                  onClick={() => setStage('closed')}
                  data-testid="web-reactivate-back"
                  style={{ marginTop: 10, fontSize: 14, color: INK.subtle }}
                >
                  ← Not yet, leave my account closed
                </Button>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer style={{ padding: '0 24px 20px', textAlign: 'center' }}>
        <p style={{ color: INK.subtle, fontSize: 14, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
