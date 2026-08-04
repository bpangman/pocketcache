// plaid-exchange
//
// POST { public_token, institution, account_name, account_mask }
// Exchanges the Plaid public_token for a real access_token, stores the
// access_token server-side only (service role, RLS-protected table), and
// returns a small confirmation payload that never includes the access token.
//
// If the request carries a Supabase auth Authorization header, we try to
// resolve the signed-in donor and attach user_id/email to the row. A donor
// who is not signed in yet at this step in the flow is still allowed through
// anonymously - this function never blocks signup on that.
//
// Deployed with --no-verify-jwt: the donor may not be signed in yet, and
// nothing this function returns is sensitive.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID");
const PLAID_SECRET = Deno.env.get("PLAID_SECRET");
const PLAID_BASE = "https://sandbox.plaid.com";

// Auto-provided by the Supabase Edge Runtime - do not set these via
// `supabase secrets set`, they are already present.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    console.error("plaid-exchange: missing PLAID_CLIENT_ID or PLAID_SECRET secret");
    return jsonResponse(req, { error: "Server is not configured yet. Try again shortly." }, 500);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("plaid-exchange: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse(req, { error: "Server is not configured yet. Try again shortly." }, 500);
  }

  let body: {
    public_token?: string;
    institution?: string;
    account_name?: string;
    account_mask?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "That request was not understood." }, 400);
  }

  const { public_token, institution, account_name, account_mask } = body;
  if (!public_token) {
    return jsonResponse(req, { error: "Missing bank connection info." }, 400);
  }

  // Best-effort: attach the signed-in donor if a valid Supabase session was
  // sent with the request. Never block the exchange on this.
  let userId: string | null = null;
  let userEmail: string | null = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader && SUPABASE_ANON_KEY) {
    try {
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await authClient.auth.getUser(jwt);
      if (!error && data?.user) {
        userId = data.user.id;
        userEmail = data.user.email ?? null;
      }
    } catch (err) {
      console.error("plaid-exchange: could not verify auth header, proceeding anonymous", err);
    }
  }

  try {
    const exchangeRes = await fetch(`${PLAID_BASE}/item/public_token/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token,
      }),
    });
    const exchangeData = await exchangeRes.json();

    if (!exchangeRes.ok || !exchangeData.access_token) {
      console.error("plaid-exchange: Plaid error", exchangeRes.status, exchangeData.error_code, exchangeData.error_message);
      return jsonResponse(req, { error: "We could not finish connecting that bank. Please try again." }, 502);
    }

    const accessToken: string = exchangeData.access_token;
    const itemId: string = exchangeData.item_id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertError } = await admin.from("plaid_items").insert({
      user_id: userId,
      email: userEmail,
      item_id: itemId,
      access_token: accessToken,
      institution: institution ?? null,
      account_name: account_name ?? null,
      account_mask: account_mask ?? null,
    });

    if (insertError) {
      console.error("plaid-exchange: insert failed", insertError.message);
      return jsonResponse(req, { error: "We connected your bank but could not save it. Please try again." }, 500);
    }

    // Never return or log the access token.
    return jsonResponse(req, {
      ok: true,
      institution: institution ?? null,
      account_name: account_name ?? null,
      account_mask: account_mask ?? null,
    });
  } catch (err) {
    console.error("plaid-exchange: unexpected error", err);
    return jsonResponse(req, { error: "We could not finish connecting that bank. Please try again." }, 500);
  }
});
