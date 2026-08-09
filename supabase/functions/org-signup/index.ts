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
  officialDomainFor, approveToken, approveKeyConfigured,
} from "../_shared/org.ts";
import type { OrgRow } from "../_shared/org.ts";
import { sendGmail } from "../_shared/gmail.ts";
import { OWNER_ALERT_EMAIL, buildOwnerApprovalAlert } from "../_shared/orgEmails.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// The signup wizard calls this function twice (see the ORDERING DECISION
// below): once when email verification succeeds, and once at wizard
// completion with the full payload (which always carries appleApproval).
// That second call is the moment the org is "waiting for review", so it is
// when the owner's approval-alert email goes out - exactly once, guarded by
// approve_alert_sent_at.
async function maybeSendOwnerAlert(org: OrgRow | null | undefined): Promise<void> {
  if (!org?.id) return;
  if (org.status !== "pending_review") return;
  if (org.approve_alert_sent_at) return;
  if (!approveKeyConfigured()) {
    console.error("org-signup: ORG_APPROVE_KEY not set - cannot build approve link");
    return;
  }
  // Claim the alert BEFORE sending (idempotency guard against the wizard's
  // repeated upserts): only the request that successfully flips
  // approve_alert_sent_at from null sends the email.
  const claimed = await dbRest(
    "PATCH",
    `orgs?id=eq.${org.id}&approve_alert_sent_at=is.null`,
    { approve_alert_sent_at: new Date().toISOString() },
    { Prefer: "return=representation" },
  );
  const row = Array.isArray(claimed.data) ? claimed.data[0] : null;
  if (!claimed.ok || !row) return; // someone else already claimed it
  try {
    const token = await approveToken(org.id);
    const approveUrl = `${SUPABASE_URL}/functions/v1/org-approve?org_id=${encodeURIComponent(org.id)}&token=${token}`;
    const mail = buildOwnerApprovalAlert(org, approveUrl);
    await sendGmail(OWNER_ALERT_EMAIL, mail.subject, mail.text, mail.html);
  } catch (err) {
    console.error("org-signup: owner approval alert failed", err);
    // Roll the claim back so a later completion call can retry the email.
    await dbRest("PATCH", `orgs?id=eq.${org.id}`, { approve_alert_sent_at: null }).catch(() => {});
  }
}

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

    // Known-org claim gate: a signup claiming a seeded org (matched by EIN or
    // by exact name - BGCA today) must verify on that org's official domain.
    // Unknown orgs keep the existing rule: any non-personal domain, which then
    // becomes the org's own admin_domain. Checked on both the create and the
    // update path so a rename mid-wizard can't sidestep it.
    const known = officialDomainFor(ein ?? existing?.ein ?? undefined, body?.name !== undefined ? name : existing?.name);
    if (known && domain !== known.domain) {
      return jsonResponse(req, {
        error: `To claim ${known.org}, use an email at @${known.domain}.`,
      }, 403);
    }

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
        if (appleApproval !== undefined) await maybeSendOwnerAlert(existing);
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
      // The completion call (the only one that carries appleApproval) is the
      // moment the org is officially waiting for review - alert the owner.
      if (appleApproval !== undefined) await maybeSendOwnerAlert(row);
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

    // Normally the alert waits for the completion call (see above), but a
    // fresh insert that already carries the full payload IS the completion.
    if (appleApproval !== undefined) await maybeSendOwnerAlert(row);

    return jsonResponse(req, { org: row, created: true, joinCodeTaken });
  } catch (err) {
    console.error("org-signup: unexpected error", err);
    return jsonResponse(req, { error: "Could not save your organization. Try again." }, 500);
  }
});
