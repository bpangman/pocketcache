// org-contact
//
// POST { org_code, kind: 'match_sponsor' | 'volunteer', fields: { name,
//   email, message?, company?, budget? } } -> { ok: true, org_name }
//
// The real backend for the donor-facing "Become a Match Sponsor" and
// "Volunteer Opportunities" forms (app MyCause sheets + the web portal's
// InvolvementModal). Resolves the org SERVER-SIDE by join code - the org's
// admin_email never leaves the server (orgs is RLS service-role only and
// orgs_public deliberately excludes it) - then sends the form contents as
// one clean HTML email to that admin_email via the shared Gmail helper, and
// records a PII-free events row (join code + kind only, no name/email) for
// the owner's live activity feed.
//
// ABUSE GUARD: at most 5 posts per minute PER ORG, counted with a simple
// query over the same events rows this function inserts ('source=org-contact'
// within the last 60 seconds for that join code). The 6th rapid post gets a
// friendly 429. Deliberately simple - this is a contact form, not a login
// endpoint, and the cost of a false positive is "try again in a minute".
//
// AUTH: none. This is reachable by anyone with the join code, exactly like
// the org's public micro-site itself - the form asks for the submitter's own
// contact details, and the only thing the server does with them is forward
// them to the nonprofit. No donor account is required or consulted.
//
// Deployed with --no-verify-jwt like every sibling (no Supabase JWT here at
// all).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";
import { sendGmail } from "../_shared/gmail.ts";
import { brandedEmail, NAVY } from "../_shared/emailBrand.ts";

const RATE_LIMIT_PER_MINUTE = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const KINDS = {
  match_sponsor: {
    subject: "New match sponsor interest from your PocketCache page",
    heading: "New match sponsor interest",
    eventName: "match sponsor interest",
    intro: (orgName: string) =>
      `Someone just used the "Become a Match Sponsor" form on your ${orgName} PocketCache page. Here is what they sent:`,
  },
  volunteer: {
    subject: "New volunteer signup from your PocketCache page",
    heading: "New volunteer signup",
    eventName: "volunteer signup",
    intro: (orgName: string) =>
      `Someone just used the "Volunteer Opportunities" form on your ${orgName} PocketCache page. Here is what they sent:`,
  },
} as const;

type Kind = keyof typeof KINDS;

/** Escape a dynamic string for the HTML body - same rule as cycle-lock's
 *  esc(): every submitter-provided value goes through this before it touches
 *  markup. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The branded shell (header band + footer) is shared from _shared/emailBrand.ts
// so everything PocketCache sends looks like one product; this file only builds
// the detail table body.
function emailShell(headingHtml: string, bodyHtml: string): string {
  return brandedEmail({
    heading: headingHtml,
    bodyHtml,
    footnote:
      "You are receiving this because your nonprofit's PocketCache page has this form enabled. Reply directly to the address above to reach the person who sent it.",
  });
}

/** One labeled row in the detail table. Values are pre-escaped by callers. */
function fieldRow(label: string, valueHtml: string): string {
  return (
    `<tr>` +
    `<td style="padding:8px 14px 8px 0;font-size:13px;font-weight:600;color:#6b7280;vertical-align:top;white-space:nowrap;">${label}</td>` +
    `<td style="padding:8px 0;font-size:15px;color:#1f2937;">${valueHtml}</td>` +
    `</tr>`
  );
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));

    const kind = body?.kind as Kind;
    if (kind !== "match_sponsor" && kind !== "volunteer") {
      return jsonResponse(req, { error: "Unknown form type." }, 400);
    }

    const orgCode = clean(body?.org_code, 8).toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!orgCode) {
      return jsonResponse(req, { error: "Missing nonprofit code." }, 400);
    }

    const fields = (body?.fields && typeof body.fields === "object") ? body.fields as Record<string, unknown> : {};
    const name = clean(fields.name, 120);
    const email = clean(fields.email, 200);
    const message = clean(fields.message, 2000);
    const company = clean(fields.company, 200);
    const budget = clean(fields.budget, 120);

    if (!name || !EMAIL_RE.test(email)) {
      return jsonResponse(req, { error: "Please include your name and a valid email." }, 400);
    }
    if (kind === "match_sponsor" && !company) {
      return jsonResponse(req, { error: "Please include your company name." }, 400);
    }
    if (kind === "volunteer" && !message) {
      return jsonResponse(req, { error: "Please tell the nonprofit how you would like to help." }, 400);
    }

    const orgRes = await dbRest(
      "GET",
      `orgs?join_code=eq.${encodeURIComponent(orgCode)}&select=id,name,join_code,admin_email&limit=1`,
    );
    const org = Array.isArray(orgRes.data)
      ? (orgRes.data[0] as { id: string; name: string; join_code: string; admin_email: string } | undefined)
      : undefined;
    if (!org?.admin_email) {
      return jsonResponse(req, { error: "We could not reach that nonprofit right now." }, 404);
    }

    // Abuse guard: >5 posts in the trailing 60s for this org -> friendly 429.
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const recentRes = await dbRest(
      "GET",
      `events?source=eq.org-contact&detail->>org=eq.${encodeURIComponent(org.join_code)}&created_at=gt.${encodeURIComponent(cutoff)}&select=id`,
    );
    const recentCount = Array.isArray(recentRes.data) ? recentRes.data.length : 0;
    if (recentCount >= RATE_LIMIT_PER_MINUTE) {
      return jsonResponse(
        req,
        { error: "This nonprofit is getting a lot of messages right now. Please wait a minute and try again." },
        429,
      );
    }

    const spec = KINDS[kind];

    // Plain-text fallback + HTML table of exactly what was submitted.
    const textLines = [
      spec.intro(org.name),
      "",
      `Name: ${name}`,
      `Email: ${email}`,
    ];
    if (company) textLines.push(`Company: ${company}`);
    if (budget) textLines.push(`Budget: ${budget}`);
    if (message) textLines.push(`Message: ${message}`);
    textLines.push("", "Reply directly to reach them.", "", "- PocketCache");

    let rows = fieldRow("Name", esc(name)) +
      fieldRow("Email", `<a href="mailto:${esc(email)}" style="color:${NAVY};">${esc(email)}</a>`);
    if (company) rows += fieldRow("Company", esc(company));
    if (budget) rows += fieldRow("Budget", esc(budget));
    if (message) rows += fieldRow("Message", esc(message).replace(/\n/g, "<br/>"));

    const html = emailShell(
      spec.heading,
      `<p style="margin:0 0 16px;">${spec.intro(esc(org.name))}</p>` +
        `<table style="border-collapse:collapse;width:100%;margin:0 0 4px;">${rows}</table>`,
    );

    try {
      await sendGmail(org.admin_email, spec.subject, textLines.join("\n"), html);
    } catch (err) {
      console.error("org-contact: email send failed", org.join_code, err);
      return jsonResponse(req, { error: "Could not send your message right now. Please try again." }, 502);
    }

    // PII-free feed row: kind + join code only. Also what the rate limiter
    // above counts.
    const eventInsert = await dbRest("POST", "events", {
      event: spec.eventName,
      detail: { org: org.join_code },
      source: "org-contact",
    });
    if (!eventInsert.ok) {
      console.error("org-contact: events insert failed", eventInsert.status, JSON.stringify(eventInsert.data));
    }

    return jsonResponse(req, { ok: true, org_name: org.name });
  } catch (err) {
    console.error("org-contact: unexpected error", err);
    return jsonResponse(req, { error: "Could not send your message right now. Please try again." }, 500);
  }
});
