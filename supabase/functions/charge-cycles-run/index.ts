// charge-cycles-run
//
// POST (no body needed) -> { ok, charged, retry_scheduled, rolled_forward,
//   waived, already_done, held_no_account, connect_blocked,
//   skipped_no_card, charged_total_cents, charged_cycles }
//
// The 11th-of-the-month job, and (same function, same cron command) the
// 14th's retry run. Protected by the x-charge-key header (must match
// CHARGE_RUN_KEY), same pattern as the other internal functions.
//
// For every charge_cycles row with status 'locked', or 'retry' whose
// next_retry_at has passed: resolve the connected account (the per-cycle
// column cycle-lock stamped from _shared/org-routing.ts; a legacy row with
// none is routed again here), get-or-create the connected Customer + cloned
// card via _shared/connected-customer.ts (the SAME module stripe-charge-run
// uses, so the manual test path and this automated run behave identically),
// then create and confirm a direct-charge PaymentIntent on the connected
// account in TWO PHASES (below).
//
// WHAT IS CHARGED: adjusted_total_cents (the donor lowered the amount in the
// 1st-10th review window) plus its processing cover when cover_processing is
// on, else the locked total_cents (which already includes cover_cents). The
// $1 fee is never in either number.
//
// FEE ROUTING - DELIBERATELY ABSENT, same as stripe-charge-run. No
// application_fee_amount here. The $1/month fee treatment is OPEN LEGAL
// DECISION #1 (with Nathan) - do not add it without that decision in
// writing. No receipt_email either: the nonprofit is the merchant of record
// and its own Stripe receipt settings decide (Blake's default 2026-11-07).
//
// IDEMPOTENCY, two layers:
//   1. Stripe Idempotency-Key 'pc_cycle_<id>_<month_key>_a<attempts>' on the
//      create AND (with a _confirm suffix) the confirm call. A crashed run
//      that re-sends the same request gets the SAME PaymentIntent back.
//   2. Two-phase write: the PaymentIntent is created with confirm=false, its
//      id is written to charge_cycles (guarded on payment_intent_id IS NULL)
//      and that write is CHECKED before anything is confirmed. If the write
//      fails the run stops and alerts - no money has moved, the unconfirmed
//      intent just expires. A row that already has a payment_intent_id when
//      the run starts (crash between confirm and the status flip) is looked
//      up on Stripe and finished, never re-created. Stripe keys expire after
//      24 hours, which is why the DB record, not the key alone, is the guard.
//
// RETRIES (Terms: "retry the charge once after approximately 3 days"): a
// retryable decline (insufficient_funds, generic_decline, processing_error,
// a network blip) marks the cycle 'retry' with attempts + 1, last_error and
// next_retry_at = now + 3 days; the 14th's cron picks it up. A second failure
// or a permanent decline (expired, lost or stolen card, no saved card) flips
// the cycle to 'rolled_forward' so the next cycle-lock absorbs the amount
// owed through the rollover chain (its round-ups stay 'locked' and its
// pledges stay stamped - they ride inside the carried figure), and the donor
// gets ONE "update your card" email (card_update_emailed_at). No connected
// account, or Stripe Connect not enabled yet, is a platform-side problem: the
// cycle simply stays 'locked' and rides the next run.
//
// AUDIT: full detail (Stripe customer, PaymentIntent, connected account,
// amount, error) goes to charge_log, a service-role-only table. The anon-
// readable events table gets cycle_id, month_key and total_cents ONLY - it
// used to carry Stripe ids, which the public anon key could read.
//
// CANCELLED DONORS: a 'waive' donor's cycle is waived here if donor-close
// somehow left it; a 'donate' donor's one final cycle is charged like any
// other, after which their card is detached everywhere and their Plaid Items
// removed - that final gift was the last thing their account owed.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest, stripeCall } from "../_shared/stripe.ts";
import type { StripeResult } from "../_shared/stripe.ts";
import { detachDonorPaymentMethods, getOrCreateConnectedCustomer, isBlockedStripeCode } from "../_shared/connected-customer.ts";
import { removePlaidItems } from "../_shared/roundups-engine.ts";
import type { PlaidItemRow } from "../_shared/roundups-engine.ts";
import { resolveOrgForCustomer, statementDescriptorSuffix } from "../_shared/org-routing.ts";
import type { ResolvedOrg } from "../_shared/org-routing.ts";
import {
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  classifyDecline,
  fmtCents,
  monthName,
  processingCoverCents,
} from "../_shared/billing-math.ts";
import { sendGmail } from "../_shared/gmail.ts";
import { brandedEmail, para } from "../_shared/emailBrand.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";

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
  status: string;
  total_cents: number;
  base_after_controls_cents: number | null;
  adjusted_total_cents: number | null;
  cover_cents: number | null;
  fee_months: number | null;
  connected_account: string | null;
  payment_intent_id: string | null;
  attempts: number | null;
  months_included: string[] | null;
  card_update_emailed_at: string | null;
}

const CYCLE_SELECT =
  "id,stripe_customer_id,month_key,status,total_cents,base_after_controls_cents,adjusted_total_cents,cover_cents,fee_months,connected_account,payment_intent_id,attempts,months_included,card_update_emailed_at";

interface DonorRow {
  payment_method_id: string | null;
  setup_status: string;
  email: string | null;
  user_id: string | null;
  cover_processing: boolean | null;
  cancelled_at: string | null;
  close_final: "donate" | "waive" | null;
}

/** PII-free owner feed: never a Stripe id, never an email. */
async function logEvent(event: string, detail: Record<string, unknown>) {
  const res = await dbRest("POST", "events", { event, detail, source: "charge-cycles-run" });
  if (!res.ok) console.error("charge-cycles-run: events insert failed", res.status, JSON.stringify(res.data));
}

/** Service-role-only audit row with the full detail. */
async function chargeLog(cycle: CycleRow, connectedAccount: string | null, amountCents: number, status: string, paymentIntentId: string | null, error: string | null) {
  const res = await dbRest("POST", "charge_log", {
    cycle_id: cycle.id,
    stripe_customer_id: cycle.stripe_customer_id,
    payment_intent_id: paymentIntentId,
    connected_account: connectedAccount,
    amount_cents: amountCents,
    status,
    error,
  });
  if (!res.ok) console.error("charge-cycles-run: charge_log insert failed", res.status, JSON.stringify(res.data));
}

function monthsOf(cycle: CycleRow): string[] {
  return Array.isArray(cycle.months_included) && cycle.months_included.length > 0 ? cycle.months_included : [cycle.month_key];
}

function monthsFilter(cycle: CycleRow): string {
  return `month_key=in.(${monthsOf(cycle).map(encodeURIComponent).join(",")})`;
}

/** What this cycle charges today: the review-window adjustment (plus its
 *  fresh gross-up) when the donor lowered it, else the locked total. */
function amountFor(cycle: CycleRow, donor: DonorRow): { amountCents: number; baseCents: number; coverCents: number } {
  if (cycle.adjusted_total_cents !== null && cycle.adjusted_total_cents !== undefined) {
    const base = cycle.adjusted_total_cents;
    const cover = donor.cover_processing === false ? 0 : processingCoverCents(base);
    return { amountCents: base + cover, baseCents: base, coverCents: cover };
  }
  const cover = cycle.cover_cents ?? 0;
  return { amountCents: cycle.total_cents, baseCents: cycle.total_cents - cover, coverCents: cover };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The one "update your card" email a donor gets when a cycle gives up. */
async function sendCardUpdateEmail(to: string, orgName: string, monthKey: string, amountCents: number): Promise<void> {
  const month = monthName(monthKey);
  const amount = fmtCents(amountCents);
  const text =
    `Hi,\n\n` +
    `${orgName} could not complete your ${month} round-up charge of ${amount} - your card declined, so nothing was charged.\n\n` +
    `Your balance is not lost. It carries forward and is added to your next monthly charge as soon as you update your card in the PocketCache app.\n\n` +
    `- PocketCache, on behalf of ${orgName}'s round-up program`;
  const html = brandedEmail({
    heading: `Please update your card`,
    bodyHtml:
      para(`${esc(orgName)} could not complete your ${month} round-up charge of ${amount} - your card declined, so nothing was charged.`) +
      para(`Your balance is not lost. It carries forward and is added to your next monthly charge as soon as you update your card in the PocketCache app.`) +
      para(`PocketCache, on behalf of ${esc(orgName)}'s round-up program`),
    footnote: "You are receiving this because you set up round-up giving in the PocketCache app.",
  });
  await sendGmail(to, `Please update your card - ${orgName} round-ups`, text, html);
}

/** Fully close a leaving donor once their final gift has settled. */
async function finishClosure(stripeCustomerId: string, donor: DonorRow): Promise<string[]> {
  const errors: string[] = [];
  const detach = await detachDonorPaymentMethods(stripeCustomerId, donor.payment_method_id);
  errors.push(...detach.errors);
  const filter = donor.user_id
    ? `user_id=eq.${encodeURIComponent(donor.user_id)}`
    : donor.email
    ? `email=eq.${encodeURIComponent(donor.email)}`
    : null;
  if (filter) {
    const itemsRes = await dbRest("GET", `plaid_items?${filter}&select=id,item_id,access_token`);
    const items = Array.isArray(itemsRes.data) ? (itemsRes.data as Pick<PlaidItemRow, "id" | "item_id" | "access_token">[]) : [];
    errors.push(...(await removePlaidItems(items)).errors);
  }
  return errors;
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
    retry_scheduled: 0,
    rolled_forward: 0,
    waived: 0,
    already_done: 0,
    held_no_account: 0,
    connect_blocked: 0,
    skipped_no_card: 0,
    charged_total_cents: 0,
  };
  const chargedCycles: { cycle_id: number; payment_intent_id: string; month_key: string }[] = [];
  const failedCycles: { cycle_id: number; month_key: string; outcome: string; error: string }[] = [];
  const heldCycles: { cycle_id: number; month_key: string; why: string }[] = [];
  const closureErrors: string[] = [];
  const orgCache = new Map<string, ResolvedOrg | null>();

  try {
    const nowIso = new Date().toISOString();
    const cyclesRes = await dbRest(
      "GET",
      `charge_cycles?status=in.(locked,retry)&or=(next_retry_at.is.null,next_retry_at.lte.${encodeURIComponent(nowIso)})&order=month_key.asc&select=${CYCLE_SELECT}`,
    );
    const cycles = Array.isArray(cyclesRes.data) ? (cyclesRes.data as CycleRow[]) : [];

    for (const cycle of cycles) {
      const attempts = cycle.attempts ?? 0;
      const months = monthsFilter(cycle);

      const donorRes = await dbRest(
        "GET",
        `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}&select=payment_method_id,setup_status,email,user_id,cover_processing,cancelled_at,close_final&limit=1`,
      );
      const donor = (Array.isArray(donorRes.data) ? donorRes.data[0] : null) as DonorRow | null;

      // A cancelled donor who waived: nothing may be charged. donor-close
      // already waives open cycles; this is the belt to its suspenders.
      if (donor?.cancelled_at && donor.close_final !== "donate") {
        await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}&status=in.(locked,retry)`, { status: "waived" });
        await dbRest("PATCH", `roundups?stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}&${months}&status=in.(pending,rolled,locked)`, { status: "waived" });
        await dbRest("PATCH", `give_extras?stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}&cycle_month=in.(${monthsOf(cycle).map(encodeURIComponent).join(",")})&status=eq.pending`, { status: "cancelled" });
        counts.waived++;
        continue;
      }

      const org = await resolveOrgForCustomer(cycle.stripe_customer_id, orgCache);
      const connectedAccount = cycle.connected_account || org?.connectedAccount || null;
      if (!connectedAccount) {
        // Platform-side problem, not the donor's: stays locked, rides the
        // next run, and the owner hears about it.
        counts.held_no_account++;
        heldCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, why: "no connected account resolved for this donor's nonprofit" });
        continue;
      }
      if (!cycle.connected_account) {
        await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}`, { connected_account: connectedAccount });
      }
      const orgName = org?.name ?? "Your nonprofit";

      /** Give up on this attempt: schedule the one retry, or roll the cycle
       *  forward and ask the donor for a new card. */
      async function failAttempt(step: string, errorCode: string | null | undefined, declineCode: string | null | undefined, message: string, paymentIntentId: string | null, amountCents: number) {
        const cls = classifyDecline(errorCode, declineCode);
        const attemptsNow = attempts + 1;
        const detail = `${step}: ${errorCode ?? "error"}${declineCode ? ` (${declineCode})` : ""} ${message}`.trim();
        await chargeLog(cycle, connectedAccount, amountCents, "failed", paymentIntentId, detail);
        if (cls === "retryable" && attemptsNow < MAX_ATTEMPTS) {
          const res = await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}&status=in.(locked,retry)`, {
            status: "retry",
            attempts: attemptsNow,
            last_error: detail.slice(0, 500),
            next_retry_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
            payment_intent_id: null,
          });
          if (!res.ok) console.error("charge-cycles-run: retry PATCH failed", cycle.id, res.status);
          counts.retry_scheduled++;
          failedCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, outcome: "retry in 3 days", error: detail });
          return;
        }
        // Permanent, or the retry failed too: the amount owed rides into the
        // next cycle through the rollover chain (cycle-lock's carryFromRow
        // reads the pre-cover figure off this row).
        const res = await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}&status=in.(locked,retry)`, {
          status: "rolled_forward",
          attempts: attemptsNow,
          last_error: detail.slice(0, 500),
          next_retry_at: null,
          payment_intent_id: null,
        });
        if (!res.ok) console.error("charge-cycles-run: rolled_forward PATCH failed", cycle.id, res.status);
        await logEvent("charge_cycle_failed", { cycle_id: cycle.id, month_key: cycle.month_key, total_cents: amountCents, step });
        counts.rolled_forward++;
        failedCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, outcome: "rolled forward, card email sent", error: detail });
        if (donor?.email && !cycle.card_update_emailed_at) {
          try {
            await sendCardUpdateEmail(donor.email, orgName, cycle.month_key, amountCents);
            await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}&card_update_emailed_at=is.null`, { card_update_emailed_at: new Date().toISOString() });
          } catch (err) {
            console.error("charge-cycles-run: card update email failed", cycle.id, err);
          }
        }
      }

      /** The bookkeeping after Stripe says succeeded. */
      async function finalize(paymentIntentId: string, amountCents: number): Promise<boolean> {
        const chargedAt = new Date().toISOString();
        const flip = await dbRest("PATCH", `charge_cycles?id=eq.${cycle.id}&status=in.(locked,retry)`, {
          status: "charged",
          payment_intent_id: paymentIntentId,
          charged_at: chargedAt,
          last_error: null,
          next_retry_at: null,
        });
        if (!flip.ok) {
          // Money moved but the status did not. payment_intent_id is already
          // on the row from phase one, so the next run finds the intent and
          // finishes this instead of charging again - but it must be loud.
          console.error("charge-cycles-run: charged PATCH failed", cycle.id, flip.status, JSON.stringify(flip.data));
          await notify(
            "PocketCache: charge-cycles-run needs attention",
            `Cycle ${cycle.id} (${cycle.month_key}) was charged (PaymentIntent ${paymentIntentId}) but the status write failed with ${flip.status}. The next run will reconcile it from the stored intent; please check the row.`,
          );
          return false;
        }
        await dbRest(
          "PATCH",
          `roundups?stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}&${months}&status=eq.locked`,
          { status: "charged" },
        );
        // "Give Extra" pledges cycle-lock folded into this cycle (it stamped
        // cycle_month on exactly the rows it consumed - see
        // supabase/give_extras.sql) were just billed as part of this
        // PaymentIntent, so flip them to 'charged' alongside the round-ups.
        await dbRest(
          "PATCH",
          `give_extras?stripe_customer_id=eq.${encodeURIComponent(cycle.stripe_customer_id)}&cycle_month=in.(${monthsOf(cycle).map(encodeURIComponent).join(",")})&status=eq.pending`,
          { status: "charged" },
        );
        await chargeLog(cycle, connectedAccount, amountCents, "charged", paymentIntentId, null);
        await logEvent("charge_cycle_charged", { cycle_id: cycle.id, month_key: cycle.month_key, total_cents: amountCents });
        counts.charged++;
        counts.charged_total_cents += amountCents;
        chargedCycles.push({ cycle_id: cycle.id, payment_intent_id: paymentIntentId, month_key: cycle.month_key });
        if (donor?.cancelled_at && donor.close_final === "donate") {
          // The final gift is in: close the account for real.
          closureErrors.push(...(await finishClosure(cycle.stripe_customer_id, donor)).map((e) => `${cycle.stripe_customer_id}: ${e}`));
        }
        return true;
      }

      const fallbackDonor: DonorRow = { payment_method_id: null, setup_status: "", email: null, user_id: null, cover_processing: true, cancelled_at: null, close_final: null };
      const { amountCents, baseCents, coverCents } = amountFor(cycle, donor ?? fallbackDonor);
      const savedCard = donor?.payment_method_id && donor.setup_status === "saved" ? donor.payment_method_id : null;
      if (!donor || !savedCard) {
        counts.skipped_no_card++;
        await failAttempt("lookup_donor_card", "no_saved_card", null, "No saved card for that customer", null, amountCents);
        continue;
      }

      // CRASH RECOVERY: an intent already recorded from an earlier run.
      if (cycle.payment_intent_id) {
        const existing = await stripeCall("GET", `/payment_intents/${cycle.payment_intent_id}`, undefined, connectedAccount);
        if (!existing.ok) {
          // Cannot tell what happened - leave it for the next run rather
          // than guess. Never create a second intent for this row.
          counts.already_done++;
          heldCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, why: `stored PaymentIntent could not be read (${existing.errorCode ?? existing.status})` });
          continue;
        }
        const piStatus = existing.data?.status as string;
        if (piStatus === "succeeded") {
          await finalize(cycle.payment_intent_id, Number(existing.data?.amount) || amountCents);
          continue;
        }
        if (piStatus !== "requires_confirmation") {
          const lpe = existing.data?.last_payment_error ?? {};
          await failAttempt("payment_intent_recovered", lpe.code ?? piStatus, lpe.decline_code ?? null, lpe.message ?? `intent status ${piStatus}`, cycle.payment_intent_id, amountCents);
          continue;
        }
        // requires_confirmation: fall through to the confirm step below.
      }

      const connected = await getOrCreateConnectedCustomer(cycle.stripe_customer_id, connectedAccount, { ...donor, payment_method_id: savedCard });
      if (!connected.ok) {
        if (isBlockedStripeCode(connected.stripeCode)) {
          // Stripe Connect not enabled/linked yet - platform-side, stays locked.
          counts.connect_blocked++;
          heldCycles.push({ cycle_id: cycle.id, month_key: cycle.month_key, why: `Stripe Connect not enabled/linked yet (${connected.step}, ${connected.stripeCode})` });
          await chargeLog(cycle, connectedAccount, amountCents, "connect_blocked", null, `${connected.step}: ${connected.stripeCode}`);
          continue;
        }
        await failAttempt(connected.step, connected.stripeCode, null, connected.message, null, amountCents);
        continue;
      }

      const idemKey = `pc_cycle_${cycle.id}_${cycle.month_key}_a${attempts}`;
      let paymentIntentId = cycle.payment_intent_id;

      if (!paymentIntentId) {
        // PHASE ONE: create, unconfirmed. (off_session is a confirm-time
        // parameter in Stripe's API, so it goes on the confirm call.)
        const created: StripeResult = await stripeCall(
          "POST",
          "/payment_intents",
          {
            amount: amountCents,
            currency: "usd",
            customer: connected.connectedCustomerId,
            payment_method: connected.paymentMethodId,
            confirm: "false",
            description: `${orgName} round-ups ${monthName(cycle.month_key)}`,
            statement_descriptor_suffix: statementDescriptorSuffix(org?.shortName ?? orgName),
            metadata: {
              cycle_id: String(cycle.id),
              month_key: cycle.month_key,
              pocketcache_customer: cycle.stripe_customer_id,
              roundup_cents: String(baseCents),
              cover_cents: String(coverCents),
              fee_months: String(cycle.fee_months ?? 0),
              org_id: org?.orgId ?? "",
            },
          },
          connectedAccount,
          { "Idempotency-Key": idemKey },
        );
        if (!created.ok) {
          await failAttempt("payment_intent_create", created.errorCode, created.declineCode, created.errorMessage ?? "", null, amountCents);
          continue;
        }
        paymentIntentId = created.data.id as string;

        // Record the intent BEFORE confirming, and make sure it landed.
        const recorded = await dbRest(
          "PATCH",
          `charge_cycles?id=eq.${cycle.id}&payment_intent_id=is.null&select=id`,
          { payment_intent_id: paymentIntentId },
        );
        const landed = recorded.ok && Array.isArray(recorded.data) && recorded.data.length === 1;
        if (!landed) {
          const why = `Could not record PaymentIntent ${paymentIntentId} on cycle ${cycle.id} (${recorded.status}). The intent is UNCONFIRMED - no money moved. Run stopped before confirming anything else.`;
          console.error("charge-cycles-run:", why);
          await chargeLog(cycle, connectedAccount, amountCents, "record_failed", paymentIntentId, why);
          await notify("PocketCache: charge-cycles-run STOPPED", why);
          return jsonResponse(req, { ok: false, error: "Stopped: could not record a PaymentIntent before confirming it", cycle_id: cycle.id, ...counts }, 500);
        }
      }

      // PHASE TWO: confirm, off-session, with the saved card.
      const confirmed = await stripeCall(
        "POST",
        `/payment_intents/${paymentIntentId}/confirm`,
        { off_session: "true" },
        connectedAccount,
        { "Idempotency-Key": `${idemKey}_confirm` },
      );
      if (!confirmed.ok) {
        await failAttempt("payment_intent_confirm", confirmed.errorCode, confirmed.declineCode, confirmed.errorMessage ?? "", paymentIntentId, amountCents);
        continue;
      }
      const finalStatus = confirmed.data?.status as string;
      if (finalStatus !== "succeeded") {
        // An off-session card confirm either succeeds or errors; anything
        // else (requires_action, processing) is treated as a soft failure
        // and retried once.
        await failAttempt("payment_intent_confirm", finalStatus, null, `intent status ${finalStatus}`, paymentIntentId, amountCents);
        continue;
      }
      await finalize(paymentIntentId, amountCents);
    }

    const summaryLines = [
      `charge-cycles-run finished.`,
      ``,
      `Charged: ${counts.charged} cycle(s), totaling ${fmtCents(counts.charged_total_cents)}.`,
      `Retry scheduled (about 3 days): ${counts.retry_scheduled}.`,
      `Rolled forward after a permanent decline or second failure (card email sent): ${counts.rolled_forward}.`,
      `Skipped (no saved card): ${counts.skipped_no_card}. Waived (cancelled donor): ${counts.waived}.`,
      `Held - no connected account: ${counts.held_no_account}. Held - Connect not enabled: ${counts.connect_blocked}. Awaiting reconciliation: ${counts.already_done}.`,
    ];
    if (failedCycles.length > 0) {
      summaryLines.push("", "Failures:");
      for (const f of failedCycles) summaryLines.push(`  cycle ${f.cycle_id} (${f.month_key}): ${f.outcome} - ${f.error}`);
    }
    if (heldCycles.length > 0) {
      summaryLines.push("", "Held (ride the next run):");
      for (const h of heldCycles) summaryLines.push(`  cycle ${h.cycle_id} (${h.month_key}): ${h.why}`);
    }
    if (closureErrors.length > 0) {
      summaryLines.push("", "Closure clean-up errors (card detach / Plaid unlink):");
      for (const e of closureErrors) summaryLines.push(`  ${e}`);
    }
    await notify("PocketCache: charge-cycles-run finished", summaryLines.join("\n"));

    return jsonResponse(req, { ok: true, ...counts, charged_cycles: chargedCycles });
  } catch (err) {
    console.error("charge-cycles-run: unexpected error", err);
    await notify("PocketCache: charge-cycles-run FAILED", `charge-cycles-run failed unexpectedly: ${String(err)}`);
    return jsonResponse(req, { error: "Charge cycles run failed unexpectedly", detail: String(err) }, 500);
  }
});
