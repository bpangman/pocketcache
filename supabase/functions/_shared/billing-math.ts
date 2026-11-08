// Shared, PURE billing math for the round-up pipeline. No I/O, no Deno APIs.
//
// cycle-lock (the 1st) uses computeCycle() to decide what a donor's month
// becomes; roundups-me uses the SAME function to project "what will the 1st
// do with what has accrued so far", so the dashboard and the real charge
// cannot disagree about skip, cap, adjustment, rollover, the $5 floor or the
// processing cover. src/lib/billing.js mirrors these constants for demo mode;
// the server value always wins for a real account.
//
// ALL MONTH BOUNDARIES ARE UTC. A round-up's month_key is the Plaid posting
// date sliced to YYYY-MM (roundups-engine.ts), the cron jobs run on UTC
// schedules, and the client's monthKey()/inReviewWindow() read UTC too.
//
// ORDER OF OPERATIONS for one donor and one month_key (Blake's rules, in the
// order the overhaul plan fixed them):
//   (a) Skip: skip_month_key = month_key -> the cycle is 'skipped'. That
//       month's round-ups are never charged and never rolled; only the
//       balance that was ALREADY rolling in (rollover_in_cents) carries on,
//       and the $1 fee month carries forward with it.
//   (b) R = this month's round-up total x the donor's multiplier. The
//       multiplier is read ONCE, at lock time, and applied to the whole
//       month (see cycle-lock's MULTIPLIER header section).
//   (c) Cap: R = min(R, monthly_cap_cents). The overflow is simply dropped.
//   (d) Adjustment for this month_key: R = min(R, charge_adjustment_cents).
//       Downward only - an adjustment can never raise the charge.
//   (e) S = R + rollover_in_cents + pending Give Extra pledges. Stored as
//       base_after_controls_cents.
//   (f) Floor: S < 500 -> 'rolled_forward' through the existing rollover
//       chain (the carry excludes the pledges - a still-pending pledge row
//       is its own carry mechanism, see cycle-lock's GIVE EXTRAS section).
//   (g) Cover: when cover_processing, cover_cents is a TRUE gross-up so the
//       nonprofit nets S after Stripe's 2.2% + 30c: ceil((S + 30) / (1 -
//       0.022)) - S. total_cents = S + cover_cents.
//   (h) fee_months is stored but NOT added to total_cents - the $1 app fee is
//       not live (open legal decision #1). Never gross up the $1.
//
// CANCELLED DONORS who chose "send my round-ups as a final gift" get ONE
// final cycle that ignores the $5 floor: it locks when S is at least 50 cents
// (Stripe's card minimum), otherwise it is 'waived'.

/** The nonprofit's monthly minimum - THE $5 RULE (Blake, 2026-08-04). */
export const MINIMUM_CENTS = 500;

/** Smallest final gift a leaving donor can send (Stripe's own card floor). */
export const FINAL_GIFT_MIN_CENTS = 50;

/** Standard US nonprofit card rate PocketCache quotes: 2.2% + 30c. Mirrors
 *  PROCESSING_RATE / PROCESSING_FIXED in src/lib/billing.js. */
export const PROCESSING_RATE = 0.022;
export const PROCESSING_FIXED_CENTS = 30;

/** Cap on how many $1 fee months can pile up for a donor who keeps rolling
 *  forward. Mirrors MAX_FEE_MONTHS in src/lib/billing.js (Blake question
 *  pending on the number itself). */
export const MAX_FEE_MONTHS = 12;

/** The billing calendar: lock on the 1st, review through the 10th, charge on
 *  the 11th. Mirrors LOCK_DAY / REVIEW_WINDOW_LAST_DAY / CHARGE_DAY in
 *  src/lib/billing.js. */
export const LOCK_DAY = 1;
export const REVIEW_WINDOW_LAST_DAY = 10;
export const CHARGE_DAY = 11;

/** When the 1st's cycle-lock cron fires (UTC). roundups-engine uses this to
 *  tell "a late row for a month that already locked" from "a row for last
 *  month arriving in the hours before the lock runs". */
export const LOCK_RUN_UTC_HOUR = 13;
export const LOCK_RUN_UTC_MINUTE = 10;

// ─── Month keys ──────────────────────────────────────────────────────────────

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function isMonthKey(s: unknown): s is string {
  return typeof s === "string" && MONTH_KEY_RE.test(s);
}

/** 'YYYY-MM' for the UTC month `d` falls in. */
export function monthKeyUTC(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The UTC month before the one `d` falls in - what cycle-lock processes on
 *  the 1st. */
export function previousMonthKeyUTC(d: Date = new Date()): string {
  return shiftMonthKey(monthKeyUTC(d), -1);
}

/** 'YYYY-MM' moved by `delta` months (negative allowed). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m - 1) + delta, 1));
  return monthKeyUTC(d);
}

/** Long English month name for a month key ('2026-10' -> 'October'). */
export function monthName(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

/** The day a locked cycle for `monthKey` is charged: the 11th of the FOLLOWING
 *  month, as 'YYYY-MM-11' (October's round-ups lock Nov 1 and charge Nov 11). */
export function chargeDateFor(monthKey: string): string {
  return `${shiftMonthKey(monthKey, 1)}-${String(CHARGE_DAY).padStart(2, "0")}`;
}

/** Is `now` still inside the review window for a cycle locked for `monthKey`,
 *  i.e. before 00:00 UTC on its charge day? */
export function reviewWindowOpen(monthKey: string, now: Date = new Date()): boolean {
  const [y, m] = shiftMonthKey(monthKey, 1).split("-").map(Number);
  const chargeDayStart = Date.UTC(y, m - 1, CHARGE_DAY);
  return now.getTime() < chargeDayStart;
}

/** Has the 1st's lock for `monthKey` already run by `now`? True for any month
 *  before the current UTC month once the cron time on the 1st has passed; a
 *  previous-month row arriving on the 1st BEFORE 13:10 UTC still belongs to
 *  its own month (the lock is about to pick it up). */
export function isMonthClosed(monthKey: string, now: Date = new Date()): boolean {
  const current = monthKeyUTC(now);
  if (monthKey >= current) return false;
  if (monthKey < shiftMonthKey(current, -1)) return true;
  if (now.getUTCDate() > LOCK_DAY) return true;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutes >= LOCK_RUN_UTC_HOUR * 60 + LOCK_RUN_UTC_MINUTE;
}

// ─── Money helpers ───────────────────────────────────────────────────────────

/** Gross-up so the nonprofit nets `baseCents` after the processor's 2.2% +
 *  30c: the smallest cover that makes (base + cover) x (1 - rate) - 30 >= base.
 *  processingCoverCents(1000) === 54, matching the client's
 *  processingCoverFor(10) === 0.54. Zero for a non-positive base. */
export function processingCoverCents(baseCents: number): number {
  if (!Number.isFinite(baseCents) || baseCents <= 0) return 0;
  return Math.ceil((baseCents + PROCESSING_FIXED_CENTS) / (1 - PROCESSING_RATE)) - baseCents;
}

export function clampFeeMonths(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), MAX_FEE_MONTHS);
}

export function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── The per-donor, per-month decision ───────────────────────────────────────

/** The donor's billing controls as stored on stripe_donors. */
export interface DonorBillingSettings {
  skip_month_key: string | null;
  monthly_cap_cents: number | null;
  charge_adjustment_cents: number | null;
  adjustment_month_key: string | null;
  cover_processing: boolean;
}

export const DEFAULT_SETTINGS: DonorBillingSettings = {
  skip_month_key: null,
  monthly_cap_cents: null,
  charge_adjustment_cents: null,
  adjustment_month_key: null,
  cover_processing: true,
};

/** Read the settings columns off a stripe_donors row, tolerating missing
 *  columns (a function deployed before the migration applied) by falling
 *  back to the defaults. */
export function settingsFromDonorRow(row: Record<string, unknown> | null | undefined): DonorBillingSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const str = (v: unknown) => (isMonthKey(v) ? v : null);
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  return {
    skip_month_key: str(row.skip_month_key),
    monthly_cap_cents: int(row.monthly_cap_cents),
    charge_adjustment_cents: int(row.charge_adjustment_cents),
    adjustment_month_key: str(row.adjustment_month_key),
    cover_processing: typeof row.cover_processing === "boolean" ? row.cover_processing : true,
  };
}

export interface CycleInputs {
  monthKey: string;
  /** Sum of this month's pending roundup_cents, BEFORE the multiplier, after
   *  the pre-link floor (rows dated before the bank link never count). */
  roundupTotalCents: number;
  multiplier: number;
  /** Balance carried in from the donor's open prior cycle (see carryFromRow). */
  rolloverInCents: number;
  /** Still-pending, never-stamped Give Extra pledges. */
  pledgeCents: number;
  /** fee_months on the prior open cycle being absorbed, or 0. */
  priorFeeMonths: number;
  settings: DonorBillingSettings;
  /** stripe_donors.close_final for a cancelled donor: 'donate' means this is
   *  their one final cycle (floor ignored down to 50c), 'waive' means the
   *  caller should not be computing a cycle at all. */
  closing?: "donate" | "waive" | null;
}

export type CycleStatus = "skipped" | "rolled_forward" | "locked" | "waived";

export interface CycleOutcome {
  status: CycleStatus;
  /** R after cap and adjustment. */
  roundupCentsAfterControls: number;
  /** S = R + rollover + pledges - the figure tested against the floor. */
  baseAfterControlsCents: number;
  coverCents: number;
  /** 'locked': S + cover, what charge-cycles-run charges. 'rolled_forward'
   *  and 'skipped': the carry into the next month (pledges excluded).
   *  'waived': 0. */
  totalCents: number;
  feeMonths: number;
  skipApplied: boolean;
  capApplied: boolean;
  adjustmentApplied: boolean;
}

export function computeCycle(input: CycleInputs): CycleOutcome {
  const s = input.settings ?? DEFAULT_SETTINGS;
  const roundupTotal = Math.max(0, Math.round(input.roundupTotalCents || 0));
  const multiplier = Number.isInteger(input.multiplier) && input.multiplier >= 1 && input.multiplier <= 3 ? input.multiplier : 1;
  const rolloverIn = Math.max(0, Math.round(input.rolloverInCents || 0));
  const pledges = Math.max(0, Math.round(input.pledgeCents || 0));
  const hadActivity = roundupTotal > 0;

  // (a) Skip: this month's round-ups are gone, the rolling balance and the
  //     fee month carry on. A skipped month still counts as a fee month.
  if (s.skip_month_key === input.monthKey) {
    return {
      status: "skipped",
      roundupCentsAfterControls: 0,
      baseAfterControlsCents: rolloverIn,
      coverCents: 0,
      totalCents: rolloverIn,
      feeMonths: clampFeeMonths(input.priorFeeMonths + 1),
      skipApplied: true,
      capApplied: false,
      adjustmentApplied: false,
    };
  }

  // (b) multiplier, (c) cap, (d) adjustment - all on this month's fresh
  //     round-ups only; the rollover was already a prior cycle's total.
  let r = roundupTotal * multiplier;
  let capApplied = false;
  let adjustmentApplied = false;
  if (s.monthly_cap_cents !== null && r > s.monthly_cap_cents) {
    r = s.monthly_cap_cents;
    capApplied = true;
  }
  if (s.adjustment_month_key === input.monthKey && s.charge_adjustment_cents !== null && r > s.charge_adjustment_cents) {
    r = s.charge_adjustment_cents;
    adjustmentApplied = true;
  }

  // (e)
  const baseAfterControls = r + rolloverIn + pledges;
  const feeMonths = clampFeeMonths((hadActivity ? 1 : 0) + Math.max(0, input.priorFeeMonths || 0));

  const lock = (): CycleOutcome => {
    // (g) cover on what is actually collected. Never on the $1 (h).
    const coverCents = s.cover_processing ? processingCoverCents(baseAfterControls) : 0;
    return {
      status: "locked",
      roundupCentsAfterControls: r,
      baseAfterControlsCents: baseAfterControls,
      coverCents,
      totalCents: baseAfterControls + coverCents,
      feeMonths,
      skipApplied: false,
      capApplied,
      adjustmentApplied,
    };
  };

  if (input.closing === "donate") {
    // One final gift for a leaving donor: the $5 floor does not apply, only
    // Stripe's 50c card minimum does. Below that there is nothing to send.
    if (baseAfterControls >= FINAL_GIFT_MIN_CENTS) return lock();
    return {
      status: "waived",
      roundupCentsAfterControls: r,
      baseAfterControlsCents: baseAfterControls,
      coverCents: 0,
      totalCents: 0,
      feeMonths,
      skipApplied: false,
      capApplied,
      adjustmentApplied,
    };
  }

  // (f) Floor: under $5 the whole thing rolls. The carry excludes pledges
  //     (their rows stay pending and are summed again next month).
  if (baseAfterControls < MINIMUM_CENTS) {
    return {
      status: "rolled_forward",
      roundupCentsAfterControls: r,
      baseAfterControlsCents: baseAfterControls,
      coverCents: 0,
      totalCents: r + rolloverIn,
      feeMonths,
      skipApplied: false,
      capApplied,
      adjustmentApplied,
    };
  }
  return lock();
}

// ─── The rollover chain ──────────────────────────────────────────────────────

/** A charge_cycles row, as far as the chain and the projection care. */
export interface CycleRowLike {
  id?: number;
  month_key: string;
  status: string;
  total_cents: number;
  rollover_in_cents?: number | null;
  base_after_controls_cents?: number | null;
  adjusted_total_cents?: number | null;
  fee_months?: number | null;
  locked_at?: string | null;
  months_included?: string[] | null;
}

/** Statuses whose balance (and fee months) the NEXT cycle absorbs. 'skipped'
 *  carries only the balance that was already rolling in; 'held_no_org' is a
 *  cycle that could not lock because the donor's nonprofit did not resolve to
 *  a connected Stripe account, so its whole balance waits for the next run. */
export const CARRY_STATUSES: ReadonlySet<string> = new Set(["rolled_forward", "skipped", "held_no_org"]);

/** Statuses that are final for a month_key - a re-run of cycle-lock must never
 *  rewrite them (see the RE-RUN GUARD in cycle-lock). */
export const FINAL_CYCLE_STATUSES: ReadonlySet<string> = new Set([
  "locked", "charged", "failed", "retry", "skipped", "waived", "rolled_over",
]);

/** How many cents a prior open row hands to the next cycle.
 *  - rolled_forward / held_no_org straight from cycle-lock: total_cents (R +
 *    rollover, pledges excluded by construction).
 *  - a LOCKED cycle that charge-cycles-run gave up on (status flipped back to
 *    rolled_forward after a permanent decline): the pre-cover amount the donor
 *    actually owed - adjusted_total_cents when they lowered it in the review
 *    window, else base_after_controls_cents. Its stamped pledges ride inside
 *    that figure, and the cover is recomputed on the new total.
 *  - skipped: only what was already rolling in. */
export function carryFromRow(row: CycleRowLike | null | undefined): number {
  if (!row || !CARRY_STATUSES.has(row.status)) return 0;
  if (row.status === "skipped") return Math.max(0, row.rollover_in_cents ?? 0);
  if (row.locked_at) {
    const owed = row.adjusted_total_cents ?? row.base_after_controls_cents ?? row.total_cents;
    return Math.max(0, owed ?? 0);
  }
  return Math.max(0, row.total_cents ?? 0);
}

/** fee months the next cycle inherits from a prior open row. */
export function feeMonthsFromRow(row: CycleRowLike | null | undefined): number {
  if (!row || !CARRY_STATUSES.has(row.status)) return 0;
  return clampFeeMonths(row.fee_months ?? 0);
}

/** months_included for a new cycle: its own month plus every month the
 *  absorbed prior row was already carrying. Oldest months last, deduplicated. */
export function monthsIncludedFor(monthKey: string, prior: CycleRowLike | null | undefined): string[] {
  const out = [monthKey];
  const carried = prior && CARRY_STATUSES.has(prior.status)
    ? (Array.isArray(prior.months_included) && prior.months_included.length > 0 ? prior.months_included : [prior.month_key])
    : [];
  for (const m of carried) if (!out.includes(m)) out.push(m);
  return out;
}

// ─── Charge-day decline handling ─────────────────────────────────────────────

/** Declines worth one more try about 3 days later (Terms: "retry once after
 *  approximately 3 days"). */
const RETRYABLE_DECLINES: ReadonlySet<string> = new Set([
  "insufficient_funds", "generic_decline", "processing_error", "try_again_later",
  "issuer_not_available", "reenter_transaction", "network",
]);

/** Declines that will not get better by waiting - skip the retry, roll the
 *  cycle forward and ask the donor for a new card. */
const PERMANENT_DECLINES: ReadonlySet<string> = new Set([
  "expired_card", "lost_card", "stolen_card", "pickup_card", "incorrect_number",
  "invalid_account", "card_not_supported", "restricted_card", "revocation_of_all_authorizations",
  "revocation_of_authorization", "stop_payment_order", "no_saved_card",
]);

export type DeclineClass = "retryable" | "permanent";

/** Classify a failed PaymentIntent. `declineCode` is Stripe's decline_code
 *  (present on card_declined); `errorCode` is error.code. An unknown code is
 *  treated as retryable ONCE - the second failure rolls forward anyway, so the
 *  donor-friendly default costs nothing. */
export function classifyDecline(errorCode: string | null | undefined, declineCode: string | null | undefined): DeclineClass {
  const code = (declineCode || errorCode || "").toLowerCase();
  if (PERMANENT_DECLINES.has(code)) return "permanent";
  if (RETRYABLE_DECLINES.has(code)) return "retryable";
  return "retryable";
}

/** How long charge-cycles-run waits before the one retry. */
export const RETRY_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

/** The run will try at most this many times per cycle: the 11th and one
 *  retry (the 14th cron). */
export const MAX_ATTEMPTS = 2;
