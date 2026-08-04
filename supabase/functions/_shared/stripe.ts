// Shared Stripe + database helpers for the stripe-* edge functions.
//
// Stripe's API is plain form-encoded HTTPS, so we call it with fetch instead
// of pulling in an SDK. The secret key comes from the STRIPE_SK function
// secret and never leaves the server. Database writes use the service role
// key (also server-only) because stripe_donors has RLS on with no anon
// policies at all.

const STRIPE_BASE = "https://api.stripe.com/v1";

export const STRIPE_SK = Deno.env.get("STRIPE_SK") ?? "";

/** Flatten a params object into Stripe's form encoding (a[b]=c for nesting). */
export function stripeForm(params: Record<string, unknown>, prefix = ""): URLSearchParams {
  const out = new URLSearchParams();
  const add = (obj: Record<string, unknown>, pre: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      const name = pre ? `${pre}[${key}]` : key;
      if (typeof value === "object" && !Array.isArray(value)) {
        add(value as Record<string, unknown>, name);
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => out.append(`${name}[${i}]`, String(v)));
      } else {
        out.append(name, String(value));
      }
    }
  };
  add(params, prefix);
  return out;
}

export interface StripeResult {
  ok: boolean;
  status: number;
  // deno-lint-ignore no-explicit-any
  data: any;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Call the Stripe API. `onAccount` adds the Stripe-Account header, which is
 * how a platform acts on a connected account (direct charges).
 */
export async function stripeCall(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  onAccount?: string,
): Promise<StripeResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SK}`,
  };
  if (onAccount) headers["Stripe-Account"] = onAccount;

  let url = `${STRIPE_BASE}${path}`;
  let body: string | undefined;
  if (method === "GET") {
    if (params) url += `?${stripeForm(params).toString()}`;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = params ? stripeForm(params).toString() : "";
  }

  const res = await fetch(url, { method, headers, body });
  const data = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    data,
    errorCode: data?.error?.code,
    errorMessage: data?.error?.message,
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Service-role call to PostgREST. stripe_donors is service-role-only by design. */
export async function dbRest(
  method: string,
  pathAndQuery: string,
  jsonBody?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/**
 * If the request carries a real signed-in Supabase session, resolve it to the
 * user. Returns null for anon-key or missing/invalid tokens - card saving is
 * allowed mid-signup before an account exists, so this is best-effort only.
 */
export async function resolveUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (user?.id && user?.aud === "authenticated") {
      return { id: user.id, email: user.email ?? undefined };
    }
    return null;
  } catch {
    return null;
  }
}
