// roundups-me
//
// POST { multiplier?, profile?, skip_month_key?, monthly_cap_cents?,
//        charge_adjustment_cents?, adjustment_month_key?, cover_processing? }
//   -> { ok, linked, month_key, pending_total_cents, txn_count,
//        last_synced_at, recent, multiplier,
//        give_extras: { pending_cents, lifetime_cents },
//        profile: null | { display_name, org_join_code, org_bound_at },
//        projected_total_cents, rollover_in_cents, base_total_cents,
//        fee_months, will_roll_forward, cover_cents, lifetime_txn_count,
//        locked_cycle: null | { month_key, status, total_cents,
//                               adjusted_total_cents, charge_date },
//        settings: { skip_month_key, monthly_cap_cents,
//                    charge_adjustment_cents, adjustment_month_key,
//                    cover_processing },
//        capabilities: { donor_settings: true, donor_close: true } }
//   -> { ok: false, error, reason } (409) when a review-window change is
//        refused - see IN-WINDOW CHANGES below.
//
// The on-demand path a signed-in donor's dashboard calls (both the app and
// the web portal) to show a REAL pending round-up total next to the
// simulated demo number - most donors are demo-only, so `linked: false` is
// an expected, common response, not an error.
//
// AUTH: a real Supabase Authorization Bearer JWT, verified with resolveUser()
// from _shared/stripe.ts, is the ONLY identity. The old body-`email`
// fallback is gone: it let anyone who knew a donor's email read that donor's
// round-ups, multiplier and pledges. No session -> the same `linked: false`
// shape a demo-only visitor gets, with profile null, so the response never
// reveals whether an email has an account. Deployed with --no-verify-jwt like
// its siblings; the function does its own auth here.
//
// PROFILE: every response for a signed-in donor also carries their
// server-side profile from donor_profiles (display name and bound cause's
// join code) so a returning donor on a new device lands on a populated
// dashboard from this ONE round trip. Passing `profile: { display_name?,
// org_join_code? }` upserts those fields. The row is keyed by auth user_id
// first, email as fallback for a pre-signup row, and does not depend on a
// stripe_donors row existing.
//
// SETTINGS (the donor's billing controls, persisted on stripe_donors so the
// 1st's cycle-lock actually enforces them - they used to live only in the
// browser's storage, which the server never saw):
//   skip_month_key          'YYYY-MM' or null. That month's round-ups are not
//                           charged; the rolling balance still carries.
//   monthly_cap_cents       null, or 500..1000000. Round-ups above the cap
//                           in a month are dropped, not carried.
//   charge_adjustment_cents with adjustment_month_key: a lower figure for
//                           that month's round-ups (0, or 500..1000000);
//                           null clears both.
//   cover_processing        boolean, default true: add the card-processing
//                           cover (2.2% + 30c, grossed up) so the nonprofit
//                           nets the round-up amount.
// All month keys are UTC. Validation is strict and a bad value is a 400, not
// a silent default. The math that applies them is _shared/billing-math.ts,
// the same module cycle-lock runs on the 1st.
//
// IN-WINDOW CHANGES: between the 1st (lock) and the 10th (last review day)
// the previous month's cycle is already a 'locked' charge_cycles row, so a
// skip or adjustment naming THAT month cannot wait for cycle-lock - it is
// applied to the row here: adjusted_total_cents (+ adjusted_at) is set, and
// an adjustment to 0 (or a skip) flips the row to 'skipped', its round-ups to
// 'skipped' and un-stamps its pledges so they ride the next cycle. Rules:
// downward only, once per cycle, only while reviewWindowOpen(); anything
// else is a 409 with a `reason`. The donor gets one confirmation email.
// (Reg E: the lock email quoted an amount; a changed amount is confirmed in
// writing too.)
//
// COOLDOWN: plaid_items.last_synced_at gates whether this call hits Plaid.
// Null or older than 20 minutes -> sync now via the SAME
// _shared/roundups-engine.ts module roundups-sync uses, stamping
// last_synced_at with the server time from the MOMENT the sync started. The
// engine gets the donor's giving_started_at so purchases from before the
// bank link never become round-ups.
//
// MULTIPLIER: applied at DISPLAY and LOCK time, never written into
// `roundups`. pending_total_cents is this month's base round-ups times the
// multiplier; `recent` rows stay BASE amounts. Passing `multiplier` (1..3)
// persists it.
//
// PROJECTION: projected_total_cents is what the 1st would lock if it ran
// right now - this month's round-ups through the multiplier, cap and
// adjustment, plus the balance carrying in from the donor's newest prior
// cycle, plus un-stamped pledges, plus the cover - computed by the very same
// computeCycle() cycle-lock uses. will_roll_forward says it is still under
// the $5 floor. base_total_cents is the figure before the cover. fee_months
// is the count the ledger would record (the $1 fee is NOT charged anywhere
// yet - open legal decision #1). lifetime_txn_count counts every round-up
// row that was not voided, skipped or waived.
//
// GIVE EXTRAS: pending_cents is every still-'pending' pledge (stamped into
// the locked cycle or not); lifetime_cents is all pledges ever. The projection
// only adds the un-stamped ones, since stamped pledges already sit inside the
// locked cycle. The multiplier never applies to a pledge.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { dbCount, dbRest, resolveUser } from "../_shared/stripe.ts";
import { syncItemRoundups } from "../_shared/roundups-engine.ts";
import type { PlaidItemRow } from "../_shared/roundups-engine.ts";
import {
  carryFromRow,
  chargeDateFor,
  computeCycle,
  feeMonthsFromRow,
  fmtCents,
  isMonthKey,
  monthKeyUTC,
  monthName,
  previousMonthKeyUTC,
  processingCoverCents,
  reviewWindowOpen,
  settingsFromDonorRow,
} from "../_shared/billing-math.ts";
import type { CycleRowLike, DonorBillingSettings } from "../_shared/billing-math.ts";
import { resolveOrgForCustomer } from "../_shared/org-routing.ts";
import { sendGmail } from "../_shared/gmail.ts";
import { brandedEmail, para } from "../_shared/emailBrand.ts";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID") ?? "";
const PLAID_SECRET = Deno.env.get("PLAID_SECRET") ?? "";
const SYNC_COOLDOWN_MS = 20 * 60 * 1000;

const CAP_MIN_CENTS = 500;
const CAP_MAX_CENTS = 1_000_000;

const CAPABILITIES = { donor_settings: true, donor_close: true };

interface DonorRow {
  stripe_customer_id: string;
  user_id: string | null;
  email: string | null;
  multiplier: number;
  skip_month_key: string | null;
  monthly_cap_cents: number | null;
  charge_adjustment_cents: number | null;
  adjustment_month_key: string | null;
  cover_processing: boolean | null;
  cancelled_at: string | null;
  close_final: "donate" | "waive" | null;
  giving_started_at: string | null;
  created_at: string | null;
}

const DONOR_SELECT =
  "stripe_customer_id,user_id,email,multiplier,skip_month_key,monthly_cap_cents,charge_adjustment_cents,adjustment_month_key,cover_processing,cancelled_at,close_final,giving_started_at,created_at";

type SessionUser = { id: string; email?: string | null };

// ─── donor_profiles (display name + cause binding) ──────────────────────────

interface ProfileRow {
  id: number;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  org_join_code: string | null;
  org_bound_at: string | null;
}

const PROFILE_SELECT = "id,user_id,email,display_name,org_join_code,org_bound_at";
const JOIN_CODE_RE = /^[A-Z0-9-]{2,12}$/;

async function loadProfile(user: SessionUser): Promise<ProfileRow | null> {
  const byUser = await dbRest(
    "GET",
    `donor_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=${PROFILE_SELECT}&limit=1`,
  );
  const row = Array.isArray(byUser.data) ? (byUser.data[0] as ProfileRow | undefined) : undefined;
  if (row) return row;
  if (user.email) {
    const byEmail = await dbRest(
      "GET",
      `donor_profiles?email=eq.${encodeURIComponent(user.email)}&select=${PROFILE_SELECT}&limit=1`,
    );
    const emailRow = Array.isArray(byEmail.data) ? (byEmail.data[0] as ProfileRow | undefined) : undefined;
    if (emailRow) return emailRow;
  }
  return null;
}

/**
 * Apply the body's `profile` update (if any) and return the row to answer
 * with. Sanitized hard: display_name is a trimmed string capped at 60 chars,
 * org_join_code must look like a join code (same shape orgStore.JOIN_CODE_RE
 * accepts, upper-cased here). Unknown fields are ignored.
 */
async function upsertProfile(existing: ProfileRow | null, user: SessionUser, requested: unknown): Promise<ProfileRow | null> {
  const req = (requested && typeof requested === "object") ? requested as Record<string, unknown> : null;
  const updates: Record<string, unknown> = {};
  if (req) {
    if (typeof req.display_name === "string" && req.display_name.trim()) {
      updates.display_name = req.display_name.trim().slice(0, 60);
    }
    if (typeof req.org_join_code === "string") {
      const code = req.org_join_code.trim().toUpperCase();
      if (JOIN_CODE_RE.test(code) && code !== existing?.org_join_code) {
        updates.org_join_code = code;
        updates.org_bound_at = new Date().toISOString();
      }
    }
  }
  // Adopt a pre-signup email-keyed row into the real auth user the first
  // time it is seen with a session.
  if (existing && !existing.user_id) updates.user_id = user.id;

  if (existing && Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const patched = await dbRest("PATCH", `donor_profiles?id=eq.${existing.id}`, updates);
    if (!patched.ok) {
      console.error("roundups-me: profile update failed", patched.status, JSON.stringify(patched.data));
      return existing;
    }
    return { ...existing, ...updates } as ProfileRow;
  }
  if (!existing && Object.keys(updates).length > 0) {
    const inserted = await dbRest("POST", "donor_profiles", {
      user_id: user.id,
      email: user.email ?? null,
      ...updates,
    });
    if (!inserted.ok) {
      console.error("roundups-me: profile insert failed", inserted.status, JSON.stringify(inserted.data));
      return null;
    }
    return {
      id: -1,
      user_id: user.id,
      email: user.email ?? null,
      display_name: (updates.display_name as string) ?? null,
      org_join_code: (updates.org_join_code as string) ?? null,
      org_bound_at: (updates.org_bound_at as string) ?? null,
    };
  }
  return existing;
}

function publicProfile(row: ProfileRow | null) {
  if (!row) return null;
  return {
    display_name: row.display_name,
    org_join_code: row.org_join_code,
    org_bound_at: row.org_bound_at,
  };
}

// ─── stripe_donors + plaid_items ─────────────────────────────────────────────

async function findDonor(user: SessionUser): Promise<DonorRow | null> {
  const byUser = await dbRest(
    "GET",
    `stripe_donors?user_id=eq.${encodeURIComponent(user.id)}&select=${DONOR_SELECT}&limit=1`,
  );
  const row = Array.isArray(byUser.data) ? (byUser.data[0] as DonorRow | undefined) : undefined;
  if (row) return row;
  if (user.email) {
    // A pre-signup card save keyed by email only: adopt it into this user.
    const byEmail = await dbRest(
      "GET",
      `stripe_donors?email=eq.${encodeURIComponent(user.email)}&user_id=is.null&select=${DONOR_SELECT}&limit=1`,
    );
    const emailRow = Array.isArray(byEmail.data) ? (byEmail.data[0] as DonorRow | undefined) : undefined;
    if (emailRow) {
      await dbRest("PATCH", `stripe_donors?stripe_customer_id=eq.${encodeURIComponent(emailRow.stripe_customer_id)}&user_id=is.null`, { user_id: user.id });
      return { ...emailRow, user_id: user.id };
    }
  }
  return null;
}

type ItemRow = PlaidItemRow & { last_synced_at: string | null };
const ITEM_SELECT = "id,item_id,access_token,email,user_id,cursor,last_synced_at,created_at";

async function findDonorPlaidItems(donor: DonorRow): Promise<ItemRow[]> {
  // user_id first (the common case - see roundups_realtime.sql header),
  // falling back to email for the rows a pre-signup bank link left behind.
  if (donor.user_id) {
    const byUser = await dbRest("GET", `plaid_items?user_id=eq.${encodeURIComponent(donor.user_id)}&select=${ITEM_SELECT}`);
    const fromUser = Array.isArray(byUser.data) ? (byUser.data as ItemRow[]) : [];
    if (fromUser.length > 0) return fromUser;
  }
  if (donor.email) {
    const byEmail = await dbRest("GET", `plaid_items?email=eq.${encodeURIComponent(donor.email)}&select=${ITEM_SELECT}`);
    if (Array.isArray(byEmail.data)) return byEmail.data as ItemRow[];
  }
  return [];
}

interface RoundupRow {
  txn_date: string | null;
  merchant: string | null;
  amount_cents: number;
  roundup_cents: number;
  status: string;
}

interface GiveExtraTotals {
  pending_cents: number;
  lifetime_cents: number;
  /** Pending pledges no cycle has stamped yet - the ones the NEXT lock takes. */
  unstamped_pending_cents: number;
}

/** The donor's give-extra pledge totals - one small select, summed here. */
async function giveExtraTotals(stripeCustomerId: string): Promise<GiveExtraTotals> {
  const res = await dbRest(
    "GET",
    `give_extras?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&select=amount_cents,status,cycle_month`,
  );
  const rows = Array.isArray(res.data) ? (res.data as { amount_cents: number; status: string; cycle_month: string | null }[]) : [];
  let pending = 0;
  let lifetime = 0;
  let unstamped = 0;
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    lifetime += r.amount_cents;
    if (r.status === "pending") {
      pending += r.amount_cents;
      if (!r.cycle_month) unstamped += r.amount_cents;
    }
  }
  return { pending_cents: pending, lifetime_cents: lifetime, unstamped_pending_cents: unstamped };
}

const ZERO_GIVE_EXTRAS: GiveExtraTotals = { pending_cents: 0, lifetime_cents: 0, unstamped_pending_cents: 0 };

function publicGiveExtras(g: GiveExtraTotals) {
  return { pending_cents: g.pending_cents, lifetime_cents: g.lifetime_cents };
}

// ─── charge_cycles (the chain + the in-window row) ───────────────────────────

interface CycleRow extends CycleRowLike {
  id: number;
  month_key: string;
  status: string;
  total_cents: number;
  rollover_in_cents: number | null;
  base_after_controls_cents: number | null;
  adjusted_total_cents: number | null;
  adjusted_at: string | null;
  cover_cents: number | null;
  fee_months: number | null;
  locked_at: string | null;
  months_included: string[] | null;
}

const CYCLE_SELECT =
  "id,month_key,status,total_cents,rollover_in_cents,base_after_controls_cents,adjusted_total_cents,adjusted_at,cover_cents,fee_months,locked_at,months_included";

async function newestCycleBefore(stripeCustomerId: string, monthKey: string): Promise<CycleRow | null> {
  const res = await dbRest(
    "GET",
    `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&month_key=lt.${encodeURIComponent(monthKey)}&order=month_key.desc&limit=1&select=${CYCLE_SELECT}`,
  );
  return (Array.isArray(res.data) ? (res.data[0] as CycleRow | undefined) : undefined) ?? null;
}

/** The cycle the dashboard shows as "coming up": the newest row still waiting
 *  to be charged ('locked' or 'retry', any month), else last month's row of
 *  any status (so a skipped or rolled-forward month is visible too). */
async function lockedCycleFor(stripeCustomerId: string): Promise<CycleRow | null> {
  const waiting = await dbRest(
    "GET",
    `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&status=in.(locked,retry)&order=month_key.desc&limit=1&select=${CYCLE_SELECT}`,
  );
  const row = Array.isArray(waiting.data) ? (waiting.data[0] as CycleRow | undefined) : undefined;
  if (row) return row;
  const prev = await dbRest(
    "GET",
    `charge_cycles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&month_key=eq.${encodeURIComponent(previousMonthKeyUTC())}&limit=1&select=${CYCLE_SELECT}`,
  );
  return (Array.isArray(prev.data) ? (prev.data[0] as CycleRow | undefined) : undefined) ?? null;
}

function publicLockedCycle(row: CycleRow | null) {
  if (!row) return null;
  return {
    month_key: row.month_key,
    status: row.status,
    total_cents: row.total_cents,
    adjusted_total_cents: row.adjusted_total_cents,
    charge_date: chargeDateFor(row.month_key),
  };
}

/** The amount a locked row would charge before the cover - what an in-window
 *  adjustment must stay at or below. */
function lockedBaseCents(row: CycleRow): number {
  if (row.adjusted_total_cents !== null && row.adjusted_total_cents !== undefined) return row.adjusted_total_cents;
  if (row.base_after_controls_cents !== null && row.base_after_controls_cents !== undefined) return row.base_after_controls_cents;
  return Math.max(0, row.total_cents - (row.cover_cents ?? 0));
}

// ─── settings validation ─────────────────────────────────────────────────────

class BadSetting extends Error {
  constructor(message: string) {
    super(message);
  }
}

interface SettingsRequest {
  /** Column writes for stripe_donors. */
  updates: Record<string, unknown>;
  /** An in-window change aimed at an already-locked cycle: the month and the
   *  new pre-cover figure (0 = skip the whole cycle). */
  inWindow: { monthKey: string; newBaseCents: number } | null;
}

function isCapAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= CAP_MIN_CENTS && v <= CAP_MAX_CENTS;
}

/** Turn the body's settings fields into column writes. Throws BadSetting on a
 *  malformed value. A skip or adjustment that names the in-window locked month
 *  is returned as `inWindow` instead of a column write. */
function parseSettings(body: Record<string, unknown>, lockedRow: CycleRow | null): SettingsRequest {
  const updates: Record<string, unknown> = {};
  let inWindow: SettingsRequest["inWindow"] = null;
  const now = new Date();
  const currentMonth = monthKeyUTC(now);
  const inWindowMonth = lockedRow && lockedRow.status === "locked" && reviewWindowOpen(lockedRow.month_key, now) ? lockedRow.month_key : null;

  if ("skip_month_key" in body) {
    const v = body.skip_month_key;
    if (v === null) {
      updates.skip_month_key = null;
    } else if (isMonthKey(v)) {
      if (v === inWindowMonth) {
        inWindow = { monthKey: v, newBaseCents: 0 };
      } else if (v < currentMonth) {
        throw new BadSetting("That month has already been settled and cannot be skipped.");
      } else {
        updates.skip_month_key = v;
      }
    } else {
      throw new BadSetting("skip_month_key must be 'YYYY-MM' or null.");
    }
  }

  if ("monthly_cap_cents" in body) {
    const v = body.monthly_cap_cents;
    if (v === null) updates.monthly_cap_cents = null;
    else if (isCapAmount(v)) updates.monthly_cap_cents = v;
    else throw new BadSetting(`monthly_cap_cents must be null or a whole number of cents between ${CAP_MIN_CENTS} and ${CAP_MAX_CENTS}.`);
  }

  if ("charge_adjustment_cents" in body) {
    const v = body.charge_adjustment_cents;
    if (v === null) {
      updates.charge_adjustment_cents = null;
      updates.adjustment_month_key = null;
    } else if (v === 0 || isCapAmount(v)) {
      const mk = body.adjustment_month_key;
      if (!isMonthKey(mk)) throw new BadSetting("adjustment_month_key ('YYYY-MM') is required with charge_adjustment_cents.");
      if (mk === inWindowMonth) {
        inWindow = { monthKey: mk, newBaseCents: v };
      } else if (mk < currentMonth) {
        throw new BadSetting("That month has already been settled and cannot be adjusted.");
      } else {
        updates.charge_adjustment_cents = v;
        updates.adjustment_month_key = mk;
      }
    } else {
      throw new BadSetting(`charge_adjustment_cents must be null, 0, or a whole number of cents between ${CAP_MIN_CENTS} and ${CAP_MAX_CENTS}.`);
    }
  }

  if ("cover_processing" in body) {
    const v = body.cover_processing;
    if (typeof v !== "boolean") throw new BadSetting("cover_processing must be true or false.");
    updates.cover_processing = v;
  }

  return { updates, inWindow };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** One confirmation email per in-window change. Same voice as the lock
 *  email: the nonprofit's round-up program, PocketCache on its behalf. */
async function sendAdjustmentEmail(to: string, orgName: string, monthKey: string, newTotalCents: number, skipped: boolean): Promise<void> {
  const month = monthName(monthKey);
  const chargeDate = chargeDateFor(monthKey);
  const sig = `- PocketCache, on behalf of ${orgName}'s round-up program`;
  const line = skipped
    ? `You skipped ${month}. Nothing will be charged to your card on ${chargeDate}. Any balance that was already carrying forward stays with you and combines with next month's round-ups.`
    : `You lowered your ${month} round-up charge. ${orgName} will now charge ${fmtCents(newTotalCents)} to your card on ${chargeDate}, all going to ${orgName}. Your receipt comes from ${orgName}.`;
  const text = `Hi,\n\n${line}\n\nThis change is final for ${month}.\n\n${sig}`;
  const html = brandedEmail({
    heading: skipped ? `You skipped ${month}` : `Your ${month} charge is now ${fmtCents(newTotalCents)}`,
    bodyHtml: para(esc(line)) + para(`This change is final for ${month}.`) + para(`PocketCache, on behalf of ${esc(orgName)}'s round-up program`),
    footnote: "You are receiving this because you changed a round-up charge in the PocketCache app.",
  });
  await sendGmail(to, skipped ? `You skipped ${month} - ${orgName} round-ups` : `Your ${month} round-up charge changed - ${orgName}`, text, html);
}

/**
 * Apply a review-window change to the locked row. Returns the refusal reason
 * or null on success. Downward only, once per cycle, only on a 'locked' row
 * with its window still open - the PATCH filters repeat those rules so two
 * racing requests cannot both win.
 */
async function applyInWindowChange(donor: DonorRow, row: CycleRow, newBaseCents: number): Promise<{ reason: string; error: string } | null> {
  const now = new Date();
  if (row.status !== "locked") return { reason: "not_locked", error: "That month is no longer waiting to be charged." };
  if (!reviewWindowOpen(row.month_key, now)) return { reason: "window_closed", error: "The review window for that month has closed." };
  if (row.adjusted_at) return { reason: "already_adjusted", error: "That month's charge was already changed once." };
  const currentBase = lockedBaseCents(row);
  if (newBaseCents > currentBase) return { reason: "not_lower", error: `The new amount must be ${fmtCents(currentBase)} or less.` };
  if (newBaseCents === currentBase) return { reason: "unchanged", error: "That is already the amount." };

  const skipping = newBaseCents === 0;
  const patch: Record<string, unknown> = { adjusted_total_cents: newBaseCents, adjusted_at: now.toISOString() };
  if (skipping) patch.status = "skipped";
  const res = await dbRest(
    "PATCH",
    `charge_cycles?id=eq.${row.id}&status=eq.locked&adjusted_at=is.null&select=id`,
    patch,
  );
  if (!res.ok || !Array.isArray(res.data) || res.data.length !== 1) {
    return { reason: "conflict", error: "That month's charge could not be changed right now." };
  }
  const months = (Array.isArray(row.months_included) && row.months_included.length > 0 ? row.months_included : [row.month_key]).map(encodeURIComponent).join(",");
  if (skipping) {
    // The round-ups this cycle locked are gone for good; its pledges go back
    // to waiting for the next lock. rollover_in_cents stays on the row and
    // carries (carryFromRow treats a 'skipped' row that way).
    await dbRest("PATCH", `roundups?stripe_customer_id=eq.${encodeURIComponent(donor.stripe_customer_id)}&month_key=in.(${months})&status=eq.locked`, { status: "skipped" });
    await dbRest("PATCH", `give_extras?stripe_customer_id=eq.${encodeURIComponent(donor.stripe_customer_id)}&cycle_month=in.(${months})&status=eq.pending`, { cycle_month: null });
  }
  if (donor.email) {
    try {
      const org = await resolveOrgForCustomer(donor.stripe_customer_id);
      const orgName = org?.name ?? "your nonprofit";
      const cover = skipping || donor.cover_processing === false ? 0 : processingCoverCents(newBaseCents);
      await sendAdjustmentEmail(donor.email, orgName, row.month_key, newBaseCents + cover, skipping);
    } catch (err) {
      console.error("roundups-me: adjustment email failed", err);
    }
  }
  return null;
}

// ─── the projection ──────────────────────────────────────────────────────────

interface Projection {
  projected_total_cents: number;
  rollover_in_cents: number;
  base_total_cents: number;
  fee_months: number;
  will_roll_forward: boolean;
  cover_cents: number;
}

/** What the 1st would lock if it ran now - same computeCycle() as cycle-lock. */
function projectCycle(
  monthKey: string,
  baseRoundupCents: number,
  multiplier: number,
  prior: CycleRow | null,
  unstampedPledgeCents: number,
  settings: DonorBillingSettings,
  donor: DonorRow,
): Projection {
  const outcome = computeCycle({
    monthKey,
    roundupTotalCents: baseRoundupCents,
    multiplier,
    rolloverInCents: carryFromRow(prior),
    pledgeCents: unstampedPledgeCents,
    priorFeeMonths: feeMonthsFromRow(prior),
    settings,
    closing: donor.cancelled_at ? donor.close_final : null,
  });
  return {
    projected_total_cents: outcome.totalCents,
    rollover_in_cents: carryFromRow(prior),
    base_total_cents: outcome.baseAfterControlsCents,
    fee_months: outcome.feeMonths,
    will_roll_forward: outcome.status === "rolled_forward",
    cover_cents: outcome.coverCents,
  };
}

function publicSettings(s: DonorBillingSettings) {
  return {
    skip_month_key: s.skip_month_key,
    monthly_cap_cents: s.monthly_cap_cents,
    charge_adjustment_cents: s.charge_adjustment_cents,
    adjustment_month_key: s.adjustment_month_key,
    cover_processing: s.cover_processing,
  };
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const user = await resolveUser(req);

    if (!user) {
      // No session: the exact shape a demo-only visitor gets. Nothing about
      // any account is revealed, and nothing in the body is trusted.
      return jsonResponse(req, { ok: true, linked: false, multiplier: 1, give_extras: publicGiveExtras(ZERO_GIVE_EXTRAS), profile: null, capabilities: CAPABILITIES });
    }

    // Profile first: it exists independently of stripe_donors (a donor has a
    // name and a bound cause before any card save starts), and the body may
    // carry an update to persist in this same round trip.
    const profileRow = await upsertProfile(await loadProfile(user), user, body?.profile);
    const profile = publicProfile(profileRow);

    const donor = await findDonor(user);

    if (!donor) {
      // No stripe_donors row at all for this identity - a demo-only visitor
      // who has never started a card save. Same shape as "linked: false"
      // below so this branch is not distinguishable from "found but no bank".
      return jsonResponse(req, { ok: true, linked: false, multiplier: 1, give_extras: publicGiveExtras(ZERO_GIVE_EXTRAS), profile, capabilities: CAPABILITIES });
    }

    const monthKey = monthKeyUTC();
    const customerFilter = `stripe_customer_id=eq.${encodeURIComponent(donor.stripe_customer_id)}`;

    // Optional multiplier update, persisted before computing the total so a
    // single call both saves the change and returns the fresh number.
    let multiplier = donor.multiplier ?? 1;
    const requestedMultiplier = Number(body?.multiplier);
    if (Number.isInteger(requestedMultiplier) && requestedMultiplier >= 1 && requestedMultiplier <= 3 && requestedMultiplier !== multiplier) {
      const update = await dbRest("PATCH", `stripe_donors?${customerFilter}`, { multiplier: requestedMultiplier });
      if (update.ok) {
        multiplier = requestedMultiplier;
      } else {
        console.error("roundups-me: multiplier update failed", update.status, JSON.stringify(update.data));
      }
    }

    // Settings: validate, split off any in-window change, persist the rest.
    let lockedRow = await lockedCycleFor(donor.stripe_customer_id);
    let parsed: SettingsRequest;
    try {
      parsed = parseSettings(body, lockedRow);
    } catch (err) {
      if (err instanceof BadSetting) return jsonResponse(req, { ok: false, error: err.message, reason: "invalid_setting" }, 400);
      throw err;
    }
    if (Object.keys(parsed.updates).length > 0) {
      const update = await dbRest("PATCH", `stripe_donors?${customerFilter}`, parsed.updates);
      if (!update.ok) {
        console.error("roundups-me: settings update failed", update.status, JSON.stringify(update.data));
        return jsonResponse(req, { ok: false, error: "Your settings could not be saved right now.", reason: "save_failed" }, 500);
      }
      Object.assign(donor, parsed.updates);
    }
    if (parsed.inWindow && lockedRow) {
      const refused = await applyInWindowChange(donor, lockedRow, parsed.inWindow.newBaseCents);
      if (refused) return jsonResponse(req, { ok: false, ...refused }, 409);
      lockedRow = await lockedCycleFor(donor.stripe_customer_id);
    }
    const settings = settingsFromDonorRow(donor as unknown as Record<string, unknown>);

    // Pledges and the chain exist independently of a linked bank, so compute
    // them before the linked/unlinked fork - every donor-found branch carries
    // the projection.
    const giveExtras = await giveExtraTotals(donor.stripe_customer_id);
    const prior = await newestCycleBefore(donor.stripe_customer_id, monthKey);
    const lifetimeTxnCount = (await dbCount(`roundups?${customerFilter}&status=not.in.(void,skipped,waived)`)) ?? 0;
    const common = {
      multiplier,
      give_extras: publicGiveExtras(giveExtras),
      profile,
      locked_cycle: publicLockedCycle(lockedRow),
      lifetime_txn_count: lifetimeTxnCount,
      settings: publicSettings(settings),
      capabilities: CAPABILITIES,
      cancelled: Boolean(donor.cancelled_at),
    };

    const items = await findDonorPlaidItems(donor);
    if (items.length === 0) {
      return jsonResponse(req, {
        ok: true,
        linked: false,
        month_key: monthKey,
        ...common,
        ...projectCycle(monthKey, 0, multiplier, prior, giveExtras.unstamped_pending_cents, settings, donor),
      });
    }

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      console.error("roundups-me: missing PLAID_CLIENT_ID or PLAID_SECRET secret");
      // Configuration problem, not "no bank" - but still fail soft into the
      // demo fallback rather than surfacing a scary error to a donor.
      return jsonResponse(req, {
        ok: true,
        linked: false,
        month_key: monthKey,
        ...common,
        ...projectCycle(monthKey, 0, multiplier, prior, giveExtras.unstamped_pending_cents, settings, donor),
      });
    }

    let latestSync: string | null = null;
    if (!donor.cancelled_at) {
      // A cancelled donor's giving ended at cancellation: no new round-ups,
      // so no Plaid call. (roundups-sync skips them the same way.)
      for (const item of items) {
        const lastSyncedAt = item.last_synced_at;
        const stale = !lastSyncedAt || (Date.now() - new Date(lastSyncedAt).getTime()) > SYNC_COOLDOWN_MS;
        if (stale) {
          // Stamp the server time from THIS moment, before the Plaid call, so
          // a slow response cannot shrink the cooldown window.
          const syncStartedAt = new Date().toISOString();
          try {
            await syncItemRoundups(item, donor.stripe_customer_id, { givingStartedAt: donor.giving_started_at });
          } catch (err) {
            // A Plaid hiccup on one item should not break the whole request -
            // serve whatever is already in `roundups` and let the next call
            // (or the cron sweep) retry.
            console.error("roundups-me: sync failed for item", item.id, err);
          }
          await dbRest("PATCH", `plaid_items?id=eq.${item.id}`, { last_synced_at: syncStartedAt });
          if (!latestSync || syncStartedAt > latestSync) latestSync = syncStartedAt;
        } else if (!latestSync || (lastSyncedAt && lastSyncedAt > latestSync)) {
          latestSync = lastSyncedAt;
        }
      }
    }

    const roundupsRes = await dbRest(
      "GET",
      `roundups?${customerFilter}&month_key=eq.${encodeURIComponent(monthKey)}&status=in.(pending,locked)&select=txn_date,merchant,amount_cents,roundup_cents,status&order=txn_date.desc`,
    );
    const rows = Array.isArray(roundupsRes.data) ? (roundupsRes.data as RoundupRow[]) : [];

    const baseTotalCents = rows.reduce((sum, r) => sum + r.roundup_cents, 0);
    const pendingTotalCents = baseTotalCents * multiplier;
    const pendingBaseCents = rows.filter((r) => r.status === "pending").reduce((sum, r) => sum + r.roundup_cents, 0);

    const recent = rows.slice(0, 10).map((r) => ({
      date: r.txn_date,
      merchant: r.merchant,
      amount_cents: r.amount_cents,
      roundup_cents: r.roundup_cents,
    }));

    return jsonResponse(req, {
      ok: true,
      linked: true,
      month_key: monthKey,
      pending_total_cents: pendingTotalCents,
      txn_count: rows.length,
      last_synced_at: latestSync,
      recent,
      ...common,
      ...projectCycle(monthKey, pendingBaseCents, multiplier, prior, giveExtras.unstamped_pending_cents, settings, donor),
    });
  } catch (err) {
    console.error("roundups-me: unexpected error", err);
    return jsonResponse(req, { error: "Could not load your round-ups right now." }, 500);
  }
});
