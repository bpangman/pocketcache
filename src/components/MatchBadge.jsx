import { ChevronRight, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { matchProgress } from '../lib/donorContent';

/**
 * The full corporate-match display. My Cause owns this; Home shows only a
 * compact line pointing here.
 *
 * Every figure and sentence comes from `matchProgress()`. The percentage used to
 * be recomputed here, in Dashboard.jsx and in MatchDetailsSheet.jsx, and the
 * pool figures were hand-rolled with three different `.toFixed()` calls.
 *
 * @param {object} props
 * @param {object} props.match - nonprofit.corporateMatch
 * @param {boolean} [props.compact] - pill form, for tight rows
 * @param {Function} [props.onDetails] - when given, renders a drill-in row
 */
export default function MatchBadge({ match, compact = false, onDetails }) {
  if (!match?.active) return null;
  const mp = matchProgress(match);
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ background: '#fef3c7', color: '#92400e' }}>
        🏢 {match.companyShort} Match Active
      </span>
    );
  }
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
      <div className="flex items-center gap-3 mb-2">
        {match.logoUrl && (
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0"
            style={{ border: '1px solid #f3f4f6' }}>
            {/* alt derived from match object — not hardcoded */}
            <img src={match.logoUrl} alt={match.companyShort} style={{ height: 20, objectFit: 'contain' }} />
          </div>
        )}
        <p className="text-xs font-bold text-amber-800 flex-1">
          {mp.headline}
        </p>
        <span className="text-xs font-semibold text-amber-700 shrink-0">
          {mp.matchedLabel} / {mp.poolLabel}
        </span>
      </div>
      <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden mb-1.5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${mp.pct}%` }}
          transition={{ duration: 1 }}
          className="h-full bg-amber-400 rounded-full"
        />
      </div>
      {/* Derived progress first, then the partner's own description - it carries
          the match ratio, which no derived string does. */}
      <p className="text-amber-700 text-xs">{mp.progressLabel}</p>
      {match.description && (
        <p className="text-amber-700 text-xs mt-1.5 mb-2 leading-relaxed">{match.description}</p>
      )}
      {match.impactUrl && (
        <a href={match.impactUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900">
          {mp.impactLinkLabel} <ExternalLink size={11} />
        </a>
      )}
      {onDetails && (
        <button
          onClick={onDetails}
          data-testid="match-details-link"
          className="mt-3 w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-amber-800"
          style={{ background: '#fef3c7' }}
        >
          <span>Match details</span>
          <ChevronRight size={14} className="text-amber-600" />
        </button>
      )}
    </div>
  );
}
