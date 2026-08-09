// org-approve
//
// The platform owner's one-click nonprofit approval. Two entry paths:
//
//   GET ?org_id=<uuid>&token=<hmac>
//     The link emailed to the owner by org-signup. `token` is
//     HMAC-SHA256(org_id) keyed by the ORG_APPROVE_KEY function secret, so
//     the link works from any mail client with no sign-in, but cannot be
//     forged without the secret. Returns a small human-readable HTML page.
//
//   POST { org_id } with header x-approve-key: <ORG_APPROVE_KEY>
//     The platform admin console's Approve button (src/pages/PlatformAdmin.jsx).
//     The console cannot compute the HMAC client-side (that would mean
//     shipping the secret), so it sends the key itself, pasted once into the
//     padmin session. Returns JSON.
//
// Approving: flips orgs.status to 'approved', logs an events row, and emails
// the nonprofit's verified admin their launch kit (page link, join code, QR
// link, widget snippet) via the shared Gmail sender. Approving an
// already-approved org is a friendly no-op - no duplicate launch kit.
import { handleOptions, jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";
import { getOrgById, approveTokenValid, approveKeyMatches } from "../_shared/org.ts";
import type { OrgRow } from "../_shared/org.ts";
import { sendGmail } from "../_shared/gmail.ts";
import { buildLaunchKitEmail, orgPageUrl } from "../_shared/orgEmails.ts";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlPage(title: string, body: string, status = 200): Response {
  const doc = [
    `<!doctype html><html><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title></head>`,
    `<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B2A4A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">`,
    `<div style="background:#fff;border-radius:20px;padding:36px 32px;max-width:440px;margin:24px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.25);">`,
    body,
    `</div></body></html>`,
  ].join("");
  return new Response(doc, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

interface ApproveResult {
  ok: boolean;
  org: OrgRow | null;
  alreadyApproved: boolean;
  launchKitSent: boolean;
  error?: string;
}

async function approveOrg(orgId: string): Promise<ApproveResult> {
  const org = await getOrgById(orgId);
  if (!org) return { ok: false, org: null, alreadyApproved: false, launchKitSent: false, error: "Organization not found." };
  if (org.status === "approved") {
    return { ok: true, org, alreadyApproved: true, launchKitSent: false };
  }

  const updated = await dbRest(
    "PATCH",
    `orgs?id=eq.${org.id}`,
    { status: "approved" },
    { Prefer: "return=representation" },
  );
  const row = Array.isArray(updated.data) ? updated.data[0] : null;
  if (!updated.ok || !row) {
    console.error("org-approve: status update failed", updated.status, JSON.stringify(updated.data));
    return { ok: false, org, alreadyApproved: false, launchKitSent: false, error: "Could not update the organization. Try again." };
  }

  // Activity log - best effort, never fails the approval.
  dbRest("POST", "events", {
    event: "nonprofit approved",
    detail: { org: row.name, joinCode: row.join_code },
  }).catch((err) => console.error("org-approve: events insert failed", err));

  // Launch kit to the nonprofit's verified admin.
  let launchKitSent = false;
  try {
    const mail = buildLaunchKitEmail(row);
    await sendGmail(row.admin_email, mail.subject, mail.text, mail.html);
    launchKitSent = true;
  } catch (err) {
    console.error("org-approve: launch kit email failed", err);
  }

  return { ok: true, org: row, alreadyApproved: false, launchKitSent };
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  // ── GET: the emailed one-click approve link ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("org_id") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!(await approveTokenValid(orgId, token))) {
      return htmlPage("Link not valid", [
        `<h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">This approval link is not valid</h1>`,
        `<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">The link may be incomplete or from an old email. Open the newest approval email and click its button again.</p>`,
      ].join(""), 403);
    }
    const result = await approveOrg(orgId);
    if (!result.ok || !result.org) {
      return htmlPage("Something went wrong", [
        `<h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Something went wrong</h1>`,
        `<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${escapeHtml(result.error ?? "Try the link again in a moment.")}</p>`,
      ].join(""), result.org ? 502 : 404);
    }
    const org = result.org;
    const page = orgPageUrl(org);
    return htmlPage(`Approved - ${org.name} is live`, [
      `<div style="font-size:44px;line-height:1;">✅</div>`,
      `<h1 style="margin:14px 0 8px;font-size:22px;color:#0f172a;">Approved - ${escapeHtml(org.name)} is live</h1>`,
      result.alreadyApproved
        ? `<p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.6;">This organization was already approved, so nothing changed and no duplicate email was sent.</p>`
        : `<p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.6;">Their page, QR code, and widget are live for donors, and their launch kit ${result.launchKitSent ? "was just emailed" : "could not be emailed (check the function logs)"} to ${escapeHtml(org.admin_email)}.</p>`,
      `<p style="margin:0;"><a href="${escapeHtml(page)}" style="color:#0D9488;font-weight:700;text-decoration:none;font-size:14px;">View their public page: ${escapeHtml(page)}</a></p>`,
    ].join(""));
  }

  // ── POST: the platform admin console's Approve button ──
  if (req.method === "POST") {
    const key = req.headers.get("x-approve-key") ?? "";
    if (!approveKeyMatches(key)) {
      return jsonResponse(req, { error: "That approval key does not match." }, 403);
    }
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body?.org_id === "string" ? body.org_id : "";
    if (!orgId) return jsonResponse(req, { error: "org_id required" }, 400);
    const result = await approveOrg(orgId);
    if (!result.ok) {
      return jsonResponse(req, { error: result.error ?? "Approval failed." }, result.org ? 502 : 404);
    }
    return jsonResponse(req, {
      ok: true,
      alreadyApproved: result.alreadyApproved,
      launchKitSent: result.launchKitSent,
      org: {
        id: result.org?.id,
        name: result.org?.name,
        join_code: result.org?.join_code,
        status: result.org?.status,
      },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
});
