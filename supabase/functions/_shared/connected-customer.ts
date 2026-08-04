// Shared "clone the donor's card onto a nonprofit's connected account, once"
// logic. Used by stripe-charge-run (the manual/admin test path) AND
// charge-cycles-run (the automated 11th-of-the-month run) so both behave
// identically - this file is the single place that owns the Stripe Connect
// direct-charge card-copy dance.
//
// THE PROBLEM THIS SOLVES: a payment method saved on the PocketCache
// platform account cannot be charged directly on a connected account. Stripe
// requires cloning it over first. A naive implementation clones on every
// charge, which litters the connected account with a new PaymentMethod and a
// new Customer every single month for the same donor.
//
// THE FIX: connected_customers is a permanent join row, one per
// (stripe_customer_id, connected_account) pair. The first charge for a donor
// at a nonprofit clones the card and creates the connected Customer; every
// later charge reuses both. The clone is only redone if the donor's platform
// payment method actually changed (source_payment_method_id no longer
// matches stripe_donors.payment_method_id).
import { dbRest, stripeCall } from "./stripe.ts";
import type { StripeResult } from "./stripe.ts";

export interface ConnectedCustomerResult {
  ok: true;
  connectedCustomerId: string;
  paymentMethodId: string;
}

export interface ConnectedCustomerFailure {
  ok: false;
  step: string;
  stripeCode: string | null;
  message: string;
}

interface Donor {
  payment_method_id: string;
  email: string | null;
}

interface ConnectedCustomerRow {
  connected_customer_id: string;
  cloned_payment_method_id: string;
  source_payment_method_id: string;
}

// The two Stripe error codes that mean "Connect is not set up yet" for this
// platform account. Both are the known pre-enablement state, not a bug in
// the charge itself - kept here (not just in stripe-charge-run) because
// charge-cycles-run needs to recognize the same condition.
const CONNECT_BLOCKED_CODES = new Set(["platform_account_required", "account_invalid"]);

export function isConnectBlocked(res: StripeResult): boolean {
  return !res.ok && CONNECT_BLOCKED_CODES.has(res.errorCode ?? "");
}

/** Same check, for callers that only have the extracted Stripe error code
 *  (e.g. a ConnectedCustomerFailure from this module) rather than a full
 *  StripeResult. */
export function isBlockedStripeCode(code: string | null): boolean {
  return CONNECT_BLOCKED_CODES.has(code ?? "");
}

/**
 * Get (creating or re-cloning as needed) the connected-account Customer +
 * attached PaymentMethod to charge for this donor at this nonprofit.
 *
 * Re-clone only happens when the donor's platform card changed since the
 * last clone (donor.payment_method_id !== stored source_payment_method_id),
 * or when no connected_customers row exists yet.
 */
export async function getOrCreateConnectedCustomer(
  stripeCustomerId: string,
  connectedAccount: string,
  donor: Donor,
): Promise<ConnectedCustomerResult | ConnectedCustomerFailure> {
  const existingRes = await dbRest(
    "GET",
    `connected_customers?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&connected_account=eq.${encodeURIComponent(connectedAccount)}&select=connected_customer_id,cloned_payment_method_id,source_payment_method_id&limit=1`,
  );
  const existing = Array.isArray(existingRes.data) ? (existingRes.data[0] as ConnectedCustomerRow | undefined) : undefined;

  if (existing && existing.source_payment_method_id === donor.payment_method_id) {
    // Already have a current clone for this donor/nonprofit pair - reuse it.
    return {
      ok: true,
      connectedCustomerId: existing.connected_customer_id,
      paymentMethodId: existing.cloned_payment_method_id,
    };
  }

  // Either no row yet, or the donor's platform card changed since we last
  // cloned it - (re)do the clone/create/attach dance.
  const clone = await stripeCall(
    "POST",
    "/payment_methods",
    { customer: stripeCustomerId, payment_method: donor.payment_method_id },
    connectedAccount,
  );
  if (!clone.ok) {
    return { ok: false, step: "clone_payment_method", stripeCode: clone.errorCode ?? null, message: clone.errorMessage ?? "Could not clone the payment method" };
  }
  const clonedPm = clone.data.id as string;

  let connectedCustomerId = existing?.connected_customer_id ?? null;
  if (!connectedCustomerId) {
    const connCustomer = await stripeCall(
      "POST",
      "/customers",
      { ...(donor.email ? { email: donor.email } : {}), description: "PocketCache donor (round-ups)" },
      connectedAccount,
    );
    if (!connCustomer.ok) {
      return { ok: false, step: "connected_customer", stripeCode: connCustomer.errorCode ?? null, message: connCustomer.errorMessage ?? "Could not create the nonprofit-side customer" };
    }
    connectedCustomerId = connCustomer.data.id as string;
  }

  const attach = await stripeCall(
    "POST",
    `/payment_methods/${clonedPm}/attach`,
    { customer: connectedCustomerId },
    connectedAccount,
  );
  if (!attach.ok) {
    return { ok: false, step: "attach_payment_method", stripeCode: attach.errorCode ?? null, message: attach.errorMessage ?? "Could not attach the payment method" };
  }

  const upsert = await dbRest(
    "POST",
    "connected_customers?on_conflict=stripe_customer_id,connected_account",
    {
      stripe_customer_id: stripeCustomerId,
      connected_account: connectedAccount,
      connected_customer_id: connectedCustomerId,
      cloned_payment_method_id: clonedPm,
      source_payment_method_id: donor.payment_method_id,
    },
    { Prefer: "resolution=merge-duplicates,return=representation" },
  );
  if (!upsert.ok) {
    // The Stripe side already worked; log loudly but do not fail the
    // charge over a bookkeeping write - the next run will just re-clone.
    console.error("connected-customer: connected_customers upsert failed", upsert.status, JSON.stringify(upsert.data));
  }

  return { ok: true, connectedCustomerId, paymentMethodId: clonedPm };
}
