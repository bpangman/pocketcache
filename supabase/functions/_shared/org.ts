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
  return code || "ORG";
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
