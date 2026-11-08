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
// AUTH: a real Supabase Authorization Bearer JWT resolved via resolveUser(),
// and nothing else. There is no email fallback any more: the old one let
// anyone who knew a donor's address pledge up to $10,000 on that donor's
// card with a bare POST (2026-11 audit, critical). A request with no valid
// session gets 401 { error: 'sign-in required' } and writes nothing. The
// client (src/lib/engagement.js submitGiveExtra) already refuses to call
// without a session. The donor still has to resolve to an existing
// stripe_donors row (by user_id, then by the session's verified email), so
// there is no way to pledge on behalf of an arbitrary customer id.
//
// VALIDATION: amount_cents must be an integer between 100 ($1) and
// 1_000_000 ($10,000) per pledge, AND the donor's still-pending pledges plus
// this one may not exceed 1_000_000 cents in total - the per-cycle cap that
// stops repeated calls stacking past the single-pledge ceiling. Over the
// cap is a 422 with the pending total so the client can say so.
//
// ORG: `org_code` (the donor's selected nonprofit's join code) is optional.
// If it resolves to a real orgs row the pledge stores that org_id;
// otherwise org_id stays null (demo orgs like BGCA are not in the orgs
// table during the single-nonprofit phase). A PII-free events row ('give
// extra pledged', join code + amount only) is inserted either way so the
// pledge shows in the owner's live activity feed.
//
// Deployed with --no-verify-jwt like its siblings; the gate is resolveUser()
// above, which rejects the anon key and any invalid or expired token.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";

const MIN_CENTS = 100; // $1
const MAX_CENTS = 1_000_000; // $10,000 per pledge
const PENDING_CAP_CENTS = 1_000_000; // $10,000 of pending pledges per donor, in total

interface DonorRow {
  stripe_customer_id: string;
  email: string | null;
}

// Same donor resolution as roundups-me's findDonor, minus the fields this
// function does not need and minus any body-email path. Kept local rather
// than shared: the two functions select different columns and the
// duplication is a dozen readable lines.
async function findDonor(user: { id: string; email?: string }): Promise<DonorRow | null> {
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

/** Sum of this donor's pledges that have not been charged yet - both the
 *  never-locked ones (cycle_month null) and the ones already folded into a
 *  locked cycle that charge-cycles-run has not run for. Both will hit the
 *  card, so both count toward the cap. */
async function pendingPledgeCents(stripeCustomerId: string): Promise<number> {
  const res = await dbRest(
    "GET",
    `give_extras?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&status=eq.pending&select=amount_cents`,
  );
  if (!res.ok || !Array.isArray(res.data)) {
    // Fail closed: if we cannot read the ledger we cannot prove the cap holds.
    throw new Error(`give_extras read failed (${res.status})`);
  }
  return (res.data as Array<{ amount_cents: number }>).reduce(
    (sum, row) => sum + (Number(row.amount_cents) || 0),
    0,
  );
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const user = await resolveUser(req);
    if (!user) {
      return jsonResponse(req, { error: "sign-in required" }, 401);
    }

    const body = await req.json().catch(() => ({}));

    const amountCents = Number(body?.amount_cents);
    if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return jsonResponse(req, { error: "Amount must be between $1 and $10,000." }, 400);
    }

    const donor = await findDonor(user);
    if (!donor) {
      return jsonResponse(req, { error: "We could not find your donor account." }, 404);
    }

    const pendingCents = await pendingPledgeCents(donor.stripe_customer_id);
    if (pendingCents + amountCents > PENDING_CAP_CENTS) {
      return jsonResponse(req, {
        error: "Your pending gifts cannot total more than $10,000 before they are charged.",
        pending_cents: pendingCents,
        cap_cents: PENDING_CAP_CENTS,
      }, 422);
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
