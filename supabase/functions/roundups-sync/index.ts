// roundups-sync
//
// POST (no body needed) -> { ok, items_processed, items_skipped_no_donor,
//   transactions_seen, roundups_created, roundups_updated,
//   roundups_skipped_whole_dollar, roundups_removed }
//
// This is an ADMIN/CRON action, not a browser action: it is protected by the
// x-charge-key header, which must match the CHARGE_RUN_KEY function secret,
// same pattern as stripe-charge-run and apple-secret-renewal.
//
// WHAT IT DOES: for every plaid_items row, calls Plaid's sandbox
// /transactions/sync (paging through has_more, persisting each item's
// cursor so a re-run only asks for what changed since last time), computes
// a round-up for every settled outflow transaction, and upserts it into
// roundups keyed by txn_id.
//
// ROUND-UP MATH: roundup_cents = 100 - (amount_cents % 100), skipped
// entirely when the amount is already a whole dollar (remainder 0) - there
// is nothing to round up to.
//
// WHICH TRANSACTIONS COUNT: Plaid's amount convention is positive = money
// OUT of the account, negative = money in (refunds, deposits, transfers
// in) - so only amount > 0 is an outflow worth rounding up. Pending
// transactions are skipped: Plaid gives a pending transaction a new
// transaction_id once it posts and reports the pending one as `removed`, so
// waiting for the posted transaction avoids ever rounding up a pending
// amount that could still change.
//
// LINKING A PLAID ITEM TO A DONOR: plaid_items does not carry a
// stripe_customer_id column (a donor can link a bank before or independently
// of saving a card), so this function resolves it by matching plaid_items'
// stored email (or user_id, if no email) against stripe_donors. An item
// that cannot be matched to any donor is skipped and counted separately -
// there is no card to eventually charge for it.
//
// MUTATION SAFETY: a roundup already 'locked' or 'charged' is never
// touched, even if Plaid reports the same transaction as modified again -
// only 'pending' rows are updated in place. A `removed` transaction deletes
// its roundup row, but only while it is still 'pending'.
//
// THE ACTUAL SYNC + ROUND-UP MATH now lives in _shared/roundups-engine.ts,
// shared with roundups-me (the on-demand, per-donor path a signed-in
// donor's dashboard calls) so the two paths cannot drift on what counts as
// a round-up. This file is now just: list every plaid_items row, resolve
// its donor, and call the shared syncer - same external behavior and
// response shape as before the extraction.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";
import { resolveStripeCustomerId, syncItemRoundups } from "../_shared/roundups-engine.ts";
import type { PlaidItemRow } from "../_shared/roundups-engine.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";
const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID") ?? "";
const PLAID_SECRET = Deno.env.get("PLAID_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  if (!CHARGE_RUN_KEY || req.headers.get("x-charge-key") !== CHARGE_RUN_KEY) {
    return jsonResponse(req, { error: "Unauthorized" }, 401);
  }

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    console.error("roundups-sync: missing PLAID_CLIENT_ID or PLAID_SECRET secret");
    return jsonResponse(req, { error: "Server is not configured" }, 500);
  }

  const counts = {
    items_processed: 0,
    items_skipped_no_donor: 0,
    transactions_seen: 0,
    roundups_created: 0,
    roundups_updated: 0,
    roundups_skipped_whole_dollar: 0,
    roundups_skipped_pending: 0,
    roundups_removed: 0,
  };

  try {
    const itemsRes = await dbRest("GET", "plaid_items?select=id,item_id,access_token,email,user_id,cursor");
    const items = Array.isArray(itemsRes.data) ? (itemsRes.data as PlaidItemRow[]) : [];

    for (const item of items) {
      const stripeCustomerId = await resolveStripeCustomerId(item);
      if (!stripeCustomerId) {
        counts.items_skipped_no_donor++;
        continue;
      }
      counts.items_processed++;

      const r = await syncItemRoundups(item, stripeCustomerId);
      counts.transactions_seen += r.transactions_seen;
      counts.roundups_created += r.roundups_created;
      counts.roundups_updated += r.roundups_updated;
      counts.roundups_skipped_whole_dollar += r.roundups_skipped_whole_dollar;
      counts.roundups_skipped_pending += r.roundups_skipped_pending;
      counts.roundups_removed += r.roundups_removed;
    }

    return jsonResponse(req, { ok: true, ...counts });
  } catch (err) {
    console.error("roundups-sync: unexpected error", err);
    return jsonResponse(req, { error: "Round-up sync failed unexpectedly", detail: String(err) }, 500);
  }
});
