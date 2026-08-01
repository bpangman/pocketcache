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
//   DEMO:   the "we emailed you a 6-digit code" step generates the code in the
//           browser and fills it in for you. There is no mail server. Every
//           surface must keep saying "Demo" here - PRELAUNCH.md tracks the real
//           backend as a launch blocker.
//   DEMO:   Stripe Connect is a 1.5s timer, not an OAuth handshake.
//
// Presentation lives in the components. Copy, when it is IDENTICAL on both
// surfaces and legally load-bearing (the license summary, the launch-kit email,
// the widget snippet), lives here too so the two surfaces cannot drift apart.

import { useCallback, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { useNp } from '../store/NpContext';
import { buildOrgFromSignup, saveCustomOrg, generateJoinCode, isJoinCodeAvailable } from '../store/orgStore';
import { isNative } from '../components/AppDownloadQRModal';
import { queueWebPortalPrompt } from '../components/WebPortalLinkModal';
import { NONPROFITS } from '../data/nonprofits';

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
 *  Surfaces MUST show the demo note when this is what they got. */
export const EIN_DEMO_FALLBACK = {
  name:    'Boys & Girls Clubs of America',
  address: 'Atlanta, GA',
  is501c3: true,
};

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
  const einIsSeeded = NONPROFITS.some(np => (np.ein ?? '').replace(/\D/g, '') === einDigits);
  if (einDemoMode) return einIsSeeded ? 'found' : 'none';
  // Live ProPublica success (unreachable from a browser today, but kept
  // correct for tests/future non-browser callers): trust the real name too.
  const nameIsSeeded = NONPROFITS.some(np => np.name === orgName);
  return (einIsSeeded || nameIsSeeded) ? 'found' : 'none';
}

// ─── Work-email verification (DEMO one-time code) ─────────────────────────────

// Personal-mail domains can never administer a nonprofit. For orgs whose domain
// we know (BGCA in the demo), the email must be ON that domain. Production
// cross-checks the domain against org records + Stripe KYC and actually emails
// the code (see PRELAUNCH.md).
const FREE_MAIL = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com', 'me.com'];
const KNOWN_ORG_DOMAINS = { 'boys & girls clubs of america': 'bgca.org' };

/** The domain this org's admins must use, when we know it. */
export function requiredDomainFor(orgName) {
  return KNOWN_ORG_DOMAINS[orgName?.toLowerCase?.()] ?? null;
}

/** DEMO: any email passes so the flow can be walked end to end. This returns
 *  what the LIVE rules would have said, so the surface can say it out loud. */
export function demoBypassNoteFor(orgName, email) {
  const domain = (email ?? '').split('@')[1];
  if (!domain) return null;
  const required = requiredDomainFor(orgName);
  if (required && domain !== required) {
    return `the live version requires an @${required} address for ${orgName}`;
  }
  if (FREE_MAIL.includes(domain)) {
    return 'the live version rejects personal email domains  -  admins must use their work address';
  }
  return null;
}

/** DEMO: the code is generated here, in the browser, and auto-filled. */
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

  return useCallback(function goLive(config) {
    const org = buildOrgFromSignup({
      name:           config.name,
      adminEmail:     config.adminEmail,
      story:          config.mission,
      color:          config.color,
      logoPreview:    config.logoPreview ?? null,
      monthlyMinimum: config.monthlyMinimum,
      ein:            config.ein,
      orgAddress:     config.orgAddress,
      joinCode:       config.joinCode,
      appleApproval:  config.appleApproval,
    });
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
    });
    setAdminRole({ orgId: org.id, joinCode: org.shortName });
    setLastMode('admin');
    // Native: queue the web-portal popup to appear on the admin dashboard
    // (inverse of the QR popup web admins saw on the You're Live screen).
    if (isNative()) queueWebPortalPrompt();
    setPage('np-dashboard');
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
export function useNpSignup({ onExit, defaultLogo = null } = {}) {
  const [step, setStep] = useState('ein');

  // EIN / org identity
  const [ein, setEinRaw] = useState('');
  const [einError, setEinError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [einDemoMode, setEinDemoMode] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [org501c3, setOrg501c3] = useState(true);

  // Work-email verification (DEMO code)
  const [adminEmail, setAdminEmail] = useState('');
  const [workEmail, setWorkEmailRaw] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [codeSent, setCodeSent] = useState(false);
  const [sentCode, setSentCode] = useState('');
  const [codeInput, setCodeInputRaw] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [demoBypassNote, setDemoBypassNote] = useState(null);

  // Stripe (DEMO connect)
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);

  // Apple app-listing: simulated Candid Seal lookup + the Benevity choice the
  // admin makes on the app-listing step (only reachable when no seal was found).
  const [candidSeal, setCandidSeal] = useState('checking'); // 'checking' | 'found' | 'none'
  const [benevityChoice, setBenevityChoice] = useState(null); // null | 'benevity_submitted' | 'benevity_needed'

  // Branding
  const [story, setStory] = useState('');
  const [color, setColor] = useState('#003865');
  const [monthlyMinimum, setMonthlyMinimum] = useState(5);
  const [logoPreview, setLogoPreview] = useState(defaultLogo);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoUrlError, setLogoUrlError] = useState(null);

  // Join code: auto-suggested from the org name, but the org can set their own
  // (it becomes their link, QR, and widget identity). Editable later in Grow.
  const [joinCodeCustom, setJoinCodeCustom] = useState('');
  const [joinCodeError, setJoinCodeError] = useState(null);
  const joinCode = joinCodeCustom || generateJoinCode(orgName);

  // License
  const [accepted, setAccepted] = useState(false);
  const [showLicenseHint, setShowLicenseHint] = useState(false);
  // Same idea as showLicenseHint: submitBranding() used to just return false, so
  // pressing Continue with a bad join code did nothing visible and read as a
  // dead button. This lets the surface say why, next to the button that refused.
  const [showBrandingHint, setShowBrandingHint] = useState(false);

  const requiredDomain = requiredDomainFor(orgName);

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

    try {
      const result = await lookupEIN(digits);
      setVerifying(false);
      setOrgName(result.name || EIN_DEMO_FALLBACK.name);
      setOrgAddress(result.city && result.state ? `${result.city}, ${result.state}` : EIN_DEMO_FALLBACK.address);
      setOrg501c3(result.is501c3);
      setEinDemoMode(false);
      setStep('confirm-org');
    } catch {
      // Graceful fallback  -  use simulated BGCA result with demo note
      setVerifying(false);
      setOrgName(EIN_DEMO_FALLBACK.name);
      setOrgAddress(EIN_DEMO_FALLBACK.address);
      setOrg501c3(EIN_DEMO_FALLBACK.is501c3);
      setEinDemoMode(true);
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

  function sendCode(e) {
    e?.preventDefault?.();
    const email = workEmail.trim().toLowerCase();
    const domain = email.split('@')[1];
    if (!domain || !email.includes('@') || domain.indexOf('.') < 1) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setDemoBypassNote(demoBypassNoteFor(orgName, email));
    setEmailError(null);
    const code = generateOneTimeCode();
    setSentCode(code);
    setCodeInputRaw(code); // DEMO: auto-filled; live version emails it
    setCodeError(null);
    setCodeSent(true);
  }

  function changeEmail() {
    setCodeSent(false);
    setCodeInputRaw('');
  }

  function verifyCode(e) {
    e?.preventDefault?.();
    if (codeInput.trim() !== sentCode) {
      setCodeError("That code doesn't match  -  check the email and try again.");
      return;
    }
    setAdminEmail(workEmail.trim().toLowerCase());
    setStep('stripe');
  }

  function connectStripe() {
    setStripeConnecting(true);
    // DEMO: no OAuth handshake, just the shape of one.
    setTimeout(() => {
      setStripeConnecting(false);
      setStripeConnected(true);
    }, 1500);
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
    if (prev) setStep(prev);
    else onExit?.();
  }

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

  /** Everything useNpGoLive needs. A logo the admin never changed stays null so
   *  the org falls back to its default mark rather than storing the demo asset. */
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
  }), [orgName, joinCode, color, logoPreview, defaultLogo, story, monthlyMinimum, adminEmail, ein, orgAddress, appleApproval]);

  return {
    step, setStep,
    // EIN
    ein, setEin, einError, verifying, einDemoMode,
    orgName, setOrgName, orgAddress, org501c3,
    // email
    adminEmail, workEmail, setWorkEmail, emailError,
    codeSent, codeInput, setCodeInput, codeError, demoBypassNote, requiredDomain,
    // stripe
    stripeConnecting, stripeConnected,
    // branding
    story, setStory, color, setColor, monthlyMinimum, setMonthlyMinimum,
    logoPreview, logoUrlInput, setLogoUrlInput, logoUrlError,
    joinCode, joinCodeError,
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
  };
}
