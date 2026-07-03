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
