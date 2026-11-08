// stripe-setup-intent
//
// POST { email? } -> { client_secret, customer_id, setup_intent_id }
//
// Step 1 of saving a donor's card. Creates (or, for a signed-in donor,
// reuses) a Stripe Customer on the PLATFORM account, opens a SetupIntent for
// it, and records the pending save in stripe_donors. The browser then
// confirms the SetupIntent with Stripe.js confirmCardSetup, so the card
// number goes donor -> Stripe directly and never touches this server.
//
// Deployed with --no-verify-jwt: donors may save a card mid-signup, before
// an account necessarily exists. A SetupIntent client_secret is single-use
// and only lets a browser ATTACH a card, never read or charge one.
//
// WHO GETS WHICH CUSTOMER (2026-11 audit fix - the old by-email reuse let an
// unauthenticated caller who knew a donor's address attach their own card to
// that donor's customer and null out the row's user_id):
//   - Signed in: the donor's own stripe_donors row (by user_id, then by the
//     session's verified email) is reused. A row claimed by a DIFFERENT
//     user id is a 403. A Stripe customer found by email is reused only if no
//     row claims it for someone else.
//   - Not signed in: NEVER reuse. If a stripe_donors row already exists for
//     that email and belongs to a signed-up donor, 403 (sign in to change
//     the card). Otherwise a brand-new Stripe customer is created. A retry
//     may leave a spare pending row; that is the price of not letting a
//     stranger reach an existing customer.
//
// THE ROW: the upsert never sends user_id when there is no session (merge
// would have overwritten a real id with null), and never sends setup_status
// at all - a fresh row gets the column default 'pending', and a donor whose
// card is already 'saved' stays 'saved' while they replace it. The new
// SetupIntent's id goes in pending_setup_intent_id instead, which is what
// stripe-setup-complete checks against before it records the card.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { STRIPE_SK, dbRest, resolveUser, stripeCall } from "../_shared/stripe.ts";

interface DonorRow {
  stripe_customer_id: string;
  user_id: string | null;
  email: string | null;
  setup_status: string;
}

const DONOR_SELECT = "select=stripe_customer_id,user_id,email,setup_status&limit=1";

async function donorWhere(filter: string): Promise<DonorRow | null> {
  const res = await dbRest("GET", `stripe_donors?${filter}&${DONOR_SELECT}`);
  const row = Array.isArray(res.data) ? (res.data[0] as DonorRow | undefined) : undefined;
  return row ?? null;
}

const SIGN_IN_TO_CHANGE = "Sign in to change the card on this account.";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  if (!STRIPE_SK) {
    console.error("stripe-setup-intent: STRIPE_SK secret is not set");
    return jsonResponse(req, { error: "Server is not configured yet. Try again shortly." }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const user = await resolveUser(req);
    const bodyEmail = typeof body?.email === "string" && body.email.includes("@")
      ? body.email.trim().toLowerCase()
      : null;
    // The verified session email always outranks whatever the body says.
    const email: string | null = user?.email?.toLowerCase() ?? bodyEmail;

    let customerId: string | null = null;

    if (user) {
      let row = await donorWhere(`user_id=eq.${encodeURIComponent(user.id)}`);
      if (!row && email) {
        const byEmail = await donorWhere(`email=eq.${encodeURIComponent(email)}`);
        if (byEmail) {
          if (byEmail.user_id && byEmail.user_id !== user.id) {
            return jsonResponse(req, { error: SIGN_IN_TO_CHANGE }, 403);
          }
          row = byEmail; // a pre-signup row for this same email: adopt it below
        }
      }
      if (row) {
        customerId = row.stripe_customer_id;
      } else if (email) {
        // No row yet. Reuse a Stripe customer already carrying this email so
        // repeat saves do not litter the account - but only when no
        // stripe_donors row claims that customer for someone else.
        const found = await stripeCall("GET", "/customers", { email, limit: 1 });
        const candidate: string | null = found.ok ? found.data?.data?.[0]?.id ?? null : null;
        if (candidate) {
          const claim = await donorWhere(`stripe_customer_id=eq.${encodeURIComponent(candidate)}`);
          if (claim?.user_id && claim.user_id !== user.id) {
            return jsonResponse(req, { error: SIGN_IN_TO_CHANGE }, 403);
          }
          customerId = candidate;
        }
      }
    } else if (email) {
      const byEmail = await donorWhere(`email=eq.${encodeURIComponent(email)}`);
      if (byEmail?.user_id) {
        return jsonResponse(req, { error: SIGN_IN_TO_CHANGE }, 403);
      }
      // Unclaimed or no row: fall through and mint a fresh customer. Never
      // reuse an existing customer without a session.
    }

    if (!customerId) {
      const created = await stripeCall("POST", "/customers", {
        ...(email ? { email } : {}),
        description: "PocketCache donor",
      });
      if (!created.ok || !created.data?.id) {
        console.error("stripe-setup-intent: customer create failed", created.status, created.errorCode);
        return jsonResponse(req, { error: "Could not start the card save. Try again in a moment." }, 502);
      }
      customerId = created.data.id;
    }

    const intent = await stripeCall("POST", "/setup_intents", {
      customer: customerId,
      usage: "off_session",
      "payment_method_types[]": "card",
    });
    if (!intent.ok || !intent.data?.client_secret || !intent.data?.id) {
      console.error("stripe-setup-intent: setup intent create failed", intent.status, intent.errorCode);
      return jsonResponse(req, { error: "Could not start the card save. Try again in a moment." }, 502);
    }
    const setupIntentId: string = intent.data.id;

    // Record the pending save. stripe_customer_id is unique, so a donor who
    // retries refreshes their row instead of adding another. See THE ROW in
    // the header for what is deliberately NOT in this payload.
    // deno-lint-ignore no-explicit-any
    const rowPayload: Record<string, any> = {
      stripe_customer_id: customerId,
      pending_setup_intent_id: setupIntentId,
    };
    if (email) rowPayload.email = email;
    if (user) rowPayload.user_id = user.id;
    const upsert = await dbRest(
      "POST",
      "stripe_donors?on_conflict=stripe_customer_id",
      rowPayload,
      { Prefer: "resolution=merge-duplicates,return=representation" },
    );
    if (!upsert.ok) {
      // The Stripe side already worked; log loudly but do not fail the donor.
      console.error("stripe-setup-intent: stripe_donors upsert failed", upsert.status, JSON.stringify(upsert.data));
    }

    return jsonResponse(req, {
      client_secret: intent.data.client_secret,
      customer_id: customerId,
      setup_intent_id: setupIntentId,
    });
  } catch (err) {
    console.error("stripe-setup-intent: unexpected error", err);
    return jsonResponse(req, { error: "Could not start the card save. Try again in a moment." }, 500);
  }
});
