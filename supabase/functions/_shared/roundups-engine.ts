// Shared "sync one Plaid item's transactions into round-ups" logic. Used by
// roundups-sync (the x-charge-key admin/cron sweep over EVERY plaid_items
// row) AND roundups-me (the on-demand, per-donor path a signed-in donor's
// dashboard calls) so the two paths cannot drift on the math that decides
// what counts as a round-up.
//
// See roundups-sync/index.ts's header comment for the round-up math and the
// mutation-safety rules (whole-dollar skip, pending skip, resolved rows never
// rewritten, a removed transaction only deletes its roundup row while still
// pending). On top of those, this module owns three rules the overhaul added:
//
// PRE-LINK FLOOR: Plaid's first /transactions/sync returns the account's full
// history, which used to become round-ups on purchases made months before the
// donor ever joined. A candidate dated before the bank link
// (plaid_items.created_at, or stripe_donors.giving_started_at when set) is
// now skipped. cycle-lock applies the same floor when it sums a month, so a
// row that slipped through before this rule is never billed either.
//
// LATE ROWS: a transaction that reaches Plaid after its month already locked
// (a slow-posting merchant, a failed sync on the 1st, a re-link) used to be
// stranded as 'pending' forever, because cycle-lock only ever looks at the
// month it is locking. Such a candidate is RE-KEYED to the current open month
// at sync time (txn_date unchanged) when its own month already has a
// charge_cycles row for this donor, or is a closed month (before the current
// UTC month and past the 1st's lock time). It then simply joins the next
// cycle. cycle-lock itself still selects exactly one month_key - never
// "everything up to", which would double-bill rolled-forward months.
//
// CURSOR AFTER WRITE: the Plaid cursor is persisted only after the roundups
// upsert AND the removed-delete both succeeded. Advancing it first (as this
// code once did) meant a failed upsert silently lost those transactions for
// good, since Plaid only ever returns changes after the stored cursor. A
// throw here leaves the old cursor in place and the next sync replays the
// same page; the upsert is keyed on txn_id, so the replay is idempotent.
import { dbRest } from "./stripe.ts";
import { isMonthClosed, monthKeyUTC } from "./billing-math.ts";

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
  /** When the donor linked this bank - the default pre-link floor. Optional
   *  only so older callers that did not select it still type-check; both
   *  callers in this repo select it. */
  created_at?: string | null;
}

export interface SyncItemResult {
  transactions_seen: number;
  roundups_created: number;
  roundups_updated: number;
  roundups_skipped_whole_dollar: number;
  roundups_skipped_pending: number;
  roundups_skipped_pre_link: number;
  roundups_rekeyed_late: number;
  roundups_removed: number;
}

/** Row statuses a later sync must never rewrite or delete: the money is
 *  already spoken for (locked / charged / rolled into a later cycle) or was
 *  deliberately set aside (skipped / waived / void). Only 'pending' rows are
 *  live. */
const RESOLVED_STATUSES: ReadonlySet<string> = new Set(["locked", "charged", "rolled", "skipped", "waived", "void"]);

/** dateStr is Plaid's 'YYYY-MM-DD' - slice rather than parse through Date to
 *  sidestep any timezone rounding at month boundaries. */
export function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export interface DonorForItem {
  stripe_customer_id: string;
  cancelled_at: string | null;
  giving_started_at: string | null;
}

/** Resolve a plaid_items row to the stripe_donors row it belongs to, with the
 *  two columns the sync needs: cancelled_at (a cancelled donor's banks are no
 *  longer synced - their giving ended at cancellation) and giving_started_at
 *  (the explicit pre-link floor, when set). Email first, then user_id, same
 *  precedence as before. */
export async function resolveDonorForItem(item: PlaidItemRow): Promise<DonorForItem | null> {
  const select = "select=stripe_customer_id,cancelled_at,giving_started_at&limit=1";
  if (item.email) {
    const byEmail = await dbRest("GET", `stripe_donors?email=eq.${encodeURIComponent(item.email)}&${select}`);
    const row = Array.isArray(byEmail.data) ? (byEmail.data[0] as DonorForItem | undefined) : undefined;
    if (row?.stripe_customer_id) return row;
  }
  if (item.user_id) {
    const byUser = await dbRest("GET", `stripe_donors?user_id=eq.${encodeURIComponent(item.user_id)}&${select}`);
    const row = Array.isArray(byUser.data) ? (byUser.data[0] as DonorForItem | undefined) : undefined;
    if (row?.stripe_customer_id) return row;
  }
  return null;
}

/** Resolve a plaid_items row to the stripe_donors customer it belongs to.
 *  Kept for callers that only need the id; see resolveDonorForItem. */
export async function resolveStripeCustomerId(item: PlaidItemRow): Promise<string | null> {
  const donor = await resolveDonorForItem(item);
  return donor?.stripe_customer_id ?? null;
}

/** Pages through Plaid's /transactions/sync for one item until has_more is
 *  false and returns the raw added/modified/removed lists plus the cursor the
 *  caller should persist ONCE the changes are durably written (see CURSOR
 *  AFTER WRITE in the header). Nothing is persisted here. */
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

  return { added, modified, removed, nextCursor: cursor ?? null };
}

/** The 'YYYY-MM-DD' before which this item's transactions never count. */
function preLinkFloor(item: PlaidItemRow, givingStartedAt: string | null | undefined): string | null {
  const explicit = givingStartedAt ?? null;
  const linked = item.created_at ?? null;
  const iso = explicit || linked;
  return iso ? iso.slice(0, 10) : null;
}

export interface SyncOptions {
  /** stripe_donors.giving_started_at - wins over plaid_items.created_at as
   *  the pre-link floor when set. */
  givingStartedAt?: string | null;
  /** Injected clock, for tests. */
  now?: Date;
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
 *
 * THROWS when the roundups upsert or the removed-delete fails, so the cursor
 * is not advanced and the next sync replays the same Plaid page.
 */
export async function syncItemRoundups(item: PlaidItemRow, stripeCustomerId: string, opts: SyncOptions = {}): Promise<SyncItemResult> {
  const result: SyncItemResult = {
    transactions_seen: 0,
    roundups_created: 0,
    roundups_updated: 0,
    roundups_skipped_whole_dollar: 0,
    roundups_skipped_pending: 0,
    roundups_skipped_pre_link: 0,
    roundups_rekeyed_late: 0,
    roundups_removed: 0,
  };
  const now = opts.now ?? new Date();

  const { added, modified, removed, nextCursor } = await fetchPlaidChanges(item);
  result.transactions_seen = added.length + modified.length;

  const floor = preLinkFloor(item, opts.givingStartedAt);

  // Build the round-up candidates from settled (non-pending) outflow
  // transactions only. See roundups-sync's header for why pending is
  // skipped and why amount > 0 is the outflow direction.
  const candidates = new Map<string, { amount_cents: number; roundup_cents: number; month_key: string; merchant: string | null; txn_date: string }>();
  for (const t of [...added, ...modified]) {
    if (t.pending) {
      result.roundups_skipped_pending++;
      continue;
    }
    // REFUNDS (policy, Blake's default for this pass): a merchant refund
    // arrives from Plaid as a separate NEGATIVE transaction, not as a
    // `removed` entry, so it is dropped here like every other inflow and the
    // original purchase's round-up stands. Round-ups on later-refunded
    // purchases are NOT reversed; the Terms say so. Matching refunds to
    // purchases would be fragile (partial refunds rarely equal the original).
    if (t.amount <= 0) continue; // inflow, not an outflow to round up
    if (floor && t.date < floor) {
      // Plaid's historical backfill: purchases from before the donor linked
      // this bank are not theirs to round up (PRE-LINK FLOOR in the header).
      result.roundups_skipped_pre_link++;
      continue;
    }
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

    // LATE ROWS (header): which of this donor's months already have a cycle
    // row? A candidate for such a month, or for any closed month, is re-keyed
    // to the current open month so cycle-lock sees it next time.
    const openMonth = monthKeyUTC(now);
    const cycledRes = await dbRest(
      "GET",
      `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&select=month_key`,
    );
    const cycledMonths = new Set<string>(
      (Array.isArray(cycledRes.data) ? cycledRes.data : []).map((r: { month_key: string }) => r.month_key),
    );

    const rows = [];
    for (const [txnId, c] of candidates) {
      const status = existing.get(txnId);
      if (status && RESOLVED_STATUSES.has(status)) {
        // Already resolved into a cycle (or set aside) - never rewritten by
        // a later sync.
        continue;
      }
      let monthKey = c.month_key;
      if (monthKey !== openMonth && (cycledMonths.has(monthKey) || isMonthClosed(monthKey, now))) {
        monthKey = openMonth;
        result.roundups_rekeyed_late++;
      }
      rows.push({
        stripe_customer_id: stripeCustomerId,
        plaid_item_id: item.item_id,
        txn_id: txnId,
        txn_date: c.txn_date,
        merchant: c.merchant,
        amount_cents: c.amount_cents,
        roundup_cents: c.roundup_cents,
        month_key: monthKey,
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
        // Leave the cursor where it was: the next sync replays this page.
        throw new Error(`roundups upsert failed (${upsert.status}): ${JSON.stringify(upsert.data)}`);
      }
    }
  }

  if (removed.length > 0) {
    const removedIds = removed.map((r) => r.transaction_id);
    const del = await dbRest(
      "DELETE",
      `roundups?txn_id=in.(${removedIds.map(encodeURIComponent).join(",")})&status=eq.pending`,
    );
    if (!del.ok) {
      throw new Error(`roundups removed-delete failed (${del.status}): ${JSON.stringify(del.data)}`);
    }
    if (Array.isArray(del.data)) result.roundups_removed = del.data.length;
  }

  // Both writes landed - NOW the cursor may move (CURSOR AFTER WRITE).
  if (nextCursor && nextCursor !== item.cursor) {
    const saved = await dbRest("PATCH", `plaid_items?id=eq.${item.id}`, { cursor: nextCursor });
    if (!saved.ok) {
      // Not fatal: the rows are written and keyed on txn_id, so the next
      // sync re-reads the same page and upserts the same rows harmlessly.
      console.error("roundups-engine: cursor save failed", item.id, saved.status);
    }
  }

  return result;
}

// ─── Unlinking ───────────────────────────────────────────────────────────────

export interface RemoveItemsResult {
  removed: number;
  errors: string[];
}

/**
 * Remove a donor's Plaid Items (Plaid /item/remove) and delete their
 * plaid_items rows, so roundups-sync stops for them and - the only thing that
 * actually stops Plaid's per-Item monthly billing - the Item no longer exists
 * on Plaid's side. Used by donor-close and by the billing jobs once a leaving
 * donor's final gift has settled.
 *
 * A Plaid error for an Item that is already gone (ITEM_NOT_FOUND, or an
 * access token Plaid no longer recognises) still deletes our row: there is
 * nothing left to unlink. Any other Plaid error is collected and the row is
 * KEPT, so the owner can retry rather than silently keep paying for an Item
 * we forgot about.
 */
export async function removePlaidItems(items: Pick<PlaidItemRow, "id" | "item_id" | "access_token">[]): Promise<RemoveItemsResult> {
  const result: RemoveItemsResult = { removed: 0, errors: [] };
  for (const item of items) {
    let gone = false;
    try {
      const res = await fetch(`${PLAID_BASE}/item/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, access_token: item.access_token }),
      });
      if (res.ok) {
        gone = true;
      } else {
        const errBody = await res.json().catch(() => null);
        const code = errBody?.error_code ?? "unknown";
        if (code === "ITEM_NOT_FOUND" || code === "INVALID_ACCESS_TOKEN") {
          gone = true;
        } else {
          result.errors.push(`plaid item ${item.item_id}: ${code}`);
        }
      }
    } catch (err) {
      result.errors.push(`plaid item ${item.item_id}: ${String(err)}`);
    }
    if (!gone) continue;
    const del = await dbRest("DELETE", `plaid_items?id=eq.${item.id}`);
    if (del.ok) result.removed++;
    else result.errors.push(`plaid_items row ${item.id}: delete failed (${del.status})`);
  }
  return result;
}
