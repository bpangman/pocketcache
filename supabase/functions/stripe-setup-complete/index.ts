// stripe-setup-complete
//
// POST { customer_id, payment_method_id } -> { ok, brand, last4 }
//
// Step 3 of saving a donor's card, after the browser's confirmCardSetup
// succeeded. Nothing here trusts the browser: we retrieve the payment method
// with the SECRET key and check Stripe really has it attached to that
// customer before marking the stripe_donors row saved. The response carries
// the verified brand and last4 so the UI never has to invent one.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { STRIPE_SK, dbRest, stripeCall } from "../_shared/stripe.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  if (!STRIPE_SK) {
    console.error("stripe-setup-complete: STRIPE_SK secret is not set");
    return jsonResponse(req, { error: "Server is not configured yet. Try again shortly." }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = typeof body?.customer_id === "string" ? body.customer_id : "";
    const paymentMethodId = typeof body?.payment_method_id === "string" ? body.payment_method_id : "";
    if (!customerId.startsWith("cus_") || !paymentMethodId.startsWith("pm_")) {
      return jsonResponse(req, { error: "customer_id and payment_method_id are required" }, 400);
    }

    // Verify with Stripe, server-side, that this payment method exists and is
    // attached to this customer. confirmCardSetup attaches it on success.
    const pm = await stripeCall("GET", `/payment_methods/${paymentMethodId}`);
    if (!pm.ok || !pm.data?.id) {
      console.error("stripe-setup-complete: payment method retrieve failed", pm.status, pm.errorCode);
      return jsonResponse(req, { error: "That card save could not be verified. Try again." }, 400);
    }
    if (pm.data.customer !== customerId) {
      console.error("stripe-setup-complete: pm not attached to customer", paymentMethodId, customerId);
      return jsonResponse(req, { error: "That card save could not be verified. Try again." }, 400);
    }

    const update = await dbRest(
      "PATCH",
      `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
      { payment_method_id: paymentMethodId, setup_status: "saved" },
    );
    if (!update.ok || !Array.isArray(update.data) || update.data.length === 0) {
      console.error("stripe-setup-complete: stripe_donors update failed", update.status, JSON.stringify(update.data));
      return jsonResponse(req, { error: "Could not record the saved card. Try again." }, 500);
    }

    return jsonResponse(req, {
      ok: true,
      brand: pm.data.card?.brand ?? null,
      last4: pm.data.card?.last4 ?? null,
    });
  } catch (err) {
    console.error("stripe-setup-complete: unexpected error", err);
    return jsonResponse(req, { error: "Could not record the saved card. Try again." }, 500);
  }
});
