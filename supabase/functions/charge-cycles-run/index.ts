// charge-cycles-run
//
// POST (no body needed) -> { ok, charged, failed, already_done,
//   skipped_no_card, charged_total_cents }
//
// The 11th-of-the-month job. Protected by the x-charge-key header (must
// match CHARGE_RUN_KEY), same pattern as the other internal functions.
//
// For every charge_cycles row with status 'locked': resolve the connected
// account (per-cycle column, defaulted to STRIPE_TEST_CONNECTED_ACCT today
// since we are single-nonprofit phase - multi-nonprofit routing needs no
// schema change later, just a real value in that column), get-or-create the
// connected Customer + cloned card via _shared/connected-customer.ts (the
// SAME module stripe-charge-run uses, so the manual test path and this
// automated run behave identically), then create + confirm a direct-charge
// off_session PaymentIntent on the connected account.
//
// FEE ROUTING - DELIBERATELY ABSENT, same as stripe-charge-run. No
// application_fee_amount here. The $1/month fee treatment is OPEN LEGAL
// DECISION #1 (with Nathan) - do not add it without that decision in
// writing.
//
// IDEMPOTENCY: a cycle that already has a payment_intent_id is skipped
// before any Stripe call, even if its status still reads 'locked' (the
// crash-mid-run case: the PaymentIntent went through but the status flip to
// 'charged' did not complete). This is on top of only ever selecting
// status='locked' rows to begin with, so a cycle already 'charged' or
// 'failed' from this month never gets touched again.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, stripeCall } from "../_shared/stripe.ts";
import { getOrCreateConnectedCustomer, isBlockedStripeCode } from "../_shared/connected-customer.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";
const DEFAULT_CONNECTED_ACCT = Deno.env.get("STRIPE_TEST_CONNECTED_ACCT") ?? "";

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
    console.error("charge-cycles-run: notify failed", err);
  }
}

interface CycleRow {
  id: number;
  stripe_customer_id: string;
  month_key: string;
  total_cents: number;
  connected_account: string | null;
  payment_intent_id: string | null;
}

async function logEvent(event: string, detail: Record<string, unknown>) {
  const res = await dbRest("POST", "events", { event, detail, source: "charge-cycles-run" });
  if (!res.ok) console.error("charge-cycles-run: events insert failed", res.status, JSON.stringify(res.data));
}

async function failCycle(cycle: CycleRow, step: string, message: string) {
  await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}`, { status: "failed" });
  await logEvent("charge_cycle_failed", {
    cycle_id: cycle.id,
    stripe_customer_id: cycle.stripe_customer_id,
    month_key: cycle.month_key,
    total_cents: cycle.total_cents,
    step,
    error: message,
  });
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

  const counts = {
    charged: 0,
    failed: 0,
    already_done: 0,
    skipped_no_card: 0,
    charged_total_cents: 0,
  };
  const chargedCycles: { cycle_id: number; payment_intent_id: string; month_key: string }[] = [];
  const failedCycles: { cycle_id: number; month_key: string; error: string }[] = [];

  try {
    const cyclesRes = await dbRest(
      "GET",
      "charge_cycles?status=eq.locked&select=id,stripe_customer_id,month_key,total_cents,connected_account,payment_intent_id",
    );
    const cycles = Array.isArray(cyclesRes.data) ? (cyclesRes.data as CycleRow[]) : [];

    for (const cycle of cycles) {
      if (cycle.payment_intent_id) {
        // Already charged in an earlier run that did not finish flipping the
        // status - never re-charge, just record it as already done.
        counts.already_done++;
        continue;
      }

      const connectedAccount = cycle.connected_account || DEFAULT_CONNECTED_ACCT;
      if (!connectedAccount) {
        await failCycle(cycle, "resolve_connected_account", "No connected account configured");
        counts.failed++;
        failedCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, error: "No connected account configured" });
        continue;
      }
      if (!cycle.connected_account) {
        // Stamp it on the row now, per-cycle, so this is already
        // multi-nonprofit-ready even though every cycle resolves to the
        // same account today.
        await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}`, { connected_account: connectedAccount });
      }

      const donorRes = await dbRest(
        "GET",
        `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}&select=payment_method_id,setup_status,email&limit=1`,
      );
      const donor = Array.isArray(donorRes.data) ? donorRes.data[0] : null;
      if (!donor?.payment_method_id || donor.setup_status !== "saved") {
        counts.skipped_no_card++;
        await failCycle(cycle, "lookup_donor_card", "No saved card for that customer");
        counts.failed++;
        failedCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, error: "No saved card for that customer" });
        continue;
      }

      const connected = await getOrCreateConnectedCustomer(cycle.stripe_customer_id, connectedAccount, donor);
      if (!connected.ok) {
        const detail = isBlockedStripeCode(connected.stripeCode)
          ? `Stripe Connect not enabled/linked yet (${connected.step}, ${connected.stripeCode})`
          : `${connected.step}: ${connected.message}`;
        await failCycle(cycle, connected.step, detail);
        counts.failed++;
        failedCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, error: detail });
        continue;
      }

      const intent = await stripeCall(
        "POST",
        "/payment_intents",
        {
          amount: cycle.total_cents,
          currency: "usd",
          customer: connected.connectedCustomerId,
          payment_method: connected.paymentMethodId,
          off_session: "true",
          confirm: "true",
          description: `PocketCache round-ups ${cycle.month_key}`,
        },
        connectedAccount,
      );
      if (!intent.ok) {
        const detail = `payment_intent: ${intent.errorCode ?? intent.status} ${intent.errorMessage ?? ""}`.trim();
        await failCycle(cycle, "payment_intent", detail);
        counts.failed++;
        failedCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, error: detail });
        continue;
      }

      const chargedAt = new Date().toISOString();
      await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}`, {
        status: "charged",
        payment_intent_id: intent.data.id,
        charged_at: chargedAt,
      });
      await dbRest(
        "PATCH",
        `roundups?month_key=eq.${encodeURIComponent(cycle.month_key)}&status=eq.locked&stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}`,
        { status: "charged" },
      );
      // "Give Extra" pledges cycle-lock folded into this cycle's total (it
      // stamped cycle_month on exactly the rows it consumed - see
      // supabase/give_extras.sql) were just billed as part of this
      // PaymentIntent, so flip them to 'charged' alongside the round-ups.
      await dbRest(
        "PATCH",
        `give_extras?cycle_month=eq.${encodeURIComponent(cycle.month_key)}&status=eq.pending&stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}`,
        { status: "charged" },
      );
      await logEvent("charge_cycle_charged", {
        cycle_id: cycle.id,
        stripe_customer_id: cycle.stripe_customer_id,
        month_key: cycle.month_key,
        total_cents: cycle.total_cents,
        payment_intent_id: intent.data.id,
        connected_account: connectedAccount,
      });

      counts.charged++;
      counts.charged_total_cents += cycle.total_cents;
      chargedCycles.push({ cycle_id: cycle.id, payment_intent_id: intent.data.id, month_key: cycle.month_key });
    }

    const summaryLines = [
      `charge-cycles-run finished.`,
      ``,
      `Charged: ${counts.charged} cycle(s), totaling $${(counts.charged_total_cents / 100).toFixed(2)}.`,
      `Already done (skipped, no double-charge): ${counts.already_done}.`,
      `Failed: ${counts.failed}.`,
      `Skipped (no saved card): ${counts.skipped_no_card}.`,
    ];
    if (failedCycles.length > 0) {
      summaryLines.push("", "Failures:");
      for (const f of failedCycles) summaryLines.push(`  cycle ${f.cycle_id} (${f.month_key}): ${f.error}`);
    }
    await notify("PocketCache: charge-cycles-run finished", summaryLines.join("\n"));

    return jsonResponse(req, { ok: true, ...counts, charged_cycles: chargedCycles });
  } catch (err) {
    console.error("charge-cycles-run: unexpected error", err);
    await notify("PocketCache: charge-cycles-run FAILED", `charge-cycles-run failed unexpectedly: ${String(err)}`);
    return jsonResponse(req, { error: "Charge cycles run failed unexpectedly", detail: String(err) }, 500);
  }
});
