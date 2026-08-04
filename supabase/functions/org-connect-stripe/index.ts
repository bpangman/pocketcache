// org-connect-stripe
//
// POST { org_id } -> { url }
//
// Real Stripe Connect (Standard, test mode): creates the connected account on
// first call, then always issues a fresh Account Link (hosted onboarding).
// The link IS the nonprofit's authorization for PocketCache's automation to
// charge their monthly round-ups - see stripe-charge-run for what happens
// once it is finished.
//
// Auth: caller must hold a real Supabase session whose email matches the
// org's admin_email (or its admin_domain) - see _shared/org.ts callerOwnsOrg.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { STRIPE_SK, dbRest, resolveUser, stripeCall } from "../_shared/stripe.ts";
import { getOrgById, callerOwnsOrg } from "../_shared/org.ts";

const RETURN_BASE = "https://pocketcache.app/demo/";

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
    console.error("org-connect-stripe: STRIPE_SK secret is not set");
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

    let accountId = org.stripe_account_id;
    if (!accountId) {
      const created = await stripeCall("POST", "/accounts", {
        type: "standard",
        country: "US",
        business_type: "non_profit",
        email: org.admin_email,
      });
      if (!created.ok || !created.data?.id) {
        console.error("org-connect-stripe: account create failed", created.status, created.errorCode, created.errorMessage);
        return jsonResponse(req, { error: "Could not start your Stripe connection. Try again in a moment." }, 502);
      }
      accountId = created.data.id;
      const saved = await dbRest(
        "PATCH",
        `orgs?id=eq.${org.id}`,
        { stripe_account_id: accountId },
        { Prefer: "return=minimal" },
      );
      if (!saved.ok) {
        console.error("org-connect-stripe: saving stripe_account_id failed", saved.status);
      }
    }

    const link = await stripeCall("POST", "/account_links", {
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${RETURN_BASE}?npstripe=refresh&org=${org.id}`,
      return_url: `${RETURN_BASE}?npstripe=return&org=${org.id}`,
    });
    if (!link.ok || !link.data?.url) {
      console.error("org-connect-stripe: account link failed", link.status, link.errorCode, link.errorMessage);
      return jsonResponse(req, { error: "Could not open Stripe onboarding. Try again in a moment." }, 502);
    }

    return jsonResponse(req, { url: link.data.url, account_id: accountId });
  } catch (err) {
    console.error("org-connect-stripe: unexpected error", err);
    return jsonResponse(req, { error: "Could not start your Stripe connection. Try again in a moment." }, 500);
  }
});
