import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Plus, Sparkles, Building2, HandHeart } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import OrgLogo from '../components/OrgLogo';
import MatchBadge from '../components/MatchBadge';
import GiveExtraSheet from '../components/sheets/GiveExtraSheet';
import BoostToast from '../components/sheets/BoostToast';
import VolunteerSheet from '../components/sheets/VolunteerSheet';
import BecomeMatchSponsorSheet from '../components/sheets/BecomeMatchSponsorSheet';
import MatchDetailsSheet from '../components/sheets/MatchDetailsSheet';
import { getOrgStats } from '../lib/orgStats';
import { submitGiveExtra } from '../lib/engagement';
import { fmtMoneyCompact } from '../lib/format';
// impactTier used to be a verbatim duplicate of the one in WebPortalPages.jsx.
// Both surfaces now read the single implementation in lib/donorContent.
import { impactTier } from '../lib/donorContent';

/**
 * PocketCache teal, dark enough to carry small bold text on the teal-50 tile
 * (teal-700). The org's own brand colour is used for everything else in the
 * involvement group, but the two tiles need to be told apart at a glance and a
 * second org colour would just be more red under BGCA.
 */
const TEAL_INK = '#0f766e';

export default function MyCause() {
  const { selectedNonprofit, boostDonation, totalDonated, demoActive, hasAccount, refreshRealRoundups } = useApp();
  const brand = useTheme();
  const [showBoost, setShowBoost] = useState(false);
  const [showVolunteer, setShowVolunteer] = useState(false);
  const [showSponsorSheet, setShowSponsorSheet] = useState(false); // "Become a Match Sponsor"
  const [showMatchDetails, setShowMatchDetails] = useState(false); // drill-in on the active match
  const [boostToast, setBoostToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [orgStats, setOrgStats] = useState(null);
  useEffect(() => {
    if (!selectedNonprofit) return;
    getOrgStats(selectedNonprofit).then(setOrgStats);
  }, [selectedNonprofit]);

  if (!selectedNonprofit) return null;

  function handleBoostConfirm(amount) {
    boostDonation(amount);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setBoostToast(amount);
    toastTimerRef.current = setTimeout(() => setBoostToast(null), 3500);
  }

  // REAL pledge path (demoActive false): posts to the give-extra edge
  // function, then refreshes the roundups-me snapshot so the dashboards'
  // month and lifetime figures include the new pledge immediately.
  // Deliberately NOT boostDonation: the lifetime total already folds in the
  // server-side give-extra lifetime figure (see AppContext), so bumping the
  // local total too would double-count. The sheet owns the success view.
  async function handleRealGiveExtra(amount) {
    const res = await submitGiveExtra({
      amountCents: Math.round(amount * 100),
      orgCode: selectedNonprofit?.shortName,
      email: hasAccount?.email,
    });
    if (res?.ok) refreshRealRoundups();
    return res;
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
        demoActive={demoActive}
        onSubmitReal={handleRealGiveExtra}
      />
      {/* "Suggest a Match Sponsor" (CorporateMatchSheet) used to mount here.
          Removed 2026-07: two adjacent buttons that both said "match sponsor"
          made the donor pick between a real action and a suggestion box, and the
          suggestion box was the weaker of the two. "Become a Match Sponsor" is
          the one that survives. Nothing in the app mounts CorporateMatchSheet
          any more; the component file is left in place because the web portal
          keeps its own equivalent flow. */}
      <VolunteerSheet show={showVolunteer} onClose={() => setShowVolunteer(false)} nonprofit={np} brand={brand} />
      <BecomeMatchSponsorSheet show={showSponsorSheet} onClose={() => setShowSponsorSheet(false)} nonprofit={np} brand={brand} />
      {/* Match drill-in: My Cause owns the full match display now that Home is
          only a compact line. */}
      <MatchDetailsSheet show={showMatchDetails} onClose={() => setShowMatchDetails(false)} match={match} />

      {/* Hero header */}
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pb-6"
        style={{ paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <div className="flex items-center gap-4">
          <OrgLogo nonprofit={np} size={16} rounded="2xl" className="shrink-0 shadow-lg" />
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Your Cause</p>
            <h1 className="text-white font-bold text-xl leading-snug mt-0.5" style={{ letterSpacing: '-0.3px' }}>
              {np.name}
            </h1>
            {np.category && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-white/80 text-xs font-semibold">{np.category}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <div className="flex-1 scrollable pc-scrollbar px-4 pb-28 space-y-4 pt-4">

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
            {/* No org logo + name row here: the hero at the top of this same
                screen already identifies the org. */}
            <p className="text-white font-bold text-base leading-snug relative z-10">&ldquo;{np.impact}&rdquo;</p>
          </motion.div>
        )}

        {/* Get more involved  -  deliberately placed HERE, immediately after the
            org's Impact quote and above everything else.

            Position: this used to be the LAST card on a 1380px scroll, so the ask
            only arrived after the reference material (your-impact line, total
            raised, donor count, EIN, sponsor badge) had already cooled the
            moment. Here it lands on the emotional peak - mission, then the
            headline impact quote, then "here is how to do more" - and, measured
            on a 393x852 phone, the whole group including both tiles now sits
            inside the first screenful, so a motivated donor never scrolls to
            act. It is not directly under the hero because asking for more before
            the mission has been stated is the wrong order.

            Colour: the old buttons used brand.textAccent / brand.accentLight,
            which under BGCA is #E8192C  -  three red-outlined buttons that read
            as errors. Everything here now uses the calm product palette the rest
            of the app already uses for primary actions: brand.gradient and
            brand.primary (navy under BGCA, exactly as Settings and Home do it)
            plus PocketCache teal for the sponsor tile. No brand.textAccent. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white rounded-3xl p-5 card-shadow"
          data-testid="get-involved"
        >
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Get More Involved</p>
          <p className="text-gray-500 text-xs mt-1 mb-4 leading-relaxed">
            Your round-ups are already running. Here are three ways to do more for {np.shortName}.
          </p>

          {/* One lead action, then two equal-weight tiles. Not three identical
              full-width bars: the tiles say what each one actually does, and the
              48px+ tile height keeps every target comfortably tappable. */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowBoost(true)}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2"
            style={{ background: brand.gradient }}
            data-testid="involve-give-extra"
          >
            <Plus size={16} /> Give Extra Now
          </motion.button>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowSponsorSheet(true)}
              className="rounded-2xl p-3 text-left flex flex-col gap-2 min-h-[104px]"
              style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4' }}
              data-testid="involve-become-sponsor"
            >
              <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#ccfbf1' }}>
                <Building2 size={16} style={{ color: TEAL_INK }} />
              </span>
              <span className="font-bold text-sm leading-tight" style={{ color: TEAL_INK }}>
                Become a Match Sponsor
              </span>
              <span className="text-xs leading-snug" style={{ color: '#0d9488' }}>
                Your company funds the monthly match
              </span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowVolunteer(true)}
              className="rounded-2xl p-3 text-left flex flex-col gap-2 min-h-[104px]"
              style={{ background: brand.primary + '12', border: `1.5px solid ${brand.primary}40` }}
              data-testid="involve-volunteer"
            >
              <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: brand.primary + '1F' }}>
                <HandHeart size={16} style={{ color: brand.primary }} />
              </span>
              <span className="font-bold text-sm leading-tight" style={{ color: brand.primary }}>
                Volunteer Opportunities
              </span>
              <span className="text-xs leading-snug" style={{ color: brand.primary, opacity: 0.75 }}>
                Give time near you, not just money
              </span>
            </motion.button>
          </div>
        </motion.div>

        {/* Your impact storytelling card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-5 card-shadow flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: brand.accentLight }}>
            <Sparkles size={18} style={{ color: brand.textAccent }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-1">Your Impact</p>
            <p className="text-gray-700 text-sm leading-relaxed" data-testid="impact-tier">
              {impactTier(totalDonated, np.shortName)}
            </p>
          </div>
        </motion.div>

        {/* Stats grid  -  only show fields the org actually has */}
        {((orgStats?.raised ?? np.raised) != null || (orgStats?.donors ?? np.donors) != null || np.ein) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            {(orgStats != null ? orgStats.isDemo : !!np.sampleStats) && (
              <p className="text-right mb-1">
                <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Demo data</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                (orgStats?.raised ?? np.raised) != null && { label: 'Total Raised', value: fmtMoneyCompact(orgStats?.raised ?? np.raised) },
                (orgStats?.donors ?? np.donors) != null && { label: 'Donors', value: (orgStats?.donors ?? np.donors).toLocaleString() },
                np.ein && { label: 'EIN', value: np.ein },
              ].filter(Boolean).map((stat) => (
                <div key={stat.label} className="bg-white rounded-2xl px-4 py-3 card-shadow">
                  <p className="text-gray-400 text-xs font-medium">{stat.label}</p>
                  <p className="text-gray-900 font-bold text-base mt-0.5">{stat.value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Corporate match badge  -  "Example" tag shown when match.sample is true */}
        {match?.active && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
          >
            {match.sample && (
              <div className="mb-1.5 px-1">
                <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Example partnership  -  demo
                </span>
              </div>
            )}
            <MatchBadge match={match} onDetails={() => setShowMatchDetails(true)} />
          </motion.div>
        )}

        {/* "Powered by PocketCache" footer: Settings owns it. */}

      </div>
    </div>
  );
}
