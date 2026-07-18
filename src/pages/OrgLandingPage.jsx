import { useState, useEffect } from 'react';
import { findOrgByCode } from '../store/orgStore';
import { fmtMoney, fmtCount } from '../lib/format';
import { getOrgStats } from '../lib/orgStats';
import CoinMark from '../components/CoinMark';
import OrgLogo from '../components/OrgLogo';

// OrgLandingPage  -  public micro-site for a nonprofit's vanity URL.
// Rendered full-viewport (not inside the phone shell) when ?orgpage=CODE is in the URL.
// This is a normal web page with a simple responsive max-width column layout.

function DemoPill() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 99, background: '#fef3c7', color: '#92400e',
      verticalAlign: 'middle', marginLeft: 6,
    }}>
      Demo data
    </span>
  );
}

export default function OrgLandingPage({ code }) {
  const org = findOrgByCode(code);
  const [shareClicked, setShareClicked] = useState(false);
  const [orgStats, setOrgStats] = useState(null);
  useEffect(() => {
    const targetOrg = findOrgByCode(code);
    if (!targetOrg) return;
    getOrgStats(targetOrg).then(setOrgStats);
  }, [code]);

  if (!org) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B2A4A', color: '#fff', textAlign: 'center', padding: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Org not found</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>
            We couldn&apos;t find &ldquo;{code}&rdquo;. Double-check the link or{' '}
            <a href="/" style={{ color: '#FBBF24', fontWeight: 600 }}>go to PocketCache</a>.
          </p>
        </div>
      </div>
    );
  }

  const isBgca = org.id === 'bgca';
  const brandColor = org.brand?.primary || '#003865';
  const orgCode = org.shortName || org.id.toUpperCase();
  const joinUrl = `/demo/?org=${encodeURIComponent(orgCode)}`;
  const adminSignInUrl = `/demo/?npsignin=1`;
  const vanityUrl = `https://pocketcache.app/${orgCode}`;
  const shareText = `Join ${org.name} on PocketCache: ${vanityUrl}`;

  // Public stats: live data when VITE_API_BASE is set (orgStats.isDemo=false);
  // seeded demo numbers otherwise. matchStatus always comes from org metadata.
  const displayRaised = orgStats?.raised ?? (isBgca ? (org.raised ?? 3841209) : null);
  const displayDonors = orgStats?.donors ?? null;
  const totalDonors  = displayDonors != null ? fmtCount(displayDonors) : null;
  const totalRaised  = displayRaised != null ? `$${fmtMoney(displayRaised)}` : null;
  const matchStatus  = isBgca ? (org.corporateMatch?.active ? 'Active' : 'None') : null;
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
  const card = {
    background: '#fff', borderRadius: 20, padding: '1.5rem',
    marginBottom: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    border: '1px solid #e5e7eb',
  };

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${brandColor} 0%, #001a33 100%)`, paddingBottom: '3rem' }}>
        {/* Nav */}
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <CoinMark size={26} />
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600 }}>PocketCache</span>
          </a>
          <a
            href={adminSignInUrl}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '0.45rem 0.9rem', borderRadius: 20, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}
          >
            Nonprofit admin? Sign in
          </a>
        </div>

        {/* Hero content */}
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.5rem 1.5rem 0', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <OrgLogo nonprofit={org} size={20} rounded="2xl" />
          </div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, margin: '0 0 0.5rem', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
            {org.name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', lineHeight: 1.6, margin: '0 auto', maxWidth: 480 }}>
            {org.tagline || org.brand?.tagline || org.description}
          </p>
        </div>
      </div>

      {/* Stats band */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '1.25rem 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { label: 'Total donors',     value: totalDonors,   showPill: showDemoPill },
            { label: 'Total donated',    value: totalRaised,   showPill: showDemoPill },
            { label: 'Corporate match',  value: matchStatus,   showPill: showDemoPill },
          ].map(({ label, value, showPill }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: value ? brandColor : '#9ca3af' }}>
                {value ?? '--'}
                {showPill && value && <DemoPill />}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>

        {/* Start giving  -  the app runs right here on the web */}
        <div style={card}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: '0 0 0.4rem' }}>Start giving in under a minute</h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.55 }}>
            Round up your everyday purchases  -  spare change goes straight to {org.name}.
            Nothing to download: sign in, link a card, and you&apos;re giving, right from your browser.
          </p>
          <a
            href={joinUrl}
            style={{ display: 'block', background: `linear-gradient(135deg, ${brandColor}, #001a33)`, color: '#fff', textAlign: 'center', padding: '0.85rem', borderRadius: 14, fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', marginBottom: '0.5rem' }}
          >
            Start giving to {orgCode} →
          </a>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 1rem', textAlign: 'center' }}>
            Already a supporter?{' '}
            <a href={joinUrl} style={{ color: brandColor, fontWeight: 600 }}>Open your giving dashboard</a>
          </p>
          <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: '0.6rem', textAlign: 'center' }}>Or send it to your phone:</p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <a
              href={`sms:?&body=${encodeURIComponent(shareText)}`}
              style={{ flex: '1 1 110px', background: '#f3f4f6', color: '#374151', textAlign: 'center', padding: '0.6rem 0.75rem', borderRadius: 10, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
            >
              📱 Text me the link
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Join ${org.name} on PocketCache`)}&body=${encodeURIComponent(shareText)}`}
              style={{ flex: '1 1 110px', background: '#f3f4f6', color: '#374151', textAlign: 'center', padding: '0.6rem 0.75rem', borderRadius: 10, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
            >
              ✉️ Email me the link
            </a>
            {canShare && (
              <button
                onClick={handleShare}
                style={{ flex: '1 1 110px', background: shareClicked ? '#d1fae5' : '#f3f4f6', color: shareClicked ? '#065f46' : '#374151', textAlign: 'center', padding: '0.6rem 0.75rem', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}
              >
                {shareClicked ? '✓ Shared' : '🔗 Share'}
              </button>
            )}
          </div>
        </div>

        {/* Story */}
        {storyText && (
          <div style={card}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: '0 0 0.75rem' }}>Our story</h2>
            <p style={{ color: '#374151', fontSize: '0.925rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>
              {storyText}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: '#f3f4f6', borderTop: '1px solid #e5e7eb', padding: '1.5rem', textAlign: 'center' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#6b7280', fontSize: 13 }}>
          <CoinMark size={16} />
          Powered by PocketCache  -  round-up giving software
        </a>
      </div>
    </div>
  );
}
