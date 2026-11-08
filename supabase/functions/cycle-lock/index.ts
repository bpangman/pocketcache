// cycle-lock
//
// POST { month_key? } -> { ok, month_key, donors_seen, locked, rolled_forward,
//   skipped, waived, held_no_org, skipped_final_row, skipped_cancelled,
//   locked_total_cents, rolled_total_cents }
//
// The 1st-of-the-month job. Protected by the x-charge-key header (must match
// CHARGE_RUN_KEY), same pattern as roundups-sync and stripe-charge-run.
//
// month_key defaults to the PREVIOUS calendar month (server time is UTC and
// this runs at 13:10 UTC on the 1st, so "previous month" is always the month
// that just finished accruing round-ups). ALL month boundaries are UTC.
//
// THE DECISION for each donor is one pure function, computeCycle() in
// _shared/billing-math.ts, which roundups-me also uses for the dashboard's
// projection so the app and the real charge cannot disagree. In order:
//   (a) skip (skip_month_key = this month) -> 'skipped': this month's round-ups
//       are never charged and never rolled, the rolling balance and the fee
//       month carry on, and skip_month_key is cleared;
//   (b) R = round-ups x the donor's multiplier (read ONCE here, at lock time,
//       and applied to the whole month - see MULTIPLIER below);
//   (c) monthly cap trims R; (d) a one-time adjustment for this month trims R;
//   (e) S = R + rollover_in_cents + pending Give Extra pledges
//       (base_after_controls_cents);
//   (f) THE $5 RULE (Blake's ruling, 2026-08-04): S < 500 -> 'rolled_forward'
//       and NOTHING is charged or quoted at a trimmed figure - the whole
//       balance becomes next month's rollover_in_cents;
//   (g) S >= 500 -> 'locked', with cover_cents = a true gross-up of Stripe's
//       2.2% + 30c when the donor left the processing-cover toggle on, so the
//       nonprofit nets S. total_cents = S + cover_cents;
//   (h) fee_months is RECORDED, never added to total_cents - the $1 app fee is
//       not live (open legal decision #1 with Nathan).
// Every pending roundup that fed a locked cycle moves to 'locked', so
// charge-cycles-run on the 11th knows exactly what it is charging for.
//
// ROLLOVER CHAINING: the donor's most recent charge_cycles row BEFORE this
// month is "the prior row". Its balance (carryFromRow) and fee months are
// absorbed when its status is rolled_forward, skipped or held_no_org; a
// locked, charged, retry, failed or waived prior row carries nothing. Once a
// rolled_forward / held_no_org row is absorbed it is closed as 'rolled_over'
// so it can never be read as "the open rollover" again; a skipped row keeps
// its status (the skip is the record) and is simply no longer the most recent
// row. months_included on the new row lists every month whose round-ups ride
// in it, so the locked branch can flip ALL of them (not just this month's) to
// 'locked', and charge-cycles-run can flip the same set to 'charged'. Prior
// months' rows absorbed into a still-under-$5 cycle become 'rolled' so the
// ledger never shows 'pending' for money that is already spoken for.
//
// RE-RUN GUARD (the old header claimed re-runs were idempotent; they were not
// once new input existed): before writing, the existing row for (donor,
// month_key) is read. If its status is locked, charged, failed, retry,
// skipped, waived or rolled_over the donor is SKIPPED for this month_key and
// any new input (a late round-up, a new pledge) waits for the next open month
// - roundups-engine re-keys late rows there at sync time. The row is written
// only when none exists (INSERT) or when it is still rolled_forward /
// held_no_org (PATCH guarded on that status), re-using its own
// rollover_in_cents and fee months rather than re-reading a prior row that is
// already closed.
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
// This is deliberate and donor-facing copy says so: the multiplier in force
// when the month closes applies to the WHOLE month's round-ups, not only to
// purchases after the change (Blake's default, 2026-11-07; EDGE-CASES B8 is
// the stale note). `rollover_in_cents` is carried forward from a PRIOR
// cycle's already-computed total, so it is added AFTER multiplying this
// month's fresh roundup_total_cents, never multiplied a second time.
//
// PRE-LINK FLOOR: a pending roundup dated before the donor linked that bank
// (plaid_items.created_at, or stripe_donors.giving_started_at when set) is
// ignored here, exactly as roundups-engine now refuses to create one. Rows
// that slipped in before that rule are left for the one-time 'void' cleanup
// in supabase/billing_hardening_2026_11.sql.
//
// GIVE EXTRAS (2026-08-08): a donor's still-'pending' "Give Extra" pledges
// (public.give_extras - see supabase/give_extras.sql) JOIN THE MONTHLY FLOW
// here. For every donor with pending pledges (even one with NO round-ups
// this month), the pledge sum is added to the cycle total AFTER the
// multiplier and AFTER rollover - a pledge is an exact dollar amount the
// donor typed, never scaled or re-multiplied. The $5 floor then applies to
// the COMBINED total, which is the natural rule: a month whose round-ups
// alone would roll forward still LOCKS if a pledge pushes it over $5.
//   - LOCKED: the pledges that fed the total get cycle_month stamped (status
//     stays 'pending'; charge-cycles-run flips them to 'charged' on the 11th
//     alongside the round-ups). Only cycle_month-null pledges are ever
//     summed, so a stamped pledge can never be locked twice.
//   - ROLLED FORWARD / SKIPPED / HELD: the pledges are left completely
//     untouched (status 'pending', cycle_month null) and the stored
//     total_cents deliberately EXCLUDES them - the pledge row itself is the
//     carry mechanism, and baking it into rollover_in_cents as well would
//     double-count it the next month when it is summed again.
//
// PER-DONOR NONPROFIT ROUTING (_shared/org-routing.ts): the donor's bound
// cause (donor_profiles.org_join_code) resolves to an approved orgs row with
// its own connected Stripe account, which is written to
// charge_cycles.connected_account and named in the donor's email. When it
// does NOT resolve the cycle is parked as 'held_no_org' (numbers recorded, no
// lock, no roundup changes, no email) and listed in the owner's summary; a
// re-run for that month after the binding is fixed finishes the job. The
// old single-account fallback only applies with ALLOW_TEST_CONNECTED_FALLBACK=1.
//
// CANCELLED DONORS (donor-close): a donor with cancelled_at set is skipped,
// except one who chose "send my round-ups as a final gift" (close_final =
// 'donate') and has not had that final cycle yet: computeCycle ignores the $5
// floor for them and locks anything from 50 cents up, otherwise the cycle is
// 'waived', their rows are marked waived, and their card and bank link are
// removed right here since nothing is left to charge.
//
// EMAIL: one donor amount email per cycle row (idempotent on emailed_at; the
// Gmail message id is stored in email_message_id as the record of the 10-day
// notice), plus one internal summary to blake@pocketcache.app via FormSubmit.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbRest } from "../_shared/stripe.ts";
import { sendGmail } from "../_shared/gmail.ts";
import { brandedEmail, NAVY, para } from "../_shared/emailBrand.ts";
import {
  CARRY_STATUSES,
  FINAL_CYCLE_STATUSES,
  REVIEW_WINDOW_LAST_DAY,
  CHARGE_DAY,
  carryFromRow,
  computeCycle,
  feeMonthsFromRow,
  fmtCents,
  isMonthKey,
  monthName,
  monthsIncludedFor,
  previousMonthKeyUTC,
  settingsFromDonorRow,
} from "../_shared/billing-math.ts";
import type { CycleOutcome, CycleRowLike } from "../_shared/billing-math.ts";
import { resolveOrgForCustomer } from "../_shared/org-routing.ts";
import type { ResolvedOrg } from "../_shared/org-routing.ts";
import { detachDonorPaymentMethods } from "../_shared/connected-customer.ts";
import { removePlaidItems } from "../_shared/roundups-engine.ts";
import type { PlaidItemRow } from "../_shared/roundups-engine.ts";

const CHARGE_RUN_KEY = Deno.env.get("CHARGE_RUN_KEY") ?? "";

/** Donor amount email - see _shared/gmail.ts for why this goes through the
 *  Gmail API rather than raw SMTP, and PRELAUNCH.md for why Gmail is
 *  pilot-scale only. Sends multipart/alternative (plain-text fallback plus
 *  the styled HTML body) and resolves to the Gmail message id. Errors are
 *  caught by the caller so a single failed send never breaks the run. */
async function sendDonorEmail(to: string, subject: string, body: { text: string; html: string }): Promise<string | null> {
  return await sendGmail(to, subject, body.text, body.html);
}

/** Escape a dynamic string for safe interpolation into the HTML body. Org
 *  names in particular can contain an ampersand ("Boys & Girls Clubs of
 *  America") that must become &amp; for the markup to be valid. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Styled with inline attributes only so it renders consistently across email
// clients (which strip <style> blocks and external CSS). Real <p> margins carry
// the paragraph spacing - no baked-in hard line breaks mid-sentence, so it
// reflows cleanly on a phone. The branded shell (header band + footer) lives in
// _shared/emailBrand.ts so every PocketCache email shares one look; this file
// only builds the body copy.
const DONOR_FOOTNOTE =
  "You are receiving this because you set up round-up giving in the PocketCache app.";

function emailShell(headingHtml: string, bodyHtml: string): string {
  return brandedEmail({ heading: headingHtml, bodyHtml, footnote: DONOR_FOOTNOTE });
}

/** Plain-text and HTML sign-off. The voice is the nonprofit's round-up
 *  program, not PocketCache the merchant: the nonprofit is the merchant of
 *  record and sends the receipt (Terms). */
function signature(orgName: string): { text: string; html: string } {
  return {
    text: `- PocketCache, on behalf of ${orgName}'s round-up program`,
    html: para(`PocketCache, on behalf of ${esc(orgName)}'s round-up program`),
  };
}

interface EmailOpts {
  kind: "locked" | "rolled_forward" | "skipped";
  monthKey: string;
  orgName: string;
  totalCents: number;
  coverCents: number;
  rolloverInCents: number;
  giveExtraCents: number;
}

/** Three variants: locked (the exact amount and the 11th), rolled forward
 *  (under the $5 minimum, carries), skipped (the donor chose to skip this
 *  month). Returns a plain-text fallback and the styled HTML body. The
 *  processing cover, when present, is itemized so the quoted number is honest
 *  about where it came from; no $1 fee line until the fee is actually charged. */
function donorEmailBody(o: EmailOpts): { text: string; html: string } {
  const month = monthName(o.monthKey);
  const org = o.orgName;
  const orgHtml = esc(org);
  const sig = signature(org);
  const extraAmount = fmtCents(o.giveExtraCents);

  if (o.kind === "skipped") {
    const carryText = o.rolloverInCents > 0
      ? `The ${fmtCents(o.rolloverInCents)} that was already carrying forward from earlier months stays with you and combines with next month's round-ups.\n\n`
      : "";
    const text =
      `Hi,\n\n` +
      `You chose to skip ${month}, so none of your ${month} round-ups will be charged.\n\n` +
      carryText +
      `Round-ups for the new month are already counting again. There is nothing you need to do.\n\n` +
      sig.text;
    const html = emailShell(
      `You skipped ${month}`,
      para(`You chose to skip ${month}, so none of your ${month} round-ups will be charged.`) +
        (o.rolloverInCents > 0
          ? para(`The ${fmtCents(o.rolloverInCents)} that was already carrying forward from earlier months stays with you and combines with next month's round-ups.`)
          : "") +
        para(`Round-ups for the new month are already counting again. There is nothing you need to do.`) +
        sig.html,
    );
    return { text, html };
  }

  if (o.kind === "rolled_forward") {
    // A rolled-forward month leaves any pledge 'pending' too (see GIVE
    // EXTRAS in the header), so "your balance carries forward" already
    // covers it - one extra sentence names it so the donor is not left
    // wondering where their gift went.
    const extraTextLine = o.giveExtraCents > 0
      ? `That includes the extra ${extraAmount} you added - it carries forward with the rest.\n\n`
      : "";
    const text =
      `Hi,\n\n` +
      `Your round-ups for ${month} came in under ${org}'s $5 monthly minimum, so nothing will be charged this month.\n\n` +
      extraTextLine +
      `Your balance carries forward automatically and will combine with next month's round-ups. No action is needed from you.\n\n` +
      sig.text;
    const html = emailShell(
      `Your ${month} round-ups are carrying forward`,
      para(`Your round-ups for ${month} came in under ${orgHtml}'s $5 monthly minimum, so nothing will be charged this month.`) +
        (o.giveExtraCents > 0 ? para(`That includes the extra ${extraAmount} you added - it carries forward with the rest.`) : "") +
        para(`Your balance carries forward automatically and combines with next month's round-ups. There is nothing you need to do.`) +
        para(`You can view your balance anytime in the PocketCache app.`) +
        sig.html,
    );
    return { text, html };
  }

  const amount = fmtCents(o.totalCents);
  const extraTextLine = o.giveExtraCents > 0
    ? `That includes the extra ${extraAmount} you added on top of your round-ups.\n\n`
    : "";
  const coverTextLine = o.coverCents > 0
    ? `It also includes ${fmtCents(o.coverCents)} you chose to add so ${org} receives your full round-up after card processing.\n\n`
    : "";
  const reviewLine = `You can review or lower this amount in the app until the ${REVIEW_WINDOW_LAST_DAY}th.`;
  const chargeLine = `${org} will charge ${amount} to your card on the ${CHARGE_DAY}th. Your receipt comes from ${org}.`;
  const text =
    `Hi,\n\n` +
    `Your round-ups for ${month} totaled ${amount}, all going to ${org}.\n\n` +
    extraTextLine +
    coverTextLine +
    `${chargeLine}\n\n` +
    `${reviewLine}\n\n` +
    sig.text;
  const amountBox =
    `<div style="margin:0 0 18px;padding:16px 18px;background:#f4f6f8;border-radius:12px;">` +
    `<div style="font-size:13px;font-weight:600;color:#6b7280;margin:0 0 4px;">Your ${month} donation</div>` +
    `<div style="font-size:26px;font-weight:800;color:${NAVY};">${amount}</div>` +
    `</div>`;
  const html = emailShell(
    `Your ${month} round-ups are ready`,
    para(`Your round-ups for ${month} totaled the amount below, all going to ${orgHtml}.`) +
      amountBox +
      (o.giveExtraCents > 0 ? para(`That includes the extra ${extraAmount} you added on top of your round-ups.`) : "") +
      (o.coverCents > 0
        ? para(`It also includes ${fmtCents(o.coverCents)} you chose to add so ${orgHtml} receives your full round-up after card processing.`)
        : "") +
      para(`${orgHtml} will charge ${amount} to your card on the ${CHARGE_DAY}th. Your receipt comes from ${orgHtml}.`) +
      para(reviewLine) +
      sig.html,
  );
  return { text, html };
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

interface PendingRow {
  id: number;
  stripe_customer_id: string;
  roundup_cents: number;
  txn_date: string | null;
  plaid_item_id: string | null;
}

interface CycleRow extends CycleRowLike {
  id: number;
  stripe_customer_id: string;
  roundup_total_cents: number;
  emailed_at: string | null;
  created_at: string;
}

const CYCLE_SELECT =
  "id,stripe_customer_id,month_key,status,total_cents,rollover_in_cents,roundup_total_cents,base_after_controls_cents,adjusted_total_cents,fee_months,locked_at,months_included,emailed_at,created_at";

interface PendingExtraRow {
  id: number;
  stripe_customer_id: string;
  amount_cents: number;
}

interface DonorRow {
  stripe_customer_id: string;
  multiplier: number | null;
  email: string | null;
  user_id: string | null;
  payment_method_id: string | null;
  skip_month_key: string | null;
  monthly_cap_cents: number | null;
  charge_adjustment_cents: number | null;
  adjustment_month_key: string | null;
  cover_processing: boolean | null;
  cancelled_at: string | null;
  close_final: "donate" | "waive" | null;
  giving_started_at: string | null;
}

const DONOR_SELECT =
  "stripe_customer_id,multiplier,email,user_id,payment_method_id,skip_month_key,monthly_cap_cents,charge_adjustment_cents,adjustment_month_key,cover_processing,cancelled_at,close_final,giving_started_at";

/** PATCH a set of roundup ids in chunks (PostgREST filters live in the URL). */
async function patchRoundupIds(ids: number[], patch: Record<string, unknown>, label: string): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await dbRest("PATCH", `roundups?id=in.(${chunk.join(",")})`, patch);
    if (!res.ok) console.error(`cycle-lock: ${label} failed`, res.status, JSON.stringify(res.data));
  }
}

/** Fully close a leaving donor whose final cycle came to nothing: detach the
 *  saved card everywhere and remove the Plaid Items so sync and Plaid billing
 *  stop. Mirrors what charge-cycles-run does after a final gift settles. */
async function finishClosure(donor: DonorRow): Promise<string[]> {
  const errors: string[] = [];
  const detach = await detachDonorPaymentMethods(donor.stripe_customer_id, donor.payment_method_id);
  errors.push(...detach.errors);
  const filter = donor.user_id
    ? `user_id=eq.${encodeURIComponent(donor.user_id)}`
    : donor.email
    ? `email=eq.${encodeURIComponent(donor.email)}`
    : null;
  if (filter) {
    const itemsRes = await dbRest("GET", `plaid_items?${filter}&select=id,item_id,access_token`);
    const items = Array.isArray(itemsRes.data) ? (itemsRes.data as Pick<PlaidItemRow, "id" | "item_id" | "access_token">[]) : [];
    const removed = await removePlaidItems(items);
    errors.push(...removed.errors);
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

  try {
    const body = await req.json().catch(() => ({}));
    const monthKey = isMonthKey(body?.month_key) ? body.month_key : previousMonthKeyUTC();

    const pendingRes = await dbRest(
      "GET",
      `roundups?month_key=eq.${encodeURIComponent(monthKey)}&status=eq.pending&select=id,stripe_customer_id,roundup_cents,txn_date,plaid_item_id`,
    );
    const pending = Array.isArray(pendingRes.data) ? (pendingRes.data as PendingRow[]) : [];

    const rowsByDonor = new Map<string, PendingRow[]>();
    for (const r of pending) {
      const list = rowsByDonor.get(r.stripe_customer_id) ?? [];
      list.push(r);
      rowsByDonor.set(r.stripe_customer_id, list);
    }

    // GIVE EXTRAS (see the header section): every still-'pending' pledge that
    // has never been locked into a cycle (cycle_month null - a stamped pledge
    // can never be summed twice). Grouped per donor, keeping the row ids so
    // the locked branch can stamp exactly the rows it consumed.
    const extrasRes = await dbRest(
      "GET",
      "give_extras?status=eq.pending&cycle_month=is.null&select=id,stripe_customer_id,amount_cents",
    );
    const extraRows = Array.isArray(extrasRes.data) ? (extrasRes.data as PendingExtraRow[]) : [];
    const extrasByDonor = new Map<string, { ids: number[]; cents: number }>();
    for (const e of extraRows) {
      const entry = extrasByDonor.get(e.stripe_customer_id) ?? { ids: [], cents: 0 };
      entry.ids.push(e.id);
      entry.cents += e.amount_cents;
      extrasByDonor.set(e.stripe_customer_id, entry);
    }
    // A donor with pledges but NO round-ups this month still gets a cycle -
    // their pledge alone can cross the $5 floor. So does a donor with an open
    // carried balance (rolled_forward / held_no_org) and nothing new: the
    // balance has to keep moving through the chain so a nonprofit that gets
    // its Stripe account connected later, or a leaving donor's final 'donate'
    // cycle, is not stranded waiting for fresh activity.
    const carryRes = await dbRest(
      "GET",
      `charge_cycles?status=in.(rolled_forward,held_no_org)&month_key=lt.${encodeURIComponent(monthKey)}&select=stripe_customer_id`,
    );
    const carryDonors = (Array.isArray(carryRes.data) ? carryRes.data : []) as { stripe_customer_id: string }[];
    const donorIds = new Set<string>([
      ...rowsByDonor.keys(),
      ...extrasByDonor.keys(),
      ...carryDonors.map((c) => c.stripe_customer_id),
    ]);

    // PRE-LINK FLOOR inputs: when each bank was linked.
    const itemsRes = await dbRest("GET", "plaid_items?select=item_id,created_at");
    const itemCreatedAt = new Map<string, string>();
    for (const it of (Array.isArray(itemsRes.data) ? itemsRes.data : []) as { item_id: string; created_at: string | null }[]) {
      if (it.item_id && it.created_at) itemCreatedAt.set(it.item_id, it.created_at.slice(0, 10));
    }

    // One batched donor lookup: multiplier, email, the billing controls, the
    // cancellation state and the explicit giving-start floor.
    const donorById = new Map<string, DonorRow>();
    if (donorIds.size > 0) {
      const ids = [...donorIds];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const donorsRes = await dbRest(
          "GET",
          `stripe_donors?stripe_customer_id=in.(${chunk.map(encodeURIComponent).join(",")})&select=${DONOR_SELECT}`,
        );
        for (const d of (Array.isArray(donorsRes.data) ? donorsRes.data : []) as DonorRow[]) {
          donorById.set(d.stripe_customer_id, d);
        }
      }
    }

    const orgCache = new Map<string, ResolvedOrg | null>();

    // Idempotency: only send if this SPECIFIC charge_cycles row has never
    // been emailed before (emailed_at is null). emailed_at is never in any
    // write payload here, so a re-run can never clobber a prior send back to
    // null. Failures (no email on file, Gmail error) are logged and swallowed
    // - one donor's bad address must never abort the rest of the batch, and a
    // failed send leaves emailed_at null so the NEXT run retries it. The Gmail
    // message id is stored as the record that the 10-day notice went out.
    async function maybeEmailDonor(row: CycleRow | undefined, donor: DonorRow | undefined, opts: EmailOpts): Promise<void> {
      if (!row || row.emailed_at) return;
      const to = donor?.email;
      if (!to) {
        console.error("cycle-lock: no donor email on file, skipping amount email", row.stripe_customer_id);
        return;
      }
      const subject = opts.kind === "skipped"
        ? `You skipped ${monthName(monthKey)} - PocketCache`
        : `Your ${opts.orgName} round-up donation for ${monthName(monthKey)}`;
      const emailBody = donorEmailBody(opts);
      let messageId: string | null = null;
      try {
        messageId = await sendDonorEmail(to, subject, emailBody);
      } catch (err) {
        console.error("cycle-lock: donor email send failed", row.stripe_customer_id, err);
        return;
      }
      const patch = await dbRest("PATCH", `charge_cycles?id=eq.${row.id}`, {
        emailed_at: new Date().toISOString(),
        email_message_id: messageId,
      });
      if (!patch.ok) {
        console.error("cycle-lock: emailed_at patch failed", row.stripe_customer_id, patch.status, JSON.stringify(patch.data));
      }
    }

    const counts = {
      locked: 0,
      rolled_forward: 0,
      skipped: 0,
      waived: 0,
      held_no_org: 0,
      skipped_final_row: 0,
      skipped_cancelled: 0,
      skipped_empty: 0,
      locked_total_cents: 0,
      rolled_total_cents: 0,
    };
    const heldDonors: string[] = [];
    const closureErrors: string[] = [];

    for (const stripeCustomerId of donorIds) {
      const donor = donorById.get(stripeCustomerId);
      const settings = settingsFromDonorRow(donor as unknown as Record<string, unknown>);

      // CANCELLED DONORS: skip, unless this is the one final 'donate' cycle
      // that has not happened yet (any cycle row created after cancellation
      // means it already did).
      let closing: "donate" | null = null;
      if (donor?.cancelled_at) {
        if (donor.close_final !== "donate") {
          counts.skipped_cancelled++;
          continue;
        }
        const sinceRes = await dbRest(
          "GET",
          `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&created_at=gte.${encodeURIComponent(donor.cancelled_at)}&select=id&limit=1`,
        );
        if (Array.isArray(sinceRes.data) && sinceRes.data.length > 0) {
          counts.skipped_cancelled++;
          continue;
        }
        closing = "donate";
      }

      // PRE-LINK FLOOR: sum only rows dated on or after the bank link.
      const explicitFloor = donor?.giving_started_at ? donor.giving_started_at.slice(0, 10) : null;
      const summed: PendingRow[] = [];
      let roundupTotal = 0;
      let donorFloor: string | null = explicitFloor;
      for (const r of rowsByDonor.get(stripeCustomerId) ?? []) {
        const floor = explicitFloor ?? (r.plaid_item_id ? itemCreatedAt.get(r.plaid_item_id) ?? null : null);
        if (!donorFloor && floor) donorFloor = floor;
        if (floor && r.txn_date && r.txn_date < floor) continue;
        summed.push(r);
        roundupTotal += r.roundup_cents;
      }
      const summedIds = summed.map((r) => r.id);
      const extras = extrasByDonor.get(stripeCustomerId);
      const extrasCents = extras?.cents ?? 0;

      // RE-RUN GUARD: read the existing row for this month first.
      const selfRes = await dbRest(
        "GET",
        `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&month_key=eq.${encodeURIComponent(monthKey)}&select=${CYCLE_SELECT}&limit=1`,
      );
      const selfRow = Array.isArray(selfRes.data) ? (selfRes.data[0] as CycleRow | undefined) : undefined;
      // A row that was once LOCKED (locked_at set) is final too even when
      // charge-cycles-run has since flipped it back to rolled_forward after a
      // permanent decline: its round-ups are already 'locked', so recomputing
      // it from pending rows would wipe the amount owed. The NEXT month's
      // cycle absorbs it through the chain instead.
      if (selfRow && (FINAL_CYCLE_STATUSES.has(selfRow.status) || selfRow.locked_at)) {
        counts.skipped_final_row++;
        continue;
      }

      // ROLLOVER CHAINING: the most recent row before this month.
      const priorRes = await dbRest(
        "GET",
        `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&month_key=lt.${encodeURIComponent(monthKey)}&order=month_key.desc&limit=1&select=${CYCLE_SELECT}`,
      );
      const priorRow = Array.isArray(priorRes.data) ? (priorRes.data[0] as CycleRow | undefined) : undefined;

      let rolloverIn: number;
      let priorFeeMonths: number;
      let monthsIncluded: string[];
      let consumedPrior: CycleRow | null = null;
      if (selfRow) {
        // Re-run for the SAME month_key: reuse the row's own carry-in and the
        // fee months it inherited (its total fee_months minus its own month,
        // if that month had activity) - the prior row is already closed.
        rolloverIn = selfRow.rollover_in_cents ?? 0;
        priorFeeMonths = Math.max(0, (selfRow.fee_months ?? 0) - ((selfRow.roundup_total_cents ?? 0) > 0 ? 1 : 0));
        monthsIncluded = Array.isArray(selfRow.months_included) && selfRow.months_included.length > 0
          ? selfRow.months_included
          : [monthKey];
      } else {
        rolloverIn = carryFromRow(priorRow);
        priorFeeMonths = feeMonthsFromRow(priorRow);
        monthsIncluded = monthsIncludedFor(monthKey, priorRow);
        if (priorRow && CARRY_STATUSES.has(priorRow.status)) consumedPrior = priorRow;
      }
      const priorMonths = monthsIncluded.filter((m) => m !== monthKey);

      // Nothing at all to move (a dormant donor whose open carry row is
      // empty): no row, no email.
      if (!selfRow && roundupTotal === 0 && extrasCents === 0 && rolloverIn === 0) {
        counts.skipped_empty++;
        continue;
      }

      const org = await resolveOrgForCustomer(stripeCustomerId, orgCache);

      const outcome: CycleOutcome = computeCycle({
        monthKey,
        roundupTotalCents: roundupTotal,
        multiplier: donor?.multiplier ?? 1,
        rolloverInCents: rolloverIn,
        pledgeCents: extrasCents,
        priorFeeMonths,
        settings,
        closing,
      });

      // PER-DONOR ROUTING: no nonprofit resolved -> park the numbers, touch
      // nothing else, tell the owner.
      const status: string = org ? outcome.status : "held_no_org";
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        stripe_customer_id: stripeCustomerId,
        month_key: monthKey,
        roundup_total_cents: roundupTotal,
        rollover_in_cents: rolloverIn,
        base_after_controls_cents: outcome.baseAfterControlsCents,
        fee_months: outcome.feeMonths,
        months_included: monthsIncluded,
        connected_account: org?.connectedAccount ?? null,
        status,
      };
      if (status === "locked") {
        payload.total_cents = outcome.totalCents;
        payload.cover_cents = outcome.coverCents;
        payload.locked_at = now;
      } else if (status === "waived") {
        payload.total_cents = 0;
        payload.cover_cents = 0;
      } else {
        // rolled_forward / skipped / held_no_org: total_cents is the carry
        // into the next month (pledges excluded - see GIVE EXTRAS).
        payload.total_cents = status === "held_no_org" ? outcome.roundupCentsAfterControls + rolloverIn : outcome.totalCents;
        payload.cover_cents = 0;
      }

      let written: CycleRow | undefined;
      if (selfRow) {
        const patch = await dbRest(
          "PATCH",
          `charge_cycles?id=eq.${selfRow.id}&status=in.(rolled_forward,held_no_org)&select=${CYCLE_SELECT}`,
          payload,
        );
        if (!patch.ok) {
          console.error("cycle-lock: cycle re-run PATCH failed", stripeCustomerId, patch.status, JSON.stringify(patch.data));
          continue;
        }
        written = Array.isArray(patch.data) ? (patch.data[0] as CycleRow | undefined) : undefined;
        if (!written) {
          // The row changed under us (another run finished first) - leave it.
          counts.skipped_final_row++;
          continue;
        }
      } else {
        const insert = await dbRest("POST", `charge_cycles?select=${CYCLE_SELECT}`, payload);
        if (!insert.ok) {
          console.error("cycle-lock: cycle insert failed", stripeCustomerId, insert.status, JSON.stringify(insert.data));
          continue;
        }
        written = Array.isArray(insert.data) ? (insert.data[0] as CycleRow | undefined) : undefined;
      }

      // Close the absorbed prior row so it can never be read as "the open
      // rollover" again (a skipped row keeps its status: the skip is the
      // record, and it is no longer the most recent row).
      if (consumedPrior && consumedPrior.status !== "skipped") {
        const close = await dbRest(
          "PATCH",
          `charge_cycles?id=eq.${consumedPrior.id}&status=eq.${consumedPrior.status}`,
          { status: "rolled_over" },
        );
        if (!close.ok) console.error("cycle-lock: closing consumed rollover row failed", stripeCustomerId, close.status);
      }

      // The one-time adjustment for this month has done its job either way.
      if (settings.adjustment_month_key === monthKey) {
        await dbRest(
          "PATCH",
          `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&adjustment_month_key=eq.${encodeURIComponent(monthKey)}`,
          { charge_adjustment_cents: null, adjustment_month_key: null },
        );
      }

      const floorFilter = donorFloor ? `&txn_date=gte.${donorFloor}` : "";
      const priorMonthsFilter = priorMonths.length > 0
        ? `roundups?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&month_key=in.(${priorMonths.map(encodeURIComponent).join(",")})${floorFilter}`
        : null;

      const emailBase = {
        monthKey,
        orgName: org?.name ?? "",
        totalCents: outcome.totalCents,
        coverCents: outcome.coverCents,
        rolloverInCents: rolloverIn,
        giveExtraCents: extrasCents,
      };

      if (status === "held_no_org") {
        counts.held_no_org++;
        heldDonors.push(`${stripeCustomerId} (${fmtCents(outcome.baseAfterControlsCents)}, would be ${outcome.status})`);
        continue;
      }

      if (status === "skipped") {
        // (a) This month's round-ups are set aside for good; the carry-in
        // rides on in this row; prior months' rows are marked rolled.
        await patchRoundupIds(summedIds, { status: "skipped" }, "marking roundups skipped");
        if (priorMonthsFilter) await dbRest("PATCH", `${priorMonthsFilter}&status=eq.pending`, { status: "rolled" });
        await dbRest(
          "PATCH",
          `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&skip_month_key=eq.${encodeURIComponent(monthKey)}`,
          { skip_month_key: null },
        );
        counts.skipped++;
        await maybeEmailDonor(written, donor, { kind: "skipped", ...emailBase });
        continue;
      }

      if (status === "rolled_forward") {
        // Roundups stay 'pending' for this month (they lock later with the
        // month that crosses $5); absorbed prior months become 'rolled'.
        if (priorMonthsFilter) await dbRest("PATCH", `${priorMonthsFilter}&status=eq.pending`, { status: "rolled" });
        counts.rolled_forward++;
        counts.rolled_total_cents += outcome.totalCents;
        await maybeEmailDonor(written, donor, { kind: "rolled_forward", ...emailBase });
        continue;
      }

      if (status === "waived") {
        // A leaving donor's final cycle came to under 50 cents: nothing to
        // send. Set every live row aside, drop the pledges, and finish the
        // closure (card and bank link) since no charge will follow.
        await patchRoundupIds(summedIds, { status: "waived" }, "marking roundups waived");
        if (priorMonthsFilter) await dbRest("PATCH", `${priorMonthsFilter}&status=in.(pending,rolled)`, { status: "waived" });
        if (extras && extras.ids.length > 0) {
          await dbRest("PATCH", `give_extras?id=in.(${extras.ids.join(",")})`, { status: "cancelled" });
        }
        if (donor) closureErrors.push(...(await finishClosure(donor)).map((e) => `${stripeCustomerId}: ${e}`));
        counts.waived++;
        continue;
      }

      // LOCKED: every round-up riding in this cycle (this month's, plus the
      // absorbed months') moves to 'locked'; the pledges get stamped.
      await patchRoundupIds(summedIds, { status: "locked" }, "marking roundups locked");
      if (priorMonthsFilter) await dbRest("PATCH", `${priorMonthsFilter}&status=in.(pending,rolled)`, { status: "locked" });
      // Stamp exactly the pledge rows this total consumed with cycle_month
      // (status stays 'pending' - charge-cycles-run flips them to 'charged'
      // on the 11th alongside the round-ups). A stamped pledge is excluded
      // by the cycle_month=is.null select above, so it can never be locked
      // into a second cycle.
      if (extras && extras.ids.length > 0) {
        const stamp = await dbRest("PATCH", `give_extras?id=in.(${extras.ids.join(",")})`, { cycle_month: monthKey });
        if (!stamp.ok) console.error("cycle-lock: stamping give_extras failed", stripeCustomerId, stamp.status, JSON.stringify(stamp.data));
      }
      counts.locked++;
      counts.locked_total_cents += outcome.totalCents;
      await maybeEmailDonor(written, donor, { kind: "locked", ...emailBase });
    }

    const summary = [
      `cycle-lock ran for ${monthKey}.`,
      ``,
      `Locked: ${counts.locked} cycle(s), totaling ${fmtCents(counts.locked_total_cents)}.`,
      `Rolled forward (under the $5 minimum): ${counts.rolled_forward} cycle(s), totaling ${fmtCents(counts.rolled_total_cents)}.`,
      `Skipped by the donor: ${counts.skipped}. Final gifts waived (under 50c): ${counts.waived}.`,
      `Left alone (month already final): ${counts.skipped_final_row}. Cancelled donors skipped: ${counts.skipped_cancelled}.`,
    ];
    if (heldDonors.length > 0) {
      summary.push(``, `HELD - no approved nonprofit with a connected Stripe account resolved (${heldDonors.length}). Nothing was locked or emailed for these; fix the donor's cause binding or the org's Stripe connection, then re-run for ${monthKey}:`);
      for (const h of heldDonors) summary.push(`  ${h}`);
    }
    if (closureErrors.length > 0) {
      summary.push(``, `Closure clean-up errors (card detach / Plaid unlink):`);
      for (const e of closureErrors) summary.push(`  ${e}`);
    }
    summary.push(``, `charge-cycles-run picks up the locked cycles on the ${CHARGE_DAY}th.`);
    await notify(`PocketCache: cycle-lock ran for ${monthKey}`, summary.join("\n"));

    return jsonResponse(req, {
      ok: true,
      month_key: monthKey,
      donors_seen: donorIds.size,
      ...counts,
    });
  } catch (err) {
    console.error("cycle-lock: unexpected error", err);
    await notify("PocketCache: cycle-lock FAILED", `cycle-lock failed unexpectedly: ${String(err)}`);
    return jsonResponse(req, { error: "Cycle lock failed unexpectedly", detail: String(err) }, 500);
  }
});
