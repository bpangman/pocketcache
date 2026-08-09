// Shared email content for the nonprofit approval flow.
//
// Two emails live here so their copy has exactly one home:
//   1. The owner alert (to blake@pocketcache.app) sent by org-signup when a
//      nonprofit finishes the signup wizard - includes the one-click approve
//      link (see approveToken in org.ts).
//   2. The launch kit (to the nonprofit's verified admin email) sent by
//      org-approve the moment the owner approves - the org's page link, join
//      code, QR link, and website widget snippet.
//
// Copy rules: plain language, no em or en dashes (plain "-" only), and real
// HTML paragraphs for the HTML part (gmail.ts sends multipart/alternative).
import type { OrgRow } from "./org.ts";
import { brandedEmail, NAVY } from "./emailBrand.ts";

export const OWNER_ALERT_EMAIL = "blake@pocketcache.app";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Same one-line embed the wizard and Grow tab show (src/lib/npSignup.js). */
export function widgetSnippetFor(org: OrgRow): string {
  return `<script src="https://pocketcache.app/widget.js" data-org="${org.join_code}" data-name="${org.name}"></script>`;
}

export function orgPageUrl(org: OrgRow): string {
  return `https://pocketcache.app/${org.join_code.toLowerCase()}`;
}

/** The link the org's QR code points donors at. */
export function orgJoinUrl(org: OrgRow): string {
  return `https://pocketcache.app/demo/?org=${encodeURIComponent(org.join_code)}`;
}

// ─── 1. Owner approval alert ────────────────────────────────────────────────

export function buildOwnerApprovalAlert(org: OrgRow, approveUrl: string): { subject: string; text: string; html: string } {
  const subject = `Nonprofit awaiting your approval: ${org.name}`;
  const ein = org.ein || "not provided";
  const text = [
    `A nonprofit just finished PocketCache signup and is waiting for your approval.`,
    ``,
    `Organization: ${org.name}`,
    `EIN: ${ein}`,
    `Join code: ${org.join_code}`,
    `Admin email: ${org.admin_email}`,
    ``,
    `Approve with one click (this flips them live and emails them their launch kit):`,
    approveUrl,
    ``,
    `Until you approve, their page, QR code, and widget stay held back and donors cannot join.`,
  ].join("\n");
  const bodyHtml = [
    `<p style="margin:0 0 16px;">A nonprofit just finished PocketCache signup and is waiting for your approval.</p>`,
    `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px;">`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Organization</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(org.name)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">EIN</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(ein)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Join code</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(org.join_code)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Admin email</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(org.admin_email)}</td></tr>`,
    `</table>`,
    `<p style="margin:0 0 16px;"><a href="${escapeHtml(approveUrl)}" style="display:inline-block;background:#0D9488;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Approve ${escapeHtml(org.name)}</a></p>`,
    `<p style="margin:0 0 16px;">One click approves them, flips their page live, and emails them their launch kit (widget, QR code, and page link).</p>`,
    `<p style="margin:0;color:#64748b;">Until you approve, their page, QR code, and widget stay held back and donors cannot join.</p>`,
  ].join("\n");
  const html = brandedEmail({ heading: `Nonprofit awaiting your approval`, bodyHtml });
  return { subject, text, html };
}

// ─── 2. Nonprofit launch kit ────────────────────────────────────────────────

export function buildLaunchKitEmail(org: OrgRow): { subject: string; text: string; html: string } {
  const subject = `${org.name} is approved and live on PocketCache`;
  const page = orgPageUrl(org);
  const join = orgJoinUrl(org);
  const snippet = widgetSnippetFor(org);
  const text = [
    `Congratulations - ${org.name} is approved and your round-up program is now live on PocketCache.`,
    ``,
    `Your page: ${page}`,
    `Donor join code: ${org.join_code}`,
    `Giving link (this is what your QR code points to): ${join}`,
    ``,
    `Website widget - paste this one line into your website where the "Round up for us" card should appear:`,
    snippet,
    ``,
    `A printable QR code is ready on your dashboard under the Grow tab, sized for posters, newsletters, and event tables.`,
    ``,
    `Admin sign-in: https://pocketcache.app/demo/?npsignin=1 - use this verified email and we send you a fresh sign-in code each time. No password to remember.`,
    ``,
    `Questions? Just reply to this email.`,
    `- The PocketCache team`,
  ].join("\n");
  const bodyHtml = [
    `<p style="margin:0 0 16px;">Congratulations - <strong>${escapeHtml(org.name)}</strong> is approved and your round-up program is now live on PocketCache.</p>`,
    `<p style="margin:0 0 16px;"><strong>Your page:</strong> <a href="${escapeHtml(page)}" style="color:${NAVY};">${escapeHtml(page)}</a></p>`,
    `<p style="margin:0 0 16px;"><strong>Donor join code:</strong> <span style="font-size:20px;font-weight:800;letter-spacing:0.06em;color:${NAVY};">${escapeHtml(org.join_code)}</span><br>`,
    `Donors enter this code in the PocketCache app, or open your link, to join your program.</p>`,
    `<p style="margin:0 0 16px;"><strong>Giving link:</strong> <a href="${escapeHtml(join)}" style="color:${NAVY};">${escapeHtml(join)}</a><br>`,
    `This is the link your QR code points to. A printable QR code is ready on your dashboard under the Grow tab, sized for posters, newsletters, and event tables.</p>`,
    `<p style="margin:0 0 16px;"><strong>Website widget:</strong> paste this one line into your website where the "Round up for us" card should appear:</p>`,
    `<p style="margin:0 0 16px;background:#0f172a;color:#4ade80;border-radius:10px;padding:12px 14px;font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all;">${escapeHtml(snippet)}</p>`,
    `<p style="margin:0 0 16px;"><strong>Admin sign-in:</strong> <a href="https://pocketcache.app/demo/?npsignin=1" style="color:${NAVY};">pocketcache.app/demo/?npsignin=1</a><br>`,
    `Use this verified email and we send you a fresh sign-in code each time. No password to remember.</p>`,
    `<p style="margin:0 0 16px;">Questions? Just reply to this email.</p>`,
    `<p style="margin:0;">- The PocketCache team</p>`,
  ].join("\n");
  const html = brandedEmail({ heading: `${escapeHtml(org.name)} is approved and live`, bodyHtml });
  return { subject, text, html };
}
