// Shared branded chrome for every email PocketCache sends from an edge
// function (donor amount emails, the org launch kit, the owner approval alert,
// and the nonprofit contact-form notifications). The Supabase Auth email
// templates (sign-in code, magic link, email change, recovery, invite,
// reauthentication) carry the SAME header and footer markup so every message,
// no matter which system sent it, reads as one product - keep this file and
// those templates in sync if the chrome ever changes.
//
// WHY IMAGE + TEXT, NOT SVG: Gmail and most email clients strip inline <svg>,
// so the coin cannot be the hand-built CoinMark SVG here. Instead the header
// uses the hosted coin PNG (an absolute URL - email clients never resolve
// relative paths - verified serving 200 on the live site) beside a plain-text
// wordmark: "Pocket" in white + "Cache" in logo teal, sitting on the navy band
// that echoes the app icon. Inline styles only (no <style> block, no external
// CSS) because clients strip those too.

export const EMAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Brand palette (mirrors landing/assets/shared.css and BRANDING.md).
export const NAVY = "#0B2A4A";
export const TEAL_LOGO = "#5EEAD4"; // logo-only teal - used for "Cache" on navy

// Absolute URL - email clients need it, and it must serve 200 on the live site.
export const COIN_LOGO_URL = "https://pocketcache.app/coin.png";

// The standing footer tagline shown on every email.
const FOOTER_TAGLINE =
  `<div style="margin-top:10px;color:${NAVY};font-weight:700;">PocketCache ` +
  `<span style="color:#94a3b8;font-weight:400;">- round-up giving software</span></div>`;

/** Wrap a heading + body fragment in the shared branded shell. `footnote` is an
 *  optional short context sentence shown above the standing brand tagline in the
 *  footer (e.g. why the recipient is getting this email); the tagline is always
 *  present. `bodyHtml` is inserted as-is - callers pass already-escaped,
 *  paragraph-level HTML (use para() for clean, reflowing paragraphs). */
export function brandedEmail(opts: { heading: string; bodyHtml: string; footnote?: string }): string {
  const footnote = opts.footnote
    ? `<div>${opts.footnote}</div>`
    : "";
  return (
    `<!DOCTYPE html>` +
    `<html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/></head>` +
    `<body style="margin:0;padding:0;background:#f4f6f8;">` +
    // Card: square top corners on purpose - the navy header band must read as
    // a plain solid rectangle (owner round-4 item 1), so only the bottom of
    // the card keeps a subtle radius. overflow:hidden preserves that clip.
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:0 0 16px 16px;overflow:hidden;">` +
    // Navy header band: coin PNG + "Pocket" white / "Cache" teal. No
    // border-radius here, and none inherited from the card above - squared.
    `<div style="background:${NAVY};padding:20px 22px;text-align:center;">` +
    `<img src="${COIN_LOGO_URL}" width="30" height="30" alt="PocketCache" ` +
    `style="display:inline-block;vertical-align:middle;margin:0 9px 0 0;border:0;"/>` +
    `<span style="font-family:${EMAIL_FONT};font-size:22px;font-weight:800;letter-spacing:-0.4px;vertical-align:middle;">` +
    `<span style="color:#ffffff;">Pocket</span><span style="color:${TEAL_LOGO};">Cache</span></span>` +
    `</div>` +
    // Content column.
    `<div style="padding:28px 24px;font-family:${EMAIL_FONT};font-size:16px;line-height:1.6;color:#1f2937;">` +
    `<h1 style="font-size:21px;line-height:1.3;font-weight:700;color:${NAVY};margin:0 0 18px;">${opts.heading}</h1>` +
    opts.bodyHtml +
    `<div style="margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#6b7280;">` +
    footnote +
    FOOTER_TAGLINE +
    `</div>` +
    `</div></div></body></html>`
  );
}

/** A clean, reflowing paragraph - real margins carry the spacing, no baked-in
 *  hard line breaks, so it wraps naturally on a phone. */
export function para(html: string): string {
  return `<p style="margin:0 0 16px;">${html}</p>`;
}
