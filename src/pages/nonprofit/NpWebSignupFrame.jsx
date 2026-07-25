import { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Landmark } from 'lucide-react';
import ScaleFit from '../../components/ScaleFit';
import CoinMark from '../../components/CoinMark';

// ─── Desktop container for the nonprofit signup wizard ───────────────────────
// The wizard itself (EIN verification → confirm org → work-email code → Stripe
// connect → branding → license → "You're Live") lives in
// src/pages/Onboarding.jsx as NonprofitSignupFlow, which is a phone-first
// component. Until that is rebuilt web-native, this gives the desktop case a
// real WEBPAGE instead of a phone-shaped column adrift in the middle of a
// 1600px window: product nav across the top, an explanatory rail that tells an
// executive director what the next ten minutes involve, the flow panel at a
// proper form width beside it, and a footer with the legal links.
//
// The panel width is capped by ScaleFit's SCALE_CAP (1.15 x its 390px reference
// = ~449px of usable content), so making the panel wider only adds gutters. A
// single-column form at ~450px is correct desktop form design anyway; what was
// wrong before was the PAGE, and that is what this file fixes.

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const NAVY = '#003865';

const PANEL_W = 452;

const NEEDS = [
  {
    icon: Landmark,
    title: 'Your EIN',
    body: 'We check it against the IRS exempt-organization list, so only a real 501(c)(3) can go live.',
  },
  {
    icon: Mail,
    title: 'A work email at your domain',
    body: 'We send a one-time code there. That address becomes the account that approves every later change.',
  },
  {
    icon: ShieldCheck,
    title: 'A Stripe account',
    body: 'Donations pay out to your Stripe directly. PocketCache never holds your money and never takes a percentage.',
  },
];

function useWindowHeight() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const update = () => setH(window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return h;
}

export default function NpWebSignupFrame({ children }) {
  const winH = useWindowHeight();
  const panelH = Math.max(560, Math.min(880, winH - 170));

  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav  -  same chrome as the rest of the web product */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CoinMark size={30} />
            <div style={{ lineHeight: 1.15 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14.5, color: INK.primary }}>PocketCache for nonprofits</p>
              <p style={{ margin: 0, fontSize: 10.5, color: INK.muted }}>Set up your round-up program</p>
            </div>
          </div>
          <a
            href="mailto:support@pocketcache.app"
            style={{ fontSize: 13, fontWeight: 600, color: NAVY, textDecoration: 'none' }}
          >
            Talk to us instead →
          </a>
        </div>
      </header>

      {/* Two columns: what this involves, and the flow itself */}
      <main
        style={{
          flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto',
          padding: '32px 24px 28px',
          display: 'grid', gridTemplateColumns: `minmax(320px, 1fr) ${PANEL_W}px`,
          gap: 40, alignItems: 'start', justifyContent: 'center',
        }}
      >
        <div style={{ minWidth: 0, paddingTop: 8 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.6px', color: INK.primary, lineHeight: 1.18 }}>
            List your nonprofit on PocketCache
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6, color: INK.secondary, maxWidth: 520 }}>
            Your supporters round up their everyday purchases and the spare change
            lands in your Stripe account once a month. Setup is self-serve and takes
            about ten minutes.
          </p>

          <div style={{ marginTop: 28, display: 'grid', gap: 18, maxWidth: 520 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.muted }}>
              What you&apos;ll need
            </p>
            {NEEDS.map(need => {
              const NeedIcon = need.icon;
              return (
                <div key={need.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef4fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <NeedIcon size={18} style={{ color: NAVY }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK.primary }}>{need.title}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.55, color: INK.secondary }}>{need.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 26, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 14, padding: '14px 16px', maxWidth: 520 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#166534' }}>
              $0 for your organization, always
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#15803d' }}>
              Donors cover the flat $1 monthly app fee, and most also cover card
              processing. PocketCache never takes a percentage of a donation.
            </p>
          </div>
        </div>

        {/* Flow panel  -  a form-width card, not a device mockup */}
        <div
          style={{
            width: PANEL_W,
            height: panelH,
            background: '#fff',
            borderRadius: 20,
            overflow: 'hidden',
            position: 'relative',
            border: '1px solid #e5e7eb',
            boxShadow: '0 16px 48px rgba(11,42,74,0.10), 0 2px 8px rgba(11,42,74,0.06)',
          }}
        >
          <ScaleFit viewport={{ width: PANEL_W, height: panelH }}>
            {children}
          </ScaleFit>
        </div>
      </main>

      <footer style={{ padding: '0 24px 22px', textAlign: 'center' }}>
        <p style={{ color: INK.muted, fontSize: 12, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CoinMark size={14} />
          Powered by PocketCache ·{' '}
          <a href="/legal/nonprofit-license/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Nonprofit License</a>{' '}
          <a href="/legal/terms/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Terms</a>{' '}
          <a href="/legal/privacy/" target="_blank" rel="noopener" style={{ color: INK.secondary }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
