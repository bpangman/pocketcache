// Shows corporate match details when a match is active.
// Replaces the "Suggest a Match Sponsor" sheet on the Dashboard Corp Match button
// so donors see impact details, not a form to suggest a new sponsor.
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { ExternalLink } from 'lucide-react';
import Sheet from '../Sheet';

export default function MatchDetailsSheet({ show, onClose, match }) {
  if (!match?.active) return null;
  const pct = Math.round((match.matched / match.maxAmount) * 100);
  const remaining = ((match.maxAmount - match.matched) / 1000).toFixed(1);

  return (
    <Sheet show={show} onClose={onClose} title={`${match.companyShort} Match`}>
      <div className="px-6 py-5 pb-8">
        {match.sample && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-xs font-semibold text-amber-700">
              Example partnership — demo only
            </span>
          </div>
        )}

        {match.logoUrl && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0"
              style={{ border: '1px solid #f3f4f6' }}>
              <img src={match.logoUrl} alt={match.companyShort} style={{ height: 32, objectFit: 'contain' }} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-base">{match.company}</p>
              <p className="text-gray-500 text-sm">Corporate Match Partner</p>
            </div>
          </div>
        )}

        <p className="text-gray-700 text-sm leading-relaxed mb-4">{match.impactReport}</p>

        <div className="rounded-2xl p-4 mb-4" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-amber-800 text-sm font-bold">Match Pool Progress</span>
            <span className="text-amber-700 text-sm font-semibold">
              ${(match.matched / 1000).toFixed(1)}K / ${(match.maxAmount / 1000).toFixed(0)}K
            </span>
          </div>
          <div className="h-2 bg-amber-100 rounded-full overflow-hidden mb-1.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1 }}
              className="h-full bg-amber-400 rounded-full"
            />
          </div>
          <p className="text-amber-700 text-xs">{pct}% of match pool used · ${remaining}K remaining</p>
        </div>

        {match.impactUrl && (
          <a
            href={match.impactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900"
          >
            See {match.companyShort}&apos;s community commitments <ExternalLink size={13} />
          </a>
        )}
      </div>
    </Sheet>
  );
}
