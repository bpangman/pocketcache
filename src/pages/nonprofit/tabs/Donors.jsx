import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Search, X, ChevronRight, Users } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { DEMO_DONORS, ACTIVE_COUNT, PAUSED_COUNT, BELOW_MIN_COUNT } from '../demoData';
import DemoPill from '../DemoPill';
import { NpSheet, useNpLayout } from '../NpLayout';
import { useNpDemoData } from '../useNpAdminActions';

function StatusChip({ status }) {
  const map = {
    active:          { label: 'Active',    bg: 'var(--green-50)',   color: 'var(--green-700)' },
    paused:          { label: 'Paused',    bg: 'var(--surface)',    color: 'var(--slate)' },
    'below-minimum': { label: 'Below min', bg: 'var(--warning-50)', color: 'var(--warning)' },
  };
  const s = map[status] ?? map.active;
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-pill"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// The donor detail body. Layout-agnostic: NpSheet decides whether it arrives as
// a bottom sheet (phone) or a centred modal (desktop).
function DonorDetail({ donor, accent }) {
  return (
    <>
      {/* Identity */}
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl text-white shrink-0"
          style={{ background: `linear-gradient(135deg, ${accent}, #001a33)` }}
        >
          {donor.email[0].toUpperCase()}
        </div>
        <div>
          <p className="font-bold text-ink text-base">{donor.email}</p>
          <StatusChip status={donor.status} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Joined',         value: donor.joinedDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }) },
          { label: 'Lifetime Given', value: `$${donor.lifetime.toFixed(2)}` },
          { label: 'MTD Accrued',    value: donor.mtd > 0 ? `$${donor.mtd.toFixed(2)}` : ' - ' },
          { label: 'Card',           value: donor.cardOk ? 'OK' : 'Failed' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface rounded-card p-3">
            <p className="text-xs text-slate font-medium">{label}</p>
            <p className="font-bold text-ink text-sm mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Recent months */}
      <div>
        <p className="text-[11px] font-semibold text-slate uppercase mb-2" style={{ letterSpacing: '0.06em' }}>Recent Months</p>
        <div className="space-y-2">
          {donor.recentMonths.map(m => (
            <div key={m.label} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <span className="text-sm text-ink-2">{m.label}</span>
              <span className="font-semibold text-sm" style={{ color: m.amount > 0 ? 'var(--green)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {m.amount > 0 ? `$${m.amount.toFixed(2)}` : ' - '}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* One tinted callout at most: a failed card outranks the below-minimum
          note, which reads fine as plain helper text. */}
      {donor.status === 'below-minimum' && (
        <div className="rounded-card p-4" style={{ background: 'var(--surface)' }}>
          <p className="text-ink text-sm font-semibold">Below monthly minimum</p>
          <p className="text-slate text-[13px] mt-1">
            This donor&apos;s round-ups haven&apos;t reached the monthly minimum yet. Their accrued amount will roll over to next month.
          </p>
        </div>
      )}

      {!donor.cardOk && (
        <div className="rounded-card p-4" style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--warning)' }}>Payment failed</p>
          <p className="text-ink-2 text-[13px] mt-1">Stripe is retrying. No action required unless all retries fail.</p>
        </div>
      )}
    </>
  );
}

const PAGE_SIZE = 30;
const FILTERS = ['all', 'active', 'paused', 'below-minimum'];

function filterLabel(f) {
  if (f === 'all') return 'All';
  if (f === 'below-minimum') return 'Below min';
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export default function Donors() {
  const { npOrg } = useNp();
  const { web } = useNpLayout();
  const showDemo = useNpDemoData();
  const accent = npOrg.color || '#0D9488';
  const [query, setQuery]         = useState('');
  const [statusFilter, setFilter] = useState('all');
  const [selected, setSelected]   = useState(null);
  const [page, setPage]           = useState(1);

  // Seeded donors only in demo mode / the read-only preview. A real org (BGCA
  // included) has no donor list until the server provides one, so it gets an
  // honest empty state instead of 144 fabricated people.
  const donors = showDemo ? DEMO_DONORS : [];
  const counts = showDemo
    ? { active: ACTIVE_COUNT, paused: PAUSED_COUNT, belowMin: BELOW_MIN_COUNT }
    : { active: 0, paused: 0, belowMin: 0 };

  const filtered = donors.filter(d => {
    const matchQ = !query || d.email.includes(query.toLowerCase());
    const matchS = statusFilter === 'all' || d.status === statusFilter;
    return matchQ && matchS;
  });

  const visible = filtered.slice(0, page * PAGE_SIZE);

  // ── Content pieces. Built ONCE and positioned by whichever shell is active. ──

  const sheet = (
    <NpSheet show={!!selected} title="Donor Detail" onClose={() => setSelected(null)}>
      {selected && <DonorDetail donor={selected} accent={accent} />}
    </NpSheet>
  );

  const header = (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-4 text-sm text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <span><strong className="font-bold" style={{ color: 'var(--green)' }}>{counts.active}</strong> active</span>
          <span><strong className="font-bold text-slate">{counts.paused}</strong> paused</span>
          <span><strong className="font-bold" style={{ color: 'var(--warning)' }}>{counts.belowMin}</strong> below min</span>
        </div>
        <DemoPill />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-surface rounded-input px-3" style={{ minHeight: web ? 44 : 48, ...(web ? { maxWidth: 460 } : null) }}>
        <Search size={16} className="text-slate shrink-0" aria-hidden />
        <input
          type="text"
          placeholder="Search masked emails…"
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          className="flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
          style={{ fontSize: 16, minHeight: 44 }}
          aria-label="Search donors"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="flex items-center justify-center -mr-2 rounded-input text-slate"
            style={{ width: 44, height: 44 }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mt-2 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            onClick={() => { setFilter(f); setPage(1); }}
            aria-pressed={statusFilter === f}
            className="text-[13px] font-semibold px-5 rounded-pill whitespace-nowrap transition-all"
            style={statusFilter === f
              ? { background: accent, color: '#fff', minHeight: 44 }
              : { background: 'var(--surface)', color: 'var(--ink-2)', minHeight: 44 }}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>
    </>
  );

  const rows = visible.map(donor => (
    <motion.button
      key={donor.id}
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={() => setSelected(donor)}
      className="w-full flex items-center gap-3 p-3 rounded-card bg-white text-left card-shadow"
      style={{ minHeight: 60 }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}cc, #001a33)` }}
      >
        {donor.email[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{donor.email}</p>
        <p className="text-xs text-slate">
          Joined {donor.joinedDate.toLocaleDateString('default', { month: 'short', year: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusChip status={donor.status} />
        {donor.mtd > 0 && (
          <span className="text-xs font-bold" style={{ color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>${donor.mtd.toFixed(2)}</span>
        )}
        <ChevronRight size={14} className="text-muted" aria-hidden />
      </div>
    </motion.button>
  ));

  // Two different empties: nothing to show yet (real org) vs. a filter that
  // matched nothing (demo). The first gets a real explanation.
  const empty = donors.length === 0 ? (
    <div className="bg-white rounded-card card-shadow text-center px-5 py-10 mt-2" style={web ? { maxWidth: 460 } : undefined}>
      <div className="w-9 h-9 rounded-input flex items-center justify-center mx-auto mb-3" style={{ background: `${accent}14` }}>
        <Users size={18} style={{ color: accent }} aria-hidden />
      </div>
      <p className="text-ink text-sm font-semibold">No donors yet</p>
      <p className="text-slate text-[13px] mt-1 leading-relaxed">
        Donors appear here once they join with your code or link. Share it from the Grow tab.
      </p>
    </div>
  ) : (
    <p className="text-center text-slate text-sm py-10">No donors match your search.</p>
  );

  const loadMore = visible.length < filtered.length ? (
    <button
      type="button"
      onClick={() => setPage(p => p + 1)}
      className="text-sm font-semibold text-center rounded-card"
      // Full-bleed in the phone column; a normal-sized button on desktop.
      style={{ color: accent, background: `${accent}14`, width: web ? 320 : '100%', minHeight: 44 }}
    >
      Load more ({filtered.length - visible.length} remaining)
    </button>
  ) : null;

  // ── Desktop: one page scroll, donors tiled across the available width. ──
  if (web) {
    return (
      <div style={{ position: 'relative' }}>
        {sheet}
        <div style={{ marginBottom: 16 }}>{header}</div>
        {visible.length === 0 ? empty : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
            {rows}
          </div>
        )}
        {loadMore && <div style={{ marginTop: 16 }}>{loadMore}</div>}
      </div>
    );
  }

  // ── Phone: pinned header above an independently scrolling list. ──
  return (
    <div className="flex-1 flex flex-col h-full relative">
      {sheet}
      <div className="px-4 pt-4 pb-3">{header}</div>
      <div className="flex-1 overflow-y-auto pc-scrollbar px-4 pb-28 space-y-2">
        {visible.length === 0 ? empty : (
          <>
            {rows}
            {loadMore}
          </>
        )}
      </div>
    </div>
  );
}
