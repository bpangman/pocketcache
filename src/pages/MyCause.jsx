import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Plus, Sparkles, Building2, HandHeart, ChevronRight } from 'lucide-react';
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
import { impactTier, isMatchVisible } from '../lib/donorContent';
import { safeBottomAtLeast } from '../lib/safeArea';

/**
 * PocketCache teal for the sponsor row's icon chip. The org's own brand colour
 * is used for everything else in the involvement group, but the two rows need
 * to be told apart at a glance and a second org colour would just be more red
 * under BGCA.
 */
const TEAL_INK = 'var(--teal-ui)';

/**
 * Horizontal room the hero header leaves free on the right for the global
 * avatar button AppShell pins at the top-right of every tab: the 40px circle
 * sits 20px from the edge, the header has its own 20px gutter, and 16px of
 * gap keeps the title off it (20 + 40 + 16 - 20 = 56). Dashboard's title is
 * short enough never to reach the circle; an org name is not.
 */
const AVATAR_CLEARANCE = 56;

export default function MyCause() {
  const { selectedNonprofit, boostDonation, totalDonated, demoActive, refreshRealRoundups, hasRealBankLinked } = useApp();
  // A brand-new account with nothing linked is not rounding up yet; say so
  // instead of claiming the round-ups are running (Home already says the same).
  const roundupsRunning = demoActive || hasRealBankLinked;
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
  // Identity is the session JWT only - with no session submitGiveExtra
  // resolves { ok:false, reason:'no-session' } and the sheet shows its
  // "Sign in to add a real gift." sentence; nothing is recorded.
  async function handleRealGiveExtra(amount) {
    const res = await submitGiveExtra({
      amountCents: Math.round(amount * 100),
      orgCode: selectedNonprofit?.shortName,
    });
    if (res?.ok) refreshRealRoundups();
    return res;
  }

  const np = selectedNonprofit;
  const match = np.corporateMatch;
  // BGCA's seed carries a SAMPLE match so the demo has something to show. A
  // real account must never see a sponsor claim about a partnership that does
  // not exist (lib/donorContent.isMatchVisible).
  const matchVisible = isMatchVisible(match, demoActive);

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
        {/* The right padding keeps the org name clear of the global avatar
            button AppShell pins at the top-right of every tab (40px circle, 20px
            from the edge). Without it a long name such as "Boys & Girls Clubs of
            America" fits on one line at 390px and its last word renders under the
            circle; with it the name wraps to two lines instead. */}
        <div className="flex items-center gap-4" style={{ paddingRight: AVATAR_CLEARANCE }}>
          <OrgLogo nonprofit={np} size={16} rounded="2xl" className="shrink-0 shadow-2" />
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.06em]">Your Cause</p>
            <h1 className="text-white font-bold text-xl leading-snug mt-0.5" style={{ letterSpacing: '-0.3px', textWrap: 'balance' }}>
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

      <div className="flex-1 scrollable pc-scrollbar px-4 space-y-4 pt-4" style={{ paddingBottom: safeBottomAtLeast(112, 106) }}>

        {/* Mission / story */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-card p-4 card-shadow"
        >
          <p className="text-slate text-[11px] font-semibold uppercase tracking-[0.06em] mb-2">Mission</p>
          <p className="text-ink-2 text-sm leading-relaxed">{np.description}</p>
        </motion.div>

        {/* Impact stat */}
        {np.impact && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="rounded-card p-4 text-white relative overflow-hidden pc-on-dark"
            style={{ background: brand.gradient }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.06em] mb-1 relative z-10">Impact</p>
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
            as errors. The lead action uses brand.gradient (navy under BGCA,
            exactly as Settings and Home do it); the two secondary actions are
            plain white rows with a tinted icon chip and a chevron, so the one
            tinted surface on this screen is the Impact card. No brand.textAccent. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white rounded-card p-4 card-shadow"
          data-testid="get-involved"
        >
          <p className="text-slate text-[11px] font-semibold uppercase tracking-[0.06em]">Get More Involved</p>
          <p className="text-ink-2 text-[13px] mt-1 mb-4 leading-relaxed">
            {roundupsRunning
              ? `Your round-ups are already running. Here are three ways to do more for ${np.shortName}.`
              : `Link a card to start rounding up. In the meantime, here are three ways to help ${np.shortName}.`}
          </p>

          {/* One lead action, then two equal-weight rows. The rows say what each
              one actually does, and the 56px row height keeps every target
              comfortably tappable. */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowBoost(true)}
            className="pc-btn w-full h-[52px] rounded-card text-white font-bold text-base flex items-center justify-center gap-2"
            style={{ background: brand.gradient }}
            data-testid="involve-give-extra"
          >
            <Plus size={18} /> Give Extra Now
          </motion.button>

          <div className="mt-3 rounded-card overflow-hidden" style={{ border: '1px solid var(--line)' }}>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowSponsorSheet(true)}
              className="w-full px-3 py-3 min-h-[56px] text-left flex items-center gap-3 bg-white"
              data-testid="involve-become-sponsor"
            >
              <span className="w-9 h-9 rounded-input flex items-center justify-center shrink-0" style={{ background: 'rgba(13,148,136,0.08)' }}>
                <Building2 size={18} style={{ color: TEAL_INK }} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm text-ink leading-tight">Become a Match Sponsor</span>
                <span className="block text-[13px] text-slate leading-snug mt-0.5">Your company funds the monthly match</span>
              </span>
              <ChevronRight size={18} className="text-gray-400 shrink-0" />
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowVolunteer(true)}
              className="w-full px-3 py-3 min-h-[56px] text-left flex items-center gap-3 bg-white"
              style={{ borderTop: '1px solid var(--line)' }}
              data-testid="involve-volunteer"
            >
              <span className="w-9 h-9 rounded-input flex items-center justify-center shrink-0" style={{ background: `${brand.primary}14` }}>
                <HandHeart size={18} style={{ color: brand.primary }} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm text-ink leading-tight">Volunteer Opportunities</span>
                <span className="block text-[13px] text-slate leading-snug mt-0.5">Give time near you, not just money</span>
              </span>
              <ChevronRight size={18} className="text-gray-400 shrink-0" />
            </motion.button>
          </div>
        </motion.div>

        {/* Your impact storytelling card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-card p-4 card-shadow flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-input flex items-center justify-center shrink-0"
            style={{ background: `${brand.primary}14` }}>
            <Sparkles size={18} style={{ color: brand.primary }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate text-[11px] font-semibold uppercase tracking-[0.06em] mb-1">Your Impact</p>
            <p className="text-ink-2 text-sm leading-relaxed" data-testid="impact-tier">
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
                <div key={stat.label} className="bg-white rounded-card px-4 py-3 card-shadow">
                  <p className="text-slate text-xs font-medium">{stat.label}</p>
                  <p className="text-ink font-bold text-base mt-0.5 tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Corporate match badge  -  "Example" tag shown when match.sample is true.
            Hidden entirely for a real account when the match is only a sample. */}
        {matchVisible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
          >
            {match.sample && (
              <div className="mb-1.5 px-1">
                <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-pill px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  Example partnership - demo
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
