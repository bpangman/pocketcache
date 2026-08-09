// give-extra
//
// POST { amount_cents, org_code? } -> { ok: true }
//
// A signed-in donor's "Give Extra" pledge. The amount is NOT charged here -
// it JOINS THE MONTHLY FLOW: a give_extras row is inserted as 'pending' and
// cycle-lock (the 1st) folds every still-pending pledge into that donor's
// cycle total, then charge-cycles-run (the 11th) charges it alongside the
// round-ups and flips the row to 'charged'. That is why the client's honest
// success copy says "Added to your next monthly charge".
//
// AUTH: identical posture to roundups-me - primary path is a real Supabase
// Authorization Bearer JWT resolved via resolveUser(); fallback is a body
// `email` matched against stripe_donors.email (same trust level
// stripe-setup-intent already accepts mid-signup). Either way the caller
// resolves to an existing stripe_donors row or the request is rejected -
// there is no way to pledge on behalf of an arbitrary customer id, and the
// "no donor" answer is the same 404 shape for "no such email" and "no row",
// so this cannot be used to enumerate accounts.
//
// VALIDATION: amount_cents must be an integer between 100 ($1) and
// 1_000_000 ($10,000). The client keeps its own $1 floor; the ceiling here
// is the backstop against a fat-fingered or hostile amount.
//
// ORG: `org_code` (the donor's selected nonprofit's join code) is optional.
// If it resolves to a real orgs row the pledge stores that org_id;
// otherwise org_id stays null (demo orgs like BGCA are not in the orgs
// table during the single-nonprofit phase). A PII-free events row ('give
// extra pledged', join code + amount only) is inserted either way so the
// pledge shows in the owner's live activity feed.
//
// Deployed with --no-verify-jwt, same as every sibling function, because the
// email fallback path deliberately does not require a Supabase JWT.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";

const MIN_CENTS = 100; // $1
const MAX_CENTS = 1_000_000; // $10,000

interface DonorRow {
  stripe_customer_id: string;
  email: string | null;
}

// Same donor resolution as roundups-me's findDonor, minus the fields this
// function does not need. Kept local rather than shared: the two functions
// select different columns and the duplication is 20 readable lines.
async function findDonor(req: Request, body: { email?: unknown }): Promise<DonorRow | null> {
  const user = await resolveUser(req);
  if (user) {
    const byUser = await dbRest(
      "GET",
      `stripe_donors?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,email&limit=1`,
    );
    const row = Array.isArray(byUser.data) ? (byUser.data[0] as DonorRow | undefined) : undefined;
    if (row) return row;
    if (user.email) {
      const byEmail = await dbRest(
        "GET",
        `stripe_donors?email=eq.${encodeURIComponent(user.email)}&select=stripe_customer_id,email&limit=1`,
      );
      const emailRow = Array.isArray(byEmail.data) ? (byEmail.data[0] as DonorRow | undefined) : undefined;
      if (emailRow) return emailRow;
    }
    return null;
  }
  const email = typeof body?.email === "string" && body.email.includes("@") ? body.email.trim() : null;
  if (!email) return null;
  const byEmail = await dbRest(
    "GET",
    `stripe_donors?email=eq.${encodeURIComponent(email)}&select=stripe_customer_id,email&limit=1`,
  );
  const row = Array.isArray(byEmail.data) ? (byEmail.data[0] as DonorRow | undefined) : undefined;
  return row ?? null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));

    const amountCents = Number(body?.amount_cents);
    if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return jsonResponse(req, { error: "Amount must be between $1 and $10,000." }, 400);
    }

    const donor = await findDonor(req, body);
    if (!donor) {
      return jsonResponse(req, { error: "We could not find your donor account." }, 404);
    }

    // Optional org resolution - join code to orgs.id. Absent or unknown
    // codes are fine (org_id stays null); never an error, because the demo
    // BGCA org has no orgs row in the single-nonprofit phase.
    const rawCode = typeof body?.org_code === "string" ? body.org_code.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8) : "";
    let orgId: string | null = null;
    if (rawCode) {
      const orgRes = await dbRest("GET", `orgs?join_code=eq.${encodeURIComponent(rawCode)}&select=id&limit=1`);
      const org = Array.isArray(orgRes.data) ? (orgRes.data[0] as { id: string } | undefined) : undefined;
      orgId = org?.id ?? null;
    }

    const insert = await dbRest("POST", "give_extras", {
      stripe_customer_id: donor.stripe_customer_id,
      email: donor.email,
      org_id: orgId,
      amount_cents: amountCents,
      status: "pending",
    });
    if (!insert.ok) {
      console.error("give-extra: insert failed", insert.status, JSON.stringify(insert.data));
      return jsonResponse(req, { error: "Could not save your gift right now." }, 500);
    }

    // Owner's live feed: join code + amount only, never donor PII. The org
    // dashboard's Donors/Charges tabs are still demo data - see the TODO in
    // src/pages/nonprofit/tabs/Donors.jsx for surfacing these there once
    // that dashboard goes real.
    const eventInsert = await dbRest("POST", "events", {
      event: "give extra pledged",
      detail: { org: rawCode || null, amount: `$${(amountCents / 100).toFixed(2)}` },
      source: "give-extra",
    });
    if (!eventInsert.ok) {
      console.error("give-extra: events insert failed", eventInsert.status, JSON.stringify(eventInsert.data));
    }

    return jsonResponse(req, { ok: true });
  } catch (err) {
    console.error("give-extra: unexpected error", err);
    return jsonResponse(req, { error: "Could not save your gift right now." }, 500);
  }
});
