// org-admin-lookup
//
// POST {} -> { known, org? }        (requires the admin's Supabase session)
//
// What BOTH admin sign-in screens call right after a work email verifies its
// one-time code, to find out which org that email administers, and what lets
// the sign-in screen give a friendly "we don't recognize that email" answer
// instead of stranding an admin with a verified code and nowhere to go.
//
// AUTH (2026-11 audit fix): the email is read from the verified session, via
// resolveUser(), and body.email is ignored. The function used to be public
// and answer for ANY address, which let anyone confirm which emails and
// domains administer an org before ever passing an OTP. Both callers
// (Onboarding.jsx and WebPortalPages.jsx verify()) run after
// adminAuth.verifyCode succeeded, so a session is always there; a request
// with none gets 401 and no data.
//
// Never leaks another admin's email or Stripe account id - `org` is the
// orgs_public shape (id, name, join_code, brand_color, mission,
// apple_approval, stripe_connected, status, logo_url, long_description) plus
// benevity_submitted for the admin's own dashboard, nothing more.
//
// SIDE EFFECT: an exact admin_email match whose row has no admin_user_id yet
// (an org created before the hardening migration, or one the backfill could
// not pair with an auth user) gets the session's user id stamped on it - the
// "first verified admin sign-in" moment that update-donor-email and
// org-connect-stripe then rely on. A domain-only match never stamps anything.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";
import { emailDomain } from "../_shared/org.ts";

const PUBLIC_SELECT =
  "id,name,join_code,brand_color,mission,apple_approval,stripe_connected,status,logo_url,long_description,benevity_submitted";

interface LookupRow {
  id: string;
  admin_user_id?: string | null;
  [key: string]: unknown;
}

function stripPrivate(row: LookupRow): Record<string, unknown> {
  // deno-lint-ignore no-unused-vars
  const { admin_user_id, ...pub } = row;
  return pub;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const user = await resolveUser(req);
  if (!user?.email) {
    return jsonResponse(req, { error: "Sign in required.", known: false }, 401);
  }

  try {
    // Drain the body so a client that still sends { email } is not an error;
    // its contents are deliberately unused.
    await req.json().catch(() => ({}));
    const email = user.email.trim().toLowerCase();
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
      `orgs?admin_email=eq.${encodeURIComponent(email)}&select=${PUBLIC_SELECT},admin_user_id&order=created_at.asc&limit=1`,
    );
    let row = Array.isArray(byEmail.data) ? (byEmail.data[0] as LookupRow | undefined) ?? null : null;

    if (row && !row.admin_user_id) {
      const stamped = await dbRest(
        "PATCH",
        `orgs?id=eq.${encodeURIComponent(row.id)}&admin_user_id=is.null`,
        { admin_user_id: user.id },
        { Prefer: "return=minimal" },
      );
      if (!stamped.ok) {
        console.error("org-admin-lookup: admin_user_id stamp failed", row.id, stamped.status);
      }
    }

    if (!row && domain) {
      const byDomain = await dbRest(
        "GET",
        `orgs?admin_domain=eq.${encodeURIComponent(domain)}&select=${PUBLIC_SELECT}&order=created_at.asc&limit=1`,
      );
      row = Array.isArray(byDomain.data) ? (byDomain.data[0] as LookupRow | undefined) ?? null : null;
    }

    return jsonResponse(req, { known: !!row, org: row ? stripPrivate(row) : null });
  } catch (err) {
    console.error("org-admin-lookup: unexpected error", err);
    return jsonResponse(req, { error: "Could not look that up. Try again in a moment." }, 500);
  }
});
