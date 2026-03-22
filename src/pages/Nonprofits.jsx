import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, Users, X, CheckCircle } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import { NONPROFITS, CATEGORIES } from '../data/nonprofits';

function NonprofitDetail({ nonprofit, onClose, onSelect, isSelected }) {
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
        <span className="text-6xl mb-2">{nonprofit.logo}</span>
        <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">{nonprofit.category}</span>
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
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { onSelect(nonprofit); onClose(); }}
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

function NonprofitCard({ nonprofit, onPress, isSelected, brand }) {
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={() => onPress(nonprofit)}
      className={`bg-white rounded-3xl p-4 flex items-center gap-4 cursor-pointer ${
        isSelected ? 'ring-2 ring-offset-2' : ''
      }`}
      style={isSelected ? { '--tw-ring-color': nonprofit.brand.primary } : {}}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
        style={{ background: nonprofit.brand.accentLight }}
      >
        {nonprofit.logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-gray-900 text-sm truncate">{nonprofit.name}</p>
          {nonprofit.featured && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: nonprofit.brand.accentLight, color: nonprofit.brand.primary }}>
              Featured
            </span>
          )}
        </div>
        <p className="text-gray-400 text-xs mt-0.5 truncate">{nonprofit.tagline}</p>
        <div className="flex items-center gap-3 mt-1.5">
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

  const filtered = NONPROFITS.filter(n => {
    const matchCat = activeCategory === 'all' || n.category === activeCategory;
    const matchSearch = !search || n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.category.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Header */}
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-5"
      >
        <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Find a Cause</h1>
        <p className="text-white/70 text-sm mt-0.5">
          Supporting: <span className="text-white font-semibold">{selectedNonprofit.name.split(' ').slice(0,3).join(' ')}</span>
        </p>

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
                brand={brand}
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
            onSelect={setSelectedNonprofit}
            isSelected={selectedNonprofit.id === detail.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
