import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, Users, X, CheckCircle } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { NONPROFITS, CATEGORIES } from '../data/nonprofits';
import OrgLogo from '../components/OrgLogo';
import MatchBadge from '../components/MatchBadge';

// The featured "Cause of the Month" — pulled from data, not hardcoded
const CAUSE_OF_MONTH = NONPROFITS.find(n => n.id === 'bgca');

function NonprofitDetail({ nonprofit, onClose, onSelect, isSelected }) {
  const [showConfirm, setShowConfirm] = useState(false);

  function handleSelect() {
    onSelect(nonprofit);
    onClose();
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="absolute inset-0 bg-white z-20 flex flex-col"
    >
      {/* Hero */}
      <div
        className="h-48 flex flex-col items-center justify-center relative"
        style={{ background: nonprofit.brand.gradient }}
      >
        <button
          onClick={onClose}
          className="absolute top-14 right-4 w-8 h-8 bg-black/20 rounded-full flex items-center justify-center"
        >
          <X size={16} className="text-white" />
        </button>
        <OrgLogo nonprofit={nonprofit} size={18} rounded="3xl" className="mb-2 shadow-lg" />
        <span className="text-white/80 text-xs font-semibold uppercase tracking-widest mt-2">{nonprofit.category}</span>
      </div>

      <div className="flex-1 scrollable px-5 py-5 pb-32">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-900 leading-tight flex-1 pr-4">{nonprofit.name}</h2>
          <div className="flex items-center gap-1 bg-amber-50 rounded-full px-2.5 py-1 shrink-0">
            <Star size={12} className="text-amber-400 fill-amber-400" />
            <span className="text-amber-700 text-xs font-bold">{nonprofit.rating}</span>
          </div>
        </div>
        <p className="text-gray-500 text-sm font-medium mb-4">{nonprofit.tagline}</p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { label: 'Total Raised', value: `$${(nonprofit.raised / 1e6).toFixed(1)}M` },
            { label: 'Donors', value: nonprofit.donors.toLocaleString() },
            { label: 'EIN', value: nonprofit.ein },
            { label: 'Rating', value: `${nonprofit.rating}/5.0` },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-gray-400 text-xs font-medium">{stat.label}</p>
              <p className="text-gray-900 font-bold text-base mt-0.5">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <h3 className="font-bold text-gray-900 mb-2">About</h3>
          <p className="text-gray-500 text-sm leading-relaxed">{nonprofit.description}</p>
        </div>

        <div className="rounded-2xl p-4" style={{ background: nonprofit.brand.accentLight }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: nonprofit.brand.primary }}>Impact</p>
          <p className="font-semibold text-sm" style={{ color: nonprofit.brand.primary }}>{nonprofit.impact}</p>
        </div>

        <MatchBadge match={nonprofit.corporateMatch} />

        {/* Brand preview */}
        <div className="mt-4 rounded-2xl p-4 text-white" style={{ background: nonprofit.brand.gradient }}>
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">App branding if selected</p>
          <p className="font-bold text-base">{nonprofit.brand.appName}</p>
          <p className="text-white/70 text-xs mt-0.5">{nonprofit.brand.tagline}</p>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-5">
        {isSelected ? (
          <div className="flex items-center justify-center gap-2 py-4 rounded-2xl" style={{ background: nonprofit.brand.accentLight }}>
            <CheckCircle size={20} style={{ color: nonprofit.brand.primary }} />
            <span className="font-bold" style={{ color: nonprofit.brand.primary }}>Currently Supporting</span>
          </div>
        ) : showConfirm ? (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <p className="text-center text-sm text-gray-600 font-medium">
                Switch your cause to <span className="font-bold text-gray-900">{nonprofit.name}</span>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 font-semibold text-sm"
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSelect}
                  className="flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-lg"
                  style={{ background: nonprofit.brand.gradient }}
                >
                  Yes, Switch
                </motion.button>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowConfirm(true)}
            className="w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg"
            style={{ background: nonprofit.brand.gradient }}
          >
            Support This Cause
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

function NonprofitCard({ nonprofit, onPress, isSelected }) {
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={() => onPress(nonprofit)}
      className={`bg-white rounded-3xl p-4 flex items-center gap-4 cursor-pointer ${
        isSelected ? 'ring-2 ring-offset-2' : ''
      }`}
      style={isSelected ? { '--tw-ring-color': nonprofit.brand.primary } : {}}
    >
      <OrgLogo nonprofit={nonprofit} size={14} rounded="2xl" className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="font-bold text-gray-900 text-sm leading-snug">{nonprofit.name}</p>
          {nonprofit.featured && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: nonprofit.brand.accentLight, color: nonprofit.brand.primary }}>
              Featured
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <MatchBadge match={nonprofit.corporateMatch} compact />
        </div>
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1">
            <Star size={10} className="text-amber-400 fill-amber-400" />
            <span className="text-gray-500 text-xs font-medium">{nonprofit.rating}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users size={10} className="text-gray-400" />
            <span className="text-gray-500 text-xs">{(nonprofit.donors / 1000).toFixed(0)}K donors</span>
          </div>
        </div>
      </div>
      {isSelected && (
        <CheckCircle size={20} style={{ color: nonprofit.brand.primary }} className="shrink-0" />
      )}
    </motion.div>
  );
}

export default function Nonprofits() {
  const { selectedNonprofit, setSelectedNonprofit } = useApp();
  const brand = useTheme();
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [switchToast, setSwitchToast] = useState(null); // { name, emoji }
  const toastTimer = useRef(null);

  function handleCauseSelect(np) {
    const isChange = selectedNonprofit && selectedNonprofit.id !== np.id;
    setSelectedNonprofit(np);
    if (isChange) {
      clearTimeout(toastTimer.current);
      setSwitchToast({ name: np.name, emoji: np.logo ?? '🌟' });
      toastTimer.current = setTimeout(() => setSwitchToast(null), 4000);
    }
  }

  const filtered = NONPROFITS.filter(n => {
    const matchCat = activeCategory === 'all' || n.category === activeCategory;
    const matchSearch = !search || n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.category.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  if (!selectedNonprofit) return null;

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Header */}
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Find a Cause</h1>
            <p className="text-white/70 text-sm mt-0.5">
              Supporting: <span className="text-white font-semibold">{selectedNonprofit.name}</span>
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center gap-3 bg-white/15 rounded-2xl px-4 py-3 border border-white/20">
          <Search size={16} className="text-white/60 shrink-0" />
          <input
            type="text"
            placeholder="Search causes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/50"
          />
        </div>
      </motion.div>

      {/* Featured cause of the month — pulled from data */}
      {!search && activeCategory === 'all' && CAUSE_OF_MONTH && (
        <div className="bg-white px-5 pt-3 pb-1">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">⭐ Cause of the Month</p>
          <motion.div
            whileTap={{ scale: 0.98 }}
            onClick={() => setDetail(CAUSE_OF_MONTH)}
            className="rounded-3xl overflow-hidden mb-3 cursor-pointer"
            style={{ background: CAUSE_OF_MONTH.brand.gradient }}
          >
            <div className="p-4 flex items-center gap-3">
              <OrgLogo nonprofit={CAUSE_OF_MONTH} size={14} rounded="2xl" className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-snug">{CAUSE_OF_MONTH.name}</p>
                <p className="text-white/70 text-xs mt-0.5">{CAUSE_OF_MONTH.impact}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="h-1.5 flex-1 rounded-full bg-white/20 overflow-hidden">
                    <div className="h-full rounded-full bg-white" style={{ width: '73%' }} />
                  </div>
                  <p className="text-white/70 text-xs shrink-0">73% to goal</p>
                </div>
              </div>
              <div className="shrink-0 bg-white/20 rounded-xl px-3 py-1.5">
                <p className="text-white text-xs font-bold">View</p>
              </div>
            </div>
            <div className="bg-white/10 px-4 py-2.5 flex gap-4">
              {[
                { label: 'This month', value: '$47,291 raised' },
                { label: 'Supporters', value: `${(CAUSE_OF_MONTH.donors / 1000).toFixed(0)}K donors` },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-white/50 text-xs">{s.label}</p>
                  <p className="text-white text-xs font-semibold">{s.value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Category chips */}
      <div className="bg-white px-5 py-3 border-b border-gray-100">
        <div className="flex gap-2 overflow-x-auto scrollable">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all"
              style={activeCategory === cat.id
                ? { background: brand.primary, color: '#fff' }
                : { background: '#f3f4f6', color: '#4b5563' }
              }
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 scrollable px-4 pt-3 pb-28 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-4">🔍</span>
            <p className="font-semibold">No results found</p>
            <p className="text-sm mt-1">Try a different search or category</p>
          </div>
        ) : (
          filtered.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <NonprofitCard
                nonprofit={n}
                onPress={setDetail}
                isSelected={selectedNonprofit.id === n.id}
              />
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {detail && (
          <NonprofitDetail
            nonprofit={detail}
            onClose={() => setDetail(null)}
            onSelect={handleCauseSelect}
            isSelected={selectedNonprofit.id === detail.id}
          />
        )}
      </AnimatePresence>

      {/* Cause-switch toast */}
      <AnimatePresence>
        {switchToast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="absolute bottom-24 left-4 right-4 z-30 rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{ background: '#1f2937', boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}
          >
            <span className="text-2xl leading-none mt-0.5">{switchToast.emoji}</span>
            <div>
              <p className="text-white font-bold text-sm">{switchToast.name} starts tomorrow</p>
              <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
                Today's round-ups still go to your previous cause. The switch takes effect at midnight.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
