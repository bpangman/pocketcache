// src/lib/npSignup.js
//
// ─── The nonprofit signup wizard, minus the pixels ────────────────────────────
//
// WHY THIS EXISTS
// There are two nonprofit signup surfaces: the phone wizard
// (Onboarding.jsx → NonprofitSignupFlow) and the desktop wizard
// (pages/nonprofit/NpWebSignup.jsx). They look nothing alike, and they must not
// share a line of layout. But they are the SAME PRODUCT FLOW: the same step
// sequence, the same real ProPublica EIN lookup with the same fallback, the same
// demo one-time-code theatre, the same simulated Stripe connect, the same
// join-code rules, the same license gate, and the same org record written at
// go-live. All of that lives here, exactly once. If you are about to copy any of
// it into a component, don't - extend this module instead.
//
// WHAT IS REAL AND WHAT IS THEATRE (do not blur this line)
//   REAL:   the EIN lookup is a live GET against ProPublica's nonprofit API.
//   DEMO:   an unreachable API / unknown EIN falls back to the BGCA sample org
//           and sets `einDemoMode`, which both wizards must surface.
//   REAL (as of 2026-08-04): work-email verification is a real Supabase OTP
//           (email code) - see src/lib/adminAuth.js. Free personal-mail
//           domains are rejected before a code is even sent, both here and
//           again server-side (org-signup edge function).
//   REAL (as of 2026-08-04): the org row is created server-side (table
//           `orgs`, RLS on) the moment email verification succeeds, and
//           Stripe Connect is Stripe's real hosted onboarding in TEST mode -
//           see connectStripe below and supabase/functions/org-connect-stripe.
//           A "practice mode" fallback (clearly labeled, never silent) keeps
//           the wizard walkable if the server is unreachable.
//
// Presentation lives in the components. Copy, when it is IDENTICAL on both
// surfaces and legally load-bearing (the license summary, the launch-kit email,
// the widget snippet), lives here too so the two surfaces cannot drift apart.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { buildOrgFromSignup, saveCustomOrg, generateJoinCode, isJoinCodeAvailable } from '../store/orgStore';
import { isNative, queueAppDownloadPrompt } from '../components/AppDownloadQRModal';
import { queueWebPortalPrompt } from '../components/WebPortalLinkModal';
import { NONPROFITS } from '../data/nonprofits';
import { pcBeacon } from './beacon.js';
import { useAdminAuth } from './adminAuth';
import { orgSignup, orgConnectStripe, orgConnectStatus, fetchOrgPublicById, currentSessionEmail } from './npApi';
import { useStepHistory } from './stepHistory';

// ─── Apple app-listing (iPhone app only - never the web) ──────────────────────
//
// Apple's charity-platform rules require every nonprofit listed INSIDE the
// iPhone app to be verified once: a US 501(c)(3) with a Candid Seal of
// Transparency is already covered, everyone else registers free at the
// Benevity Causes Portal using the org's details plus our Apple Developer
// Team ID. This never touches the web: the org's PocketCache webpage and
// website widget go live at go-live time regardless of this check.
//
// The Team ID lives in the iOS Xcode project (app/ios/App/App.xcodeproj -
// DEVELOPMENT_TEAM). Grepped from there at the time this was written; if the
// Apple Developer account's team ever changes, update this constant.
export const APPLE_TEAM_ID = 'YJU5U6VX8V';

export const BENEVITY_PORTAL_URL = 'https://causes.benevity.org';

// ─── Step sequence ────────────────────────────────────────────────────────────

/**
 * Ordered wizard steps. Both surfaces walk this exact sequence, EXCEPT
 * 'app-listing': it only renders when the simulated Candid Seal lookup comes
 * back empty (see useNpSignup's `candidSeal`). A seal match skips straight
 * from 'license' to 'live' - zero extra steps for the common case.
 */
export const NP_SIGNUP_STEPS = ['ein', 'confirm-org', 'verify-email', 'stripe', 'branding', 'license', 'app-listing', 'live'];

/** Previous step for each step; `ein` has no previous (the surface exits).
 *  'live' points at 'app-listing' here - useNpSignup.back() special-cases the
 *  seal-found path, where 'app-listing' was skipped on the way in too. */
const NP_SIGNUP_PREV = {
  ein: null,
  'confirm-org': 'ein',
  'verify-email': 'confirm-org',
  stripe: 'verify-email',
  branding: 'stripe',
  license: 'branding',
  'app-listing': 'license',
  live: 'app-listing',
};

// ─── EIN lookup ───────────────────────────────────────────────────────────────

/** XX-XXXXXXX as the admin types. */
export function formatEIN(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** REAL network call: ProPublica's public IRS exempt-organization mirror. */
export async function lookupEIN(digits9) {
  const res = await fetch(
    `https://projects.propublica.org/nonprofits/api/v2/organizations/${digits9}.json`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const org = data.organization;
  if (!org) throw new Error('No org found');
  return {
    name:     org.name ?? '',
    city:     org.city ?? '',
    state:    org.state ?? '',
    is501c3:  org.subsection_code === 3 || org.subsection_code === '3',
  };
}

/** Fallback used when the lookup fails (offline, rate limit, unknown EIN).
 *  Surfaces MUST show the demo note when this is what they got. Only used
 *  as-is when the typed EIN actually belongs to a seeded org (see
 *  einIsSeeded below) - an EIN that matches nothing gets EIN_UNKNOWN_NAME
 *  instead, so an unknown org never sails through signup still branded as
 *  BGCA. */
export const EIN_DEMO_FALLBACK = {
  name:    'Boys & Girls Clubs of America',
  address: 'Atlanta, GA',
  is501c3: true,
};

/** Neutral placeholder org name for a demo-fallback EIN that matches no
 *  seeded org. Shown editable on the confirm-org step (both surfaces) so the
 *  admin sets their real org's name instead of inheriting BGCA's. */
export const EIN_UNKNOWN_NAME = 'Your Nonprofit';

/** The seeded org (BGCA today) this EIN or name belongs to, or null. One
 *  matcher shared by the Candid Seal check, the EIN-fallback name resolution,
 *  the confirm-org logo, and the known-org domain rule, so they all agree on
 *  which orgs are "known" vs genuinely unknown. */
export function seededOrgFor({ einDigits, orgName } = {}) {
  const lowerName = (orgName ?? '').trim().toLowerCase();
  return NONPROFITS.find(np =>
    (einDigits && (np.ein ?? '').replace(/\D/g, '') === einDigits) ||
    (lowerName && np.name.toLowerCase() === lowerName)
  ) ?? null;
}

/** Does this EIN (digits only) belong to a seeded org (BGCA today)? */
function einIsSeeded(einDigits) {
  return !!seededOrgFor({ einDigits });
}

// ─── Simulated Candid Seal of Transparency lookup ──────────────────────────────
//
// DEMO: there is no real Candid API call. There is also no real ProPublica
// call in a browser - projects.propublica.org sends no CORS headers, so
// verifyEIN's fetch always throws and always falls back to the BGCA sample
// org, no matter what EIN was actually typed (see EIN_DEMO_FALLBACK below).
// That means orgName can't be trusted to tell BGCA apart from "some unknown
// org" once einDemoMode is true - it always reads as BGCA. The only signal
// that survives the fallback untouched is the EIN digits the admin actually
// entered, so that's what this keys off: BGCA's real EIN (or any other
// seeded org's EIN) reads as already sealed; anything else reads as not
// found, which is what lets an admin type literally any EIN and walk the
// Benevity path end to end in this demo.
function determineCandidSeal({ einDemoMode, einDigits, orgName }) {
  if (einDemoMode) return einIsSeeded(einDigits) ? 'found' : 'none';
  // Live ProPublica success (unreachable from a browser today, but kept
  // correct for tests/future non-browser callers): trust the real name too.
  const nameIsSeeded = NONPROFITS.some(np => np.name === orgName);
  return (einIsSeeded(einDigits) || nameIsSeeded) ? 'found' : 'none';
}

// ─── Work-email verification ─────────────────────────────────────────────────
//
// Personal-mail domains can never administer a nonprofit (rejected in
// adminAuth.sendCode before a code is even sent, and again server-side).
// For KNOWN orgs - the seeded list in data/nonprofits.js, BGCA today - the
// admin email must be on the org's official domain (officialDomain on the
// seed record), or anyone with any work email could claim BGCA. Enforced
// here BEFORE the OTP goes out (sendCode below, via requiredDomainFor) and
// enforced again server-side in the org-signup edge function
// (officialDomainFor in supabase/functions/_shared/org.ts), so the client
// check is a courtesy save of a wasted OTP round trip, never the real gate.

/** The domain this org's admins must use, when we know it - the seeded org's
 *  officialDomain, matched by EIN or exact name via seededOrgFor. Null for
 *  unknown orgs (their verified domain becomes theirs). */
export function requiredDomainFor({ einDigits, orgName } = {}) {
  return seededOrgFor({ einDigits, orgName })?.officialDomain ?? null;
}

/** DEMO: the settings-change verification modal (pages/nonprofit/AdminVerify)
 *  still simulates its one-time code in the browser - signup itself uses the
 *  real Supabase OTP (adminAuth.js). */
export function generateOneTimeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Shared content (identical on both surfaces) ──────────────────────────────

/** Brand-color palette offered at the branding step. */
export const NP_BRAND_COLORS = ['#003865', '#0D9488', '#059669', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#F59E0B'];

/** License summary shown before the accept control. Legally load-bearing, so
 *  the two surfaces read from one array rather than two hand-typed copies.
 *
 *  These bullets summarise legal/nonprofit-license/index.html and must not
 *  overstate what a donor is committed to. One bullet used to compress the whole
 *  money story into a sentence and got both halves wrong: it read as though the
 *  $1 is owed every month regardless, and as though covering the processing cost
 *  is simply what happens. The license itself is more careful - section 4 calls
 *  the fee payable "for each month a linked account is actively rounding up",
 *  and the processing cover a "donor election" that is "voluntary" and merely
 *  pre-checked - so the summary now matches the document it is summarising, and
 *  says what the nonprofit actually nets if a donor declines. */
export const NP_LICENSE_POINTS = [
  ['Always free for you.', 'You never pay PocketCache anything, and PocketCache never takes a percentage of a donation. You will never receive an invoice from us.'],
  ['Donors pay a flat $1 app fee,', 'and only in the months a charge actually runs. A month where their card never rounds up carries no fee, and if a donor skips a month nothing at all is collected then  -  that $1 simply joins their next charge.'],
  ["Covering your processing cost is the donor's choice.", 'It is pre-selected at checkout and most donors leave it on, which is how you net 100% of their round-ups, and every cent of it passes to you. A donor who unchecks it still gives: you receive their round-ups minus standard card-processing costs, the same as any card donation.'],
  ['You are the merchant of record.', 'Donations charge directly on your Stripe. PocketCache never holds donation funds.'],
  ['You issue tax receipts', 'directly to donors. PocketCache does not.'],
  ['You handle charitable solicitation registration', 'in applicable states.'],
  ['California:', 'Not available at launch. Do not promote to CA residents until PocketCache confirms availability.'],
];

/** The one-line embed an org pastes into their own website. */
export function widgetSnippet(orgName, joinCode) {
  return `<script src="https://pocketcache.app/widget.js" data-org="${joinCode}" data-name="${orgName}"></script>`;
}

/** QR target for the donor join link. */
export function joinQrValue(joinCode) {
  return `https://pocketcache.app/demo/?org=${joinCode}`;
}

/** "Forward the launch kit to a colleague" mailto (recipient left blank). */
export function launchKitMailto(orgName, joinCode) {
  const site = `https://pocketcache.app/${joinCode}`;
  const give = `https://pocketcache.app/${joinCode}/give`;
  const subject = `${orgName} is LIVE on PocketCache!`;
  const body = [
    `${orgName} is live on PocketCache! 🎉`, '',
    `Our page: ${site}`,
    `Donor join code: ${joinCode}`,
    `Direct giving link (donors sign up here): ${give}`, '',
    `Website widget  -  paste this where the "Round up for us" card should appear:`,
    widgetSnippet(orgName, joinCode), '',
    `The QR code (points to the giving link) is on the dashboard → Grow tab, ready for posters, newsletters, and event tables.`, '',
    `Admin sign-in: https://pocketcache.app/demo/?npsignin=1  -  works for the verified admin email; a fresh code is emailed each time. No password.`, '',
    ` -  Sent from ${orgName}'s PocketCache launch kit`,
  ].join('\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ─── Go-live: the single org write ────────────────────────────────────────────

/**
 * The org record. ONE writer for both surfaces: builds the org (which is where
 * the duplicate-org guard lives - buildOrgFromSignup regenerates the join code
 * if the requested one is taken), persists it, adopts it as the admin's org,
 * grants the admin role, and routes to the admin dashboard. App.jsx decides
 * whether 'np-dashboard' renders the phone shell or NpWebShell.
 */
export function useNpGoLive() {
  const { setPage, setAdminRole, setLastMode } = useApp();
  const { setNpOrg } = useNp();

  return useCallback(async function goLive(config) {
    // Server org is the source of truth for id + join_code, once it exists.
    // It was already CREATED at the end of email verification (ensureServerOrg
    // in useNpSignup); this call is the UPDATE half of org-signup's upsert,
    // landing the final name/mission/color/join-code/Apple-approval the admin
    // actually chose. config.orgId is null when email verification's own
    // org-signup call failed (server unreachable) - go-live then stays fully
    // local, exactly like the old demo, rather than blocking the admin.
    let serverOrg = null;
    if (config.orgId) {
      const res = await orgSignup({
        name: config.name,
        ein: config.ein,
        mission: config.mission,
        color: config.color,
        joinCode: config.joinCode,
        appleApproval: config.appleApproval,
      });
      if (res.ok && res.data?.org) serverOrg = res.data.org;
      else console.error('useNpGoLive: org-signup (final) failed', res.status, res.data);
    }

    const org = buildOrgFromSignup({
      name:           serverOrg?.name ?? config.name,
      adminEmail:     config.adminEmail,
      story:          serverOrg?.mission ?? config.mission,
      color:          serverOrg?.brand_color ?? config.color,
      logoPreview:    config.logoPreview ?? null,
      monthlyMinimum: config.monthlyMinimum,
      ein:            config.ein,
      orgAddress:     config.orgAddress,
      joinCode:       serverOrg?.join_code ?? config.joinCode,
      appleApproval:  serverOrg?.apple_approval ?? config.appleApproval,
    });
    // Stamp facts buildOrgFromSignup doesn't know about, so the platform admin
    // console (src/pages/PlatformAdmin.jsx) can show real "created" and
    // "Stripe connected" data instead of guessing. Orgs created before this
    // existed simply have neither field, and callers must treat that as
    // "not recorded", never as false/never-happened.
    org.createdAt = new Date().toISOString();
    org.stripeConnected = serverOrg ? !!serverOrg.stripe_connected : !!config.stripeConnected;
    if (serverOrg?.id) org._serverId = serverOrg.id;
    // Approval gate: a real server org starts 'pending_review' and only goes
    // donor-visible once the platform owner approves it (org-approve edge
    // function). The status rides on the local record + npOrg so the admin
    // dashboard can show the "awaiting review" banner and lock the Grow-tab
    // assets. A practice-mode local-only org has no server row to review, so
    // it carries no status and reads as approved (the old walkable demo).
    if (serverOrg?.status) org.status = serverOrg.status;
    saveCustomOrg(org);

    setNpOrg({
      name:           org.name,
      shortName:      org.shortName,
      color:          config.color,
      logoPreview:    org.logoUrl,
      mission:        org.description,
      monthlyMinimum: org.monthlyMinimum,
      adminEmail:     org.adminEmail,
      joinCode:       org.shortName,
      _orgId:         org.id,
      status:         serverOrg?.status,
    });
    setAdminRole({ orgId: org.id, joinCode: org.shortName });
    setLastMode('admin');
    // Queue the "get our other surface" popup to appear once the admin
    // DASHBOARD itself mounts - never mid-wizard. It used to show immediately
    // on license-accept (web) and painted straight over the Benevity portal /
    // Team ID buttons on the very next step (app-listing) or the QR/copy
    // actions on 'live'. Native has no native "app" to recommend, so it gets
    // the web-portal link instead (inverse pairing - see WebPortalLinkModal.jsx
    // and AppDownloadQRModal.jsx, and the donor-side flow this now matches).
    if (isNative()) queueWebPortalPrompt();
    else queueAppDownloadPrompt();
    setPage('np-dashboard');
    pcBeacon('nonprofit signup', { org: org.name, joinCode: org.shortName, path: config.appleApproval?.method });
    return org;
  }, [setPage, setAdminRole, setLastMode, setNpOrg]);
}

// ─── The wizard itself ────────────────────────────────────────────────────────

/**
 * Headless nonprofit signup wizard.
 *
 * @param {object}   opts
 * @param {function} opts.onExit      called when "back" is pressed on the first
 *                                    step (the surface owns where that goes).
 * @param {string}   opts.defaultLogo logo shown before the admin uploads one.
 *
 * Returns `{ step, ...state, actions }`. Action handlers accept an optional
 * event and call preventDefault, so they can be dropped straight onto a form.
 */
// A landing from Stripe's hosted onboarding (?npstripe=return|refresh&org=ID)
// is a FULL page navigation, so it always arrives on a fresh mount with no
// in-memory wizard state. This reads that off the URL once, synchronously,
// so the initial step is right the very first render (no flash of 'ein').
function stripeReturnParams() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('npstripe');
    const orgId = params.get('org');
    if ((mode === 'return' || mode === 'refresh') && orgId) {
      // Scrub the two params right here, synchronously, so a later reload of
      // the same tab (or the admin just hitting refresh) finds a clean URL
      // and does not replay this resume. The rest of the query string (and
      // any hash) is preserved untouched.
      params.delete('npstripe');
      params.delete('org');
      const rest = params.toString();
      const cleanUrl = window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
      window.history.replaceState(window.history.state, '', cleanUrl);
      return { mode, orgId };
    }
  } catch { /* no window */ }
  return null;
}

// ─── Draft persistence (survives the mobile/desktop breakpoint remount) ──────
//
// App.jsx's isMobile check (MOBILE_BP = 600) is a full component swap, not a
// CSS media query: crossing it mid-signup unmounts whichever surface is
// currently rendering this hook (Onboarding.jsx's NonprofitSignupFlow on the
// phone-style shell, NpWebSignup.jsx on the web-style one) and mounts the
// other in its place. Without this, resizing the window across 600px reset
// the wizard straight back to step 'ein' and threw away everything the admin
// had already typed. sessionStorage (not localStorage) is deliberate: it
// survives this in-tab remount but clears itself when the tab closes, so
// there is no separate staleness/expiry check to build - "same session only"
// falls out of the storage choice itself.
//
// Cleared on successful go-live (see the two useNpGoLive() callers, which
// call the `clearDraft` this hook returns) and on an explicit exit from the
// wizard's first step (back(), below).
const NP_DRAFT_KEY = 'pc_npsignup_draft';

function loadNpDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(NP_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveNpDraft(draft) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(NP_DRAFT_KEY, JSON.stringify(draft)); }
  catch { /* storage full/unavailable - the draft just won't survive a remount */ }
}

function clearNpDraft() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(NP_DRAFT_KEY); } catch { /* ignore */ }
}

export function useNpSignup({ onExit, defaultLogo = null } = {}) {
  // Captured once via the lazy useState initializer (same pattern App.jsx
  // uses for its own one-time URL reads) - stable across re-renders even
  // though stripeReturnParams() itself is not memoized.
  const [resume] = useState(stripeReturnParams);
  // A draft left by a prior mount of THIS wizard in the same tab (see the
  // persistence effect and the NP_DRAFT_KEY comment below) - ignored during a
  // real Stripe hosted-onboarding return, which reconstructs its own state
  // from the server (the resume effect further down), not from a local draft.
  const [draft] = useState(() => (resume ? null : loadNpDraft()));
  const [step, setStep] = useState(() => (resume ? 'stripe' : (draft?.step ?? 'ein')));

  // EIN / org identity
  const [ein, setEinRaw] = useState(() => draft?.ein ?? '');
  const [einError, setEinError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [einDemoMode, setEinDemoMode] = useState(() => draft?.einDemoMode ?? false);
  // True only for a demo-fallback whose EIN matches no seeded org - the
  // confirm-org step makes the name field editable in that case, instead of
  // silently branding an unknown org as BGCA.
  const [einNameEditable, setEinNameEditable] = useState(() => draft?.einNameEditable ?? false);
  const [orgName, setOrgName] = useState(() => draft?.orgName ?? '');
  const [orgAddress, setOrgAddress] = useState(() => draft?.orgAddress ?? '');
  const [org501c3, setOrg501c3] = useState(() => draft?.org501c3 ?? true);

  // Work-email verification: REAL Supabase OTP (see src/lib/adminAuth.js).
  const adminAuth = useAdminAuth();
  const [adminEmail, setAdminEmail] = useState(() => draft?.adminEmail ?? '');
  const [workEmail, setWorkEmailRaw] = useState(() => draft?.workEmail ?? '');
  const [emailError, setEmailError] = useState(null);
  // codeSent restores (it only picks which half of the verify-email step
  // shows); the code itself does not - a 6-digit OTP is single-use and
  // short-lived, so a restored draft always lands back on a clean "enter the
  // code we just sent" form rather than a stale, likely-expired one.
  const [codeSent, setCodeSent] = useState(() => draft?.codeSent ?? false);
  const [codeInput, setCodeInputRaw] = useState('');
  const [codeError, setCodeError] = useState(null);

  // Server org (table `orgs`, via the org-* edge functions). Created the
  // moment email verification succeeds (see verifyCode below) - orgId is what
  // lets the Stripe step call org-connect-stripe. Null means either "not
  // created yet" or "the server was unreachable", which is what practiceMode
  // distinguishes: a clearly-labeled local-only fallback so the wizard is
  // never dead-ended by a network blip.
  const [orgId, setOrgId] = useState(() => draft?.orgId ?? null);
  const [orgCreateError, setOrgCreateError] = useState(null);
  const [practiceMode, setPracticeMode] = useState(() => draft?.practiceMode ?? false);
  // The server org's approval status ('pending_review' until the platform
  // owner approves, 'approved' after - see supabase/functions/org-approve).
  // Set from every org-signup response; null when no server org exists yet
  // (or practice mode). Drives the completion step: a pending org gets the
  // "Almost there - awaiting review" screen instead of the live assets.
  const [orgStatus, setOrgStatus] = useState(() => draft?.orgStatus ?? null);

  // Stripe: REAL hosted Connect onboarding (test mode) via org-connect-stripe.
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(() => draft?.stripeConnected ?? false);
  const [stripeError, setStripeError] = useState(null);

  // Apple app-listing: simulated Candid Seal lookup + the Benevity choice the
  // admin makes on the app-listing step (only reachable when no seal was found).
  const [candidSeal, setCandidSeal] = useState(() => draft?.candidSeal ?? 'checking'); // 'checking' | 'found' | 'none'
  const [benevityChoice, setBenevityChoice] = useState(() => draft?.benevityChoice ?? null); // null | 'benevity_submitted' | 'benevity_needed'

  // Branding
  const [story, setStory] = useState(() => draft?.story ?? '');
  const [color, setColor] = useState(() => draft?.color ?? '#003865');
  const [monthlyMinimum, setMonthlyMinimum] = useState(() => draft?.monthlyMinimum ?? 5);
  // Not restored from the draft: a File-derived blob: URL only resolves for
  // this tab's current document, and while that still covers the in-session
  // remount this draft exists for, a logo the admin never changed already
  // falls back to defaultLogo with nothing lost - not worth persisting a
  // value that would degrade the moment a real reload ever intervenes.
  const [logoPreview, setLogoPreview] = useState(defaultLogo);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoUrlError, setLogoUrlError] = useState(null);

  // Join code: auto-suggested from the org name, but the org can set their own
  // (it becomes their link, QR, and widget identity). Editable later in Grow.
  const [joinCodeCustom, setJoinCodeCustom] = useState(() => draft?.joinCodeCustom ?? '');
  const [joinCodeError, setJoinCodeError] = useState(null);
  const joinCode = joinCodeCustom || generateJoinCode(orgName);

  // License
  const [accepted, setAccepted] = useState(() => draft?.accepted ?? false);
  const [showLicenseHint, setShowLicenseHint] = useState(false);
  // Same idea as showLicenseHint: submitBranding() used to just return false, so
  // pressing Continue with a bad join code did nothing visible and read as a
  // dead button. This lets the surface say why, next to the button that refused.
  const [showBrandingHint, setShowBrandingHint] = useState(false);

  // The seeded org (BGCA today) this signup is claiming, or null for a
  // genuinely unknown org. Drives two honesty rules the surfaces render:
  //   1. Only a seeded org's own logo may appear in the wizard - an unknown
  //      EIN gets a neutral placeholder, never BGCA branding.
  //   2. Claiming a seeded org requires an admin email on its official
  //      domain (requiredDomain below; sendCode refuses other domains before
  //      an OTP is even sent, and the server enforces it again).
  const seededOrg = seededOrgFor({ einDigits: ein.replace(/\D/g, ''), orgName });
  const requiredDomain = seededOrg?.officialDomain ?? null;

  // Persist a draft of wizard progress to sessionStorage on every meaningful
  // change, so the mobile/desktop breakpoint remount (see the NP_DRAFT_KEY
  // comment above) can restore it on the other surface's mount.
  useEffect(() => {
    saveNpDraft({
      step, ein, einDemoMode, einNameEditable, orgName, orgAddress, org501c3,
      adminEmail, workEmail, codeSent, orgId, practiceMode, stripeConnected,
      candidSeal, benevityChoice, story, color, monthlyMinimum,
      joinCodeCustom, accepted, orgStatus,
    });
  }, [
    step, ein, einDemoMode, einNameEditable, orgName, orgAddress, org501c3,
    adminEmail, workEmail, codeSent, orgId, practiceMode, stripeConnected,
    candidSeal, benevityChoice, story, color, monthlyMinimum,
    joinCodeCustom, accepted, orgStatus,
  ]);

  // A draft saved mid candidSeal-check (the ~1.2s window confirmOrg's timeout
  // covers, below) restores as 'checking' with no timer left to resolve it -
  // the timer lived on the unmounted instance. Repair it once, synchronously,
  // with the same inputs confirmOrg's own timeout would have used, instead of
  // leaving the license step waiting forever for a check that already ran.
  useEffect(() => {
    if (draft && candidSeal === 'checking' && step !== 'ein' && step !== 'confirm-org') {
      setCandidSeal(determineCandidSeal({ einDemoMode, einDigits: ein.replace(/\D/g, ''), orgName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume after the Stripe hosted-onboarding redirect. The Supabase auth
  // session survives the full-page round trip (it lives in localStorage), so
  // the admin's email comes from the current session rather than anything in
  // memory; the rest of the org (name, mission, color, join code) comes from
  // orgs_public via the org id in the URL. Runs once; the URL is scrubbed on
  // the very first render (see stripeReturnParams) so a later reload of the
  // same tab does not replay it.
  useEffect(() => {
    if (!resume) return;
    let cancelled = false;
    (async () => {
      const [org, email] = await Promise.all([fetchOrgPublicById(resume.orgId), currentSessionEmail()]);
      if (cancelled) return;
      if (!org) {
        // Nothing to resume - stay on 'stripe' with no org context; the
        // admin can back out and re-enter through the EIN step.
        setStripeError("We couldn't find your organization. Please start again.");
        return;
      }
      setOrgId(org.id);
      setOrgName(org.name);
      if (org.mission) setStory(org.mission);
      if (org.brand_color) setColor(org.brand_color);
      if (org.join_code) setJoinCodeCustom(org.join_code);
      if (org.status) setOrgStatus(org.status);
      setStripeConnected(!!org.stripe_connected);
      setEinDemoMode(false);
      // By the time an admin reaches Stripe (and comes back from it), the org
      // name was already confirmed - either a real IRS match or, for an
      // unknown EIN, whatever the admin typed into the editable field on
      // confirm-org. Either way it is a settled fact now, not something this
      // resumed session should let the admin edit again.
      setEinNameEditable(false);
      if (email) setAdminEmail(email);
      if (resume.mode === 'return') {
        const status = await orgConnectStatus(org.id);
        if (!cancelled && status.ok) setStripeConnected(!!status.data?.connected);
      }
    })();
    return () => { cancelled = true; };
  }, [resume]);

  function setEin(raw) {
    setEinRaw(formatEIN(raw));
    setEinError(null);
  }

  function setWorkEmail(raw) {
    setWorkEmailRaw(raw);
    setEmailError(null);
  }

  function setCodeInput(raw) {
    setCodeInputRaw(String(raw).replace(/\D/g, ''));
    setCodeError(null);
  }

  function changeJoinCode(raw) {
    const v = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
    setJoinCodeCustom(v);
    setShowBrandingHint(false);
    // Clearing the field is not an error: `joinCode` falls back to the code
    // generated from the org name, so blank means "use the suggested one".
    setJoinCodeError(v ? validateJoinCode(v) : null);
  }

  /**
   * The join code rules, in one place so the field and the Continue button agree.
   * Returns an error string, or null when the code is fine.
   *
   * Callers pass the code that would actually SHIP - `joinCode`, not the raw
   * field - because a blank field means the generated fallback applies.
   */
  function validateJoinCode(v) {
    if (!v) return 'Pick a join code  -  donors type this to find you.';
    if (v.length < 2) return 'At least 2 characters.';
    if (!isJoinCodeAvailable(v)) return 'That code is taken  -  try another.';
    return null;
  }

  async function verifyEIN(e) {
    e?.preventDefault?.();
    const digits = ein.replace(/\D/g, '');
    if (digits.length !== 9) {
      setEinError('EIN must be exactly 9 digits (format: XX-XXXXXXX).');
      return;
    }
    setEinError(null);
    setVerifying(true);
    setEinDemoMode(false);
    setEinNameEditable(false);

    try {
      const result = await lookupEIN(digits);
      setVerifying(false);
      setOrgName(result.name || EIN_DEMO_FALLBACK.name);
      setOrgAddress(result.city && result.state ? `${result.city}, ${result.state}` : EIN_DEMO_FALLBACK.address);
      setOrg501c3(result.is501c3);
      setEinDemoMode(false);
      setStep('confirm-org');
    } catch {
      // Graceful fallback  -  use simulated result with demo note. Only the
      // EIN that actually belongs to a seeded org (BGCA's real EIN) gets
      // BGCA's name - any other EIN is genuinely unknown, so the name must
      // NOT default to BGCA's. It gets a neutral placeholder instead, and
      // the confirm-org step (both surfaces) makes it editable via
      // einNameEditable so the admin sets their real org's name. Same logic
      // for the address: an unknown EIN has nothing to do with BGCA's
      // Atlanta office, so it gets no address at all rather than borrowing
      // BGCA's - the confirm-org step (both surfaces) already treats a blank
      // orgAddress fine, since it's just a subtitle under the org name.
      setVerifying(false);
      const seeded = einIsSeeded(digits);
      setOrgName(seeded ? EIN_DEMO_FALLBACK.name : EIN_UNKNOWN_NAME);
      setOrgAddress(seeded ? EIN_DEMO_FALLBACK.address : '');
      setOrg501c3(seeded ? EIN_DEMO_FALLBACK.is501c3 : false);
      setEinDemoMode(true);
      setEinNameEditable(!seeded);
      setStep('confirm-org');
    }
  }

  function confirmOrg() {
    setStep('verify-email');
    // Kick off the simulated Candid Seal lookup now, so its ~1.2s has plenty
    // of time to resolve before the admin could possibly reach the license
    // step (email verify + Stripe connect + branding all come first).
    setCandidSeal('checking');
    const einDigits = ein.replace(/\D/g, '');
    setTimeout(() => {
      setCandidSeal(determineCandidSeal({ einDemoMode, einDigits, orgName }));
    }, 1200);
  }

  function reenterEIN() {
    setStep('ein');
  }

  async function sendCode(e) {
    e?.preventDefault?.();
    const email = workEmail.trim().toLowerCase();
    // Known-org claim gate (client half - org-signup enforces it again):
    // claiming a seeded org (BGCA today) requires an email on its official
    // domain. Refusing here saves the admin a wasted OTP round trip.
    const domain = email.split('@')[1] || '';
    if (requiredDomain && domain !== requiredDomain) {
      const err = `To claim ${orgName}, use an email at @${requiredDomain}.`;
      setEmailError(err);
      return false;
    }
    const result = await adminAuth.sendCode(email);
    if (!result.ok) { setEmailError(result.error); return false; }
    setEmailError(null);
    setCodeInputRaw('');
    setCodeError(null);
    setCodeSent(true);
    return true;
  }

  function changeEmail() {
    setCodeSent(false);
    setCodeInputRaw('');
    setCodeError(null);
  }

  /** Creates (or, on a retry, reuses) the server org the moment the work
   *  email verifies - see the ordering note atop this file and in
   *  supabase/functions/org-signup/index.ts. Never blocks go-live: if the
   *  server is unreachable, orgId stays null and practiceMode flips on so the
   *  Stripe step falls back to a clearly-labeled local simulation instead of
   *  stranding the admin mid-wizard. */
  async function ensureServerOrg() {
    const res = await orgSignup({ name: orgName, ein: ein.replace(/\D/g, '') });
    if (res.ok && res.data?.org?.id) {
      setOrgId(res.data.org.id);
      if (res.data.org.status) setOrgStatus(res.data.org.status);
      setOrgCreateError(null);
      setPracticeMode(false);
      return res.data.org;
    }
    console.error('npSignup: org-signup failed', res.status, res.data);
    setOrgCreateError(res.data?.error || null);
    setPracticeMode(true);
    return null;
  }

  async function verifyCode(e) {
    e?.preventDefault?.();
    const email = workEmail.trim().toLowerCase();
    const result = await adminAuth.verifyCode(email, codeInput.trim());
    if (!result.ok) { setCodeError(result.error); return; }
    setCodeError(null);
    setAdminEmail(email);
    await ensureServerOrg();
    setStep('stripe');
  }

  /** REAL Stripe Connect hosted onboarding (test mode): navigates the whole
   *  page to Stripe, which redirects back to ?npstripe=return&org=<id> (see
   *  the resume effect above) once the admin finishes or bails. Falls back to
   *  a clearly-labeled practice mode if org-connect-stripe can't be reached -
   *  never a silent one: stripeError stays set so the surface can say why. */
  async function connectStripe() {
    setStripeError(null);
    if (!orgId) {
      practiceConnectStripe();
      return;
    }
    setStripeConnecting(true);
    const res = await orgConnectStripe(orgId);
    if (!res.ok || !res.data?.url) {
      setStripeConnecting(false);
      console.error('npSignup: org-connect-stripe failed', res.status, res.data);
      setStripeError(res.data?.error || "Could not reach Stripe. Try again, or continue in practice mode.");
      return;
    }
    window.location.assign(res.data.url);
  }

  /** Explicit escape hatch, only ever reached after a real attempt failed
   *  (see the stripeError branch in each surface) - the wizard never falls
   *  into this silently. */
  function practiceConnectStripe() {
    setPracticeMode(true);
    setStripeError(null);
    setStripeConnecting(true);
    setTimeout(() => {
      setStripeConnecting(false);
      setStripeConnected(true);
    }, 1200);
  }

  function stripeNext() {
    setStep('branding');
  }

  function setLogoFile(file) {
    if (file) setLogoPreview(URL.createObjectURL(file));
  }

  /** Paste-a-URL logo: only adopted once the browser can actually load it. */
  function applyLogoUrl(raw) {
    const url = (raw ?? '').trim();
    if (!url) return;
    const img = new Image();
    img.onload = () => { setLogoPreview(url); setLogoUrlError(null); };
    img.onerror = () => { setLogoUrlError("We couldn't load that image  -  check the link or upload a file instead"); };
    img.src = url;
  }

  function submitBranding(e) {
    e?.preventDefault?.();
    // Validate the code that would actually ship: `joinCode` falls back to one
    // generated from the org name, and that generated value never passed through
    // changeJoinCode(), so it had never been checked at all.
    const err = validateJoinCode(joinCode);
    if (err) {
      setJoinCodeError(err);
      setShowBrandingHint(true);
      return false;
    }
    setJoinCodeError(null);
    setShowBrandingHint(false);
    setStep('license');
    return true;
  }

  /** Returns true when the license was accepted and the wizard advanced, so the
   *  surface can fire its own completion chrome (QR popup, confetti, ...).
   *  A seal match skips 'app-listing' entirely - straight to 'live'. Anything
   *  else (including a seal check that is still 'checking' this instant, which
   *  should not happen given confirmOrg's head start, but is handled safely)
   *  shows the app-listing step so the admin always sees a real answer. */
  function acceptLicense(e) {
    e?.preventDefault?.();
    if (!accepted) { setShowLicenseHint(true); return false; }
    setStep(candidSeal === 'found' ? 'live' : 'app-listing');
    return true;
  }

  function openBenevityPortal() {
    window.open(BENEVITY_PORTAL_URL, '_blank', 'noopener');
  }

  /** "I have registered" on the app-listing step. Either choice below goes
   *  live immediately - neither one blocks go-live, only the iPhone-app
   *  listing itself waits. */
  function confirmBenevityRegistered() {
    setBenevityChoice('benevity_submitted');
    setStep('live');
  }

  /** "I'll do this later" on the app-listing step. */
  function deferBenevity() {
    setBenevityChoice('benevity_needed');
    setStep('live');
  }

  function back() {
    // The seal-found path skipped 'app-listing' on the way in, so going back
    // from 'live' has to skip it too, or back() would land on a step that was
    // never shown and dead-end the admin on a re-click of "Back".
    if (step === 'live' && candidSeal === 'found') { setStep('license'); return; }
    const prev = NP_SIGNUP_PREV[step];
    if (prev) { setStep(prev); return; }
    // Leaving the wizard entirely from its first step - an explicit exit, not
    // a breakpoint-triggered remount, so the draft that exists only to survive
    // THAT should not survive this.
    clearNpDraft();
    onExit?.();
  }

  // Hardware/browser back steps through the SAME sequence the wizard's own
  // "← Back" button already does (back(), above) - one wiring point covers
  // both surfaces, since NonprofitSignupFlow (Onboarding.jsx, app) and
  // NpWebSignup.jsx (web) both render off this one hook and both point their
  // own back button at this same `back` function. On the first step ('ein'),
  // back() itself already calls onExit() - the surface's own exit target -
  // so hardware back on the first step "just works" without any special
  // case here.
  useStepHistory(step, back);

  // The Apple app-listing status that will be written to the org record at
  // go-live. Seal match -> approved, nothing else to decide. No seal -> what
  // the admin picked on the app-listing step, defaulting to 'benevity_needed'
  // if they somehow reach 'live' without picking (should not happen; both
  // buttons on that step set this before advancing).
  const appleApproval = useMemo(() => (
    candidSeal === 'found'
      ? { status: 'approved', method: 'candid_seal' }
      : { status: benevityChoice ?? 'benevity_needed', method: 'benevity' }
  ), [candidSeal, benevityChoice]);

  // The moment the wizard reaches its completion step with a real server org,
  // send the completed payload to org-signup. That call is what marks the org
  // "waiting for review" server-side and fires the owner's approval-alert
  // email - it must NOT wait for the admin to also click "Open your
  // dashboard" (useNpGoLive sends the same idempotent payload again there;
  // the alert itself is sent exactly once, guarded by approve_alert_sent_at
  // server-side). The response's status tells this wizard whether to show
  // "Almost there - awaiting review" or the live assets.
  const finalizeRanRef = useRef(false);
  useEffect(() => {
    if (step !== 'live' || !orgId || practiceMode || finalizeRanRef.current) return;
    finalizeRanRef.current = true;
    (async () => {
      const res = await orgSignup({
        name: orgName,
        ein,
        mission: story,
        color,
        joinCode,
        appleApproval,
      });
      if (res.ok && res.data?.org?.status) setOrgStatus(res.data.org.status);
      else if (!res.ok) console.error('npSignup: completion org-signup failed', res.status, res.data);
    })();
    // Only the arrival on 'live' should fire this - the payload fields are
    // settled by then and must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, orgId, practiceMode]);

  // A real server org that has not been approved yet. The surfaces swap the
  // "You're Live" assets for the "Almost there - awaiting review" screen, and
  // donor surfaces hold the org back (see orgStore.isOrgPending).
  const pendingReview = orgStatus === 'pending_review';

  // The logo the surfaces should DISPLAY. The phone wizard passes BGCA's logo
  // as defaultLogo, which is only honest while the org being signed up IS the
  // seeded BGCA - an unknown org must never preview under BGCA's mark, so an
  // untouched default logo reads as "no logo" (surfaces show their neutral
  // placeholder) unless the org is genuinely seeded.
  const displayLogoPreview = (logoPreview === defaultLogo && !seededOrg) ? null : logoPreview;

  /** Everything useNpGoLive needs. A logo the admin never changed stays null so
   *  the org falls back to its default mark rather than storing the demo asset.
   *  `orgId` tells goLive whether a server org already exists to update
   *  (email verification succeeded) or whether it must fall back to a fully
   *  local record (practiceMode - the server was unreachable). */
  const config = useMemo(() => ({
    name:           orgName,
    shortName:      joinCode,
    color,
    logoPreview:    logoPreview !== defaultLogo ? logoPreview : null,
    mission:        story,
    monthlyMinimum,
    adminEmail,
    joinCode,
    ein,
    orgAddress,
    appleApproval,
    stripeConnected,
    orgId,
  }), [orgName, joinCode, color, logoPreview, defaultLogo, story, monthlyMinimum, adminEmail, ein, orgAddress, appleApproval, stripeConnected, orgId]);

  return {
    step, setStep,
    // EIN
    ein, setEin, einError, verifying, einDemoMode, einNameEditable,
    orgName, setOrgName, orgAddress, org501c3,
    // The seeded org being claimed (BGCA today), or null for an unknown org.
    // Surfaces use it for the ONLY case a real logo may show pre-branding.
    seededOrg,
    // email
    adminEmail, workEmail, setWorkEmail, emailError,
    codeSent, codeInput, setCodeInput, codeError, requiredDomain,
    sendingCode: adminAuth.sendingCode, verifyingCode: adminAuth.verifying,
    // server org
    orgId, orgCreateError, practiceMode,
    // approval gate: 'pending_review' | 'approved' | null (no server org)
    orgStatus, pendingReview,
    // stripe
    stripeConnecting, stripeConnected, stripeError, practiceConnectStripe,
    // branding
    story, setStory, color, setColor, monthlyMinimum, setMonthlyMinimum,
    logoPreview: displayLogoPreview, logoUrlInput, setLogoUrlInput, logoUrlError,
    // joinCode is the EFFECTIVE code (falls back to the generated suggestion
    // when the admin hasn't typed one) - use it for preview text and links.
    // joinCodeCustom is the raw field the admin is actually editing - bind
    // the <input> to THIS, not to joinCode, or a cleared field snaps back to
    // the generated fallback text on every render and corrupts what gets typed
    // next (e.g. clearing then typing "UNKORG1" would land as "BGCA2UNK").
    joinCode, joinCodeCustom, joinCodeError,
    // license
    accepted, setAccepted, showLicenseHint, showBrandingHint,
    // apple app-listing
    candidSeal, benevityChoice, appleApproval,
    openBenevityPortal, confirmBenevityRegistered, deferBenevity,
    // actions
    verifyEIN, confirmOrg, reenterEIN,
    sendCode, changeEmail, verifyCode,
    connectStripe, stripeNext,
    changeJoinCode, setLogoFile, applyLogoUrl, submitBranding,
    acceptLicense, back,
    config,
    // Call after a successful useNpGoLive() - the wizard is done, so the
    // in-tab draft that exists only to survive a breakpoint remount mid-signup
    // has nothing left to protect.
    clearDraft: clearNpDraft,
  };
}
