// Shows corporate match details when a match is active.
// Replaces the "Suggest a Match Sponsor" sheet on the Dashboard Corp Match button
// so donors see impact details, not a form to suggest a new sponsor.
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { ExternalLink } from 'lucide-react';
import Sheet from '../Sheet';
import { matchProgress } from '../../lib/donorContent';

export default function MatchDetailsSheet({ show, onClose, match }) {
  if (!match?.active) return null;
  // Figures and strings come from the shared derivation - this sheet used to
  // recompute the same percentage and pool labels itself.
  const mp = matchProgress(match);

  return (
    <Sheet show={show} onClose={onClose} title={`${match.companyShort} Match`}>
      {/* No bottom padding - Sheet owns the bottom safe-area inset. */}
      <div className="px-6 pt-5">
        {match.sample && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-pill px-3 py-1 text-[11px] font-semibold text-amber-700">
              Example partnership - demo only
            </span>
          </div>
        )}

        {match.logoUrl && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shrink-0"
              style={{ border: '1px solid var(--line)' }}>
              <img src={match.logoUrl} alt={match.companyShort} style={{ height: 32, objectFit: 'contain' }} />
            </div>
            <div>
              <p className="font-bold text-ink text-base">{match.company}</p>
              <p className="text-slate text-sm">Corporate Match Partner</p>
            </div>
          </div>
        )}

        <p className="text-ink-2 text-sm leading-relaxed mb-4">{match.impactReport}</p>

        {/* White, not amber: a match is good news, and amber is the warning
            color. The gold lives on the bar alone. */}
        <div className="rounded-card p-4 mb-4" style={{ border: '1px solid var(--line)' }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-ink text-sm font-bold">Match Pool Progress</span>
            <span className="text-slate text-sm font-semibold tabular-nums">
              {mp.matchedLabel} / {mp.poolLabel}
            </span>
          </div>
          <div className="h-2 rounded-pill overflow-hidden mb-1.5" style={{ background: 'var(--line)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${mp.pct}%` }}
              transition={{ duration: 1 }}
              className="h-full rounded-pill"
              style={{ background: 'var(--gold)' }}
            />
          </div>
          <p className="text-slate text-[13px]" data-testid="match-progress-label">{mp.progressLabel}</p>
        </div>

        {match.impactUrl && (
          <a
            href={match.impactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold min-h-[44px]"
            style={{ color: 'var(--navy-deep)' }}
          >
            See {match.companyShort}&apos;s community commitments <ExternalLink size={13} />
          </a>
        )}
      </div>
    </Sheet>
  );
}
