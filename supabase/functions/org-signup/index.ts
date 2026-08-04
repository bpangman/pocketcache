// org-signup
//
// POST { name, ein?, mission?, color?, joinCode?, appleApproval? }
//   -> { org, created }
//
// Requires a real Supabase auth JWT (the admin just OTP-verified their work
// email on the verify-email step - see src/lib/adminAuth.js). Rejects free
// personal-mail domains; the verified email's domain becomes the org's
// admin_domain, and the org can only ever be looked up / administered by an
// email on that domain or the exact admin_email.
//
// ORDERING DECISION (see /Users/jarvis/pocketchange-np-real PRELAUNCH.md and
// the build brief): the wizard needs an org_id to exist BEFORE the Stripe
// step can call org-connect-stripe, but the admin doesn't pick their final
// join code / mission / color until the LATER branding step. Rather than add
// a 5th endpoint, this one is an idempotent UPSERT keyed on admin_email:
//   1. Called once at the END of email verification with whatever is known
//      then (org name + EIN from the confirm-org step) - this INSERTs the row
//      with a provisional, name-derived join code so org-connect-stripe has
//      something to act on immediately after.
//   2. Called again at go-live with the completed payload (final name,
//      mission, color, requested join code, Apple approval) - this UPDATEs
//      the SAME row (matched by admin_email) instead of creating a second
//      one. Only the FIRST call writes an `events` row.
// A requested join_code that is already taken by a DIFFERENT org is silently
// ignored (the existing code is kept) rather than failing the whole request -
// `joinCodeTaken: true` in the response tells the caller so it can say so.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";
import {
  emailDomain, isFreeMail, isValidJoinCodeShape, normalizeJoinCode,
  generateUniqueJoinCode, joinCodeAvailableFor, isJoinCodeFree, getOrgByAdminEmail,
} from "../_shared/org.ts";

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
  const email = user.email.toLowerCase();
  const domain = emailDomain(email);
  if (!domain || isFreeMail(domain)) {
    return jsonResponse(req, {
      error: "Use your organization's work email, not a personal address.",
    }, 400);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Your Nonprofit";
    const mission = typeof body?.mission === "string" ? body.mission : undefined;
    const color = typeof body?.color === "string" ? body.color : undefined;
    const ein = typeof body?.ein === "string" ? body.ein : undefined;
    const appleApproval = body?.appleApproval !== undefined ? body.appleApproval : undefined;
    const requestedJoinCode = typeof body?.joinCode === "string" && body.joinCode.trim()
      ? normalizeJoinCode(body.joinCode)
      : null;

    const existing = await getOrgByAdminEmail(email);

    if (existing) {
      // deno-lint-ignore no-explicit-any
      const patch: Record<string, any> = {};
      if (body?.name !== undefined) patch.name = name;
      if (mission !== undefined) patch.mission = mission;
      if (color !== undefined) patch.brand_color = color;
      if (ein !== undefined) patch.ein = ein;
      if (appleApproval !== undefined) patch.apple_approval = appleApproval;

      let joinCodeTaken = false;
      if (requestedJoinCode && requestedJoinCode !== existing.join_code) {
        if (isValidJoinCodeShape(requestedJoinCode) && await joinCodeAvailableFor(requestedJoinCode, existing.id)) {
          patch.join_code = requestedJoinCode;
        } else {
          joinCodeTaken = true;
        }
      }

      if (Object.keys(patch).length === 0) {
        return jsonResponse(req, { org: existing, created: false, joinCodeTaken });
      }

      const updated = await dbRest(
        "PATCH",
        `orgs?id=eq.${existing.id}`,
        patch,
        { Prefer: "return=representation" },
      );
      if (!updated.ok) {
        console.error("org-signup: update failed", updated.status, JSON.stringify(updated.data));
        return jsonResponse(req, { error: "Could not save your organization. Try again." }, 502);
      }
      const row = Array.isArray(updated.data) ? updated.data[0] : updated.data;
      return jsonResponse(req, { org: row, created: false, joinCodeTaken });
    }

    // Fresh org.
    let joinCode = requestedJoinCode && isValidJoinCodeShape(requestedJoinCode)
      ? requestedJoinCode
      : null;
    let joinCodeTaken = false;
    if (joinCode && !(await isJoinCodeFree(joinCode))) {
      joinCodeTaken = true;
      joinCode = null;
    }
    if (!joinCode) joinCode = await generateUniqueJoinCode(name);

    const inserted = await dbRest(
      "POST",
      "orgs",
      {
        name,
        ein: ein ?? null,
        join_code: joinCode,
        admin_email: email,
        admin_domain: domain,
        brand_color: color ?? null,
        mission: mission ?? null,
        apple_approval: appleApproval ?? null,
        source: "self-serve",
      },
      { Prefer: "return=representation" },
    );
    if (!inserted.ok) {
      console.error("org-signup: insert failed", inserted.status, JSON.stringify(inserted.data));
      return jsonResponse(req, { error: "Could not create your organization. Try again." }, 502);
    }
    const row = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;

    // Best-effort activity log - never fail the signup over this.
    dbRest("POST", "events", {
      event: "nonprofit signup server-side",
      detail: { org: name, joinCode: row?.join_code },
    }).catch((err) => console.error("org-signup: events insert failed", err));

    return jsonResponse(req, { org: row, created: true, joinCodeTaken });
  } catch (err) {
    console.error("org-signup: unexpected error", err);
    return jsonResponse(req, { error: "Could not save your organization. Try again." }, 500);
  }
});
