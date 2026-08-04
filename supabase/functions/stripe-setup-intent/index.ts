// stripe-setup-intent
//
// POST { email? } -> { client_secret, customer_id }
//
// Step 1 of saving a donor's card. Creates (or reuses, matched by email) a
// Stripe Customer on the PLATFORM account, opens a SetupIntent for it, and
// records a pending row in stripe_donors. The browser then confirms the
// SetupIntent with Stripe.js confirmCardSetup, so the card number goes donor
// -> Stripe directly and never touches this server.
//
// Deployed with --no-verify-jwt: donors save a card mid-signup, before an
// account necessarily exists. A SetupIntent client_secret is single-use and
// only lets a browser ATTACH a card, never read or charge one. When a real
// session token IS present we resolve it and stamp user_id/email on the row.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { STRIPE_SK, dbRest, resolveUser, stripeCall } from "../_shared/stripe.ts";

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
    const email: string | null =
      user?.email ?? (typeof body?.email === "string" && body.email.includes("@") ? body.email.trim() : null);

    // Reuse an existing Customer for this email so repeat saves do not litter
    // the Stripe account with duplicates.
    let customerId: string | null = null;
    if (email) {
      const found = await stripeCall("GET", "/customers", { email, limit: 1 });
      customerId = found.ok ? found.data?.data?.[0]?.id ?? null : null;
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
    if (!intent.ok || !intent.data?.client_secret) {
      console.error("stripe-setup-intent: setup intent create failed", intent.status, intent.errorCode);
      return jsonResponse(req, { error: "Could not start the card save. Try again in a moment." }, 502);
    }

    // Record the pending save. stripe_customer_id is unique, so a donor who
    // retries just refreshes their row instead of adding another.
    const upsert = await dbRest(
      "POST",
      "stripe_donors?on_conflict=stripe_customer_id",
      {
        stripe_customer_id: customerId,
        email,
        user_id: user?.id ?? null,
        setup_status: "pending",
      },
      { Prefer: "resolution=merge-duplicates,return=representation" },
    );
    if (!upsert.ok) {
      // The Stripe side already worked; log loudly but do not fail the donor.
      console.error("stripe-setup-intent: stripe_donors upsert failed", upsert.status, JSON.stringify(upsert.data));
    }

    return jsonResponse(req, {
      client_secret: intent.data.client_secret,
      customer_id: customerId,
    });
  } catch (err) {
    console.error("stripe-setup-intent: unexpected error", err);
    return jsonResponse(req, { error: "Could not start the card save. Try again in a moment." }, 500);
  }
});
