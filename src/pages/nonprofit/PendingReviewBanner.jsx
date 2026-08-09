import { useEffect } from 'react';
import { useNp } from '../../store/NpContext';
import { cacheServerOrgLocally } from '../../store/orgStore';
import { fetchOrgPublicByCode } from '../../lib/npApi';

// ─── "Awaiting review" banner for the nonprofit admin dashboard ──────────────
// Rendered by BOTH admin shells (NpShell under the phone header, NpWebShell
// under the desktop nav) whenever the signed-in org is still waiting for the
// platform owner's approval (orgs.status = 'pending_review' - see
// supabase/functions/org-approve). Renders nothing for approved orgs, seeded
// orgs, and practice-mode local orgs (no status at all).
//
// While pending, the banner also re-checks the org's real status against the
// server once per mount (orgs_public by join code): approval happens OUTSIDE
// this browser - the owner clicks a link in an email - so a dashboard the
// admin leaves open, or reopens later, must notice on its own that the org
// flipped to approved, update the local cache, and drop the banner without
// requiring a fresh sign-in.

function usePendingOrgRefresh() {
  const { npOrg, setNpOrg } = useNp();
  const pending = npOrg?.status === 'pending_review';
  const joinCode = npOrg?.joinCode;
  const adminEmail = npOrg?.adminEmail;
  useEffect(() => {
    if (!pending || !joinCode) return;
    let cancelled = false;
    fetchOrgPublicByCode(joinCode).then(row => {
      if (cancelled || !row?.status || row.status === 'pending_review') return;
      cacheServerOrgLocally(row, adminEmail);
      setNpOrg({ ...npOrg, status: row.status });
    });
    return () => { cancelled = true; };
    // Re-run only when the pending flag or the org identity changes - npOrg
    // itself changes reference on every settings edit and must not re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, joinCode]);
  return pending;
}

export default function PendingReviewBanner({ web = false }) {
  const pending = usePendingOrgRefresh();
  if (!pending) return null;

  const title = 'Almost there - your organization is being reviewed';
  const body = 'PocketCache is reviewing your signup. Your launch kit (page link, join code, QR, and website widget) arrives by email the moment you are approved, and donors can join from then on. Nothing else is needed from you.';

  if (web) {
    return (
      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>⏳</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>{title}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#b45309' }}>{body}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-4 py-3" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-none" aria-hidden>⏳</span>
        <div className="min-w-0">
          <p className="text-xs font-bold" style={{ color: '#92400e' }}>{title}</p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#b45309' }}>{body}</p>
        </div>
      </div>
    </div>
  );
}
