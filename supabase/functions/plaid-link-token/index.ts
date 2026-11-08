// plaid-link-token
//
// POST, no body needed. Calls Plaid's /link/token/create in sandbox mode and
// returns { link_token }. This is the first call the frontend makes when a
// donor opens the real Plaid Link flow on the connect-card step.
//
// AUTH (2026-11 audit fix): a real Supabase session is required. Both
// wizards put the verified account step BEFORE connect-card, so every
// legitimate caller has one; the client (src/lib/plaid.js) no longer falls
// back to the anon key and PlaidBankConnect turns a 401 into its labeled
// practice-mode fallback. The verified user's id is the Plaid
// client_user_id, so the Item Plaid creates is tied to the donor instead of
// to a throwaway random id.
//
// DEPLOY: redeploy WITHOUT --no-verify-jwt (plain `supabase functions deploy
// plaid-link-token`) so the gateway also rejects requests with no valid JWT
// before they reach this code. The resolveUser() check below stays the real
// gate either way, because the gateway accepts the anon key as a valid JWT.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { resolveUser } from "../_shared/stripe.ts";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID");
const PLAID_SECRET = Deno.env.get("PLAID_SECRET");
const PLAID_BASE = "https://sandbox.plaid.com";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const user = await resolveUser(req);
  if (!user) {
    return jsonResponse(req, { error: "Sign in required." }, 401);
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
        user: { client_user_id: user.id },
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
