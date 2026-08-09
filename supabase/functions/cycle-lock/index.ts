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
// MULTIPLIER (2026-08-04, part of the on-demand-sync work): a donor's 1x/2x/
// 3x round-up multiplier (stripe_donors.multiplier) is applied HERE, once,
// when this month's roundup_total_cents is turned into a billable total -
// NOT stored back into `roundups` itself. Two reasons:
//   1. `roundups` is a per-transaction audit trail of what actually
//      happened at the register. A $0.32 round-up on a real $4.68 purchase
//      is $0.32, full stop - inflating that row to $0.96 for a 3x donor
//      would make the ledger lie about the purchase it is tied to, and
//      would double-apply if the donor's multiplier changed again before
//      this cycle locked (the row would already be "baked" at the OLD
//      multiplier).
//   2. Applying it once, at lock time, from the CURRENT multiplier value,
//      means a donor can change their multiplier mid-month right up until
//      the 1st and this job always uses what they actually chose - the
//      same reason roundups-me (the live dashboard total) applies it at
//      read/display time rather than writing a multiplied number anywhere.
// `rollover_in_cents` is carried forward from a PRIOR cycle's already-
// computed `total_cents`, so it is added AFTER multiplying this month's
// fresh roundup_total_cents, never multiplied a second time.
//
// EMAIL: sends one internal summary to blake@pocketcache.app via FormSubmit
// (same pattern as apple-secret-renewal). This is NOT a donor-facing email -
// see PRELAUNCH.md for the real-SMTP donor amount email, which is out of
// scope this round.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";
import { sendGmail } from "../_shared/gmail.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";
// Single-nonprofit phase: every locked cycle resolves to the one sandbox
// connected account. The column is per-cycle so multi-nonprofit routing
// later needs no schema change, just a real per-donor lookup here.
const DEFAULT_CONNECTED_ACCT = Deno.env.get("STRIPE_TEST_CONNECTED_ACCT") ?? "";
const MINIMUM_CENTS = 500;

// Single-nonprofit phase (same note as DEFAULT_CONNECTED_ACCT above): there
// is no per-donor org lookup yet, so the donor email names the one nonprofit
// this whole billing pipeline currently serves. Update alongside
// DEFAULT_CONNECTED_ACCT if/when this becomes multi-nonprofit.
const ORG_NAME = "Boys & Girls Clubs of America";

function monthName(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

/** Plain-text donor email sent once a cycle is locked (or rolled forward)
 *  for them - see _shared/gmail.ts for why this goes through the Gmail API
 *  rather than raw SMTP, and PRELAUNCH.md for why Gmail is pilot-scale only,
 *  not the production sending path. Errors are caught by the caller so a
 *  single failed send never breaks the rest of the run. */
async function sendDonorEmail(to: string, subject: string, text: string): Promise<void> {
  await sendGmail(to, subject, text);
}

/** Variant A (normal locked cycle) vs variant B (roll-forward, under the $5
 *  minimum) - see the file header's THE $5 RULE section. */
function donorEmailBody(opts: { rolledForward: boolean; totalCents: number; monthKey: string }): string {
  const month = monthName(opts.monthKey);
  if (opts.rolledForward) {
    return (
      `Hi,\n\n` +
      `Your round-ups for ${month} came in under ${ORG_NAME}'s $5 monthly minimum, ` +
      `so nothing will be charged this month. Your balance carries forward automatically ` +
      `and will combine with next month's round-ups.\n\n` +
      `No action is needed from you.\n\n` +
      `- PocketCache`
    );
  }
  const amount = `$${(opts.totalCents / 100).toFixed(2)}`;
  return (
    `Hi,\n\n` +
    `Your PocketCache round-ups for ${month} totaled ${amount}, going to ${ORG_NAME}. ` +
    `This amount will be charged to your card on the 11th.\n\n` +
    `Questions or want to skip a month? You can manage this anytime from your PocketCache app.\n\n` +
    `- PocketCache`
  );
}

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

    // One batched lookup for every donor with pending round-ups this month,
    // rather than one query per donor in the loop below. Missing from the
    // map (should not happen - a pending roundup row only exists for a
    // customer resolved to a donor) defaults to 1x, never a bigger number.
    // Also carries email - the address the locked/rolled-forward amount
    // email below goes to.
    const multiplierByDonor = new Map<string, number>();
    const emailByDonor = new Map<string, string>();
    if (totalsByDonor.size > 0) {
      const ids = [...totalsByDonor.keys()];
      const donorsRes = await dbRest(
        "GET",
        `stripe_donors?stripe_customer_id=in.(${ids.map(encodeURIComponent).join(",")})&select=stripe_customer_id,multiplier,email`,
      );
      for (const d of (Array.isArray(donorsRes.data) ? donorsRes.data : []) as { stripe_customer_id: string; multiplier: number; email: string | null }[]) {
        multiplierByDonor.set(d.stripe_customer_id, d.multiplier ?? 1);
        if (d.email) emailByDonor.set(d.stripe_customer_id, d.email);
      }
    }

    // Idempotency: only send if this SPECIFIC charge_cycles row has never
    // been emailed before (emailed_at is null). A re-run of cycle-lock for
    // the same month_key re-upserts the SAME row (on_conflict=stripe_
    // customer_id,month_key) rather than inserting a new one, and
    // merge-duplicates only overwrites columns present in the upsert payload
    // - emailed_at is deliberately never in that payload, so a prior send is
    // never clobbered back to null by a later run. Failures (no email on
    // file, SMTP error) are logged and swallowed - one donor's bad address
    // must never abort the rest of the batch, and a failed send leaves
    // emailed_at null so the NEXT run retries it.
    async function maybeEmailDonor(
      row: { id: number; emailed_at: string | null } | undefined,
      stripeCustomerId: string,
      rolledForwardCycle: boolean,
      totalCents: number,
    ): Promise<void> {
      if (!row || row.emailed_at) return;
      const to = emailByDonor.get(stripeCustomerId);
      if (!to) {
        console.error("cycle-lock: no donor email on file, skipping amount email", stripeCustomerId);
        return;
      }
      const subject = `Your PocketCache donation for ${monthName(monthKey)}`;
      const text = donorEmailBody({ rolledForward: rolledForwardCycle, totalCents, monthKey });
      try {
        await sendDonorEmail(to, subject, text);
      } catch (err) {
        console.error("cycle-lock: donor email send failed", stripeCustomerId, err);
        return;
      }
      const patch = await dbRest("PATCH", `charge_cycles?id=eq.${row.id}`, { emailed_at: new Date().toISOString() });
      if (!patch.ok) {
        console.error("cycle-lock: emailed_at patch failed", stripeCustomerId, patch.status, JSON.stringify(patch.data));
      }
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

      // Multiplier applies to THIS month's fresh round-ups only - see the
      // MULTIPLIER section in the file header for why rolloverIn (already a
      // prior cycle's computed total_cents) is added after, not multiplied
      // again.
      const multiplier = multiplierByDonor.get(stripeCustomerId) ?? 1;
      const total = roundupTotal * multiplier + rolloverIn;

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
        const rolledRow = Array.isArray(upsert.data) ? upsert.data[0] : upsert.data;
        await maybeEmailDonor(rolledRow, stripeCustomerId, true, total);
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
        const lockedRow = Array.isArray(upsert.data) ? upsert.data[0] : upsert.data;
        await maybeEmailDonor(lockedRow, stripeCustomerId, false, total);
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
