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
