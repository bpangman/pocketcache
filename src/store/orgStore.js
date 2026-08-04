// src/store/orgStore.js
// Shared org store — used by both NpContext (nonprofit side) and AppContext (donor side).
// Custom orgs created via signup are stored in localStorage under 'pc_custom_orgs'.
// BGCA overrides (from NpSettings on the BGCA demo session) are stored under 'pc_bgca_overrides'.

import { NONPROFITS } from '../data/nonprofits';

const CUSTOM_ORGS_KEY = 'pc_custom_orgs';
const BGCA_OVERRIDES_KEY = 'pc_bgca_overrides';

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ── Brand computation ─────────────────────────────────────────────────────────

// Darken a hex color by a factor (0-1 means darker)
function darkenHex(hex, factor) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0,2), 16);
  const g = parseInt(clean.slice(2,4), 16);
  const b = parseInt(clean.slice(4,6), 16);
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return `#${dr.toString(16).padStart(2,'0')}${dg.toString(16).padStart(2,'0')}${db.toString(16).padStart(2,'0')}`;
}

export function computeBrandFromColor(primary, shortName) {
  const dark1 = darkenHex(primary, 0.25);
  const dark2 = darkenHex(primary, 0.45);
  return {
    appName: `${shortName} Round-Up`,
    tagline: `Supporting ${shortName}, every purchase`,
    primary,
    secondary: darkenHex(primary, 0.1),
    gradient: `linear-gradient(135deg, ${primary} 0%, ${dark1} 100%)`,
    headerGradient: `linear-gradient(135deg, ${dark1}, ${dark2})`,
    accentLight: `${primary}22`,
    textAccent: primary,
    logoEmoji: null,
    brandLogoUrl: null,
  };
}

// ── Join code generation ──────────────────────────────────────────────────────

export function generateJoinCode(name, existingOrgs = []) {
  if (!name) return 'ORG';
  const words = name.split(/[\s&,]+/).filter(w => w.length > 2);
  let code = words.map(w => w[0].toUpperCase()).join('').slice(0, 6);
  if (!code) code = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'ORG';

  // Collision check against 'bgca' + existing custom orgs
  const taken = new Set(['bgca', ...existingOrgs.map(o => o.id)]);
  if (!taken.has(code.toLowerCase())) return code;

  // Try appending digits
  for (let i = 2; i <= 99; i++) {
    const candidate = `${code.slice(0, 5)}${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return code + '1';
}

// ── Org object builder ────────────────────────────────────────────────────────

// Format rule shared by signup + settings editing + the 404 vanity forwarder
// (which accepts up to 12, so old longer codes keep working). Kept SHORT so
// codes are easy to say out loud and type: 2–8 characters.
export const JOIN_CODE_RE = /^[A-Z0-9-]{2,8}$/;

// Is this code free to use? (optionally excluding the org that already owns it)
export function isJoinCodeAvailable(code, excludeOrgId = null) {
  if (!JOIN_CODE_RE.test(code ?? '')) return false;
  const hit = findOrgByCode(code);
  return !hit || hit.id === excludeOrgId;
}

export function buildOrgFromSignup({ name, adminEmail, story, color, logoPreview, monthlyMinimum, ein, orgAddress, joinCode, appleApproval }) {
  const existing = listCustomOrgs();
  const custom = (joinCode ?? '').toUpperCase();
  const shortName = (JOIN_CODE_RE.test(custom) && isJoinCodeAvailable(custom))
    ? custom
    : generateJoinCode(name, existing);
  const id = shortName.toLowerCase();
  return {
    id,
    name,
    shortName,
    tagline: story ? story.slice(0, 80) : `Supporting ${name}`,
    description: story || '',
    longDescription: story || '',
    logoUrl: logoPreview || null,
    monthlyMinimum: monthlyMinimum || 5,
    ein: ein || '',
    address: orgAddress || '',
    adminEmail: adminEmail || '',
    brand: computeBrandFromColor(color || '#0D9488', shortName),
    // Apple requires every nonprofit listed INSIDE the iPhone app to be
    // verified (a Candid Seal of Transparency, or Benevity registration).
    // Falls back to 'approved' via getAppleApproval() below when absent, but
    // useNpGoLive always passes a real value now - see lib/npSignup.js.
    appleApproval: appleApproval || { status: 'approved', method: 'candid_seal' },
    _isCustom: true,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function listCustomOrgs() {
  return lsGet(CUSTOM_ORGS_KEY, []);
}

// Admin sign-in: the verified work email IS the admin username. Resolve which
// custom org (if any) this email administers. Production does this lookup
// server-side; the demo can only see orgs created on this device.
export function resolveAdminOrgByEmail(email) {
  const lower = (email ?? '').trim().toLowerCase();
  if (!lower) return null;
  return listCustomOrgs().find(o => (o.adminEmail ?? '').toLowerCase() === lower) ?? null;
}

// The BGCA demo tenant has no signup flow of its own (it ships pre-seeded), so
// it has no adminEmail on its NONPROFITS record for resolveAdminOrgByEmail to
// match against. This is its stand-in: the address NpContext's DEFAULT_NP_ORG
// ships as BGCA's admin, and the one email the demo's admin sign-in has ever
// promised will "still work for BGCA" (Onboarding's AdminSignInScreen and
// WebAdminSignIn both point at it).
export const BGCA_DEMO_ADMIN_EMAIL = 'info@bgca.org';

// Admin sign-in, resolved for real: a KNOWN work email adopts the org it
// actually administers - a custom org created on this device, or BGCA via its
// demo admin address (also honoring an admin-edited BGCA email saved through
// NpSettings, since that edit is NOT mirrored into pc_bgca_overrides). An
// UNKNOWN email resolves to null so the caller can refuse sign-in instead of
// silently handing out the shared BGCA demo record - the previous behavior,
// and the reason any email at all used to land an impostor on BGCA's real
// dashboard, able to overwrite it via Settings.
export function resolveAdminOrg(email) {
  const lower = (email ?? '').trim().toLowerCase();
  if (!lower) return null;
  const custom = resolveAdminOrgByEmail(lower);
  if (custom) return { orgId: custom.id, joinCode: custom.shortName };
  const savedNpOrg = lsGet('pc_np_org', null);
  const bgcaEditedEmail = savedNpOrg && (savedNpOrg.joinCode ?? '').toUpperCase() === 'BGCA'
    ? (savedNpOrg.adminEmail ?? '').toLowerCase()
    : null;
  if (lower === BGCA_DEMO_ADMIN_EMAIL || (bgcaEditedEmail && lower === bgcaEditedEmail)) {
    return { orgId: 'bgca', joinCode: 'BGCA' };
  }
  return null;
}

// ── Real server org -> local cache bridge ─────────────────────────────────
// Server orgs (supabase table `orgs`, via the org-* edge functions) are the
// source of truth for id + join_code (see src/lib/npSignup.js). Everything
// else in this file - the dashboard, the microsite, findOrgByCode - still
// reads local custom orgs from localStorage, so a real org needs a local
// mirror to keep working with all of that unchanged. This is the one place
// that mirror gets written. `serverOrg` is the orgs_public shape (id, name,
// join_code, brand_color, mission, apple_approval, stripe_connected); fields
// the server doesn't track yet (logo, monthly minimum, EIN, address) fall
// back to whatever this device already had cached, never to blank/defaults,
// so re-adopting a server org never erases a prior local customization.
export function cacheServerOrgLocally(serverOrg, adminEmail) {
  const shortName = serverOrg.join_code;
  const id = shortName.toLowerCase();
  const existing = getCustomOrg(id);
  const merged = {
    id,
    name: serverOrg.name,
    shortName,
    tagline: serverOrg.mission ? serverOrg.mission.slice(0, 80) : `Supporting ${serverOrg.name}`,
    description: serverOrg.mission || existing?.description || '',
    longDescription: existing?.longDescription ?? (serverOrg.mission || ''),
    logoUrl: existing?.logoUrl ?? null,
    monthlyMinimum: existing?.monthlyMinimum ?? 5,
    ein: existing?.ein ?? '',
    address: existing?.address ?? '',
    adminEmail: adminEmail || existing?.adminEmail || '',
    brand: computeBrandFromColor(serverOrg.brand_color || existing?.brand?.primary || '#0D9488', shortName),
    appleApproval: serverOrg.apple_approval || existing?.appleApproval || { status: 'approved', method: 'candid_seal' },
    stripeConnected: !!serverOrg.stripe_connected,
    createdAt: existing?.createdAt || new Date().toISOString(),
    _isCustom: true,
    _serverId: serverOrg.id,
  };
  saveCustomOrg(merged);
  return merged;
}

export function saveCustomOrg(org) {
  const list = listCustomOrgs();
  const idx = list.findIndex(o => o.id === org.id);
  if (idx >= 0) list[idx] = org;
  else list.push(org);
  lsSet(CUSTOM_ORGS_KEY, list);
}

export function getCustomOrg(id) {
  return listCustomOrgs().find(o => o.id === id) ?? null;
}

// Rename a custom org's donor join code. `id` is always the lowercase form
// of the CURRENT code (see buildOrgFromSignup: `id = shortName.toLowerCase()`),
// so a rename has to move the record to a new id, not just overwrite
// `shortName` in place - otherwise the record stays filed under its old id,
// the new code never resolves via findOrgByCode/getCustomOrg, and the old
// code silently keeps working forever. There is no grace period: once this
// runs, the old code stops resolving immediately.
export function renameCustomOrgCode(orgId, newCode) {
  const list = listCustomOrgs();
  const idx = list.findIndex(o => o.id === orgId);
  if (idx < 0) return null;
  const newId = newCode.toLowerCase();
  const renamed = { ...list[idx], id: newId, shortName: newCode };
  const next = list.filter((o, i) => i !== idx && o.id !== newId);
  next.push(renamed);
  lsSet(CUSTOM_ORGS_KEY, next);
  return renamed;
}

// BGCA overrides: NpSettings edits on the BGCA demo session are stored separately
// so they can be merged when BGCA is looked up on the donor side.
export function getBgcaOverrides() {
  return lsGet(BGCA_OVERRIDES_KEY, null);
}
export function saveBgcaOverrides(overrides) {
  lsSet(BGCA_OVERRIDES_KEY, overrides);
}

// ── Apple app-listing approval ──────────────────────────────────────────────
// Apple requires every nonprofit listed INSIDE the iPhone app to be verified:
// a US 501(c)(3) with a Candid Seal of Transparency is already covered; every
// other org registers once, for free, at the Benevity Causes Portal
// (https://causes.benevity.org). This is an iPhone-app-only requirement - the
// org's PocketCache webpage and website widget are never gated by it.

/**
 * Resolve an org's Apple app-listing status. ALWAYS read through this (never
 * `org.appleApproval` directly) so a legacy/seeded record with no field at
 * all - anything created before this existed - reads as already approved
 * instead of silently blocking its iPhone-app listing.
 */
export function getAppleApproval(org) {
  return org?.appleApproval ?? { status: 'approved', method: 'candid_seal' };
}

/** Persist a status change (from the signup wizard or the dashboard card). */
export function setOrgAppleApproval(orgId, appleApproval) {
  if (!orgId) return;
  if (orgId === 'bgca') {
    saveBgcaOverrides({ ...(getBgcaOverrides() ?? {}), appleApproval });
    return;
  }
  const record = getCustomOrg(orgId);
  if (record) saveCustomOrg({ ...record, appleApproval });
}

// ── Unified org lookup ────────────────────────────────────────────────────────
// Used by both donor gate (code entry) and AppContext (selectedNonprofit resolution).

export function findOrgByCode(code) {
  if (!code) return null;
  const lower = code.toLowerCase().trim();

  // 1. Check static NONPROFITS (BGCA etc) — may have overrides applied
  const staticOrg = NONPROFITS.find(n => n.id === lower || n.shortName.toLowerCase() === lower);
  if (staticOrg) {
    if (staticOrg.id === 'bgca') {
      const overrides = getBgcaOverrides();
      if (overrides) {
        // Merge overrides into BGCA: name, description, monthlyMinimum, brand color
        const merged = { ...staticOrg, ...overrides };
        if (overrides.color) {
          merged.brand = { ...staticOrg.brand, ...computeBrandFromColor(overrides.color, staticOrg.shortName), appName: staticOrg.brand.appName, brandLogoUrl: staticOrg.brand.brandLogoUrl };
        }
        if (overrides.logoUrl !== undefined) {
          merged.brand = { ...merged.brand, brandLogoUrl: overrides.logoUrl || staticOrg.brand.brandLogoUrl };
          merged.logoUrl = overrides.logoUrl || staticOrg.brand.brandLogoUrl;
        }
        return merged;
      }
    }
    return staticOrg;
  }

  // 2. Check custom orgs
  return getCustomOrg(lower) ?? null;
}
