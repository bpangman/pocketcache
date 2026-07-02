// demoData.js — Seeded, coherent fake data for the PocketCache Nonprofit Dashboard demo.
// All dates are derived from new Date() so the demo never goes stale.

// ── Deterministic pseudo-random ───────────────────────────────────────────────
function sr(seed) {
  const x = Math.sin(seed + 1.7) * 10000;
  return x - Math.floor(x);
}

const now = new Date();
const thisYear  = now.getFullYear();
const thisMonth = now.getMonth(); // 0-based

function dateMonthsAgo(months, day = 1) {
  return new Date(thisYear, thisMonth - months, day);
}

function monthLabel(monthsAgo) {
  return dateMonthsAgo(monthsAgo).toLocaleString('default', { month: 'short' });
}

// ── Donors ────────────────────────────────────────────────────────────────────

const DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com'];
const ALPHA   = 'abcdefghijklmnopqrstuvwxyz';

function makeEmail(i) {
  const ch  = ALPHA[Math.floor(sr(i * 3 + 1) * 26)];
  const num = Math.floor(sr(i * 7 + 2) * 99) + 1;
  const dom = DOMAINS[Math.floor(sr(i * 11 + 3) * DOMAINS.length)];
  return `${ch}${num}***@${dom}`;
}

// Donor pool: 128 active, 11 paused, 5 below-minimum = 144 total
function makeStatus(i) {
  if (i < 128) return 'active';
  if (i < 139) return 'paused';
  return 'below-minimum';
}

const daysIntoMonth  = now.getDate();
const daysInMonth    = new Date(thisYear, thisMonth + 1, 0).getDate();
const monthFraction  = daysIntoMonth / daysInMonth;

export const DEMO_DONORS = Array.from({ length: 144 }, (_, i) => {
  const status    = makeStatus(i);
  const r1 = sr(i * 17 + 3);
  const r2 = sr(i * 31 + 7);
  const r3 = sr(i * 23 + 11);

  const monthsJoined = Math.floor(r1 * 22) + 1;
  const dayJoined    = Math.floor(r2 * 27) + 1;
  const joinedDate   = dateMonthsAgo(monthsJoined, dayJoined);

  // Monthly donation amount for active/below-minimum
  const monthlyAmount = status === 'below-minimum'
    ? parseFloat((r2 * 4.5 + 0.50).toFixed(2))
    : status === 'paused'
    ? 0
    : parseFloat((r3 * 18 + 2.50).toFixed(2));

  // MTD accrued (only active donors are accruing)
  const mtd = (status === 'active' || status === 'below-minimum')
    ? parseFloat((monthlyAmount * monthFraction).toFixed(2))
    : 0;

  // Lifetime giving
  const lifetime = parseFloat(
    (monthlyAmount * Math.min(monthsJoined, 18) * (0.75 + r1 * 0.5)).toFixed(2)
  );

  // Recent 3-month history
  const recentMonths = Array.from({ length: 3 }, (_, m) => ({
    label:  monthLabel(m + 1),
    amount: status === 'paused' ? 0 : parseFloat((monthlyAmount * (0.8 + sr(i * m + 77) * 0.4)).toFixed(2)),
  }));

  // Card OK?
  const cardOk = sr(i * 13 + 5) > 0.08; // ~92% ok

  return { id: i + 1, email: makeEmail(i), joinedDate, status, monthlyAmount, mtd, lifetime, recentMonths, cardOk };
});

export const ACTIVE_COUNT    = DEMO_DONORS.filter(d => d.status === 'active').length;       // 128
export const PAUSED_COUNT    = DEMO_DONORS.filter(d => d.status === 'paused').length;       // 11
export const BELOW_MIN_COUNT = DEMO_DONORS.filter(d => d.status === 'below-minimum').length; // 5

// ── This month's running total (accruing) ─────────────────────────────────────
export const MTD_TOTAL = parseFloat(
  DEMO_DONORS
    .filter(d => d.status === 'active')
    .reduce((sum, d) => sum + d.mtd, 0)
    .toFixed(2)
);

// ── Charge history (last 6 completed months) ──────────────────────────────────
export const CHARGE_HISTORY = Array.from({ length: 6 }, (_, m) => {
  // m=0 → most recently completed month, m=5 → oldest
  const monthsAgo = m + 1;
  const period    = dateMonthsAgo(monthsAgo);

  const eligibleDonors = DEMO_DONORS.filter(d => {
    return d.joinedDate < period && d.status !== 'paused';
  });

  // 2 failed donors in last completed month, 1 in month before
  const failureCount = m === 0 ? 2 : m === 1 ? 1 : 0;
  const donorsCharged = Math.max(0, eligibleDonors.length - failureCount);

  const gross = parseFloat(
    eligibleDonors.reduce((s, d) => s + d.monthlyAmount, 0).toFixed(2)
  );

  const coveringFee = Math.floor(eligibleDonors.length * 0.68);
  const feesCovered  = parseFloat((coveringFee * 0.50).toFixed(2));
  const feesDeducted = parseFloat(((eligibleDonors.length - coveringFee) * 0.50).toFixed(2));

  return {
    period,
    label:        period.toLocaleString('default', { month: 'long', year: 'numeric' }),
    shortLabel:   period.toLocaleString('default', { month: 'short', year: '2-digit' }),
    donorsCharged,
    gross,
    feesCovered,
    feesDeducted,
    failures:       failureCount,
    failureStatus:  failureCount > 0 ? 'retrying' : null,
  };
});

// ── Donor-growth chart (last 6 months, labels from current date) ───────────────
export const GROWTH_CHART = Array.from({ length: 6 }, (_, idx) => {
  const monthsAgo = 5 - idx; // 0 = current month (partial), 5 = oldest
  const cutoff    = dateMonthsAgo(monthsAgo + 1); // donors who joined before this period
  const count     = DEMO_DONORS.filter(d => d.joinedDate <= cutoff && d.status === 'active').length;
  return {
    month: monthLabel(5 - idx),
    donors: Math.max(0, count + Math.round(sr((idx + 1) * 13) * 10 - 3)),
  };
}).map((d, i, arr) => {
  // Ensure monotonically increasing (more realistic)
  const prev = arr[i - 1]?.donors ?? 90;
  return { ...d, donors: Math.max(prev, d.donors) };
});

// ── Summary figures ───────────────────────────────────────────────────────────
const nextChargeDate = new Date(thisYear, thisMonth + 1, 1);
export const NEXT_CHARGE_DATE    = nextChargeDate.toLocaleDateString('default', { month: 'long', day: 'numeric' });
export const LAST_MONTH_GROSS    = CHARGE_HISTORY[0]?.gross ?? 0;
export const AVG_PER_DONOR       = parseFloat((LAST_MONTH_GROSS / Math.max(1, CHARGE_HISTORY[0]?.donorsCharged ?? 1)).toFixed(2));
export const FAILED_COUNT        = CHARGE_HISTORY[0]?.failures ?? 0;
