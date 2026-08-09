import { useState, useEffect, useCallback } from 'react';
import { IDENTITY_KEYS, loadKey, saveKey } from '../store/identityStore';
import { listCustomOrgs, findOrgByCode, getAppleApproval, BGCA_DEMO_ADMIN_EMAIL } from '../store/orgStore';
import { CURRENT_MONTH_PENDING } from '../data/transactions';
import { chargeTotal, effectiveCharge, processingCoverFor, nextChargeLabel, monthKey } from '../lib/billing';
import { fmtMoney } from '../lib/format';
import CoinMark from '../components/CoinMark';

// src/pages/PlatformAdmin.jsx - platform-owner-only console.
// Reachable ONLY by typing ?padmin=1 in the address bar - it is never linked
// from anywhere else in the app. It shows Blake (the one person who runs
// PocketCache) everything currently knowable about the demo: what is saved in
// THIS browser, plus the real cross-visitor signal from the event beacon.
//
// This gate is a courtesy, not real security - there is no backend yet to
// check a password against, so it just compares a typed email to a constant.
// It is fully separate from the app's real donor/admin sign-in - it never
// reads or writes pc_identity, pc_donor_role, or pc_admin_role.

const PLATFORM_ADMIN_EMAIL = 'info@pocketcache.app';
const PADMIN_KEY = 'pc_padmin';
const NTFY_TOPIC_URL = 'https://ntfy.sh/pocketcache-wl-x7k2m9q4';

// Supabase events table - the permanent, PII-free activity log this console
// reads directly from the browser. The anon key is public by design (meant
// to ship in client-side source) and is scoped by row-level security on the
// events table to insert + select only.
const SUPABASE_EVENTS_URL = 'https://yeptifozaytoglfwxksz.supabase.co/rest/v1/events?select=*&order=created_at.desc&limit=100';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';

// ── Shared visual bits (same card language as the rest of the app: white
//    rounded-2xl cards with card-shadow, gray-400 uppercase tracking-widest
//    labels) ───────────────────────────────────────────────────────────────

function Card({ title, right, children }) {
  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 card-shadow mb-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm border-b border-gray-100 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

// ── Access gate ─────────────────────────────────────────────────────────────

function GateCard({ onUnlock }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);

  function submit(e) {
    e?.preventDefault?.();
    const normalized = email.trim().toLowerCase();
    if (normalized === PLATFORM_ADMIN_EMAIL) {
      saveKey(PADMIN_KEY, true);
      setError(null);
      onUnlock();
    } else {
      setError("That doesn't match the platform admin email - try again.");
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B2A4A', padding: '1.5rem' }}>
      <form onSubmit={submit} className="bg-white rounded-2xl p-6 card-shadow w-full" style={{ maxWidth: 360 }}>
        <div className="flex items-center gap-2 mb-4">
          <CoinMark size={28} />
          <span className="font-bold text-gray-900">PocketCache</span>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">What&apos;s your platform admin email?</h1>
        <p className="text-sm text-gray-500 mb-4">This page is only for the person who runs PocketCache.</p>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-gray-500"
          autoFocus
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button type="submit" className="w-full bg-gray-900 text-white rounded-xl py-2.5 font-semibold text-sm">
          Continue
        </button>
      </form>
    </div>
  );
}

// ── Section 2: Live activity ────────────────────────────────────────────────

function parseNdjson(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (!obj || (!obj.message && !obj.title)) continue;
    out.push(obj);
  }
  out.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return out;
}

function formatSupabaseDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  return Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

function normalizeSupabaseRows(rows) {
  return (rows || []).map(row => ({
    id: row.id,
    time: row.created_at ? new Date(row.created_at).getTime() / 1000 : null,
    title: row.event,
    message: formatSupabaseDetail(row.detail) || row.source || '',
  }));
}

function LiveActivityCard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Primary source: the permanent events table in Supabase. Reads happen
      // on every hostname including localhost - this is not the prod-only
      // restriction that lib/beacon.js uses for posting.
      const res = await fetch(SUPABASE_EVENTS_URL, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const rows = await res.json();
      setEvents(normalizeSupabaseRows(rows));
    } catch {
      // Silent fallback: if the Supabase read fails for any reason (network
      // error, non-2xx, etc), fall back to the old ntfy 12-hour poll rather
      // than show an error.
      try {
        const res = await fetch(`${NTFY_TOPIC_URL}/json?poll=1&since=12h`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const text = await res.text();
        setEvents(parseNdjson(text));
      } catch {
        setError("Couldn't load live activity right now - try Refresh in a moment.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card
      title="Live activity (all visitors)"
      right={
        <button
          onClick={load}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      <p className="text-xs text-gray-400 mb-3">
        Real signups from anyone, anywhere show up in the list below - the newest 100, held as a
        permanent server-side record in PocketCache's database, not a short rolling window - and
        also arrive as email alerts to blake@pocketcache.app.
      </p>
      {error ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">{error}</p>
      ) : loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400">No events yet</p>
      ) : (
        <div className="space-y-2">
          {events.map((ev, i) => (
            <div key={ev.id ?? i} className="text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0">
              <div className="text-xs text-gray-400 mb-0.5">
                {ev.time ? new Date(ev.time * 1000).toLocaleString() : 'time unknown'}
              </div>
              {ev.title && <div className="font-semibold text-gray-900">{ev.title}</div>}
              {ev.message && <div className="text-gray-600">{ev.message}</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Section 2.5: Nonprofits awaiting approval ───────────────────────────────
// Real server-side pending list (orgs_public, status = 'pending_review') with
// a working Approve action. Approving here does exactly what the emailed
// one-click link does: POST to the org-approve edge function, which flips the
// org live and emails the nonprofit their launch kit. The function checks the
// pasted approval key (x-approve-key) against its ORG_APPROVE_KEY secret -
// the key is asked for once and kept in sessionStorage only, so it survives
// tab navigation but never lands in localStorage or the exported raw data.

const SUPABASE_FUNCTIONS_BASE = 'https://yeptifozaytoglfwxksz.supabase.co/functions/v1';
const SUPABASE_PENDING_ORGS_URL = 'https://yeptifozaytoglfwxksz.supabase.co/rest/v1/orgs_public?status=eq.pending_review&select=*&order=name.asc';
const APPROVE_KEY_SESSION_KEY = 'pc_approve_key';

function loadApproveKey() {
  try { return sessionStorage.getItem(APPROVE_KEY_SESSION_KEY) ?? ''; } catch { return ''; }
}

function saveApproveKey(key) {
  try { sessionStorage.setItem(APPROVE_KEY_SESSION_KEY, key); } catch { /* ignore */ }
}

function PendingApprovalsCard() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [approveKey, setApproveKey] = useState(loadApproveKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rowMsg, setRowMsg] = useState({}); // org id -> result / error string

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(SUPABASE_PENDING_ORGS_URL, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setPending(await res.json());
    } catch {
      setLoadError("Couldn't load the pending list right now - try Refresh in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function saveKey(e) {
    e?.preventDefault?.();
    const key = keyDraft.trim();
    if (!key) return;
    saveApproveKey(key);
    setApproveKey(key);
    setKeyDraft('');
  }

  async function approve(org) {
    setBusyId(org.id);
    setRowMsg(m => ({ ...m, [org.id]: null }));
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}/org-approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'x-approve-key': approveKey,
        },
        body: JSON.stringify({ org_id: org.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 403) {
          // Wrong key: clear it so the paste field comes back.
          saveApproveKey('');
          setApproveKey('');
        }
        setRowMsg(m => ({ ...m, [org.id]: data?.error || `Approval failed (status ${res.status}).` }));
        return;
      }
      setRowMsg(m => ({
        ...m,
        [org.id]: data?.alreadyApproved
          ? 'Already approved - nothing changed.'
          : data?.launchKitSent
            ? `Approved - launch kit emailed. ✓`
            : 'Approved, but the launch kit email failed - check the function logs.',
      }));
      // Drop the row after a beat so the confirmation is readable.
      setTimeout(() => { setPending(list => list.filter(o => o.id !== org.id)); }, 2500);
    } catch {
      setRowMsg(m => ({ ...m, [org.id]: "Couldn't reach the approval service - try again." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Nonprofits awaiting approval"
      right={
        <button
          onClick={load}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      <p className="text-xs text-gray-400 mb-3">
        Every new nonprofit signup waits here (and in an email to blake@pocketcache.app with a
        one-click approve link) until you approve it. Approving flips their page live for donors
        and emails them their launch kit.
      </p>
      {!approveKey && (
        <form onSubmit={saveKey} className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
          <p className="text-xs text-amber-900 mb-2 font-medium">
            Paste the approval key once to enable the Approve buttons (kept only for this tab session).
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              placeholder="Approval key"
              className="flex-1 border border-amber-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500 bg-white"
            />
            <button type="submit" className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-900 text-white">
              Save key
            </button>
          </div>
        </form>
      )}
      {loadError ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">{loadError}</p>
      ) : loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing waiting - every signed-up nonprofit is approved.</p>
      ) : (
        pending.map(org => (
          <div key={org.id} className="border border-gray-100 rounded-xl p-3 mb-2 last:mb-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{org.name}</p>
                <p className="text-xs text-gray-500">Join code {org.join_code} · awaiting review</p>
              </div>
              <button
                onClick={() => approve(org)}
                disabled={!approveKey || busyId === org.id}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-40"
                title={approveKey ? undefined : 'Paste the approval key above first'}
              >
                {busyId === org.id ? 'Approving…' : 'Approve'}
              </button>
            </div>
            {rowMsg[org.id] && (
              <p className="text-xs mt-2 font-medium text-gray-700">{rowMsg[org.id]}</p>
            )}
          </div>
        ))
      )}
    </Card>
  );
}

// ── Section 3: Nonprofits on this device ────────────────────────────────────

function resolveBgcaAdminEmail() {
  const npOrg = loadKey('pc_np_org', null);
  if (npOrg && (npOrg.joinCode ?? '').toUpperCase() === 'BGCA' && npOrg.adminEmail) {
    return npOrg.adminEmail;
  }
  return BGCA_DEMO_ADMIN_EMAIL;
}

function appleApprovalLabel(approval) {
  if (approval.status === 'approved') return 'Verified';
  if (approval.status === 'benevity_submitted') return 'Registration submitted';
  return 'Not yet registered';
}

function orgPublicUrl(code) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?orgpage=${encodeURIComponent((code || '').toUpperCase())}`;
}

function OrgCard({ org }) {
  const isBgca = org.id === 'bgca';
  const approval = getAppleApproval(org);
  const stripeLabel = org.stripeConnected === true
    ? 'Connected'
    : org.stripeConnected === false
      ? 'Not connected'
      : 'Not recorded (this org predates tracking that)';
  return (
    <div className="border border-gray-100 rounded-xl p-3 mb-2 last:mb-0">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <span className="font-semibold text-gray-900 text-sm">{org.name}</span>
        <a
          href={orgPublicUrl(org.shortName)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-teal-700 bg-teal-50 rounded-lg px-2.5 py-1 hover:bg-teal-100 transition-colors"
        >
          View public page →
        </a>
      </div>
      <Row label="Join code" value={org.shortName} />
      <Row label="EIN" value={org.ein || 'not recorded'} />
      <Row label="Admin email" value={isBgca ? resolveBgcaAdminEmail() : (org.adminEmail || 'not recorded')} />
      <Row label="Created" value={org.createdAt ? new Date(org.createdAt).toLocaleString() : 'not recorded'} />
      <Row label="Apple app-listing" value={appleApprovalLabel(approval)} />
      <Row label="Stripe" value={stripeLabel} />
    </div>
  );
}

function NonprofitsCard() {
  const bgca = findOrgByCode('bgca');
  const customOrgs = listCustomOrgs();
  const allOrgs = [bgca, ...customOrgs].filter(Boolean);
  return (
    <Card title="Nonprofits on this device">
      <p className="text-xs text-gray-400 mb-3">
        Opening a nonprofit&apos;s own admin dashboard from here isn&apos;t something this console does -
        this device isn&apos;t signed in as their admin, and there is no real login system yet to borrow.
        The public page link below shows what any visitor sees.
      </p>
      {allOrgs.map(org => <OrgCard key={org.id} org={org} />)}
    </Card>
  );
}

// ── Section 4: Donor account on this device ─────────────────────────────────

function DonorCard() {
  const donorRole = loadKey(IDENTITY_KEYS.donorRole, null);
  const hasDonor = !!donorRole?.active;

  if (!hasDonor) {
    return (
      <Card title="Donor account on this device">
        <p className="text-sm text-gray-500">No donor account has been created in this browser.</p>
      </Card>
    );
  }

  const identity = loadKey(IDENTITY_KEYS.identity, null);
  const causeId = loadKey('pc_cause_id', null);
  const causeOrg = causeId ? findOrgByCode(causeId) : null;
  const accountStatus = loadKey('pc_account_status', 'active');
  const trackedCard = loadKey('pc_tracked_card', null);
  const paymentMethod = loadKey('pc_payment_method', null);
  const multiplier = loadKey('pc_multiplier', 1);
  const monthlyCap = loadKey('pc_monthly_cap', null);
  const chargeAdjustment = loadKey('pc_charge_adjustment', null);
  const feeMonths = loadKey('pc_fee_months', 1);
  const coverProcessingPref = loadKey('pc_cover_processing', true);
  const skipMonth = loadKey('pc_skip_month', null);

  // Same math WebDashboard.jsx uses (~line 786-796) so this console can never
  // quote a different number than the donor's own screen.
  const pendingRoundUps = parseFloat((CURRENT_MONTH_PENDING * multiplier).toFixed(2));
  const skipNextCharge = skipMonth !== null && skipMonth === monthKey();
  const processingCover = coverProcessingPref && !skipNextCharge
    ? processingCoverFor(effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment }))
    : 0;
  const upcomingCharge = chargeTotal({ pendingRoundUps, monthlyCap, chargeAdjustment, feeMonths, processingCover });
  const roundUpsCharged = effectiveCharge({ pendingRoundUps, monthlyCap, chargeAdjustment });
  const monthlyMinimum = causeOrg?.monthlyMinimum ?? 5;
  const rollingOver = pendingRoundUps < monthlyMinimum && !skipNextCharge;

  return (
    <Card title="Donor account on this device">
      <Row label="Name" value={identity?.name || 'not recorded'} />
      <Row label="Email" value={identity?.email || 'not recorded'} />
      <Row label="Giving to" value={causeOrg?.name || 'no cause picked'} />
      <Row label="Account status" value={accountStatus === 'cancelled' ? 'Cancelled' : 'Active'} />
      {paymentMethod && <Row label="Payment method" value={`${paymentMethod.label ?? paymentMethod.type ?? ''}${paymentMethod.last4 ? ` ····${paymentMethod.last4}` : ''}`} />}
      {trackedCard && <Row label="Card being tracked" value={`${trackedCard.brand ?? trackedCard.institution ?? trackedCard.name ?? 'card'}${trackedCard.last4 ? ` ····${trackedCard.last4}` : ''}`} />}
      <Row label="Round-up multiplier" value={`${multiplier}x`} />
      <Row label="Monthly cap" value={monthlyCap != null ? `$${fmtMoney(monthlyCap)}` : 'no cap'} />
      <Row label="Pending round-ups this cycle" value={`$${fmtMoney(pendingRoundUps)}`} />

      <div className="mt-4 pt-3 border-t border-gray-200">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
          Next charge: {nextChargeLabel()}
        </p>
        {skipNextCharge ? (
          <p className="text-sm text-gray-700">
            This cycle is skipped - nothing will be charged on {nextChargeLabel()}. The $1 monthly fee
            rolls forward and rides along with the next charge instead.
          </p>
        ) : rollingOver ? (
          <p className="text-sm text-gray-700">
            Round-ups are below {causeOrg?.name || 'the nonprofit'}&apos;s ${fmtMoney(monthlyMinimum)} minimum this
            cycle, so nothing is charged yet - the amount rolls into next month instead.
          </p>
        ) : (
          <>
            <Row label="Round-ups (after any cap or adjustment)" value={`$${fmtMoney(roundUpsCharged)}`} />
            <Row label={`App fee ($1 × ${feeMonths} month${feeMonths === 1 ? '' : 's'})`} value={`$${fmtMoney(feeMonths)}`} />
            {processingCover > 0 && <Row label="Card processing cover (donor opted in)" value={`$${fmtMoney(processingCover)}`} />}
            <Row label="Total" value={<span className="font-bold">${fmtMoney(upcomingCharge)}</span>} />
          </>
        )}
      </div>
    </Card>
  );
}

// ── Section 5: How the money runs ───────────────────────────────────────────

function HowTheMoneyRunsCard() {
  return (
    <Card title="How the money runs">
      <ul className="text-sm text-gray-700 space-y-2 list-disc pl-4">
        <li>Charges shown in this demo are simulated entirely inside each visitor&apos;s own browser.</li>
        <li>Nothing shown here has ever charged a real card or moved real money.</li>
        <li>A real monthly charge requires the backend, which exists in this repo but is not running yet.</li>
        <li>That backend is on the launch checklist before PocketCache can go live to real users or real money.</li>
      </ul>
    </Card>
  );
}

// ── Section 6: Raw data ─────────────────────────────────────────────────────

function RawKeyBlock({ storageKey }) {
  const [open, setOpen] = useState(false);
  let value = localStorage.getItem(storageKey);
  try { value = JSON.parse(value); } catch { /* keep raw string */ }
  return (
    <details className="border border-gray-100 rounded-xl mb-2 last:mb-0" open={open} onToggle={e => setOpen(e.target.open)}>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-mono text-gray-800">{storageKey}</summary>
      <pre className="text-xs bg-gray-50 rounded-b-xl p-3 overflow-x-auto m-0">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function RawDataCard() {
  const pcKeys = Object.keys(localStorage).filter(k => k.startsWith('pc_')).sort();

  function exportAll() {
    const data = {};
    pcKeys.forEach(k => {
      const raw = localStorage.getItem(k);
      try { data[k] = JSON.parse(raw); } catch { data[k] = raw; }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `pocketcache-device-export-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Card
      title="Raw data"
      right={
        <button
          onClick={exportAll}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-colors"
        >
          Export everything (JSON file)
        </button>
      }
    >
      <p className="text-xs text-gray-400 mb-3">
        Every saved item on this device, read-only. This page never deletes or changes anything.
      </p>
      {pcKeys.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing saved on this device yet.</p>
      ) : (
        pcKeys.map(k => <RawKeyBlock key={k} storageKey={k} />)
      )}
    </Card>
  );
}

// ── The console ──────────────────────────────────────────────────────────────

function PlatformAdminConsole() {
  return (
    <div style={{ minHeight: '100dvh', background: '#f6f8fb', fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)' }} className="px-4 sm:px-6 py-6">
        <div style={{ maxWidth: 820, margin: '0 auto' }} className="flex items-center gap-2.5">
          <CoinMark size={30} />
          <div>
            <div className="text-white font-bold text-base leading-tight">PocketCache platform admin</div>
            <div className="text-white/60 text-xs">Everything currently knowable about the demo</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto' }} className="px-4 sm:px-6 py-5">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-sm text-amber-900 leading-relaxed">
          This page shows everything saved in this browser, plus real signups from anyone, anywhere
          in Live activity below - a permanent, server-side record in PocketCache&apos;s database, not a
          short rolling window - and email alerts to blake@pocketcache.app. That is the one part of
          this page that reflects visitors other than you. Donor and nonprofit accounts still live
          only in each visitor&apos;s own browser until the rest of the real backend exists.
        </div>

        <LiveActivityCard />
        <PendingApprovalsCard />
        <NonprofitsCard />
        <DonorCard />
        <HowTheMoneyRunsCard />
        <RawDataCard />
      </div>
    </div>
  );
}

export default function PlatformAdmin() {
  const [unlocked, setUnlocked] = useState(() => loadKey(PADMIN_KEY, false) === true);
  if (!unlocked) return <GateCard onUnlock={() => setUnlocked(true)} />;
  return <PlatformAdminConsole />;
}
