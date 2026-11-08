// donor-close
//
// POST { action: 'cancel' | 'delete', final: 'donate' | 'waive' }
//   -> { ok: true } | { ok: false, error }        (401 without a session)
//
// A donor ending their round-up giving, from the app's settings screen
// (src/lib/roundupsMe.js closeDonorAccount). Until this function existed
// "cancel" and "delete" only cleared the browser's local storage: the card
// stayed saved, the bank stayed linked, the 1st kept locking and the 11th
// kept charging. Now the server does what the words say.
//
// AUTH: a real Supabase session JWT (resolveUser), nothing else. The donor
// can only close their OWN account - the stripe_donors row is found from the
// session's user id (or its email for a pre-signup card save), never from the
// body.
//
// `final` is what happens to the balance that has accrued so far:
//   'donate'  the next cycle-lock turns everything pending into ONE final
//             cycle (floor lowered to 50c, Stripe's minimum - never charged
//             for just the fee, which is not charged at all) and the 11th
//             charges it; only after THAT settles is the card detached and
//             the bank unlinked (charge-cycles-run finishes the closure). No
//             new round-ups accrue after cancelled_at - roundups-sync and
//             roundups-me skip a cancelled donor.
//   'waive'   nothing more is ever charged: pending round-ups -> 'waived',
//             not-yet-charged cycles -> 'waived', pending pledges ->
//             'cancelled', the card is detached everywhere (platform +
//             every connected-account clone) and every Plaid Item is removed
//             (which is also what stops Plaid billing us for it).
//   If pending balance is under 50c, 'donate' is treated as 'waive' by
//   cycle-lock (computeCycle returns 'waived') - nothing to give.
//
// 'delete' does everything 'waive' does (or 'donate' with the final cycle
// still pending - the money side) and ALSO removes the person: their
// donor_profiles row, the merchant names on their round-up rows, the email
// on their pledges, the email + user id on stripe_donors (the row itself
// stays, as the ledger's anchor, with only an opaque Stripe customer id),
// and their Supabase auth user. The auth user is NOT deleted when the same
// email is a nonprofit's admin_email - that account is also their org login.
//
// With 'delete' + 'donate' the final charge still has to go through, so the
// card and bank stay until charge-cycles-run settles it; the personal data
// goes now. cancelled_at + close_final on stripe_donors is the whole state
// machine the billing jobs read.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";
import { detachDonorPaymentMethods } from "../_shared/connected-customer.ts";
import { removePlaidItems } from "../_shared/roundups-engine.ts";
import type { PlaidItemRow } from "../_shared/roundups-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface DonorRow {
  stripe_customer_id: string;
  user_id: string | null;
  email: string | null;
  payment_method_id: string | null;
  cancelled_at: string | null;
  close_final: "donate" | "waive" | null;
}

const DONOR_SELECT = "stripe_customer_id,user_id,email,payment_method_id,cancelled_at,close_final";

type SessionUser = { id: string; email?: string | null };

async function findDonor(user: SessionUser): Promise<DonorRow | null> {
  const byUser = await dbRest("GET", `stripe_donors?user_id=eq.${encodeURIComponent(user.id)}&select=${DONOR_SELECT}&limit=1`);
  const row = Array.isArray(byUser.data) ? (byUser.data[0] as DonorRow | undefined) : undefined;
  if (row) return row;
  if (user.email) {
    const byEmail = await dbRest(
      "GET",
      `stripe_donors?email=eq.${encodeURIComponent(user.email)}&user_id=is.null&select=${DONOR_SELECT}&limit=1`,
    );
    const emailRow = Array.isArray(byEmail.data) ? (byEmail.data[0] as DonorRow | undefined) : undefined;
    if (emailRow) return emailRow;
  }
  return null;
}

async function findPlaidItems(user: SessionUser, donor: DonorRow | null): Promise<Pick<PlaidItemRow, "id" | "item_id" | "access_token">[]> {
  const seen = new Map<number, Pick<PlaidItemRow, "id" | "item_id" | "access_token">>();
  const filters = [`user_id=eq.${encodeURIComponent(user.id)}`];
  const email = donor?.email ?? user.email ?? null;
  if (email) filters.push(`email=eq.${encodeURIComponent(email)}`);
  for (const f of filters) {
    const res = await dbRest("GET", `plaid_items?${f}&select=id,item_id,access_token`);
    for (const row of Array.isArray(res.data) ? (res.data as PlaidItemRow[]) : []) seen.set(row.id, row);
  }
  return [...seen.values()];
}

/** Stop the money: nothing pending is ever charged. */
async function waiveEverything(customerFilter: string, errors: string[]): Promise<void> {
  const steps: [string, string, Record<string, unknown>][] = [
    ["roundups", `roundups?${customerFilter}&status=in.(pending,rolled)`, { status: "waived" }],
    ["charge_cycles", `charge_cycles?${customerFilter}&status=in.(locked,retry,rolled_forward,held_no_org)`, { status: "waived" }],
    ["give_extras", `give_extras?${customerFilter}&status=eq.pending`, { status: "cancelled" }],
  ];
  for (const [name, path, patch] of steps) {
    const res = await dbRest("PATCH", path, patch);
    if (!res.ok) errors.push(`${name}: ${res.status}`);
  }
}

/** Card gone everywhere, bank unlinked everywhere. */
async function releaseCardAndBank(user: SessionUser, donor: DonorRow, errors: string[]): Promise<void> {
  const detach = await detachDonorPaymentMethods(donor.stripe_customer_id, donor.payment_method_id);
  errors.push(...detach.errors);
  const items = await findPlaidItems(user, donor);
  const removed = await removePlaidItems(items);
  errors.push(...removed.errors);
}

/** Is this email also a nonprofit admin's login? Then the auth user stays. */
async function isOrgAdminEmail(email: string | null): Promise<boolean> {
  if (!email) return false;
  const res = await dbRest("GET", `orgs?admin_email=ilike.${encodeURIComponent(email)}&select=id&limit=1`);
  return Array.isArray(res.data) && res.data.length > 0;
}

async function deleteAuthUser(userId: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  await res.body?.cancel();
  return res.ok || res.status === 404;
}

/** Remove the person while keeping the ledger's opaque anchors. */
async function scrubPersonalData(user: SessionUser, donor: DonorRow | null, errors: string[]): Promise<void> {
  const email = donor?.email ?? user.email ?? null;
  const profileFilters = [`user_id=eq.${encodeURIComponent(user.id)}`];
  if (email) profileFilters.push(`email=eq.${encodeURIComponent(email)}`);
  for (const f of profileFilters) {
    const res = await dbRest("DELETE", `donor_profiles?${f}`);
    if (!res.ok) errors.push(`donor_profiles: ${res.status}`);
  }
  if (donor) {
    const customerFilter = `stripe_customer_id=eq.${encodeURIComponent(donor.stripe_customer_id)}`;
    const r1 = await dbRest("PATCH", `roundups?${customerFilter}&merchant=not.is.null`, { merchant: null });
    if (!r1.ok) errors.push(`roundups merchant: ${r1.status}`);
    const r2 = await dbRest("PATCH", `give_extras?${customerFilter}&email=not.is.null`, { email: null });
    if (!r2.ok) errors.push(`give_extras email: ${r2.status}`);
    const r3 = await dbRest("PATCH", `stripe_donors?${customerFilter}`, { email: null, user_id: null });
    if (!r3.ok) errors.push(`stripe_donors identity: ${r3.status}`);
  }
  // Any plaid_items row that survived (a 'donate' closer keeps the bank until
  // the final charge settles) loses its email now; user_id stays so
  // charge-cycles-run can still find the Item to remove.
  if (email) {
    const r4 = await dbRest("PATCH", `plaid_items?email=eq.${encodeURIComponent(email)}`, { email: null });
    if (!r4.ok) errors.push(`plaid_items email: ${r4.status}`);
  }
  if (await isOrgAdminEmail(email)) {
    // Shared login with a nonprofit admin account: keep the auth user.
    return;
  }
  if (!(await deleteAuthUser(user.id))) errors.push("auth user delete failed");
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  const user = await resolveUser(req);
  if (!user) {
    return jsonResponse(req, { ok: false, error: "Please sign in again to close your account." }, 401);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body?.action;
    const final = body?.final;
    if (action !== "cancel" && action !== "delete") {
      return jsonResponse(req, { ok: false, error: "action must be 'cancel' or 'delete'." }, 400);
    }
    if (final !== "donate" && final !== "waive") {
      return jsonResponse(req, { ok: false, error: "final must be 'donate' or 'waive'." }, 400);
    }

    const donor = await findDonor(user);
    const errors: string[] = [];
    const nowIso = new Date().toISOString();

    if (donor) {
      const customerFilter = `stripe_customer_id=eq.${encodeURIComponent(donor.stripe_customer_id)}`;

      // A donor who already chose 'donate' and comes back with 'waive' (or
      // asks to delete) is allowed to tighten; 'waive' -> 'donate' later is
      // not, since the waive already released everything.
      const effectiveFinal: "donate" | "waive" = donor.close_final === "waive" ? "waive" : final;

      if (!donor.cancelled_at || donor.close_final !== effectiveFinal) {
        const mark = await dbRest("PATCH", `stripe_donors?${customerFilter}`, {
          cancelled_at: donor.cancelled_at ?? nowIso,
          close_final: effectiveFinal,
        });
        if (!mark.ok) {
          console.error("donor-close: could not mark cancellation", mark.status, JSON.stringify(mark.data));
          return jsonResponse(req, { ok: false, error: "Your account could not be closed right now. Nothing has changed." }, 500);
        }
      }

      if (effectiveFinal === "waive") {
        await waiveEverything(customerFilter, errors);
        await releaseCardAndBank(user, donor, errors);
      } else {
        // 'donate': nothing accrues past cancelled_at; the sync jobs stop for
        // this donor, cycle-lock builds the one final cycle, charge-cycles-run
        // charges it and then detaches the card and removes the bank.
        // A pledge still pending rides into that final cycle.
      }
    } else if (action === "cancel") {
      // No card was ever saved: there is nothing to cancel on the money side,
      // but a bank may have been linked - unlink it so Plaid stops billing.
      const items = await findPlaidItems(user, null);
      errors.push(...(await removePlaidItems(items)).errors);
    }

    if (action === "delete") {
      if (!donor) {
        const items = await findPlaidItems(user, null);
        errors.push(...(await removePlaidItems(items)).errors);
      }
      await scrubPersonalData(user, donor, errors);
    }

    if (errors.length > 0) {
      // The state change that matters (cancelled_at / close_final / waived
      // rows) is in; what failed is clean-up, which the owner can finish by
      // hand. Say so honestly instead of pretending it all worked.
      console.error("donor-close: clean-up errors", user.id, errors);
      await dbRest("POST", "events", {
        event: "donor_close_cleanup_errors",
        detail: { action, final, error_count: errors.length },
        source: "donor-close",
      });
      return jsonResponse(req, { ok: false, error: "Your account is closed, but part of the clean-up did not finish. We have been notified and will complete it." }, 502);
    }

    await dbRest("POST", "events", { event: "donor closed", detail: { action, final }, source: "donor-close" });
    return jsonResponse(req, { ok: true });
  } catch (err) {
    console.error("donor-close: unexpected error", err);
    return jsonResponse(req, { ok: false, error: "Your account could not be closed right now." }, 500);
  }
});
