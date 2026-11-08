// Per-donor nonprofit routing for the billing jobs.
//
// Which nonprofit does a donor's money go to? The chain is:
//   stripe_donors.stripe_customer_id -> stripe_donors.user_id (or email)
//   -> donor_profiles.org_join_code (the cause the donor bound in the app)
//   -> orgs row with that join_code, status 'approved' and a non-null
//      stripe_account_id (the nonprofit's own connected Stripe account).
// The resolved account is written onto charge_cycles.connected_account at
// lock time, so the 11th charges exactly where the 1st said it would, and the
// donor's emails name the resolved nonprofit instead of a hardcoded one.
//
// NO RESOLUTION means NO CHARGE. cycle-lock parks the cycle as 'held_no_org'
// (no lock, no email) and lists it in the owner's summary; charge-cycles-run
// leaves such a cycle alone. The old STRIPE_TEST_CONNECTED_ACCT fallback
// (every donor billed into the single sandbox account under BGCA's name) is
// now ONLY honored when the ALLOW_TEST_CONNECTED_FALLBACK=1 secret is set -
// that is the sandbox / pilot switch, never a production default.
import { dbRest } from "./stripe.ts";
import { KNOWN_ORGS } from "./org.ts";

const TEST_CONNECTED_ACCT = Deno.env.get("STRIPE_TEST_CONNECTED_ACCT") ?? "";
const ALLOW_TEST_FALLBACK = Deno.env.get("ALLOW_TEST_CONNECTED_FALLBACK") === "1";

export interface ResolvedOrg {
  /** orgs.id, or null for the sandbox fallback (the BGCA seed has no orgs row). */
  orgId: string | null;
  name: string;
  /** The join code - the nonprofit's short, sayable handle ("BGCA"). */
  shortName: string;
  connectedAccount: string;
  source: "org" | "test_fallback";
}

interface DonorIdentity {
  user_id: string | null;
  email: string | null;
}

interface OrgRouteRow {
  id: string;
  name: string;
  join_code: string;
  stripe_account_id: string | null;
  status: string;
}

/** The sandbox fallback, or null when it is not allowed / not configured. */
export function testFallbackOrg(): ResolvedOrg | null {
  if (!ALLOW_TEST_FALLBACK || !TEST_CONNECTED_ACCT) return null;
  const known = KNOWN_ORGS[0];
  return {
    orgId: null,
    name: known?.name ?? "PocketCache test nonprofit",
    shortName: "BGCA",
    connectedAccount: TEST_CONNECTED_ACCT,
    source: "test_fallback",
  };
}

/** Resolve the org for a join code (approved, with a Stripe account), or null. */
export async function resolveOrgByJoinCode(joinCode: string | null | undefined): Promise<ResolvedOrg | null> {
  const code = (joinCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const res = await dbRest(
    "GET",
    `orgs?join_code=eq.${encodeURIComponent(code)}&status=eq.approved&stripe_account_id=not.is.null&select=id,name,join_code,stripe_account_id,status&limit=1`,
  );
  const row = Array.isArray(res.data) ? (res.data[0] as OrgRouteRow | undefined) : undefined;
  if (!row?.stripe_account_id) return null;
  return {
    orgId: row.id,
    name: row.name,
    shortName: row.join_code,
    connectedAccount: row.stripe_account_id,
    source: "org",
  };
}

/**
 * Resolve the nonprofit a donor (by Stripe customer id) is bound to. `cache`
 * lets a batch job resolve each donor once per run. Returns the sandbox
 * fallback only when ALLOW_TEST_CONNECTED_FALLBACK=1, else null.
 */
export async function resolveOrgForCustomer(
  stripeCustomerId: string,
  cache?: Map<string, ResolvedOrg | null>,
): Promise<ResolvedOrg | null> {
  if (cache?.has(stripeCustomerId)) return cache.get(stripeCustomerId) ?? null;
  const resolved = await resolveUncached(stripeCustomerId);
  cache?.set(stripeCustomerId, resolved);
  return resolved;
}

async function resolveUncached(stripeCustomerId: string): Promise<ResolvedOrg | null> {
  const donorRes = await dbRest(
    "GET",
    `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&select=user_id,email&limit=1`,
  );
  const donor = Array.isArray(donorRes.data) ? (donorRes.data[0] as DonorIdentity | undefined) : undefined;
  if (!donor) return testFallbackOrg();

  // donor_profiles: user_id first, email as the pre-signup fallback - the same
  // precedence roundups-me's loadProfile uses.
  let joinCode: string | null = null;
  if (donor.user_id) {
    const byUser = await dbRest(
      "GET",
      `donor_profiles?user_id=eq.${encodeURIComponent(donor.user_id)}&select=org_join_code&limit=1`,
    );
    const row = Array.isArray(byUser.data) ? (byUser.data[0] as { org_join_code: string | null } | undefined) : undefined;
    joinCode = row?.org_join_code ?? null;
  }
  if (!joinCode && donor.email) {
    const byEmail = await dbRest(
      "GET",
      `donor_profiles?email=eq.${encodeURIComponent(donor.email)}&select=org_join_code&limit=1`,
    );
    const row = Array.isArray(byEmail.data) ? (byEmail.data[0] as { org_join_code: string | null } | undefined) : undefined;
    joinCode = row?.org_join_code ?? null;
  }

  const org = await resolveOrgByJoinCode(joinCode);
  return org ?? testFallbackOrg();
}

/** Stripe statement_descriptor_suffix: letters, digits and spaces only, at
 *  most 22 characters, never empty (Stripe also requires at least one letter).
 *  Built from the nonprofit's short name so the donor's card statement reads
 *  as the nonprofit, not as PocketCache. */
export function statementDescriptorSuffix(shortName: string): string {
  const cleaned = (shortName || "").replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 22).trim();
  return /[A-Za-z]/.test(cleaned) ? cleaned : "ROUNDUPS";
}
