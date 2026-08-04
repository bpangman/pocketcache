// roundups-me
//
// POST { multiplier? } -> { ok, linked, month_key, pending_total_cents,
//   txn_count, last_synced_at, recent, multiplier }
//
// The on-demand path a signed-in donor's dashboard calls (both the app and
// the web portal) to show a REAL pending round-up total next to the
// simulated demo number - most donors are demo-only, so `linked: false` is
// an expected, common response, not an error.
//
// AUTH: primary path is a real Supabase Authorization Bearer JWT, verified
// with resolveUser() from _shared/stripe.ts (same helper stripe-setup-intent
// already uses). Fallback: a body `email` field, matched against
// stripe_donors.email - same trust level as stripe-setup-intent already
// accepts a bare `email` in its body for a donor mid-signup with no session
// yet. Both paths resolve to "a donor row", never to an arbitrary lookup:
// the caller has to already know the donor's own email (same as knowing
// your own login), and a donor who does not match ANY row gets the exact
// same `linked: false` shape as a donor who matches but has no bank linked
// - so this cannot be used to enumerate which emails have accounts.
//
// Deployed with --no-verify-jwt, same as every other function in this
// project (plaid-exchange, stripe-setup-intent, roundups-sync, ...): the
// platform's own verify-jwt gate only understands a Supabase user JWT, and
// the email-fallback path above deliberately does NOT require one, so this
// function does its own auth via resolveUser()/email exactly like its
// siblings do.
//
// COOLDOWN: plaid_items.last_synced_at gates whether this call actually hits
// Plaid. Null or older than 20 minutes -> sync now (via the SAME
// _shared/roundups-engine.ts module roundups-sync uses, so the on-demand and
// cron paths cannot compute a round-up differently) and stamp
// last_synced_at with the server time from the MOMENT the sync started.
// Within 20 minutes -> skip Plaid entirely and answer from the `roundups`
// table alone. A donor can have more than one plaid_items row (relinked a
// bank, or linked a second one); each item's cooldown is tracked and
// applied independently, and the response's last_synced_at is the most
// recent of the donor's items.
//
// MULTIPLIER: applied at DISPLAY time only - pending_total_cents sums this
// month's pending+locked roundup_cents and multiplies by stripe_donors.
// multiplier, matching the storage discipline cycle-lock's multiplier
// section documents (never written back into `roundups`). The `recent` rows
// stay BASE, unmultiplied amounts - same convention the demo UI already
// uses (the multiplier scales the aggregate total; individual transaction
// round-ups are what they really were). Passing `multiplier` in the body
// updates stripe_donors.multiplier for this donor before computing the
// total, so a single call can both save a multiplier change and return the
// freshly-multiplied total.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, resolveUser } from "../_shared/stripe.ts";
import { syncItemRoundups } from "../_shared/roundups-engine.ts";
import type { PlaidItemRow } from "../_shared/roundups-engine.ts";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID") ?? "";
const PLAID_SECRET = Deno.env.get("PLAID_SECRET") ?? "";
const SYNC_COOLDOWN_MS = 20 * 60 * 1000;

interface DonorRow {
  stripe_customer_id: string;
  user_id: string | null;
  email: string | null;
  multiplier: number;
}

function currentMonthKeyUTC(): string {
  // Same UTC-based approach cycle-lock's previousMonthKey() uses, but for
  // the CURRENT month - a donor's dashboard shows what has accrued so far
  // this cycle, not what already locked last month.
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function findDonor(req: Request, body: { email?: unknown }): Promise<DonorRow | null> {
  const user = await resolveUser(req);
  if (user) {
    const byUser = await dbRest(
      "GET",
      `stripe_donors?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,user_id,email,multiplier&limit=1`,
    );
    const row = Array.isArray(byUser.data) ? (byUser.data[0] as DonorRow | undefined) : undefined;
    if (row) return row;
    if (user.email) {
      const byEmail = await dbRest(
        "GET",
        `stripe_donors?email=eq.${encodeURIComponent(user.email)}&select=stripe_customer_id,user_id,email,multiplier&limit=1`,
      );
      const emailRow = Array.isArray(byEmail.data) ? (byEmail.data[0] as DonorRow | undefined) : undefined;
      if (emailRow) return emailRow;
    }
    return null;
  }
  // Fallback: body email, unauthenticated JWT-wise but same trust level as
  // stripe-setup-intent's bare-email path (see file header).
  const email = typeof body?.email === "string" && body.email.includes("@") ? body.email.trim() : null;
  if (!email) return null;
  const byEmail = await dbRest(
    "GET",
    `stripe_donors?email=eq.${encodeURIComponent(email)}&select=stripe_customer_id,user_id,email,multiplier&limit=1`,
  );
  const row = Array.isArray(byEmail.data) ? (byEmail.data[0] as DonorRow | undefined) : undefined;
  return row ?? null;
}

async function findDonorPlaidItems(donor: DonorRow): Promise<PlaidItemRow[]> {
  // user_id first (the common case - see roundups_realtime.sql header),
  // falling back to email for the rows a pre-signup bank link left behind.
  const byUser = donor.user_id
    ? await dbRest(
      "GET",
      `plaid_items?user_id=eq.${encodeURIComponent(donor.user_id)}&select=id,item_id,access_token,email,user_id,cursor,last_synced_at`,
    )
    : null;
  const fromUser = Array.isArray(byUser?.data) ? (byUser!.data as (PlaidItemRow & { last_synced_at: string | null })[]) : [];
  if (fromUser.length > 0) return fromUser;

  if (donor.email) {
    const byEmail = await dbRest(
      "GET",
      `plaid_items?email=eq.${encodeURIComponent(donor.email)}&select=id,item_id,access_token,email,user_id,cursor,last_synced_at`,
    );
    if (Array.isArray(byEmail.data)) return byEmail.data as (PlaidItemRow & { last_synced_at: string | null })[];
  }
  return [];
}

interface RoundupRow {
  txn_date: string | null;
  merchant: string | null;
  amount_cents: number;
  roundup_cents: number;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const donor = await findDonor(req, body);

    if (!donor) {
      // No stripe_donors row at all for this identity - a demo-only visitor
      // who has never started a card save. Same shape as "linked: false"
      // below so this branch is not distinguishable from "found but no
      // bank" (see file header on enumeration).
      return jsonResponse(req, { ok: true, linked: false, multiplier: 1 });
    }

    // Optional multiplier update, persisted before computing the total so a
    // single call both saves the change and returns the fresh number.
    let multiplier = donor.multiplier ?? 1;
    const requestedMultiplier = Number(body?.multiplier);
    if (Number.isInteger(requestedMultiplier) && requestedMultiplier >= 1 && requestedMultiplier <= 3 && requestedMultiplier !== multiplier) {
      const update = await dbRest(
        "PATCH",
        `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(donor.stripe_customer_id)}`,
        { multiplier: requestedMultiplier },
      );
      if (update.ok) {
        multiplier = requestedMultiplier;
      } else {
        console.error("roundups-me: multiplier update failed", update.status, JSON.stringify(update.data));
      }
    }

    const items = await findDonorPlaidItems(donor);
    if (items.length === 0) {
      return jsonResponse(req, { ok: true, linked: false, multiplier });
    }

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      console.error("roundups-me: missing PLAID_CLIENT_ID or PLAID_SECRET secret");
      // Configuration problem, not "no bank" - but still fail soft into the
      // demo fallback rather than surfacing a scary error to a donor.
      return jsonResponse(req, { ok: true, linked: false, multiplier });
    }

    let latestSync: string | null = null;
    for (const item of items as (PlaidItemRow & { last_synced_at: string | null })[]) {
      const lastSyncedAt = item.last_synced_at;
      const stale = !lastSyncedAt || (Date.now() - new Date(lastSyncedAt).getTime()) > SYNC_COOLDOWN_MS;
      if (stale) {
        // Stamp the server time from THIS moment, before the Plaid call, so
        // a slow response cannot shrink the cooldown window.
        const syncStartedAt = new Date().toISOString();
        try {
          await syncItemRoundups(item, donor.stripe_customer_id);
        } catch (err) {
          // A Plaid hiccup on one item should not break the whole request -
          // serve whatever is already in `roundups` and let the next call
          // (or the cron sweep) retry.
          console.error("roundups-me: sync failed for item", item.id, err);
        }
        await dbRest("PATCH", `plaid_items?id=eq.${item.id}`, { last_synced_at: syncStartedAt });
        if (!latestSync || syncStartedAt > latestSync) latestSync = syncStartedAt;
      } else if (!latestSync || (lastSyncedAt && lastSyncedAt > latestSync)) {
        latestSync = lastSyncedAt;
      }
    }

    const monthKey = currentMonthKeyUTC();
    const roundupsRes = await dbRest(
      "GET",
      `roundups?stripe_customer_id=eq.${encodeURIComponent(donor.stripe_customer_id)}&month_key=eq.${encodeURIComponent(monthKey)}&status=in.(pending,locked)&select=txn_date,merchant,amount_cents,roundup_cents&order=txn_date.desc`,
    );
    const rows = Array.isArray(roundupsRes.data) ? (roundupsRes.data as RoundupRow[]) : [];

    const baseTotalCents = rows.reduce((sum, r) => sum + r.roundup_cents, 0);
    const pendingTotalCents = baseTotalCents * multiplier;

    const recent = rows.slice(0, 10).map((r) => ({
      date: r.txn_date,
      merchant: r.merchant,
      amount_cents: r.amount_cents,
      roundup_cents: r.roundup_cents,
    }));

    return jsonResponse(req, {
      ok: true,
      linked: true,
      month_key: monthKey,
      pending_total_cents: pendingTotalCents,
      txn_count: rows.length,
      last_synced_at: latestSync,
      recent,
      multiplier,
    });
  } catch (err) {
    console.error("roundups-me: unexpected error", err);
    return jsonResponse(req, { error: "Could not load your round-ups right now." }, 500);
  }
});
