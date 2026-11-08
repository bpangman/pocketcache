import { Building2, ChevronRight, ExternalLink } from 'lucide-react';
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
 * A white card, not an amber one: amber is the app's warning color and a
 * sponsor match is good news. The gold only appears on the thin progress bar.
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
      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-pill"
        style={{ background: 'var(--gold-50)', color: 'var(--gold-700)' }}>
        <Building2 size={12} /> {match.companyShort} Match Active
      </span>
    );
  }
  return (
    <div className="bg-white rounded-card p-4 card-shadow" data-testid="match-badge">
      <div className="flex items-center gap-3 mb-3">
        {match.logoUrl ? (
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0"
            style={{ border: '1px solid var(--line)' }}>
            {/* alt derived from match object - not hardcoded */}
            <img src={match.logoUrl} alt={match.companyShort} style={{ height: 22, objectFit: 'contain' }} />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-input flex items-center justify-center shrink-0"
            style={{ background: 'var(--gold-50)', color: 'var(--gold-700)' }}>
            <Building2 size={18} />
          </div>
        )}
        <p className="text-sm font-semibold text-ink flex-1 leading-snug">
          {mp.headline}
        </p>
        <span className="text-xs font-semibold text-slate shrink-0 tabular-nums">
          {mp.matchedLabel} / {mp.poolLabel}
        </span>
      </div>
      <div className="h-1.5 rounded-pill overflow-hidden mb-2" style={{ background: 'var(--line)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${mp.pct}%` }}
          transition={{ duration: 1 }}
          className="h-full rounded-pill"
          style={{ background: 'var(--gold)' }}
        />
      </div>
      {/* Derived progress first, then the partner's own description - it carries
          the match ratio, which no derived string does. */}
      <p className="text-slate text-[13px]">{mp.progressLabel}</p>
      {match.description && (
        <p className="text-ink-2 text-[13px] mt-1.5 leading-relaxed">{match.description}</p>
      )}
      {match.impactUrl && (
        <a href={match.impactUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-semibold min-h-[44px] -mb-2"
          style={{ color: 'var(--navy-deep)' }}>
          {mp.impactLinkLabel} <ExternalLink size={12} />
        </a>
      )}
      {onDetails && (
        <button
          type="button"
          onClick={onDetails}
          data-testid="match-details-link"
          className="mt-3 w-full min-h-[44px] flex items-center justify-between rounded-input px-3 py-2 text-sm font-semibold text-ink"
          style={{ border: '1px solid var(--line)' }}
        >
          <span>Match details</span>
          <ChevronRight size={16} className="text-gray-400" />
        </button>
      )}
    </div>
  );
}
