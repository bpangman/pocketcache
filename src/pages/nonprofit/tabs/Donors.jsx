import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Search, X, ChevronRight } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { DEMO_DONORS, ACTIVE_COUNT, PAUSED_COUNT, BELOW_MIN_COUNT } from '../demoData';
import DemoPill from '../DemoPill';
import { NpSheet, useNpLayout } from '../NpLayout';

function StatusChip({ status }) {
  const map = {
    active:          { label: 'Active',          bg: '#d1fae5', color: '#065f46' },
    paused:          { label: 'Paused',           bg: '#f3f4f6', color: '#6b7280' },
    'below-minimum': { label: 'Below min',        bg: '#fef3c7', color: '#92400e' },
  };
  const s = map[status] ?? map.active;
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
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
          <p className="font-bold text-gray-900 text-base">{donor.email}</p>
          <StatusChip status={donor.status} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Joined',        value: donor.joinedDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }) },
          { label: 'Lifetime Given', value: `$${donor.lifetime.toFixed(2)}` },
          { label: 'MTD Accrued',   value: donor.mtd > 0 ? `$${donor.mtd.toFixed(2)}` : ' - ' },
          { label: 'Card',          value: donor.cardOk ? 'OK' : 'Failed' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-2xl p-3">
            <p className="text-xs text-gray-400 font-medium">{label}</p>
            <p className="font-bold text-gray-900 text-sm mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent months */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Recent Months</p>
        <div className="space-y-2">
          {donor.recentMonths.map(m => (
            <div key={m.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-600">{m.label}</span>
              <span className="font-semibold text-sm" style={{ color: m.amount > 0 ? '#059669' : '#9ca3af' }}>
                {m.amount > 0 ? `$${m.amount.toFixed(2)}` : ' - '}
              </span>
            </div>
          ))}
        </div>
      </div>

      {donor.status === 'below-minimum' && (
        <div className="rounded-2xl p-4 bg-amber-50 border border-amber-100">
          <p className="text-amber-800 text-sm font-semibold">Below monthly minimum</p>
          <p className="text-amber-700 text-xs mt-1">
            This donor&apos;s round-ups haven&apos;t reached the monthly minimum yet. Their accrued amount will roll over to next month.
          </p>
        </div>
      )}

      {!donor.cardOk && (
        <div className="rounded-2xl p-4 bg-orange-50 border border-orange-100">
          <p className="text-orange-800 text-sm font-semibold">Payment failed</p>
          <p className="text-orange-700 text-xs mt-1">Stripe is retrying. No action required unless all retries fail.</p>
        </div>
      )}
    </>
  );
}

const PAGE_SIZE = 30;

export default function Donors() {
  const { npOrg } = useNp();
  const { web } = useNpLayout();
  const accent = npOrg.color || '#0D9488';
  const [query, setQuery]         = useState('');
  const [statusFilter, setFilter] = useState('all');
  const [selected, setSelected]   = useState(null);
  const [page, setPage]           = useState(1);

  const filtered = DEMO_DONORS.filter(d => {
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
        <div className="flex gap-4 text-sm">
          <span><strong className="font-bold" style={{ color: '#059669' }}>{ACTIVE_COUNT}</strong> active</span>
          <span><strong className="font-bold text-gray-500">{PAUSED_COUNT}</strong> paused</span>
          <span><strong className="font-bold text-amber-600">{BELOW_MIN_COUNT}</strong> below min</span>
        </div>
        <DemoPill />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-3 py-2.5" style={web ? { maxWidth: 460 } : undefined}>
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          type="text"
          placeholder="Search masked emails…"
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
        {query && (
          <button onClick={() => setQuery('')}><X size={14} className="text-gray-400" /></button>
        )}
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mt-2 overflow-x-auto">
        {['all', 'active', 'paused', 'below-minimum'].map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-all"
            style={statusFilter === f
              ? { background: accent, color: '#fff' }
              : { background: '#f3f4f6', color: '#6b7280' }}
          >
            {f === 'all' ? 'All' : f === 'below-minimum' ? 'Below min' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
    </>
  );

  const rows = visible.map(donor => (
    <motion.button
      key={donor.id}
      whileTap={{ scale: 0.98 }}
      onClick={() => setSelected(donor)}
      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white text-left card-shadow"
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}cc, #001a33)` }}
      >
        {donor.email[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{donor.email}</p>
        <p className="text-xs text-gray-400">
          Joined {donor.joinedDate.toLocaleDateString('default', { month: 'short', year: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusChip status={donor.status} />
        {donor.mtd > 0 && (
          <span className="text-xs font-bold" style={{ color: '#059669' }}>${donor.mtd.toFixed(2)}</span>
        )}
        <ChevronRight size={14} className="text-gray-300" />
      </div>
    </motion.button>
  ));

  const empty = <p className="text-center text-gray-400 text-sm py-10">No donors match your search.</p>;

  const loadMore = visible.length < filtered.length ? (
    <button
      onClick={() => setPage(p => p + 1)}
      className="py-3 text-sm font-semibold text-center rounded-2xl"
      // Full-bleed in the phone column; a normal-sized button on desktop.
      style={{ color: accent, background: `${accent}12`, width: web ? 320 : '100%' }}
    >
      Load more ({filtered.length - visible.length} remaining)
    </button>
  ) : null;

  // ── Desktop: one page scroll, donors tiled across the available width. ──
  if (web) {
    return (
      <div style={{ position: 'relative' }}>
        {sheet}
        <div style={{ marginBottom: 18 }}>{header}</div>
        {visible.length === 0 ? empty : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
            {rows}
          </div>
        )}
        {loadMore && <div style={{ marginTop: 18 }}>{loadMore}</div>}
      </div>
    );
  }

  // ── Phone: pinned header above an independently scrolling list. ──
  return (
    <div className="flex-1 flex flex-col h-full relative">
      {sheet}
      <div className="px-4 pt-4 pb-3">{header}</div>
      <div className="flex-1 overflow-y-auto pc-scrollbar px-4 pb-28 space-y-1.5">
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
