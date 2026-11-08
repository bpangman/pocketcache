// stripe-setup-complete
//
// POST { customer_id, payment_method_id, setup_intent_id? } -> { ok, brand, last4 }
//
// Step 3 of saving a donor's card, after the browser's confirmCardSetup
// succeeded. Nothing here trusts the browser: we retrieve the payment method
// with the SECRET key and check Stripe really has it attached to that
// customer before marking the stripe_donors row saved. The response carries
// the verified brand and last4 so the UI never has to invent one.
//
// WHO MAY COMPLETE WHICH ROW (2026-11 audit fix - the bare customer/pm pair
// used to be enough, so anyone who had a client_secret for a victim's
// customer could record their own card as the victim's payment method):
//   - The stripe_donors row for customer_id must exist (stripe-setup-intent
//     wrote it). A row already claimed by a user id can only be completed by
//     a session with that same id (403 otherwise, including no session).
//   - The payment method must have come through the SetupIntent that
//     stripe-setup-intent minted for this customer: we load that intent
//     (pending_setup_intent_id on the row, cross-checked against
//     setup_intent_id when the client sends it) and require status
//     'succeeded', the same customer, and the same payment_method. Without a
//     session this proof is mandatory; with a session it is applied whenever
//     an intent id is on record (legacy rows from before the column existed
//     fall back to the attached-to-customer check alone).
//   - A session completing an unclaimed (user_id null) row stamps its user
//     id on it, so a mid-signup card ends up owned by the account.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { STRIPE_SK, dbRest, resolveUser, stripeCall } from "../_shared/stripe.ts";

interface DonorRow {
  stripe_customer_id: string;
  user_id: string | null;
  pending_setup_intent_id?: string | null;
  setup_status: string;
}

const NOT_VERIFIED = "That card save could not be verified. Try again.";

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
    const bodyIntentId = typeof body?.setup_intent_id === "string" && body.setup_intent_id.startsWith("seti_")
      ? body.setup_intent_id
      : "";
    if (!customerId.startsWith("cus_") || !paymentMethodId.startsWith("pm_")) {
      return jsonResponse(req, { error: "customer_id and payment_method_id are required" }, 400);
    }

    const user = await resolveUser(req);

    const rowRes = await dbRest(
      "GET",
      `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=stripe_customer_id,user_id,pending_setup_intent_id,setup_status&limit=1`,
    );
    const row = Array.isArray(rowRes.data) ? (rowRes.data[0] as DonorRow | undefined) : undefined;
    if (!rowRes.ok || !row) {
      console.error("stripe-setup-complete: no stripe_donors row for customer", customerId, rowRes.status);
      return jsonResponse(req, { error: NOT_VERIFIED }, 404);
    }

    // Ownership: a claimed row needs the owning session.
    if (row.user_id) {
      if (!user || user.id !== row.user_id) {
        return jsonResponse(req, { error: "Sign in to change the card on this account." }, 403);
      }
    }

    // Provenance: the pm must have come through OUR SetupIntent for this
    // customer. The id on the row is authoritative; the client's copy, when
    // sent, has to agree with it.
    const recordedIntentId = row.pending_setup_intent_id ?? "";
    if (bodyIntentId && recordedIntentId && bodyIntentId !== recordedIntentId) {
      console.error("stripe-setup-complete: setup_intent_id mismatch", customerId);
      return jsonResponse(req, { error: NOT_VERIFIED }, 400);
    }
    const intentId = recordedIntentId || bodyIntentId;
    if (!user && !intentId) {
      // No session and nothing to prove the intent with - refuse.
      return jsonResponse(req, { error: NOT_VERIFIED }, 400);
    }
    if (intentId) {
      const si = await stripeCall("GET", `/setup_intents/${intentId}`);
      if (!si.ok || !si.data?.id) {
        console.error("stripe-setup-complete: setup intent retrieve failed", si.status, si.errorCode);
        return jsonResponse(req, { error: NOT_VERIFIED }, 400);
      }
      if (si.data.status !== "succeeded" || si.data.customer !== customerId || si.data.payment_method !== paymentMethodId) {
        console.error("stripe-setup-complete: setup intent does not match", customerId, si.data.status);
        return jsonResponse(req, { error: NOT_VERIFIED }, 400);
      }
    }

    // Verify with Stripe, server-side, that this payment method exists and is
    // attached to this customer. confirmCardSetup attaches it on success.
    const pm = await stripeCall("GET", `/payment_methods/${paymentMethodId}`);
    if (!pm.ok || !pm.data?.id) {
      console.error("stripe-setup-complete: payment method retrieve failed", pm.status, pm.errorCode);
      return jsonResponse(req, { error: NOT_VERIFIED }, 400);
    }
    if (pm.data.customer !== customerId) {
      console.error("stripe-setup-complete: pm not attached to customer", paymentMethodId, customerId);
      return jsonResponse(req, { error: NOT_VERIFIED }, 400);
    }

    // deno-lint-ignore no-explicit-any
    const patch: Record<string, any> = {
      payment_method_id: paymentMethodId,
      setup_status: "saved",
      pending_setup_intent_id: null,
    };
    if (user && !row.user_id) {
      patch.user_id = user.id;
      if (user.email) patch.email = user.email.toLowerCase();
    }
    const update = await dbRest(
      "PATCH",
      `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
      patch,
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
