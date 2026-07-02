import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Plus, Star, Sparkles } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import OrgLogo from '../components/OrgLogo';
import MatchBadge from '../components/MatchBadge';
import GiveExtraSheet from '../components/sheets/GiveExtraSheet';
import BoostToast from '../components/sheets/BoostToast';
import CorporateMatchSheet from '../components/sheets/CorporateMatchSheet';
import VolunteerSheet from '../components/sheets/VolunteerSheet';
import BecomeMatchSponsorSheet from '../components/sheets/BecomeMatchSponsorSheet';

// Impact tier copy uses "example equivalency" language to be honest about
// the approximate nature of impact figures.
function impactTier(total) {
  if (total >= 100) return 'About $100 could support roughly a month of after-school programming for one Club member — an example equivalency provided by the nonprofit.';
  if (total >= 60) return 'About $60 might cover approximately 2 weeks of after-school snacks for a Club member — example equivalency.';
  if (total >= 25) return 'About $25 could fund art and sports supplies for a Club session — example equivalency.';
  return 'Every dollar helps fund safe, staffed after-school spaces for young people in their community.';
}

export default function MyCause() {
  const { selectedNonprofit, boostDonation, totalDonated } = useApp();
  const brand = useTheme();
  const [showBoost, setShowBoost] = useState(false);
  const [showMatch, setShowMatch] = useState(false);       // "Suggest a Match Sponsor"
  const [showVolunteer, setShowVolunteer] = useState(false);
  const [showSponsorSheet, setShowSponsorSheet] = useState(false); // "Become a Match Sponsor"
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
  const match = np.corporateMatch;

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
      {/* "Suggest a Match Sponsor" — reachable from the Get More Involved section */}
      <CorporateMatchSheet
        show={showMatch}
        onClose={() => setShowMatch(false)}
        nonprofit={np}
        brand={brand}
      />
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
            {(np.rating || np.category) && (
              <div className="flex items-center gap-1.5 mt-1">
                {np.rating && <Star size={11} className="text-amber-300 fill-amber-300" />}
                <span className="text-white/80 text-xs font-semibold">
                  {[np.rating && `${np.rating}`, np.category].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
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
        {np.impact && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="rounded-3xl p-5 text-white relative overflow-hidden"
            style={{ background: brand.gradient }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1 relative z-10">Impact</p>
            <p className="text-white font-bold text-base leading-snug relative z-10">&ldquo;{np.impact}&rdquo;</p>
            <div className="flex items-center gap-2 mt-3 relative z-10">
              <OrgLogo nonprofit={np} size={7} rounded="full" className="shrink-0" />
              <p className="text-white/70 text-xs">{np.name}</p>
            </div>
          </motion.div>
        )}

        {/* Your impact storytelling card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white rounded-3xl p-5 card-shadow flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: brand.accentLight }}>
            <Sparkles size={18} style={{ color: brand.textAccent }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-1">Your Impact</p>
            <p className="text-gray-700 text-sm leading-relaxed">{impactTier(totalDonated)}</p>
          </div>
        </motion.div>

        {/* Stats grid — only show fields the org actually has */}
        {(np.raised != null || np.donors != null || np.ein || np.rating != null) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="grid grid-cols-2 gap-3">
              {[
                np.raised != null && { label: 'Total Raised', value: `$${(np.raised / 1e6).toFixed(1)}M` },
                np.donors != null && { label: 'Donors', value: np.donors.toLocaleString() },
                np.ein && { label: 'EIN', value: np.ein },
                np.rating != null && { label: 'Rating', value: `${np.rating}/5.0` },
              ].filter(Boolean).map((stat) => (
                <div key={stat.label} className="bg-white rounded-2xl px-4 py-3 card-shadow">
                  <p className="text-gray-400 text-xs font-medium">{stat.label}</p>
                  <p className="text-gray-900 font-bold text-base mt-0.5">{stat.value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Corporate match badge — "Example" tag shown when match.sample is true */}
        {match?.active && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            {match.sample && (
              <div className="mb-1.5 px-1">
                <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Example partnership — demo
                </span>
              </div>
            )}
            <MatchBadge match={match} />
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-4">Get More Involved</p>

          <div className="space-y-3">
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
              onClick={() => setShowSponsorSheet(true)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2"
              style={{ borderColor: '#f59e0b', color: '#92400e', background: '#fffbeb' }}
            >
              🏢 Become a Match Sponsor
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowMatch(true)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2"
              style={{ borderColor: brand.textAccent, color: brand.textAccent, background: brand.accentLight }}
            >
              &#127962; Suggest a Match Sponsor
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowVolunteer(true)}
              className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2"
              style={{ borderColor: brand.textAccent + '80', color: brand.textAccent, background: brand.accentLight }}
            >
              &#128588; Volunteer Opportunities
            </motion.button>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-center py-2">
          <p className="text-xs text-gray-300">Powered by <span className="font-semibold">PocketCache</span></p>
        </div>

      </div>
    </div>
  );
}
