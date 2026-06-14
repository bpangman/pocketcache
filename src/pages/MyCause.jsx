import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Star } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import OrgLogo from '../components/OrgLogo';
import MatchBadge from '../components/MatchBadge';
import Sheet from '../components/Sheet';

// ─── Give Extra sheet (lifted from Dashboard) ────────────────────────────────

const BOOST_PRESETS = [1, 5, 10, 25];
const LARGE_DONATION_THRESHOLD = 1000;

function GiveExtraSheet({ show, onClose, onConfirm, nonprofit, brand }) {
  const [selected, setSelected] = useState(5);
  const [custom, setCustom] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const inputRef = useRef(null);
  const amount = custom ? parseFloat(custom) : selected;
  const valid = amount > 0 && !isNaN(amount);
  const isLarge = valid && amount >= LARGE_DONATION_THRESHOLD;

  useEffect(() => {
    if (show) {
      setSelected(5);
      setCustom('');
      setShowConfirm(false);
    }
  }, [show]);

  function handlePrimaryTap() {
    if (!valid) return;
    if (isLarge) { setShowConfirm(true); return; }
    onConfirm(amount);
    onClose();
  }

  function handleConfirmedLarge() {
    onConfirm(amount);
    setShowConfirm(false);
    onClose();
  }

  const displayAmount = valid
    ? (Number.isInteger(amount) ? amount : amount.toFixed(2))
    : '—';

  return (
    <Sheet show={show} onClose={onClose} title="Give Extra Now">
      <div className="px-6 py-5 pb-8">
        <p className="text-gray-500 text-sm mb-5">
          Make a one-time donation to{' '}
          <span className="font-semibold text-gray-900">{nonprofit?.shortName}</span>{' '}
          on top of your round-ups.
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {BOOST_PRESETS.map(p => (
            <motion.button
              key={p}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setSelected(p); setCustom(''); }}
              className="py-3 rounded-2xl font-bold text-sm transition-all"
              style={selected === p && !custom
                ? { background: brand.gradient, color: '#fff' }
                : { background: '#f3f4f6', color: '#374151' }}
            >
              ${p}
            </motion.button>
          ))}
        </div>

        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5 border-2 transition-colors"
          style={{ background: '#f9fafb', borderColor: custom ? brand.primary : 'transparent' }}
        >
          <span className="text-gray-400 font-semibold">$</span>
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Custom amount"
            value={custom}
            onChange={e => { setCustom(e.target.value); setSelected(null); }}
            className="flex-1 bg-transparent text-gray-900 text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handlePrimaryTap}
          className="w-full py-4 rounded-2xl text-white font-bold text-base"
          style={{ background: brand.gradient, opacity: valid ? 1 : 0.4 }}
        >
          Give ${displayAmount} Now
        </motion.button>

        <AnimatePresence>
          {showConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-x-6 bottom-8 bg-white border-2 border-amber-200 rounded-3xl p-5 shadow-xl"
              style={{ background: '#fffbeb' }}
            >
              <p className="font-bold text-amber-900 text-base mb-1">Just to confirm…</p>
              <p className="text-amber-700 text-sm mb-4">
                You're about to donate <span className="font-bold">${displayAmount}</span> to{' '}
                {nonprofit?.shortName}. Was that intentional?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-amber-200 text-amber-700 font-semibold text-sm"
                >
                  Go back
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConfirmedLarge}
                  className="flex-1 py-3 rounded-2xl text-white font-bold text-sm"
                  style={{ background: brand.gradient }}
                >
                  Yes, give ${displayAmount}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

function BoostToast({ amount, nonprofit, onClose }) {
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      className="absolute top-20 left-4 right-4 z-30 bg-white rounded-3xl p-4 shadow-2xl flex items-center gap-3"
    >
      <div className="text-3xl">💚</div>
      <div className="flex-1">
        <p className="font-bold text-gray-900 text-sm">Extra ${typeof amount === 'number' && !Number.isInteger(amount) ? amount.toFixed(2) : amount} sent!</p>
        <p className="text-gray-500 text-xs">Added to your {nonprofit?.shortName} donation</p>
      </div>
      <button onClick={onClose}><X size={16} className="text-gray-300" /></button>
    </motion.div>
  );
}

// ─── Corporate Match sheet ───────────────────────────────────────────────────

function CorporateMatchSheet({ show, onClose, nonprofit, brand }) {
  const [company, setCompany] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  return (
    <Sheet show={show} onClose={() => { onClose(); setSubmitted(false); setCompany(''); }} title="Suggest a Match Sponsor">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#127962;</div>
            <p className="font-bold text-gray-900 text-lg">Inquiry Sent!</p>
            <p className="text-gray-500 text-sm mt-2">BGCA's corporate partnerships team will follow up with {company} about sponsoring the monthly match.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">Know a company that should be matching your round-ups for BGCA? Let us know — BGCA's corporate partnerships team will reach out to them.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="Company you'd like to suggest" value={company} onChange={e => setCompany(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: company ? 1 : 0.4 }}>
                Send Suggestion
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ─── Become a Match Sponsor sheet ───────────────────────────────────────────

function BecomeMatchSponsorSheet({ show, onClose, nonprofit, brand }) {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  return (
    <Sheet show={show} onClose={() => { onClose(); setSubmitted(false); setCompanyName(''); setContactName(''); setEmail(''); setBudget(''); }} title="Become a Match Sponsor">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🤝</div>
            <p className="font-bold text-gray-900 text-lg">Application Sent!</p>
            <p className="text-gray-500 text-sm mt-2">BGCA's corporate partnerships team will be in touch within 2 business days.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">Partner with BGCA this month. Your company sponsors the monthly round-up match — donors see your logo, you get a community impact report.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="text" placeholder="Contact name" value={contactName} onChange={e => setContactName(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <input type="text" placeholder="$10,000–$50,000" value={budget} onChange={e => setBudget(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400" />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: companyName && email ? 1 : 0.4 }}>
                Submit to BGCA Partnerships
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ─── Volunteer sheet ─────────────────────────────────────────────────────────

function VolunteerSheet({ show, onClose, nonprofit, brand }) {
  const [interest, setInterest] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setTimeout(() => { setSubmitted(true); }, 600);
  }

  return (
    <Sheet show={show} onClose={() => { onClose(); setSubmitted(false); setInterest(''); }} title="Volunteer">
      <div className="px-6 py-5 pb-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">&#128588;</div>
            <p className="font-bold text-gray-900 text-lg">Interest Noted!</p>
            <p className="text-gray-500 text-sm mt-2">{nonprofit?.shortName} will reach out about volunteer opportunities near you.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5">Express your interest in volunteering with {nonprofit?.shortName}.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea placeholder="Tell us how you'd like to help..." value={interest} onChange={e => setInterest(e.target.value)} required rows={3}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-blue-400 resize-none" />
              <motion.button whileTap={{ scale: 0.97 }} type="submit"
                className="w-full py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: brand.gradient, opacity: interest ? 1 : 0.4 }}>
                Express Interest
              </motion.button>
            </form>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ─── MyCause page ────────────────────────────────────────────────────────────

export default function MyCause() {
  const { selectedNonprofit, boostDonation } = useApp();
  const brand = useTheme();
  const [showBoost, setShowBoost] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [showVolunteer, setShowVolunteer] = useState(false);
  const [showSponsorSheet, setShowSponsorSheet] = useState(false);
  const [boostToast, setBoostToast] = useState(null);
  const toastTimerRef = useRef(null);

  if (!selectedNonprofit) return null;

  function handleBoostConfirm(amount) {
    boostDonation(amount);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setBoostToast(amount);
    toastTimerRef.current = setTimeout(() => setBoostToast(null), 3500);
  }

  const np = selectedNonprofit;

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Boost toast */}
      <AnimatePresence>
        {boostToast !== null && (
          <BoostToast amount={boostToast} nonprofit={np} onClose={() => setBoostToast(null)} />
        )}
      </AnimatePresence>

      {/* Sheets */}
      <GiveExtraSheet
        show={showBoost}
        onClose={() => setShowBoost(false)}
        onConfirm={handleBoostConfirm}
        nonprofit={np}
        brand={brand}
      />
      <CorporateMatchSheet show={showMatch} onClose={() => setShowMatch(false)} nonprofit={np} brand={brand} />
      <VolunteerSheet show={showVolunteer} onClose={() => setShowVolunteer(false)} nonprofit={np} brand={brand} />
      <BecomeMatchSponsorSheet show={showSponsorSheet} onClose={() => setShowSponsorSheet(false)} nonprofit={np} brand={brand} />

      {/* Hero header */}
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-6"
      >
        <div className="flex items-center gap-4">
          <OrgLogo nonprofit={np} size={16} rounded="2xl" className="shrink-0 shadow-lg" />
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Your Cause</p>
            <h1 className="text-white font-bold text-xl leading-snug mt-0.5" style={{ letterSpacing: '-0.3px' }}>
              {np.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <Star size={11} className="text-amber-300 fill-amber-300" />
              <span className="text-white/80 text-xs font-semibold">{np.rating} · {np.category}</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 space-y-4 pt-4">

        {/* Mission / story */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Mission</p>
          <p className="text-gray-700 text-sm leading-relaxed">{np.description}</p>
        </motion.div>

        {/* Impact stat */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-3xl p-5 text-white relative overflow-hidden"
          style={{ background: brand.gradient }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1 relative z-10">Impact</p>
          <p className="text-white font-bold text-base leading-snug relative z-10">"{np.impact}"</p>
          <div className="flex items-center gap-2 mt-3 relative z-10">
            <span className="text-2xl">{np.logo}</span>
            <p className="text-white/70 text-xs">{np.name}</p>
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          {[
            { label: 'Total Raised', value: `$${(np.raised / 1e6).toFixed(1)}M` },
            { label: 'Donors', value: np.donors.toLocaleString() },
            { label: 'EIN', value: np.ein },
            { label: 'Rating', value: `${np.rating}/5.0` },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl px-4 py-3 card-shadow">
              <p className="text-gray-400 text-xs font-medium">{stat.label}</p>
              <p className="text-gray-900 font-bold text-base mt-0.5">{stat.value}</p>
            </div>
          ))}
        </motion.div>

        {/* Corporate match badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
        >
          <MatchBadge match={np.corporateMatch} />
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="bg-white rounded-3xl p-5 card-shadow space-y-3"
        >
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-1">Get More Involved</p>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowBoost(true)}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2"
            style={{ background: brand.gradient }}
          >
            <Plus size={16} /> Give Extra Now
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowMatch(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2"
            style={{ borderColor: brand.primary, color: brand.primary, background: brand.accentLight }}
          >
            &#127962; Corporate Match
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowVolunteer(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2"
            style={{ borderColor: brand.primary, color: brand.primary, background: brand.accentLight }}
          >
            &#128588; Volunteer
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowSponsorSheet(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2"
            style={{ borderColor: '#f59e0b', color: '#92400e', background: '#fffbeb' }}
          >
            🏢 Become a Match Sponsor
          </motion.button>
        </motion.div>

        {/* Footer */}
        <div className="text-center py-2">
          <p className="text-xs text-gray-300">Powered by <span className="font-semibold">PocketCache</span></p>
        </div>

      </div>
    </div>
  );
}
