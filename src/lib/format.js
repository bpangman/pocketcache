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
