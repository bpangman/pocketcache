import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars

export default function MatchBadge({ match, compact = false }) {
  if (!match?.active) return null;
  const pct = Math.round((match.matched / match.maxAmount) * 100);
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
          {match.company} is matching your round-ups this month
        </p>
        <span className="text-xs font-semibold text-amber-700 shrink-0">
          ${(match.matched / 1000).toFixed(1)}K / ${(match.maxAmount / 1000).toFixed(0)}K
        </span>
      </div>
      <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden mb-1.5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1 }}
          className="h-full bg-amber-400 rounded-full"
        />
      </div>
      <p className="text-amber-700 text-xs mb-2">{match.description}</p>
      {match.impactUrl && (
        <a href={match.impactUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900">
          See {match.companyShort}&apos;s community impact <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
