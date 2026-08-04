// apple-secret-renewal
//
// POST (no body needed) -> { ok: true, validUntil }   on success
//                        -> { ok: false, step, message } on failure
//
// This is an ADMIN/CRON action, not a browser action: it is protected by the
// x-renewal-key header, which must match the APPLE_RENEWAL_KEY function
// secret. Anything without the key gets a 401 before any Apple/Supabase call
// happens - same pattern as stripe-charge-run's x-charge-key.
//
// WHAT IT DOES: Apple Sign In needs a client secret that is a signed JWT
// (ES256), capped by Apple at roughly six months of life. This function
// rebuilds that JWT from the permanent EC signing key (stored as the
// APPLE_SIWA_P8_B64 / APPLE_SIWA_KEY_ID / APPLE_SIWA_TEAM_ID secrets) and
// installs it into Supabase Auth via the Management API. It is meant to be
// called by a pg_cron job every four months - comfortably inside the
// six-month window - so this no longer depends on any local Mac process
// being on. The original Mac-side script (renew-apple-signin.sh) stays in
// place as a manual fallback.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";

const APPLE_RENEWAL_KEY = Deno.env.get("APPLE_RENEWAL_KEY") ?? "";
const MGMT_API_TOKEN = Deno.env.get("MGMT_API_TOKEN") ?? "";
const APPLE_SIWA_P8_B64 = Deno.env.get("APPLE_SIWA_P8_B64") ?? "";
const APPLE_SIWA_KEY_ID = Deno.env.get("APPLE_SIWA_KEY_ID") ?? "";
const APPLE_SIWA_TEAM_ID = Deno.env.get("APPLE_SIWA_TEAM_ID") ?? "";

const SUPABASE_PROJECT_REF = "yeptifozaytoglfwxksz";
const APPLE_SERVICES_ID = "app.pocketcache.signin";
const SIX_MONTHS_SECONDS = 15550000; // ~180 days, under Apple's client-secret cap

const FORMSUBMIT_URL = "https://formsubmit.co/ajax/blake@pocketcache.app";
const FORMSUBMIT_HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://pocketcache.app",
  Referer: "https://pocketcache.app",
};

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(str: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(str));
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Strip PEM armor/newlines to recover the raw base64 (which decodes to PKCS8 DER). */
function pemToDerBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
}

/** Best-effort email via FormSubmit - never throws, never masks the caller's own error. */
async function notify(subject: string, message: string): Promise<void> {
  try {
    await fetch(FORMSUBMIT_URL, {
      method: "POST",
      headers: FORMSUBMIT_HEADERS,
      body: JSON.stringify({ _subject: subject, message }),
    });
  } catch (err) {
    console.error("apple-secret-renewal: notify failed", err);
  }
}

async function signAppleClientSecret(): Promise<{ jwt: string; exp: number }> {
  const derBase64 = pemToDerBase64(new TextDecoder().decode(decodeBase64(APPLE_SIWA_P8_B64)));
  const derBytes = decodeBase64(derBase64);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    derBytes.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const exp = now + SIX_MONTHS_SECONDS;
  const header = { alg: "ES256", typ: "JWT", kid: APPLE_SIWA_KEY_ID };
  const claims = {
    iss: APPLE_SIWA_TEAM_ID,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: APPLE_SERVICES_ID,
  };

  const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claims))}`;
  // WebCrypto ECDSA signatures are raw IEEE P1363 r||s - exactly what JWS ES256
  // expects, so no DER-to-raw conversion is needed here.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  return { jwt: `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`, exp };
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, step: "method", message: "Method not allowed" }, 405);
  }

  if (!APPLE_RENEWAL_KEY || req.headers.get("x-renewal-key") !== APPLE_RENEWAL_KEY) {
    return jsonResponse(req, { ok: false, step: "auth", message: "Unauthorized" }, 401);
  }

  if (!APPLE_SIWA_P8_B64 || !APPLE_SIWA_KEY_ID || !APPLE_SIWA_TEAM_ID || !MGMT_API_TOKEN) {
    console.error("apple-secret-renewal: missing required secrets");
    return jsonResponse(req, { ok: false, step: "config", message: "Server is not configured" }, 500);
  }

  let step = "sign_jwt";
  try {
    const { jwt, exp } = await signAppleClientSecret();
    const validUntil = new Date(exp * 1000).toISOString();

    step = "install_secret";
    const patchRes = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${MGMT_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_apple_enabled: true,
          external_apple_client_id: APPLE_SERVICES_ID,
          external_apple_secret: jwt,
        }),
      },
    );
    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => "");
      console.error("apple-secret-renewal: management API patch failed", patchRes.status);
      throw new Error(`Management API returned ${patchRes.status}: ${detail.slice(0, 300)}`);
    }

    step = "log_event";
    const eventRes = await dbRest("POST", "events", {
      event: "apple signin secret renewed",
      detail: { validUntil },
    });
    if (!eventRes.ok) {
      console.error("apple-secret-renewal: events insert failed", eventRes.status);
      // Not fatal to the renewal itself - the secret is already installed -
      // but worth surfacing, so fall through and let the success email note it.
    }

    step = "notify_success";
    await notify(
      "PocketCache: Apple sign-in secret auto-renewed",
      `The Apple sign-in client secret was auto-renewed and is now valid until ${validUntil} - there is nothing for you to do.`,
    );

    return jsonResponse(req, { ok: true, validUntil });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`apple-secret-renewal: failed at step ${step}`, message);

    await notify(
      "PocketCache: Apple sign-in secret renewal FAILED",
      `The automatic Apple sign-in secret renewal failed at step "${step}". Apple sign-in will stop working around the current secret's expiry unless this is fixed. Error: ${message}`,
    );

    return jsonResponse(req, { ok: false, step, message }, 500);
  }
});
