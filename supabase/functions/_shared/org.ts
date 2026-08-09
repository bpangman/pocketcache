// Shared helpers for the org-* edge functions (nonprofit self-serve
// onboarding). Reuses dbRest/resolveUser/STRIPE_SK from stripe.ts rather than
// duplicating them - those helpers are generic (service-role PostgREST calls,
// Supabase session resolution), not Stripe-specific despite the file name.
import { dbRest } from "./stripe.ts";

// Same list the client (src/lib/npSignup.js) already rejects at signup - kept
// in sync by hand since one is Deno/TS and the other is browser JS. A nonprofit
// admin account can never live on a free personal mail domain.
export const FREE_MAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com", "me.com",
]);

export function emailDomain(email: string): string {
  return (email.split("@")[1] || "").toLowerCase();
}

// ─── Known orgs (seeded) ─────────────────────────────────────────────────────
// Mirror of src/data/nonprofits.js (BGCA today). When a signup claims one of
// these orgs - matched by EIN or by name - the verified admin email MUST be on
// the org's official domain, or anyone with any work email could claim BGCA.
// Kept in sync by hand, same as FREE_MAIL above.
export const KNOWN_ORGS = [
  {
    name: "Boys & Girls Clubs of America",
    einDigits: "135562976",
    domain: "bgca.org",
  },
];

/** The official domain a signup claiming this org must verify on, or null when
 *  the org is unknown (unknown orgs: the verified domain becomes theirs). */
export function officialDomainFor(ein: string | undefined, name: string | undefined): { org: string; domain: string } | null {
  const einDigits = (ein ?? "").replace(/\D/g, "");
  const lowerName = (name ?? "").trim().toLowerCase();
  for (const known of KNOWN_ORGS) {
    if ((einDigits && einDigits === known.einDigits) || (lowerName && lowerName === known.name.toLowerCase())) {
      return { org: known.name, domain: known.domain };
    }
  }
  return null;
}

// ─── Approval-link token ─────────────────────────────────────────────────────
// The one-click approve link emailed to the platform owner carries
// {org_id, token} where token = HMAC-SHA256(org_id) keyed by the
// ORG_APPROVE_KEY function secret. Verified by org-approve.

const ORG_APPROVE_KEY = Deno.env.get("ORG_APPROVE_KEY") ?? "";

export function approveKeyConfigured(): boolean {
  return ORG_APPROVE_KEY.length > 0;
}

/** Constant-time-ish check of a pasted console key against the secret. */
export function approveKeyMatches(candidate: string): boolean {
  if (!ORG_APPROVE_KEY || !candidate) return false;
  if (candidate.length !== ORG_APPROVE_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ ORG_APPROVE_KEY.charCodeAt(i);
  }
  return diff === 0;
}

export async function approveToken(orgId: string): Promise<string> {
  if (!ORG_APPROVE_KEY) throw new Error("ORG_APPROVE_KEY not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ORG_APPROVE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(orgId));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function approveTokenValid(orgId: string, token: string): Promise<boolean> {
  if (!orgId || !token) return false;
  try {
    const expected = await approveToken(orgId);
    if (token.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < token.length; i++) {
      diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.has(domain);
}

const JOIN_CODE_RE = /^[A-Z0-9-]{2,8}$/;

export function normalizeJoinCode(raw: string): string {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
}

export function isValidJoinCodeShape(code: string): boolean {
  return JOIN_CODE_RE.test(code);
}

/** Same shape as src/store/orgStore.js's generateJoinCode, ported server-side
 *  so a freshly-created org always gets a short, sayable code even before the
 *  admin picks their own at the branding step. */
function candidateFromName(name: string): string {
  const words = (name || "").split(/[\s&,]+/).filter((w) => w.length > 2);
  let code = words.map((w) => w[0].toUpperCase()).join("").slice(0, 6);
  if (!code) code = (name || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  if (!code) code = "ORG";
  // JOIN_CODE_RE (isValidJoinCodeShape) requires 2-8 characters - the same
  // floor a manually-entered code is validated against. A name that reduces
  // to a single alnum character after the rules above (e.g. "A", or "A!!!"
  // once symbols are stripped) used to sail straight through as a 1-char
  // code, since nothing here re-checked it against that rule. Pad with a
  // random alphanumeric character until it clears the floor.
  while (code.length < 2) {
    code += Math.random().toString(36).slice(2, 3).toUpperCase();
  }
  return code;
}

async function joinCodeTaken(code: string, excludeId?: string): Promise<boolean> {
  const filter = excludeId
    ? `join_code=eq.${encodeURIComponent(code)}&id=neq.${excludeId}`
    : `join_code=eq.${encodeURIComponent(code)}`;
  const res = await dbRest("GET", `orgs?${filter}&select=id&limit=1`);
  return Array.isArray(res.data) && res.data.length > 0;
}

/** Generate a join code that is free right now. Tries the name-derived code,
 *  then numbered variants, same fallback order as the client version. */
export async function generateUniqueJoinCode(name: string): Promise<string> {
  const base = candidateFromName(name);
  if (!(await joinCodeTaken(base))) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base.slice(0, 5)}${i}`;
    if (!(await joinCodeTaken(candidate))) return candidate;
  }
  return `${base}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/** Is `code` available for `orgId` to claim (free, or already owned by it)? */
export async function joinCodeAvailableFor(code: string, orgId: string): Promise<boolean> {
  if (!isValidJoinCodeShape(code)) return false;
  return !(await joinCodeTaken(code, orgId));
}

/** Is `code` free for a brand-new org (no existing id to exclude)? */
export async function isJoinCodeFree(code: string): Promise<boolean> {
  if (!isValidJoinCodeShape(code)) return false;
  return !(await joinCodeTaken(code));
}

export interface OrgRow {
  id: string;
  created_at: string;
  name: string;
  ein: string | null;
  join_code: string;
  admin_email: string;
  admin_domain: string;
  brand_color: string | null;
  mission: string | null;
  apple_approval: unknown;
  stripe_account_id: string | null;
  stripe_connected: boolean;
  source: string;
  // 'pending_review' until the platform owner approves the org (org-approve);
  // 'approved' after. Donor-facing surfaces hold pending orgs back.
  status: string;
  approve_alert_sent_at: string | null;
}

export async function getOrgById(id: string): Promise<OrgRow | null> {
  const res = await dbRest("GET", `orgs?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const row = Array.isArray(res.data) ? res.data[0] : null;
  return row ?? null;
}

export async function getOrgByAdminEmail(email: string): Promise<OrgRow | null> {
  const res = await dbRest("GET", `orgs?admin_email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
  const row = Array.isArray(res.data) ? res.data[0] : null;
  return row ?? null;
}

/** org-connect-stripe / org-connect-status share this authorization rule: the
 *  signed-in user must BE the org's admin - either the exact verified address,
 *  or (for a teammate on the same domain who somehow got a token - defense in
 *  depth, not the primary path) the same admin_domain. */
export function callerOwnsOrg(userEmail: string, org: OrgRow): boolean {
  const lower = userEmail.toLowerCase();
  if (lower === org.admin_email.toLowerCase()) return true;
  return emailDomain(lower) === org.admin_domain.toLowerCase();
}
