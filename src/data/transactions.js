// Generate a date string N days before today (YYYY-MM-DD)
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ~12 transactions spread over the last ~10 days so that Activity shows
// "Today" and "Yesterday" date headers with real data.
// roundUp = Math.ceil(amount) − amount (exact to 2 decimal places).
export const TRANSACTIONS = [
  { id: 1,  merchant: 'Blue Bottle Coffee',  amount: 6.75,  roundUp: 0.25, date: daysAgo(0), category: 'Food & Drink' },
  { id: 2,  merchant: 'Whole Foods Market',  amount: 43.18, roundUp: 0.82, date: daysAgo(0), category: 'Groceries' },
  { id: 3,  merchant: 'Uber',                amount: 14.60, roundUp: 0.40, date: daysAgo(1), category: 'Transport' },
  { id: 4,  merchant: 'Netflix',             amount: 15.99, roundUp: 0.01, date: daysAgo(1), category: 'Entertainment' },
  { id: 5,  merchant: 'Sweetgreen',          amount: 13.40, roundUp: 0.60, date: daysAgo(2), category: 'Food & Drink' },
  { id: 6,  merchant: 'Target',              amount: 67.83, roundUp: 0.17, date: daysAgo(2), category: 'Shopping' },
  { id: 7,  merchant: 'Amazon',              amount: 29.99, roundUp: 0.01, date: daysAgo(3), category: 'Shopping' },
  { id: 8,  merchant: 'Starbucks',           amount: 5.45,  roundUp: 0.55, date: daysAgo(3), category: 'Food & Drink' },
  { id: 9,  merchant: 'Shell Gas Station',   amount: 52.30, roundUp: 0.70, date: daysAgo(5), category: 'Fuel' },
  { id: 10, merchant: 'Spotify',             amount: 9.99,  roundUp: 0.01, date: daysAgo(5), category: 'Subscriptions' },
  { id: 11, merchant: 'CVS Pharmacy',        amount: 18.64, roundUp: 0.36, date: daysAgo(8), category: 'Health' },
  { id: 12, merchant: 'Chipotle',            amount: 11.25, roundUp: 0.75, date: daysAgo(8), category: 'Food & Drink' },
];

// Current billing-cycle pending = sum of all transaction round-ups.
// In production this is computed server-side from Plaid webhook events.
export const CURRENT_MONTH_PENDING = parseFloat(
  TRANSACTIONS.reduce((s, t) => s + t.roundUp, 0).toFixed(2),
); // 4.63

// Build MONTHLY_DATA dynamically: 6 entries ending with the current calendar
// month. Labels are derived from the actual date so they never go stale.
// The current month's value equals CURRENT_MONTH_PENDING. All prior completed
// months are ≥ $10, consistent with the $10 monthly minimum — any month that
// accumulated less than $10 would have rolled its balance into the next month.
function buildMonthlyData() {
  const now = new Date();
  // Five prior completed months, all ≥ $5
  const priorValues = [11.18, 14.03, 10.55, 11.82, 13.47];
  return Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i; // 5 months ago … current month
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return {
      month: d.toLocaleString('en-US', { month: 'short' }),
      year: d.getFullYear(),
      monthIndex: d.getMonth(),
      donated: offset === 0 ? CURRENT_MONTH_PENDING : priorValues[i],
    };
  });
}

export const MONTHLY_DATA = buildMonthlyData();

// Sum of prior completed months only — used as the initial totalDonated value
// in AppContext. "Donated" means actually charged; the pending current month
// is NOT counted until it clears at month-end.
export const PRIOR_MONTHS_SUM = parseFloat(
  MONTHLY_DATA.slice(0, -1).reduce((s, m) => s + m.donated, 0).toFixed(2),
); // 61.05
