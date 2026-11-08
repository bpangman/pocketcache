import { DEMO_USER } from '../data/derived';

/**
 * Format a dollar amount with commas and 2 decimal places.
 * All amounts in this app are in dollars (not cents).
 * In production, Plaid amounts in cents would be divided by 100 first:
 *   fmtMoney(plaid_cents / 100)
 */
export function fmtMoney(dollars) {
  return dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCount(n) {
  return n.toLocaleString('en-US');
}

/**
 * Compact headline money: adapts to the size of the number so real launch-day
 * totals never render as "$0.0M".
 *   $842.50 → "$842" · $12,400 → "$12.4K" · $3,841,209 → "$3.8M"
 */
export function fmtMoneyCompact(dollars) {
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${(dollars / 1e3).toFixed(1)}K`;
  return `$${Math.round(dollars).toLocaleString('en-US')}`;
}

/**
 * "as of 2 minutes ago" style freshness caption for a real-time sync
 * timestamp. Computed ONCE from the moment it is called (response arrival /
 * render) - callers should call this when a new value comes in, not on a
 * live-ticking interval, so the label does not creep forward while a donor
 * just sits looking at the screen.
 */
export function fmtFreshness(isoTimestamp) {
  if (!isoTimestamp) return null;
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return 'as of just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `as of ${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `as of ${hours} hr${hours === 1 ? '' : 's'} ago`;
}

/**
 * Money with no decimals for whole-dollar amounts and 2 otherwise: the Give
 * Extra chips and milestone labels deliberately read "$1,000" and "$25", not
 * "$1,000.00", while $12.40 still shows its cents. Use fmtMoney everywhere a
 * column of amounts needs to line up.
 *   1000 -> "1,000" · 25 -> "25" · 12.4 -> "12.40"
 */
export function fmtMoneyWhole(dollars) {
  const n = Number(dollars) || 0;
  const whole = Number.isInteger(Math.round(n * 100) / 100) && Number.isInteger(n);
  return n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/**
 * The donor's join date as a Date: the real identity's joinedAt (an ISO
 * string written by buildIdentity) for a real account, or the demo user's for
 * demo mode / no account. One place so "Member since" on both surfaces and the
 * privacy export never name the demo user for a real donor again.
 * @param {{joinedAt?: string|Date}|null|undefined} hasAccount
 * @param {boolean} demo - demoActive / demoMode on the calling surface.
 * @returns {Date}
 */
function joinedDate(hasAccount, demo) {
  if (hasAccount?.joinedAt && !demo) {
    const d = hasAccount.joinedAt instanceof Date ? hasAccount.joinedAt : new Date(hasAccount.joinedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return DEMO_USER.joinedAt;
}

/**
 * "Member since" label, e.g. "Nov 2026".
 * @param {{joinedAt?: string|Date}|null|undefined} hasAccount
 * @param {boolean} demo
 */
export function memberSinceLabel(hasAccount, demo) {
  return joinedDate(hasAccount, demo).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Join date as YYYY-MM-DD (local calendar day), for the Download My Data export.
 * @param {{joinedAt?: string|Date}|null|undefined} hasAccount
 * @param {boolean} demo
 */
export function joinedDateISO(hasAccount, demo) {
  const d = joinedDate(hasAccount, demo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
