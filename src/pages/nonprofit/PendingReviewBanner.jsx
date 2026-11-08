import { useEffect } from 'react';
import { Hourglass, Eye } from 'lucide-react';
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

// One strip under the shell header: amber wash, 1px amber rule, icon + two
// lines. Both banners below share it so the phone and desktop shells agree.
function StatusStrip({ web, icon, title, body, role }) {
  const StripIcon = icon;
  const inner = (
    <>
      <StripIcon size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} aria-hidden />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>{title}</p>
        {body && <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>{body}</p>}
      </div>
    </>
  );
  if (web) {
    return (
      <div role={role} style={{ background: 'var(--warning-50)', borderBottom: '1px solid #FDE68A' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {inner}
        </div>
      </div>
    );
  }
  return (
    <div role={role} className="shrink-0 px-4 py-3" style={{ background: 'var(--warning-50)', borderBottom: '1px solid #FDE68A' }}>
      <div className="flex items-start gap-2.5">{inner}</div>
    </div>
  );
}

export default function PendingReviewBanner({ web = false }) {
  const pending = usePendingOrgRefresh();
  if (!pending) return null;
  return (
    <StatusStrip
      web={web}
      icon={Hourglass}
      role="status"
      title="Almost there - your organization is being reviewed"
      body="PocketCache is reviewing your signup. Your launch kit (page link, join code, QR, and website widget) arrives by email the moment you are approved, and donors can join from then on. Nothing else is needed from you."
    />
  );
}

/**
 * "Demo preview - read only": shown by both shells while a donor is touring
 * the admin side (NpContext.previewAdmin). Every save / rename / register
 * control is disabled underneath it, so the strip says why once instead of
 * each button explaining itself.
 */
export function PreviewAdminBanner({ web = false }) {
  const { previewAdmin } = useNp();
  if (!previewAdmin) return null;
  return (
    <StatusStrip
      web={web}
      icon={Eye}
      role="note"
      title="Demo preview - read only"
      body="You are looking at the nonprofit admin side with sample data. Changes are turned off here; sign in as your organization to make them."
    />
  );
}
