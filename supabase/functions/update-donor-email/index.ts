// update-donor-email
//
// POST { role: 'donor'|'admin', oldEmail?, orgId? }
//   -> { ok: true, email } | { ok: false, error }
//
// Called by src/lib/emailChange.js AFTER a Supabase email change has been
// CONFIRMED (the donor/admin clicked the link and getUser() shows the new
// address). The auth email is already changed by then; this only keeps the
// email-keyed server rows in step with it:
//
//   role 'donor' -> stripe_donors.email  (the row is what every billing/
//     round-up path matches a donor by; a stale email there would orphan
//     their charges from their new sign-in).
//   role 'admin' -> orgs.admin_email     (the org's admin of record). The new
//     address MUST be on the org's admin_domain - enforced HERE, server-side,
//     against orgs.admin_domain, not just in the client. A cross-domain admin
//     email is rejected 403 and nothing is written.
//
// AUTH: a real Supabase Bearer JWT, verified with resolveUser() (same helper
// roundups-me / stripe-setup-intent use). The NEW email is read from the
// verified user, never trusted from the body - the caller cannot set an email
// they have not actually confirmed with Supabase. `oldEmail` from the body is
// only used to also catch pre-signup rows whose user_id is null and can only
// be matched by their old address.
//
// Deployed with --no-verify-jwt like every other function here: this function
// does its own auth via resolveUser(). A request with no/expired token gets a
// clean 401 and writes nothing.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";
import { emailDomain, getOrgByAdminEmail, getOrgById } from "../_shared/org.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  const user = await resolveUser(req);
  if (!user || !user.email) {
    return jsonResponse(req, { ok: false, error: "Not signed in." }, 401);
  }
  // The confirmed, verified new address - taken from the session, not the body.
  const newEmail = user.email;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const role = body?.role === "admin" ? "admin" : "donor";
  const oldEmail = typeof body?.oldEmail === "string" && body.oldEmail.includes("@")
    ? body.oldEmail.trim()
    : null;

  try {
    if (role === "admin") {
      // Find the org: by explicit id, else by the OLD admin email.
      const orgId = typeof body?.orgId === "string" ? body.orgId : null;
      const org = orgId
        ? await getOrgById(orgId)
        : (oldEmail ? await getOrgByAdminEmail(oldEmail) : null);
      if (!org) {
        return jsonResponse(req, { ok: false, error: "Organization not found." }, 404);
      }
      // DOMAIN ENFORCEMENT. The admin of record must stay on the org's domain.
      if (emailDomain(newEmail) !== (org.admin_domain || "").toLowerCase()) {
        return jsonResponse(
          req,
          { ok: false, error: `A new admin email must be on the @${org.admin_domain} domain.` },
          403,
        );
      }
      const upd = await dbRest(
        "PATCH",
        `orgs?id=eq.${encodeURIComponent(org.id)}`,
        { admin_email: newEmail, admin_domain: emailDomain(newEmail) },
      );
      if (!upd.ok) {
        console.error("update-donor-email: org admin_email update failed", upd.status, JSON.stringify(upd.data));
        return jsonResponse(req, { ok: false, error: "Could not update the organization." }, 500);
      }
      return jsonResponse(req, { ok: true, email: newEmail });
    }

    // role 'donor': update stripe_donors by user_id (the common case), and also
    // any null-user_id row matched only by the old email (a pre-signup card
    // save). Both are idempotent PATCHes - a donor with no row simply matches
    // nothing, which is fine (a demo-only donor who never saved a card).
    const byUser = await dbRest(
      "PATCH",
      `stripe_donors?user_id=eq.${encodeURIComponent(user.id)}`,
      { email: newEmail },
    );
    if (!byUser.ok) {
      console.error("update-donor-email: donor update failed", byUser.status, JSON.stringify(byUser.data));
    }
    if (oldEmail && oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
      await dbRest(
        "PATCH",
        `stripe_donors?email=eq.${encodeURIComponent(oldEmail)}&user_id=is.null`,
        { email: newEmail },
      );
    }
    return jsonResponse(req, { ok: true, email: newEmail });
  } catch (err) {
    console.error("update-donor-email: unexpected error", err);
    return jsonResponse(req, { ok: false, error: "Something went wrong updating your email." }, 500);
  }
});
