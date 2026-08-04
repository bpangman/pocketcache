// Shared "sync one Plaid item's transactions into round-ups" logic. Used by
// roundups-sync (the x-charge-key admin/cron sweep over EVERY plaid_items
// row) AND roundups-me (the on-demand, per-donor path a signed-in donor's
// dashboard calls) so the two paths cannot drift on the math that decides
// what counts as a round-up.
//
// Pulled out of roundups-sync/index.ts unchanged - see that file's own
// header comment for the round-up math and mutation-safety rules (whole-
// dollar skip, pending skip, locked/charged rows never rewritten, a removed
// transaction only deletes its roundup row while still pending). Nothing
// about those rules changed in this extraction, only where the code lives.
import { dbRest } from "./stripe.ts";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID") ?? "";
const PLAID_SECRET = Deno.env.get("PLAID_SECRET") ?? "";
const PLAID_BASE = "https://sandbox.plaid.com";

export interface PlaidTxn {
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

export interface PlaidItemRow {
  id: number;
  item_id: string;
  access_token: string;
  email: string | null;
  user_id: string | null;
  cursor: string | null;
}

export interface SyncItemResult {
  transactions_seen: number;
  roundups_created: number;
  roundups_updated: number;
  roundups_skipped_whole_dollar: number;
  roundups_skipped_pending: number;
  roundups_removed: number;
}

/** dateStr is Plaid's 'YYYY-MM-DD' - slice rather than parse through Date to
 *  sidestep any timezone rounding at month boundaries. */
export function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Resolve a plaid_items row to the stripe_donors customer it belongs to.
 *  Same pattern as before: email first, then user_id, either matched against
 *  stripe_donors. An item that matches neither is not linked to any donor
 *  with a saved card yet, so there is no one to eventually charge for it. */
export async function resolveStripeCustomerId(item: PlaidItemRow): Promise<string | null> {
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

/** Pages through Plaid's /transactions/sync for one item until has_more is
 *  false, persists the new cursor if it changed, and returns the raw
 *  added/modified/removed lists for the caller to turn into round-ups. */
async function fetchPlaidChanges(item: PlaidItemRow) {
  let cursor = item.cursor ?? undefined;
  const added: PlaidTxn[] = [];
  const modified: PlaidTxn[] = [];
  const removed: { transaction_id: string }[] = [];

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

/**
 * Sync one plaid_items row's transactions and upsert its round-ups. Requires
 * the caller to have already resolved the item to a stripe_customer_id (both
 * callers do this slightly differently - roundups-sync resolves per item
 * from ALL items, roundups-me already knows the donor it is syncing for -
 * hence it is a parameter here rather than resolved inside).
 *
 * PLAID_CLIENT_ID / PLAID_SECRET missing is treated as a hard error (throws)
 * rather than silently no-op-ing, same as the original inline code did via
 * the top-level guard in roundups-sync - callers should check those secrets
 * are configured before looping.
 */
export async function syncItemRoundups(item: PlaidItemRow, stripeCustomerId: string): Promise<SyncItemResult> {
  const result: SyncItemResult = {
    transactions_seen: 0,
    roundups_created: 0,
    roundups_updated: 0,
    roundups_skipped_whole_dollar: 0,
    roundups_skipped_pending: 0,
    roundups_removed: 0,
  };

  const { added, modified, removed } = await fetchPlaidChanges(item);
  result.transactions_seen = added.length + modified.length;

  // Build the round-up candidates from settled (non-pending) outflow
  // transactions only. See roundups-sync's header for why pending is
  // skipped and why amount > 0 is the outflow direction.
  const candidates = new Map<string, { amount_cents: number; roundup_cents: number; month_key: string; merchant: string | null; txn_date: string }>();
  for (const t of [...added, ...modified]) {
    if (t.pending) {
      result.roundups_skipped_pending++;
      continue;
    }
    if (t.amount <= 0) continue; // inflow, not an outflow to round up
    const amountCents = Math.round(t.amount * 100);
    const remainder = amountCents % 100;
    if (remainder === 0) {
      result.roundups_skipped_whole_dollar++;
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
      if (existing.has(txnId)) result.roundups_updated++;
      else result.roundups_created++;
    }

    if (rows.length > 0) {
      const upsert = await dbRest(
        "POST",
        "roundups?on_conflict=txn_id",
        rows,
        { Prefer: "resolution=merge-duplicates,return=representation" },
      );
      if (!upsert.ok) {
        console.error("roundups-engine: roundups upsert failed", upsert.status, JSON.stringify(upsert.data));
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
      result.roundups_removed = del.data.length;
    }
  }

  return result;
}
