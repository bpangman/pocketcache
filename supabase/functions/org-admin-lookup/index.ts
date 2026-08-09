// org-admin-lookup
//
// POST { email } -> { known, org? }
//
// Public (no auth required) on purpose: this is what BOTH admin sign-in
// screens call right after a work email verifies its one-time code, to find
// out which org that email administers. It is also what lets the sign-in
// screen give a friendly "we don't recognize that email" answer instead of
// stranding an admin with a verified code and nowhere to go.
//
// Never leaks another admin's email or Stripe account id - `org` is exactly
// the orgs_public shape (id, name, join_code, brand_color, mission,
// apple_approval, stripe_connected), nothing more.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";
import { emailDomain } from "../_shared/org.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return jsonResponse(req, { error: "A valid email is required" }, 400);
    }
    const domain = emailDomain(email);

    // Precedence, made explicit and deterministic:
    //   1. Exact admin_email match wins over a domain match, always - the
    //      email that actually signed the org up outranks a colleague who
    //      merely shares its verified domain.
    //   2. Within either query, `limit=1` with no ORDER BY is nondeterministic
    //      in Postgres/PostgREST - which row you get back when more than one
    //      matches (two orgs on the same admin_domain, e.g. two teams both on
    //      bgca.org) can change from call to call. order=created_at.asc makes
    //      it deterministic: the OLDEST matching org always wins the tie.
    const byEmail = await dbRest(
      "GET",
      `orgs?admin_email=eq.${encodeURIComponent(email)}&select=id,name,join_code,brand_color,mission,apple_approval,stripe_connected&order=created_at.asc&limit=1`,
    );
    let row = Array.isArray(byEmail.data) ? byEmail.data[0] : null;

    if (!row && domain) {
      const byDomain = await dbRest(
        "GET",
        `orgs?admin_domain=eq.${encodeURIComponent(domain)}&select=id,name,join_code,brand_color,mission,apple_approval,stripe_connected&order=created_at.asc&limit=1`,
      );
      row = Array.isArray(byDomain.data) ? byDomain.data[0] : null;
    }

    return jsonResponse(req, { known: !!row, org: row ?? null });
  } catch (err) {
    console.error("org-admin-lookup: unexpected error", err);
    return jsonResponse(req, { error: "Could not look that up. Try again in a moment." }, 500);
  }
});
