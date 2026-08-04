// cycle-lock
//
// POST { month_key? } -> { ok, month_key, donors_seen, locked, rolled_forward,
//   locked_total_cents, rolled_total_cents }
//
// The 1st-of-the-month job. Protected by the x-charge-key header (must match
// CHARGE_RUN_KEY), same pattern as roundups-sync and stripe-charge-run.
//
// month_key defaults to the PREVIOUS calendar month (server time is UTC and
// this runs at 13:10 UTC on the 1st, so "previous month" is always the month
// that just finished accruing round-ups).
//
// THE $5 RULE (Blake's ruling, dated 2026-08-04): the nonprofit's minimum
// charge is 500 cents. For every donor who has pending round-ups in
// month_key:
//   total = sum(their pending roundup_cents this month)
//         + rollover_in_cents carried from their most recent still-open
//           ('rolled_forward') cycle, if any.
//   - total < 500  -> the cycle is 'rolled_forward': total_cents (the whole
//     thing) becomes next month's rollover_in_cents, and the roundups stay
//     'pending' - nothing about them changes. NOTHING is charged and nothing
//     is quoted at a trimmed-down figure. This is what replaces the old
//     abolished behavior of capping a $3 total down to a quoted $2: there is
//     no partial-gap quoting here at all, only "not yet" or "the real
//     amount".
//   - total >= 500 -> the cycle is 'locked' with total_cents set, and every
//     pending roundup that fed it moves to 'locked' too, so charge-cycles-run
//     on the 11th knows exactly what it is being asked to charge for.
//
// ROLLOVER CHAINING: "most recent still-open cycle" is simply the donor's
// latest charge_cycles row with status = 'rolled_forward', ordered by
// month_key. Because every run either locks a cycle (removing it from the
// 'rolled_forward' set) or replaces the open rolled_forward row with a new
// one for the current month_key, there is only ever at most one open
// rolled_forward cycle per donor at a time - so this naturally chains
// forward without ever double-counting an old balance.
//
// EMAIL: sends one internal summary to blake@pocketcache.app via FormSubmit
// (same pattern as apple-secret-renewal). This is NOT a donor-facing email -
// see PRELAUNCH.md for the real-SMTP donor amount email, which is out of
// scope this round.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";
// Single-nonprofit phase: every locked cycle resolves to the one sandbox
// connected account. The column is per-cycle so multi-nonprofit routing
// later needs no schema change, just a real per-donor lookup here.
const DEFAULT_CONNECTED_ACCT = Deno.env.get("STRIPE_TEST_CONNECTED_ACCT") ?? "";
const MINIMUM_CENTS = 500;

const FORMSUBMIT_URL = "https://formsubmit.co/ajax/blake@pocketcache.app";
const FORMSUBMIT_HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://pocketcache.app",
  Referer: "https://pocketcache.app",
};

async function notify(subject: string, message: string): Promise<void> {
  try {
    await fetch(FORMSUBMIT_URL, {
      method: "POST",
      headers: FORMSUBMIT_HEADERS,
      body: JSON.stringify({ _subject: subject, message }),
    });
  } catch (err) {
    console.error("cycle-lock: notify failed", err);
  }
}

function previousMonthKey(): string {
  const now = new Date();
  // UTC-based: this job runs on a UTC schedule, so "previous month" should
  // read the same way regardless of the machine's local timezone.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface PendingRow {
  stripe_customer_id: string;
  roundup_cents: number;
}

interface OpenCycleRow {
  stripe_customer_id: string;
  total_cents: number;
  month_key: string;
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

  try {
    const body = await req.json().catch(() => ({}));
    const monthKey = typeof body?.month_key === "string" && /^\d{4}-\d{2}$/.test(body.month_key)
      ? body.month_key
      : previousMonthKey();

    const pendingRes = await dbRest(
      "GET",
      `roundups?month_key=eq.${encodeURIComponent(monthKey)}&status=eq.pending&select=stripe_customer_id,roundup_cents`,
    );
    const pending = Array.isArray(pendingRes.data) ? (pendingRes.data as PendingRow[]) : [];

    const totalsByDonor = new Map<string, number>();
    for (const r of pending) {
      totalsByDonor.set(r.stripe_customer_id, (totalsByDonor.get(r.stripe_customer_id) ?? 0) + r.roundup_cents);
    }

    let locked = 0;
    let rolledForward = 0;
    let lockedTotalCents = 0;
    let rolledTotalCents = 0;
    const lockedDonors: string[] = [];
    const rolledDonors: string[] = [];

    for (const [stripeCustomerId, roundupTotal] of totalsByDonor) {
      // Pull forward any balance still sitting in an open rolled_forward
      // cycle for this donor. Only ever at most one, per the chaining note
      // above, but order by month_key desc + limit 1 defensively either way.
      const openRes = await dbRest(
        "GET",
        `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&status=eq.rolled_forward&order=month_key.desc&limit=1&select=stripe_customer_id,total_cents,month_key`,
      );
      const open = Array.isArray(openRes.data) ? (openRes.data[0] as OpenCycleRow | undefined) : undefined;
      const rolloverIn = open && open.month_key !== monthKey ? open.total_cents : 0;

      const total = roundupTotal + rolloverIn;

      if (total < MINIMUM_CENTS) {
        const upsert = await dbRest(
          "POST",
          "charge_cycles?on_conflict=stripe_customer_id,month_key",
          {
            stripe_customer_id: stripeCustomerId,
            month_key: monthKey,
            roundup_total_cents: roundupTotal,
            rollover_in_cents: rolloverIn,
            total_cents: total,
            status: "rolled_forward",
          },
          { Prefer: "resolution=merge-duplicates,return=representation" },
        );
        if (!upsert.ok) {
          console.error("cycle-lock: rolled_forward upsert failed", stripeCustomerId, upsert.status, JSON.stringify(upsert.data));
          continue;
        }
        rolledForward++;
        rolledTotalCents += total;
        rolledDonors.push(stripeCustomerId);
        // Roundups stay 'pending' - nothing charged, nothing locked.
      } else {
        const now = new Date().toISOString();
        const upsert = await dbRest(
          "POST",
          "charge_cycles?on_conflict=stripe_customer_id,month_key",
          {
            stripe_customer_id: stripeCustomerId,
            month_key: monthKey,
            roundup_total_cents: roundupTotal,
            rollover_in_cents: rolloverIn,
            total_cents: total,
            status: "locked",
            locked_at: now,
            connected_account: DEFAULT_CONNECTED_ACCT || null,
          },
          { Prefer: "resolution=merge-duplicates,return=representation" },
        );
        if (!upsert.ok) {
          console.error("cycle-lock: locked upsert failed", stripeCustomerId, upsert.status, JSON.stringify(upsert.data));
          continue;
        }
        const markLocked = await dbRest(
          "PATCH",
          `roundups?month_key=eq.${encodeURIComponent(monthKey)}&status=eq.pending&stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}`,
          { status: "locked" },
        );
        if (!markLocked.ok) {
          console.error("cycle-lock: marking roundups locked failed", stripeCustomerId, markLocked.status);
        }
        locked++;
        lockedTotalCents += total;
        lockedDonors.push(stripeCustomerId);
      }
    }

    await notify(
      `PocketCache: cycle-lock ran for ${monthKey}`,
      `cycle-lock ran for ${monthKey}.\n\n` +
      `Locked: ${locked} cycle(s), totaling $${(lockedTotalCents / 100).toFixed(2)}.\n` +
      `Rolled forward (under the $5 minimum): ${rolledForward} cycle(s), totaling $${(rolledTotalCents / 100).toFixed(2)}.\n\n` +
      `charge-cycles-run picks up the locked cycles on the 11th.`,
    );

    return jsonResponse(req, {
      ok: true,
      month_key: monthKey,
      donors_seen: totalsByDonor.size,
      locked,
      rolled_forward: rolledForward,
      locked_total_cents: lockedTotalCents,
      rolled_total_cents: rolledTotalCents,
    });
  } catch (err) {
    console.error("cycle-lock: unexpected error", err);
    await notify("PocketCache: cycle-lock FAILED", `cycle-lock failed unexpectedly: ${String(err)}`);
    return jsonResponse(req, { error: "Cycle lock failed unexpectedly", detail: String(err) }, 500);
  }
});
