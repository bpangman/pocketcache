// Shared CORS handling for every edge function here.
//
// Allowed origins: the live site, the iOS shell's bundled-fallback origin
// (capacitor://localhost - the app remote-loads https://pocketcache.app/demo/
// today, but app/www is the offline fallback and its origin must keep
// working), and - ONLY when the ALLOW_LOCALHOST_ORIGINS=1 function secret is
// set on a dev project - any http://localhost:* or 127.0.0.1 port for local
// development. Production leaves that secret unset, so a random page a donor
// happens to run locally cannot call these functions with a browser-held
// token (low practical risk since auth is a Bearer token, not a cookie, but
// there is no reason to allow it).
//
// Android's Capacitor fallback origin would be http://localhost; the shell is
// iOS-only today, so it is deliberately not listed here. Add it to
// ALLOWED_ORIGIN_EXACT if an Android build ever ships.
//
// Returns the right Access-Control-Allow-Origin header for a given request,
// or omits it if the origin is not allowed (the browser then blocks the read).

const ALLOWED_ORIGIN_EXACT = new Set([
  "https://pocketcache.app",
  "capacitor://localhost",
]);

const ALLOW_LOCALHOST_ORIGINS = Deno.env.get("ALLOW_LOCALHOST_ORIGINS") === "1";

function isLocalhost(origin: string): boolean {
  if (!ALLOW_LOCALHOST_ORIGINS) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGIN_EXACT.has(origin) || isLocalhost(origin);
  const headers: Record<string, string> = {
    // GET is for org-approve's emailed one-click link (a top-level navigation,
    // but harmless to allow here); x-approve-key is the platform admin
    // console's pasted approval key (org-approve POST). x-charge-key and
    // x-renewal-key are deliberately NOT listed: their callers are
    // server-to-server cron jobs that never preflight.
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-approve-key",
  };
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}
