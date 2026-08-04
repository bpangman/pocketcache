// org-connect-status
//
// POST { org_id } -> { connected, details_submitted, charges_enabled }
//
// Polled after the hosted Stripe onboarding redirect returns
// (?npstripe=return&org=...) to find out whether the nonprofit actually
// finished onboarding on Stripe's side, and persists stripe_connected so the
// rest of the app (dashboard, org-connect-stripe's own "already connected"
// check) doesn't have to ask Stripe again.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { STRIPE_SK, dbRest, resolveUser, stripeCall } from "../_shared/stripe.ts";
import { getOrgById, callerOwnsOrg } from "../_shared/org.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const user = await resolveUser(req);
  if (!user?.email) {
    return jsonResponse(req, { error: "Sign in required." }, 401);
  }

  if (!STRIPE_SK) {
    console.error("org-connect-status: STRIPE_SK secret is not set");
    return jsonResponse(req, { error: "Server is not configured yet. Try again shortly." }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body?.org_id === "string" ? body.org_id : "";
    if (!orgId) return jsonResponse(req, { error: "org_id is required" }, 400);

    const org = await getOrgById(orgId);
    if (!org) return jsonResponse(req, { error: "Organization not found" }, 404);
    if (!callerOwnsOrg(user.email, org)) {
      return jsonResponse(req, { error: "You do not administer this organization." }, 403);
    }

    if (!org.stripe_account_id) {
      return jsonResponse(req, { connected: false, details_submitted: false, charges_enabled: false });
    }

    const account = await stripeCall("GET", `/accounts/${org.stripe_account_id}`);
    if (!account.ok) {
      console.error("org-connect-status: account fetch failed", account.status, account.errorCode);
      return jsonResponse(req, { error: "Could not check your Stripe status. Try again in a moment." }, 502);
    }

    const detailsSubmitted = !!account.data?.details_submitted;
    const chargesEnabled = !!account.data?.charges_enabled;
    const connected = detailsSubmitted && chargesEnabled;

    if (connected !== org.stripe_connected) {
      const saved = await dbRest(
        "PATCH",
        `orgs?id=eq.${org.id}`,
        { stripe_connected: connected },
        { Prefer: "return=minimal" },
      );
      if (!saved.ok) {
        console.error("org-connect-status: saving stripe_connected failed", saved.status);
      }
    }

    return jsonResponse(req, { connected, details_submitted: detailsSubmitted, charges_enabled: chargesEnabled });
  } catch (err) {
    console.error("org-connect-status: unexpected error", err);
    return jsonResponse(req, { error: "Could not check your Stripe status. Try again in a moment." }, 500);
  }
});
