// Shared Gmail-send helper for edge functions.
//
// WHY THE GMAIL API INSTEAD OF SMTP: raw SMTP (denomailer, port 587 +
// STARTTLS) was tried first for cycle-lock's donor amount email and failed
// in this edge runtime - STARTTLS's connection upgrade threw
// (`BadResource` / `InvalidData: received corrupt message`) both against
// the live deployed function and in a bare local Deno process against the
// same library, and outbound SMTP ports (25/465/587) are a known blocked
// surface on Deno-Deploy-style edge runtimes regardless. The Gmail API is
// plain HTTPS (never blocked) and reuses the SAME domain-wide-delegated
// service account already used locally by /Users/jarvis/clawd/gmail_sa.py
// to read info@pocketcache.app's mailbox - this is the send-side of that
// same credential, ported to Deno's Web Crypto (no local `openssl`
// subprocess available in the edge runtime, unlike the Python script).
//
// Auth flow: sign a short-lived RS256 JWT with the service account's
// private key (impersonating info@pocketcache.app via domain-wide
// delegation, scope gmail.send), exchange it for an OAuth access token,
// then POST the base64url-encoded RFC 2822 message to
// users/{user}/messages/send. GMAIL_SA_KEY_JSON is the full service-account
// JSON key (client_email + private_key), set as a function secret - never
// logged, never returned to a caller.
const GMAIL_SA_KEY_JSON = Deno.env.get("GMAIL_SA_KEY_JSON") ?? "";
const GMAIL_USER = "info@pocketcache.app";
// This service account's domain-wide delegation in Google Workspace admin
// is authorized for exactly this one scope (the same one
// /Users/jarvis/clawd/gmail_sa.py already uses to read the mailbox) - a
// narrower gmail.send-only scope is NOT separately authorized and gets a
// 401 unauthorized_client from the token endpoint.
const GMAIL_SEND_SCOPE = "https://mail.google.com/";

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(s: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(s));
}

/** PEM (PKCS8) -> the raw DER bytes crypto.subtle.importKey wants. */
function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedKey: CryptoKey | null = null;
async function importSigningKey(pem: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

async function getAccessToken(): Promise<string> {
  if (!GMAIL_SA_KEY_JSON) throw new Error("GMAIL_SA_KEY_JSON not set");
  const sa = JSON.parse(GMAIL_SA_KEY_JSON) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlFromString(JSON.stringify({
    iss: sa.client_email,
    sub: GMAIL_USER, // domain-wide delegation: act AS info@pocketcache.app
    scope: GMAIL_SEND_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const key = await importSigningKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`gmail token exchange failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

/** Sends a plain-text email as info@pocketcache.app via the Gmail API.
 *  Throws on any failure - callers decide whether/how to swallow it. */
export async function sendGmail(to: string, subject: string, text: string): Promise<void> {
  const token = await getAccessToken();
  const raw = [
    `From: PocketCache <${GMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    text,
  ].join("\r\n");
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_USER)}/messages/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64UrlFromString(raw) }),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`gmail send failed: ${res.status} ${JSON.stringify(data)}`);
  }
}
