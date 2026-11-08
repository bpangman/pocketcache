// Shared helpers for the org-* edge functions (nonprofit self-serve
// onboarding). Reuses dbRest/resolveUser/STRIPE_SK from stripe.ts rather than
// duplicating them - those helpers are generic (service-role PostgREST calls,
// Supabase session resolution), not Stripe-specific despite the file name.
import { dbRest } from "./stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

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

/** An EIN is stored as exactly 9 digits or not at all. Strips the dash and
 *  any other formatting; anything that is not 9 digits afterwards (including
 *  '' - a wizard resuming after the Stripe redirect used to send that and
 *  wipe the stored EIN) is "no EIN provided" and returns null, so callers
 *  patch only when they really have one. */
export function normalizeEin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 9 ? digits : null;
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

/** Case-insensitive, to match the unique index on upper(join_code) (see
 *  supabase/security_hardening_2026_11.sql): a pre-check that said "free" for
 *  KIDS while a legacy row held kids would otherwise send every retry into
 *  the same 23505. ilike with no wildcards is a plain case-insensitive
 *  equality here - codes are [A-Z0-9-] only, never % or _. */
async function joinCodeTaken(code: string, excludeId?: string): Promise<boolean> {
  const filter = excludeId
    ? `join_code=ilike.${encodeURIComponent(code)}&id=neq.${excludeId}`
    : `join_code=ilike.${encodeURIComponent(code)}`;
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
  // Added by supabase/security_hardening_2026_11.sql. Rows read before that
  // migration is applied come back without these keys, so treat undefined
  // the same as null / false everywhere.
  admin_user_id?: string | null;
  benevity_submitted?: boolean;
  logo_url?: string | null;
  long_description?: string | null;
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

/** READ-ONLY authorization (org-connect-status): the signed-in user is the
 *  org's admin of record - the exact verified address - or a teammate on the
 *  same admin_domain. The domain match is fine for a status read (the same
 *  facts are in orgs_public) but it is NOT enough for anything that writes;
 *  use callerIsOrgAdmin for those paths. */
export function callerOwnsOrg(userEmail: string, org: OrgRow): boolean {
  const lower = userEmail.toLowerCase();
  if (lower === org.admin_email.toLowerCase()) return true;
  return emailDomain(lower) === org.admin_domain.toLowerCase();
}

/** WRITE authorization (org-connect-stripe, update-donor-email's admin
 *  branch, anything else that changes the org): the caller must be the admin
 *  of record exactly - the auth user id stamped on the org (admin_user_id,
 *  set at org-signup and backfilled by the hardening migration), or the exact
 *  admin_email. A colleague who merely shares the domain is refused. */
export function callerIsOrgAdmin(user: { id: string; email?: string }, org: OrgRow): boolean {
  if (org.admin_user_id && user.id === org.admin_user_id) return true;
  if (!user.email) return false;
  return user.email.toLowerCase() === org.admin_email.toLowerCase();
}

/** PostgREST reports a Postgres unique violation (23505) as HTTP 409 with
 *  { code: "23505" } in the body. The unique index on upper(join_code) from
 *  the hardening migration makes this the authoritative "code taken" signal
 *  when two signups race the GET-then-write check above. */
export function isUniqueViolation(res: { status: number; data: unknown }): boolean {
  if (res.status === 409) return true;
  const code = (res.data as { code?: unknown } | null)?.code;
  return code === "23505";
}

// ─── Org profile fields (logo, landing-page story) ──────────────────────────

export const LONG_DESCRIPTION_MAX = 2000;

/** The nonprofit's landing-page story. undefined = not in this request (leave
 *  the stored value alone); null = clear it; otherwise trimmed and capped. */
export function sanitizeLongDescription(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, LONG_DESCRIPTION_MAX);
}

/** Only logos hosted in this project's own Supabase Storage (public bucket)
 *  are accepted - the URL is rendered on every donor-facing page of the org,
 *  so an arbitrary https host would let an admin point donors' browsers at a
 *  third party (tracking pixel, swapped image), and a data: URL would stuff
 *  the orgs row and the anon-readable view with the whole file. */
export function logoStorageBase(): string {
  return `${SUPABASE_URL}/storage/v1/object/public/`;
}

export function sanitizeLogoUrl(raw: unknown):
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Logo must be a link." };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 1024) return { ok: false, error: "That logo link is too long." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "That logo link is not a valid web address." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Logo links must start with https://." };
  }
  const base = logoStorageBase();
  if (!base.startsWith("https://") || !url.href.startsWith(base)) {
    return { ok: false, error: "Upload the logo through PocketCache so we can host it for you." };
  }
  return { ok: true, value: url.href };
}
