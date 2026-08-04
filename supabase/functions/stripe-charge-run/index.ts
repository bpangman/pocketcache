// stripe-charge-run
//
// POST { customer_id, amount_cents, connected_account_id? }
//   -> { ok, payment_intent, status }                       on success
//   -> { blocked: "connect_not_enabled", ... }              while the Stripe
//        account is not yet enabled as a Connect platform (known state; the
//        retry script re-runs this the moment Connect gets switched on)
//
// The 11th-of-the-month charge logic, in test mode. This is an ADMIN/CRON
// action, not a browser action: it is protected by the x-charge-key header,
// which must match the CHARGE_RUN_KEY function secret. Anything without the
// key gets a 401 before any Stripe call happens.
//
// WHAT IT DOES (Stripe Connect direct-charge pattern, per the architecture
// doc): the donor's card lives on the PLATFORM account. To charge it into the
// nonprofit's own Stripe account we
//   1. look up the donor's saved payment method in stripe_donors,
//   2. clone the payment method over to the connected account
//      (POST /v1/payment_methods with the Stripe-Account header),
//   3. create a Customer on the connected account and attach the clone,
//   4. create + immediately confirm an off_session PaymentIntent ON the
//      connected account for the round-up total.
//
// FEE ROUTING - DELIBERATELY ABSENT. The $1/month fee treatment is OPEN LEGAL
// DECISION #1 (with Nathan). Until that lands, this function charges the
// donation amount ONLY: no application_fee_amount, no fee PaymentIntent, no
// transfer. Do not add any fee here without that decision in writing.
//
// The clone/create/attach dance (steps 2-3 below) now lives in
// _shared/connected-customer.ts, shared with charge-cycles-run, so the
// manual test path and the monthly automated run behave identically and a
// donor+nonprofit pair only ever gets cloned once. See that file for the
// "why" of the connected_customers table.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { STRIPE_SK, dbRest, stripeCall } from "../_shared/stripe.ts";
import { getOrCreateConnectedCustomer, isBlockedStripeCode, isConnectBlocked } from "../_shared/connected-customer.ts";
import type { StripeResult } from "../_shared/stripe.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";
const DEFAULT_CONNECTED_ACCT = Deno.env.get("STRIPE_TEST_CONNECTED_ACCT") ?? "";

function connectBlocked(step: string, res: StripeResult) {
  return {
    blocked: "connect_not_enabled",
    step,
    stripe_code: res.errorCode ?? null,
    detail: "Stripe Connect is not enabled/linked for this platform account yet. Re-run after enabling Connect and connecting the test account.",
  };
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  if (!CHARGE_RUN_KEY || req.headers.get("x-charge-key") !== CHARGE_RUN_KEY) {
    return jsonResponse(req, { error: "Unauthorized" }, 401);
  }

  if (!STRIPE_SK) {
    console.error("stripe-charge-run: STRIPE_SK secret is not set");
    return jsonResponse(req, { error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = typeof body?.customer_id === "string" ? body.customer_id : "";
    const amountCents = Number(body?.amount_cents);
    const connectedAccount =
      (typeof body?.connected_account_id === "string" && body.connected_account_id.startsWith("acct_"))
        ? body.connected_account_id
        : DEFAULT_CONNECTED_ACCT;

    if (!customerId.startsWith("cus_")) {
      return jsonResponse(req, { error: "customer_id is required" }, 400);
    }
    if (!Number.isInteger(amountCents) || amountCents < 50 || amountCents > 100000) {
      // Stripe's own card minimum is 50 cents; the cap is a sanity rail.
      return jsonResponse(req, { error: "amount_cents must be an integer between 50 and 100000" }, 400);
    }
    if (!connectedAccount) {
      return jsonResponse(req, { error: "No connected account configured" }, 400);
    }

    // 1. The donor's saved card, from our table (service role only).
    const row = await dbRest(
      "GET",
      `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=payment_method_id,setup_status,email&limit=1`,
    );
    const donor = Array.isArray(row.data) ? row.data[0] : null;
    if (!donor?.payment_method_id || donor.setup_status !== "saved") {
      return jsonResponse(req, { error: "No saved card for that customer" }, 404);
    }

    // 2-3. Get (or create/re-clone as needed) the connected-account Customer
    //    + attached PaymentMethod for this donor at this nonprofit. Shared
    //    with charge-cycles-run so both paths clone the same way and reuse
    //    the same connected_customers row instead of duplicating it.
    const connected = await getOrCreateConnectedCustomer(customerId, connectedAccount, donor);
    if (!connected.ok) {
      if (isBlockedStripeCode(connected.stripeCode)) {
        return jsonResponse(req, {
          blocked: "connect_not_enabled",
          step: connected.step,
          stripe_code: connected.stripeCode,
          detail: "Stripe Connect is not enabled/linked for this platform account yet. Re-run after enabling Connect and connecting the test account.",
        });
      }
      console.error("stripe-charge-run: connected customer setup failed", connected.step, connected.stripeCode);
      return jsonResponse(req, { error: connected.message, stripe_code: connected.stripeCode }, 502);
    }
    const { connectedCustomerId, paymentMethodId: clonedPm } = connected;

    // 4. The direct charge on the connected account. Donation amount ONLY -
    //    NO application fee (open legal decision #1, see header).
    const intent = await stripeCall(
      "POST",
      "/payment_intents",
      {
        amount: amountCents,
        currency: "usd",
        customer: connectedCustomerId,
        payment_method: clonedPm,
        off_session: "true",
        confirm: "true",
        description: "PocketCache round-ups",
      },
      connectedAccount,
    );
    if (!intent.ok) {
      if (isConnectBlocked(intent)) {
        return jsonResponse(req, connectBlocked("payment_intent", intent));
      }
      console.error("stripe-charge-run: payment intent failed", intent.status, intent.errorCode);
      return jsonResponse(req, { error: "Charge failed", stripe_code: intent.errorCode ?? null }, 502);
    }

    return jsonResponse(req, {
      ok: true,
      payment_intent: intent.data.id,
      status: intent.data.status,
      amount_cents: amountCents,
      connected_account: connectedAccount,
    });
  } catch (err) {
    console.error("stripe-charge-run: unexpected error", err);
    return jsonResponse(req, { error: "Charge run failed unexpectedly" }, 500);
  }
});
