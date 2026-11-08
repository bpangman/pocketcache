import { useState, useEffect } from 'react';
import { Smartphone, Mail, Share2, Check, Hourglass } from 'lucide-react';
import { findOrgByCode, resolveOrgByCode, isOrgPending } from '../store/orgStore';
import { fmtMoney, fmtCount } from '../lib/format';
import { getOrgStats } from '../lib/orgStats';
import { isMatchVisible } from '../lib/donorContent';
import { useShowDemoAffordances } from '../lib/demo';
import { RADIUS } from '../lib/webTheme';
import CoinMark from '../components/CoinMark';
import OrgLogo from '../components/OrgLogo';

// OrgLandingPage  -  public micro-site for a nonprofit's vanity URL.
// Rendered full-viewport (not inside the phone shell) when ?orgpage=CODE is in the URL.
// This is a normal web page with a simple responsive max-width column layout.
//
// It mounts OUTSIDE AppProvider (App.jsx ?orgpage= branch), so there is no
// donor demo toggle here: "demo" on this surface means the demo build or the
// marketing PhoneFrame shell (lib/demo.js). A stranger landing from a QR code
// is the real public, and sample figures are labelled for them.

// Mobile user agents are the ones where an sms: link opens a real composer.
// On a desktop browser it is a dead control (or an app picker at best), so the
// email button carries the "send it to my phone" job there.
const TOUCH_UA = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function DemoPill() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 8px', minHeight: 20, lineHeight: 1.2,
      borderRadius: RADIUS.pill, background: 'var(--gold-50)', color: 'var(--warning)',
      verticalAlign: 'middle',
    }}>
      Demo data
    </span>
  );
}

// Secondary share pills: --surface fill, --ink-2 label, 44px tall so each is a
// full hit target, pill radius like every other web button.
const SHARE_BTN = {
  flex: '1 1 110px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  minHeight: 44, padding: '0 16px', borderRadius: RADIUS.pill, border: '1px solid var(--line)',
  background: 'var(--surface)', color: 'var(--ink-2)', fontWeight: 600, fontSize: 14,
  textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit',
};

export default function OrgLandingPage({ code }) {
  // Initial sync value covers the BGCA seed and any org this device already
  // has cached; the effect below is the server-first upgrade so a code from
  // ANY device (not just the one that created the org) still resolves here -
  // this page is exactly the surface a QR code or vanity URL lands a stranger
  // on, so it cannot rely on localStorage alone.
  const [org, setOrg] = useState(() => findOrgByCode(code));
  const [shareClicked, setShareClicked] = useState(false);
  const [orgStats, setOrgStats] = useState(null);
  const demoActive = useShowDemoAffordances(false);
  useEffect(() => {
    let cancelled = false;
    resolveOrgByCode(code).then(resolved => {
      if (!cancelled && resolved) setOrg(resolved);
    });
    return () => { cancelled = true; };
  }, [code]);
  useEffect(() => {
    if (!org) return;
    getOrgStats(org).then(setOrgStats);
  }, [org]);
  // The tab reads as the nonprofit's own page, and the previous title comes
  // back if this page unmounts in-tab (it never does today, but it is cheap).
  const orgName = org?.name;
  useEffect(() => {
    if (!orgName) return;
    const prev = document.title;
    document.title = `${orgName} - Round-up giving`;
    return () => { document.title = prev; };
  }, [orgName]);

  if (!org) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', color: '#fff', textAlign: 'center', padding: '2rem' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>Org not found</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            We couldn&apos;t find &ldquo;{code}&rdquo;. Double-check the link or{' '}
            <a href="/" style={{ color: 'var(--gold)', fontWeight: 600 }}>go to PocketCache</a>.
          </p>
        </div>
      </div>
    );
  }

  // The org exists but is still awaiting the platform owner's approval
  // (orgs.status = 'pending_review') - the microsite is held back so nothing
  // printed or shared early lands donors on a page that cannot enroll them.
  if (isOrgPending(org)) {
    return (
      <div className="pc-on-dark" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', color: '#fff', textAlign: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }} aria-hidden>
            <Hourglass size={36} color="var(--gold)" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 8, textWrap: 'balance' }}>This nonprofit&apos;s page is almost ready</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            {org.name} is finishing setup with PocketCache. Check back soon - donations open the
            moment their page is approved.
          </p>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px', color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>
            <CoinMark size={18} /> Go to PocketCache
          </a>
        </div>
      </div>
    );
  }

  const isBgca = org.id === 'bgca';
  const brandColor = org.brand?.primary || '#003865';
  const orgCode = org.shortName || org.id.toUpperCase();
  const joinUrl = `/demo/?org=${encodeURIComponent(orgCode)}`;
  // A returning supporter goes through the wizard's own sign-in door, not back
  // into account creation (WebOnboarding reads entryIntent before org).
  const signInUrl = `${joinUrl}&signin=1`;
  const adminSignInUrl = `/demo/?npsignin=1`;
  const vanityUrl = `https://pocketcache.app/${orgCode}`;
  const shareText = `Join ${org.name} on PocketCache: ${vanityUrl}`;

  // Public stats: live data when VITE_API_BASE is set (orgStats.isDemo=false);
  // seeded demo numbers otherwise. matchStatus always comes from org metadata,
  // but BGCA's seed match is a SAMPLE (GM, $50K) and the public never sees a
  // sponsor claim that does not exist: isMatchVisible hides it outside demo.
  const displayRaised = orgStats?.raised ?? (isBgca ? (org.raised ?? 3841209) : null);
  const displayDonors = orgStats?.donors ?? null;
  const totalDonors  = displayDonors != null ? fmtCount(displayDonors) : null;
  const totalRaised  = displayRaised != null ? `$${fmtMoney(displayRaised)}` : null;
  // The match tile only renders while a match is live: a big-number slot that
  // reads "None" is a stat about nothing, so the tile is dropped instead.
  const matchStatus  = isBgca && isMatchVisible(org.corporateMatch, demoActive) ? 'Active' : null;
  const showDemoPill = orgStats != null ? orgStats.isDemo : isBgca;

  const storyText = org.longDescription || org.description || '';

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: `Support ${org.name}`, text: shareText, url: vanityUrl })
        .then(() => setShareClicked(true))
        .catch(() => {/* user cancelled */});
    }
  }

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  // Inline styles only (no Tailwind  -  this page lives outside the phone shell and
  // should be self-contained and responsive without fighting phone-frame CSS).
  // Values come from the shared tokens in src/index.css so the micro-site
  // reads as the same product as the portal it links into.
  const card = {
    background: '#fff', borderRadius: RADIUS.lg, padding: 24,
    marginBottom: 20, boxShadow: 'var(--shadow-1)',
    border: '1px solid var(--line)',
  };

  return (
    <div style={{ fontFamily: 'inherit', minHeight: '100vh', background: 'var(--surface)', color: 'var(--ink)' }}>

      {/* Hero */}
      <div className="pc-on-dark" style={{ background: `linear-gradient(135deg, ${brandColor} 0%, #001a33 100%)`, paddingBottom: 48 }}>
        {/* Nav */}
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, textDecoration: 'none' }}>
            <CoinMark size={26} />
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 600 }}>PocketCache</span>
          </a>
          <a
            href={adminSignInUrl}
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600, padding: '0 16px', borderRadius: RADIUS.pill, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}
          >
            Nonprofit admin? Sign in
          </a>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 24px 0', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <OrgLogo nonprofit={org} size={20} rounded="3xl" />
          </div>
          <h1 style={{ color: '#fff', fontSize: 34, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.2, textWrap: 'balance' }}>
            {org.name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, lineHeight: 1.6, margin: '0 auto', maxWidth: 480 }}>
            Welcome to the {org.name} round-up microsite
          </p>
        </div>
      </div>

      {/* Stats band. One "Demo data" label for the whole row - the figures are
          seeded sample numbers until live stats arrive, and saying so once is
          enough for the public to read them correctly. */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--line)', padding: '20px 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
          {showDemoPill && (
            <div style={{ textAlign: 'center', marginBottom: 8 }} data-testid="orgpage-demo-pill">
              <DemoPill />
            </div>
          )}
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { label: 'Total donors',     value: totalDonors },
              { label: 'Total raised',     value: totalRaised },
              ...(matchStatus ? [{ label: 'Corporate match', value: matchStatus }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', color: value ? brandColor : 'var(--muted)' }}>
                  {value ?? '--'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 600, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* Start giving  -  the app runs right here on the web */}
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 8px' }}>Start giving in under a minute</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 15, margin: '0 0 16px', lineHeight: 1.55 }}>
            Round up your everyday purchases  -  spare change goes straight to {org.name}.
            Nothing to download: sign in, link a card, and you&apos;re giving, right from your browser.
          </p>
          <a
            href={joinUrl}
            className="pc-btn"
            data-variant="primary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, background: `linear-gradient(135deg, ${brandColor}, #001a33)`, color: '#fff', textAlign: 'center', padding: '0 20px', borderRadius: RADIUS.pill, fontWeight: 700, fontSize: 16, textDecoration: 'none', marginBottom: 8 }}
          >
            Start giving to {orgCode} →
          </a>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '0 0 16px', textAlign: 'center' }}>
            Already a supporter?{' '}
            <a href={signInUrl} data-testid="orgpage-signin" style={{ display: 'inline-block', padding: '12px 4px', margin: '-12px -4px', color: brandColor, fontWeight: 600 }}>Open your giving dashboard</a>
          </p>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '0 0 8px', textAlign: 'center' }}>Or send it to your phone:</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {TOUCH_UA && (
              <a
                href={`sms:?&body=${encodeURIComponent(shareText)}`}
                data-testid="orgpage-sms"
                style={SHARE_BTN}
              >
                <Smartphone size={16} aria-hidden /> Text me the link
              </a>
            )}
            <a
              href={`mailto:?subject=${encodeURIComponent(`Join ${org.name} on PocketCache`)}&body=${encodeURIComponent(shareText)}`}
              style={SHARE_BTN}
            >
              <Mail size={16} aria-hidden /> Email me the link
            </a>
            {canShare && (
              <button
                type="button"
                onClick={handleShare}
                style={{
                  ...SHARE_BTN,
                  ...(shareClicked ? { background: 'var(--green-50)', color: 'var(--green-700)', borderColor: 'transparent' } : {}),
                }}
              >
                {shareClicked ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
                {shareClicked ? 'Shared' : 'Share'}
              </button>
            )}
          </div>
        </div>

        {/* Story */}
        {storyText && (
          <div style={card}>
            <h2 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: 'var(--ink)', margin: '0 0 12px' }}>Our story</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>
              {storyText}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: '#fff', borderTop: '1px solid var(--line)', padding: 24, textAlign: 'center' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, textDecoration: 'none', color: 'var(--slate)', fontSize: 13 }}>
          <CoinMark size={16} />
          Powered by PocketCache  -  round-up giving software
        </a>
      </div>
    </div>
  );
}
