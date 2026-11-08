// org-signup
//
// POST { name?, ein?, mission?, color?, joinCode?, appleApproval?,
//        benevitySubmitted?, longDescription?, logoUrl? }
//   -> { org, created, joinCodeTaken }
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
//   3. Called again, any time later, by the admin dashboard (Settings "Save
//      changes", Overview "I have registered", Grow "Change code") with just
//      the fields that changed. Same UPDATE path.
//
// JOIN CODE: a requested code already taken by a DIFFERENT org is never
// silently swapped on an UPDATE - the existing code is kept, nothing else in
// the request is lost, and `joinCodeTaken: true` tells the caller so it can
// say "that code is taken". On a rename, donor_profiles rows bound to the old
// code are moved to the new one so returning donors still land on their
// cause. The unique index on upper(join_code) (hardening migration) is the
// last word: a Postgres 23505 from a racing signup is treated exactly like
// the pre-check saying "taken" (update) or triggers a fresh generated code
// (create).
//
// EIN: digits only, and only ever written when there are exactly 9 of them.
// '' or a partial value means "no EIN in this request" - the stored one stays.
//
// APPLE APPROVAL: the client reports the status it computed, but 'approved'
// is never taken from client input on its own. It is kept only when the
// server can corroborate it: method 'candid_seal' for a KNOWN org (the
// seeded seal-holder list in _shared/org.ts) whose admin verified on that
// org's official domain. Any other 'approved' claim is stored as
// 'benevity_needed' unless the row already carries an approved status (which
// is then left alone). 'benevity_submitted' is a self-report the model
// allows (PRELAUNCH.md item 5) and also sets the benevity_submitted column.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";
import {
  emailDomain, isFreeMail, isValidJoinCodeShape, normalizeJoinCode,
  generateUniqueJoinCode, joinCodeAvailableFor, isJoinCodeFree, getOrgByAdminEmail,
  officialDomainFor, approveToken, approveKeyConfigured,
  normalizeEin, isUniqueViolation, sanitizeLongDescription, sanitizeLogoUrl,
} from "../_shared/org.ts";
import type { OrgRow } from "../_shared/org.ts";
import { sendGmail } from "../_shared/gmail.ts";
import { OWNER_ALERT_EMAIL, buildOwnerApprovalAlert } from "../_shared/orgEmails.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// How many times the create path regenerates a code after the unique index
// rejects one. Two racing signups for the same name is the realistic case;
// three tries is already generous.
const CREATE_RETRIES = 3;

type ApprovalStatus = "approved" | "benevity_submitted" | "benevity_needed";
type ApprovalMethod = "candid_seal" | "benevity";
interface AppleApproval {
  status: ApprovalStatus;
  method: ApprovalMethod;
}

function asApproval(value: unknown): AppleApproval | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { status?: unknown; method?: unknown };
  const status = v.status === "approved" || v.status === "benevity_submitted" || v.status === "benevity_needed"
    ? v.status
    : null;
  const method: ApprovalMethod = v.method === "candid_seal" ? "candid_seal" : "benevity";
  if (!status) return null;
  return { status, method };
}

/** See APPLE APPROVAL in the header. `sealCorroborated` is true when this
 *  signup is a known seal-holding org verified on its official domain. */
function sanitizeAppleApproval(
  raw: unknown,
  sealCorroborated: boolean,
  existing: OrgRow | null,
): AppleApproval | undefined {
  if (raw === undefined) return undefined;
  const parsed = asApproval(raw);
  if (!parsed) return undefined; // unknown shape: ignore rather than store junk
  if (parsed.status !== "approved") return parsed;
  if (parsed.method === "candid_seal" && sealCorroborated) return parsed;
  const current = asApproval(existing?.apple_approval);
  if (current?.status === "approved") return current; // owner-granted, keep as is
  return { status: "benevity_needed", method: parsed.method };
}

// The signup wizard calls this function twice (see the ORDERING DECISION
// above): once when email verification succeeds, and once at wizard
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

/** After a successful rename, move every donor bound to the old code onto
 *  the new one. Best effort: a failure is logged, never returned - the org
 *  row is already renamed and donors can re-enter the code if it comes to
 *  that. ilike with no wildcards is a case-insensitive equality match (codes
 *  never contain % or _). */
async function moveDonorProfiles(oldCode: string, newCode: string): Promise<void> {
  if (!oldCode || !newCode || oldCode.toUpperCase() === newCode.toUpperCase()) return;
  const res = await dbRest(
    "PATCH",
    `donor_profiles?org_join_code=ilike.${encodeURIComponent(oldCode)}`,
    { org_join_code: newCode, updated_at: new Date().toISOString() },
    { Prefer: "return=minimal" },
  );
  if (!res.ok) {
    console.error("org-signup: donor_profiles rename failed", oldCode, newCode, res.status, JSON.stringify(res.data));
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
    // null here means "no usable EIN in this request" - see EIN in the header.
    const ein = normalizeEin(body?.ein);
    const benevitySubmitted = body?.benevitySubmitted === true;
    const longDescription = sanitizeLongDescription(body?.longDescription);
    const logo = sanitizeLogoUrl(body?.logoUrl);
    if (!logo.ok) {
      return jsonResponse(req, { error: logo.error }, 400);
    }
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
    const appleApproval = sanitizeAppleApproval(body?.appleApproval, !!known, existing);
    // A self-reported Benevity registration, either as the explicit flag or
    // as the approval status the Overview tab sends.
    const markBenevity = benevitySubmitted || appleApproval?.status === "benevity_submitted";

    if (existing) {
      // deno-lint-ignore no-explicit-any
      const patch: Record<string, any> = {};
      if (body?.name !== undefined) patch.name = name;
      if (mission !== undefined) patch.mission = mission;
      if (color !== undefined) patch.brand_color = color;
      if (ein) patch.ein = ein;
      if (appleApproval !== undefined) patch.apple_approval = appleApproval;
      if (markBenevity && !existing.benevity_submitted) patch.benevity_submitted = true;
      if (longDescription !== undefined) patch.long_description = longDescription;
      if (logo.value !== undefined) patch.logo_url = logo.value;
      // First verified sign-in through here stamps the admin's auth user id,
      // which update-donor-email and org-connect-stripe then require.
      if (!existing.admin_user_id) patch.admin_user_id = user.id;

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

      let updated = await dbRest(
        "PATCH",
        `orgs?id=eq.${existing.id}`,
        patch,
        { Prefer: "return=representation" },
      );
      if (!updated.ok && patch.join_code && isUniqueViolation(updated)) {
        // Lost the race for that code: keep the old one, save the rest.
        joinCodeTaken = true;
        delete patch.join_code;
        updated = Object.keys(patch).length === 0
          ? { ok: true, status: 200, data: [existing] }
          : await dbRest("PATCH", `orgs?id=eq.${existing.id}`, patch, { Prefer: "return=representation" });
      }
      if (!updated.ok) {
        console.error("org-signup: update failed", updated.status, JSON.stringify(updated.data));
        return jsonResponse(req, { error: "Could not save your organization. Try again." }, 502);
      }
      const row = (Array.isArray(updated.data) ? updated.data[0] : updated.data) as OrgRow;
      if (patch.join_code && row?.join_code && row.join_code !== existing.join_code) {
        await moveDonorProfiles(existing.join_code, row.join_code);
      }
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

    let inserted = { ok: false, status: 0, data: null as unknown };
    for (let attempt = 0; attempt <= CREATE_RETRIES; attempt++) {
      inserted = await dbRest(
        "POST",
        "orgs",
        {
          name,
          ein: ein ?? null,
          join_code: joinCode,
          admin_email: email,
          admin_domain: domain,
          admin_user_id: user.id,
          brand_color: color ?? null,
          mission: mission ?? null,
          apple_approval: appleApproval ?? null,
          benevity_submitted: markBenevity,
          long_description: longDescription ?? null,
          logo_url: logo.value ?? null,
          source: "self-serve",
        },
        { Prefer: "return=representation" },
      );
      if (inserted.ok || !isUniqueViolation(inserted) || attempt === CREATE_RETRIES) break;
      // The unique index on upper(join_code) beat our pre-check: a racing
      // signup took this code between the GET and the INSERT. If it was the
      // admin's requested code, say so; either way pick a fresh generated one.
      if (requestedJoinCode && joinCode === requestedJoinCode) joinCodeTaken = true;
      joinCode = await generateUniqueJoinCode(name);
    }
    if (!inserted.ok) {
      console.error("org-signup: insert failed", inserted.status, JSON.stringify(inserted.data));
      return jsonResponse(req, { error: "Could not create your organization. Try again." }, 502);
    }
    const row = (Array.isArray(inserted.data) ? inserted.data[0] : inserted.data) as OrgRow;

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
