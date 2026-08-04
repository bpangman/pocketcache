// plaid-link-token
//
// POST, no body needed. Calls Plaid's /link/token/create in sandbox mode and
// returns { link_token }. This is the first call the frontend makes when a
// donor opens the real Plaid Link flow on the connect-card step.
//
// Deployed with --no-verify-jwt: the donor may not be signed in yet at this
// point in signup, and a link token is single-session and safe to hand out
// without auth - it does not expose any account data by itself.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID");
const PLAID_SECRET = Deno.env.get("PLAID_SECRET");
const PLAID_BASE = "https://sandbox.plaid.com";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    console.error("plaid-link-token: missing PLAID_CLIENT_ID or PLAID_SECRET secret");
    return jsonResponse(req, { error: "Server is not configured yet. Try again shortly." }, 500);
  }

  try {
    const plaidRes = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        client_name: "PocketCache",
        user: { client_user_id: crypto.randomUUID() },
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
      }),
    });

    const data = await plaidRes.json();

    if (!plaidRes.ok || !data.link_token) {
      console.error("plaid-link-token: Plaid error", plaidRes.status, data.error_code, data.error_message);
      return jsonResponse(req, { error: "Could not start bank connection. Try again in a moment." }, 502);
    }

    return jsonResponse(req, { link_token: data.link_token });
  } catch (err) {
    console.error("plaid-link-token: unexpected error", err);
    return jsonResponse(req, { error: "Could not start bank connection. Try again in a moment." }, 500);
  }
});
