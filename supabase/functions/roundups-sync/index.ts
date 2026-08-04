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
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";
const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID") ?? "";
const PLAID_SECRET = Deno.env.get("PLAID_SECRET") ?? "";
const PLAID_BASE = "https://sandbox.plaid.com";

interface PlaidTxn {
  transaction_id: string;
  date: string;
  amount: number;
  pending: boolean;
  merchant_name?: string | null;
  name?: string | null;
}

interface PlaidSyncPage {
  added: PlaidTxn[];
  modified: PlaidTxn[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
}

interface PlaidItemRow {
  id: number;
  item_id: string;
  access_token: string;
  email: string | null;
  user_id: string | null;
  cursor: string | null;
}

function monthKeyFromDate(dateStr: string): string {
  // dateStr is Plaid's 'YYYY-MM-DD' - slice rather than parse through Date
  // to sidestep any timezone rounding at month boundaries.
  return dateStr.slice(0, 7);
}

async function resolveStripeCustomerId(item: PlaidItemRow): Promise<string | null> {
  if (item.email) {
    const byEmail = await dbRest(
      "GET",
      `stripe_donors?email=eq.${encodeURIComponent(item.email)}&select=stripe_customer_id&limit=1`,
    );
    const row = Array.isArray(byEmail.data) ? byEmail.data[0] : null;
    if (row?.stripe_customer_id) return row.stripe_customer_id;
  }
  if (item.user_id) {
    const byUser = await dbRest(
      "GET",
      `stripe_donors?user_id=eq.${encodeURIComponent(item.user_id)}&select=stripe_customer_id&limit=1`,
    );
    const row = Array.isArray(byUser.data) ? byUser.data[0] : null;
    if (row?.stripe_customer_id) return row.stripe_customer_id;
  }
  return null;
}

async function syncOneItem(item: PlaidItemRow) {
  let cursor = item.cursor ?? undefined;
  const added: PlaidTxn[] = [];
  const modified: PlaidTxn[] = [];
  const removed: { transaction_id: string }[] = [];

  // Page through has_more until Plaid says there is nothing left new.
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`${PLAID_BASE}/transactions/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: item.access_token,
        ...(cursor ? { cursor } : {}),
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(`Plaid /transactions/sync failed (${res.status}): ${errBody?.error_code ?? "unknown"}`);
    }
    const data = (await res.json()) as PlaidSyncPage;
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    cursor = data.next_cursor;
    if (!data.has_more) break;
  }

  if (cursor && cursor !== item.cursor) {
    await dbRest("PATCH", `plaid_items?id=eq.${item.id}`, { cursor });
  }

  return { added, modified, removed };
}

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

      const { added, modified, removed } = await syncOneItem(item);
      counts.transactions_seen += added.length + modified.length;

      // Build the round-up candidates from settled (non-pending) outflow
      // transactions only. See file header for why pending is skipped.
      const candidates = new Map<string, { amount_cents: number; roundup_cents: number; month_key: string; merchant: string | null; txn_date: string }>();
      for (const t of [...added, ...modified]) {
        if (t.pending) {
          counts.roundups_skipped_pending++;
          continue;
        }
        if (t.amount <= 0) continue; // inflow, not an outflow to round up
        const amountCents = Math.round(t.amount * 100);
        const remainder = amountCents % 100;
        if (remainder === 0) {
          counts.roundups_skipped_whole_dollar++;
          continue;
        }
        candidates.set(t.transaction_id, {
          amount_cents: amountCents,
          roundup_cents: 100 - remainder,
          month_key: monthKeyFromDate(t.date),
          merchant: t.merchant_name ?? t.name ?? null,
          txn_date: t.date,
        });
      }

      if (candidates.size > 0) {
        const ids = [...candidates.keys()];
        const existingRes = await dbRest(
          "GET",
          `roundups?txn_id=in.(${ids.map(encodeURIComponent).join(",")})&select=txn_id,status`,
        );
        const existing = new Map<string, string>(
          (Array.isArray(existingRes.data) ? existingRes.data : []).map((r: { txn_id: string; status: string }) => [r.txn_id, r.status]),
        );

        const rows = [];
        for (const [txnId, c] of candidates) {
          const status = existing.get(txnId);
          if (status === "locked" || status === "charged") {
            // Already resolved into a cycle - never rewritten by a later sync.
            continue;
          }
          rows.push({
            stripe_customer_id: stripeCustomerId,
            plaid_item_id: item.item_id,
            txn_id: txnId,
            txn_date: c.txn_date,
            merchant: c.merchant,
            amount_cents: c.amount_cents,
            roundup_cents: c.roundup_cents,
            month_key: c.month_key,
            status: "pending",
          });
          if (existing.has(txnId)) counts.roundups_updated++;
          else counts.roundups_created++;
        }

        if (rows.length > 0) {
          const upsert = await dbRest(
            "POST",
            "roundups?on_conflict=txn_id",
            rows,
            { Prefer: "resolution=merge-duplicates,return=representation" },
          );
          if (!upsert.ok) {
            console.error("roundups-sync: roundups upsert failed", upsert.status, JSON.stringify(upsert.data));
          }
        }
      }

      if (removed.length > 0) {
        const removedIds = removed.map((r) => r.transaction_id);
        const del = await dbRest(
          "DELETE",
          `roundups?txn_id=in.(${removedIds.map(encodeURIComponent).join(",")})&status=eq.pending`,
        );
        if (del.ok && Array.isArray(del.data)) {
          counts.roundups_removed += del.data.length;
        }
      }
    }

    return jsonResponse(req, { ok: true, ...counts });
  } catch (err) {
    console.error("roundups-sync: unexpected error", err);
    return jsonResponse(req, { error: "Round-up sync failed unexpectedly", detail: String(err) }, 500);
  }
});
