import { useState, useRef, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, CheckCircle, Mail, X, KeyRound } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { useApp } from '../../../store/AppContext';
import CoinMark from '../../../components/CoinMark';
import Button from '../../../components/ui/Button';
import { AdminVerifyModal, SaveBar } from '../AdminVerify';
import { NpPage, NpBlock, useNpLayout } from '../NpLayout';
import { useNpDemoData, serverOrgIdFor } from '../useNpAdminActions';
import { PREVIEW_NOTE } from './Overview';
import { MONTHLY_FLOOR } from '../../../lib/billing';
import { orgSignup } from '../../../lib/npApi';
import { requestEmailChange, pollConfirmed, syncServerEmail, hasRealSession, isValidEmail, emailDomain } from '../../../lib/emailChange';

const PRESET_COLORS = [
  '#003865', '#0D9488', '#059669', '#2563EB', '#4F46E5',
  '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#F59E0B',
];

// Form controls share one look: 16px text (no iOS zoom), 48px tall on the
// phone / 44 on desktop, 12px radius, line border.
const LABEL = 'text-[11px] font-semibold text-slate uppercase mb-1 block';
const LABEL_STYLE = { letterSpacing: '0.06em' };
function fieldClass(extra = '') {
  return `w-full bg-surface rounded-input px-4 py-3 text-ink outline-none border border-line ${extra}`;
}
const FIELD_STYLE = { fontSize: 16 };

// A plain secondary button inside the modal: surface fill, 44px tall.
const MODAL_BTN = { width: '100%', minHeight: 44, padding: '10px 14px', borderRadius: 12, border: 'none', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 14, cursor: 'pointer' };

/**
 * ChangeAdminEmailModal - the admin twin of the donor change-email flow, with
 * one added rule: a nonprofit admin's new sign-in email MUST stay on the org's
 * admin domain. That is enforced BOTH here (fast client fail) and server-side
 * in the update-donor-email edge function against orgs.admin_domain. Same
 * honest Supabase mechanics as the donor flow (see src/lib/emailChange.js):
 * a real confirmation link, and we poll getUser() until the address flips.
 */
function ChangeAdminEmailModal({ show, onClose, currentEmail, orgId, onChanged }) {
  const [stage, setStage] = useState('enter'); // 'enter' | 'nosession' | 'sent' | 'done'
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const requiredDomain = emailDomain(currentEmail);

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setStage('enter'); setNewEmail(''); setError(null); setSending(false); }, 0);
    return () => clearTimeout(id);
  }, [show]);

  useEffect(() => {
    if (stage !== 'sent') return;
    let cancelled = false;
    const id = setInterval(async () => {
      const { email } = await pollConfirmed();
      if (cancelled) return;
      if (email && email.toLowerCase() === newEmail.trim().toLowerCase()) {
        clearInterval(id);
        await syncServerEmail({ role: 'admin', oldEmail: currentEmail, orgId });
        if (cancelled) return;
        onChanged?.(newEmail.trim());
        setStage('done');
      }
    }, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [stage, newEmail, currentEmail, orgId, onChanged]);

  async function handleSend(e) {
    e?.preventDefault?.();
    const addr = newEmail.trim();
    if (!isValidEmail(addr)) { setError('Enter a valid email address.'); return; }
    if (addr.toLowerCase() === (currentEmail || '').toLowerCase()) { setError('That is already your sign-in email.'); return; }
    // CLIENT domain check. The server enforces the same rule against
    // orgs.admin_domain, so this is a fast courtesy fail, not the boundary.
    if (emailDomain(addr) !== requiredDomain) { setError(`Your admin email must be on the @${requiredDomain} domain.`); return; }
    setSending(true); setError(null);
    if (!(await hasRealSession())) { setSending(false); setStage('nosession'); return; }
    const res = await requestEmailChange(addr);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    setStage('sent');
  }

  if (!show) return null;
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-labelledby="admin-change-email-title"
          style={{ width: 'min(420px,100%)', background: '#fff', borderRadius: 22, padding: 20, boxShadow: 'var(--shadow-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={18} style={{ color: 'var(--teal-ui)' }} aria-hidden />
              <h3 id="admin-change-email-title" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Change sign-in email</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'var(--surface)', width: 44, height: 44, borderRadius: 999, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)', marginRight: -8 }}><X size={16} /></button>
          </div>
          {stage === 'done' ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }} data-testid="admin-change-email-done">
              <CheckCircle size={40} style={{ color: 'var(--green)', margin: '0 auto' }} aria-hidden />
              <p style={{ fontWeight: 800, color: 'var(--ink)', margin: '8px 0 4px' }}>Email updated</p>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 14px' }}>You now sign in with <strong>{newEmail.trim()}</strong>.</p>
              <button type="button" onClick={onClose} style={MODAL_BTN}>Done</button>
            </div>
          ) : stage === 'nosession' ? (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <KeyRound size={32} style={{ color: 'var(--warning)', margin: '0 auto' }} aria-hidden />
              <p style={{ fontWeight: 800, color: 'var(--ink)', margin: '8px 0 4px' }}>Sign in first</p>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 14px' }}>You need to sign in again before changing your email. Sign out and back in, then try again.</p>
              <button type="button" onClick={onClose} style={MODAL_BTN}>Got it</button>
            </div>
          ) : stage === 'sent' ? (
            <div data-testid="admin-change-email-sent">
              <div style={{ background: 'var(--teal-50)', border: '1px solid #99F6E4', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>Check your inbox</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>We sent a confirmation link to <strong>{newEmail.trim()}</strong> and to your current address ({currentEmail}). Open the link in each, then come back  -  we&apos;ll update automatically.</p>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--slate)', textAlign: 'center' }}>Waiting for you to confirm…</p>
              <button type="button" onClick={onClose} style={MODAL_BTN}>Close  -  I&apos;ll finish later</button>
            </div>
          ) : (
            <form onSubmit={handleSend}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-2)' }}>Your sign-in email is <strong>{currentEmail}</strong>. Your new email must be on the <strong>@{requiredDomain}</strong> domain.</p>
              <input type="email" inputMode="email" autoComplete="email" placeholder={`you@${requiredDomain}`}
                value={newEmail} onChange={e => { setNewEmail(e.target.value); setError(null); }}
                data-testid="admin-change-email-input"
                aria-label="New sign-in email"
                aria-invalid={!!error}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '12px 14px', borderRadius: 12, border: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}`, fontSize: 16, marginBottom: 8, color: 'var(--ink)' }} />
              {error && <p data-testid="admin-change-email-error" style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--danger)' }}>{error}</p>}
              <Button type="submit" surface="web" size="md" disabled={!newEmail.trim()} loading={sending}>
                {sending ? 'Sending…' : 'Send confirmation link'}
              </Button>
              <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)', textAlign: 'center' }}>We&apos;ll email a link to confirm it&apos;s really you. Nothing changes until you open it.</p>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// The server's orgs.logo_url only makes sense as a real web address: a blob:
// preview from the file picker exists in this browser alone.
function publicLogoUrl(src) {
  return /^https?:\/\//i.test(src ?? '') ? src : undefined;
}

export default function NpSettings() {
  const { npOrg, setNpOrg, previewAdmin } = useNp();
  const { showToast } = useApp();
  const { web } = useNpLayout();
  const showDemo = useNpDemoData();

  const [name,    setName]    = useState(npOrg.name);
  const [color,   setColor]   = useState(npOrg.color || '#003865');
  const [mission, setMission] = useState(npOrg.mission);
  const [email,   setEmail]   = useState(npOrg.adminEmail);
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [logoPreview, setLogoPreview] = useState(npOrg.logoPreview ?? null);
  const [longDesc, setLongDesc] = useState(npOrg.longDescription ?? '');
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoUrlError, setLogoUrlError] = useState(null);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const fileInputRef = useRef(null);

  // Unsaved-change detection → pinned SaveBar → email verification → commit.
  const dirty =
    name !== npOrg.name ||
    color !== (npOrg.color || '#003865') ||
    mission !== npOrg.mission ||
    email !== npOrg.adminEmail ||
    logoPreview !== (npOrg.logoPreview ?? null) ||
    longDesc !== (npOrg.longDescription ?? '');
  const [verifying, setVerifying] = useState(false);

  function handleSave(e) {
    e?.preventDefault?.();
    if (previewAdmin) { showToast?.(PREVIEW_NOTE); return; }
    if (!dirty || saving) return;
    setVerifying(true);
  }

  async function commitSave() {
    const serverId = serverOrgIdFor(npOrg);
    if (serverId) {
      // A real org: donors read name/mission/color from orgs_public, so the
      // server row has to change first and the local cache only follows a
      // confirmed save. longDescription and logoUrl ride along; the server
      // ignores fields it has no column for.
      setSaving(true);
      const res = await orgSignup({ name, mission, color, longDescription: longDesc, logoUrl: publicLogoUrl(logoPreview) });
      setSaving(false);
      if (!res.ok) {
        setVerifying(false);
        showToast?.(res.status === 401
          ? 'Your admin session has expired. Sign in again to save.'
          : "Couldn't save your changes right now. Please try again.");
        return;
      }
    }
    setNpOrg({ ...npOrg, name, color, mission, adminEmail: email, logoPreview, longDescription: longDesc });
    setVerifying(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  // Defined once, placed differently by each shell: under the branding preview
  // in the desktop left rail (which would otherwise be dead space beside the
  // tall form), at the bottom of the phone's single column.
  const links = (
    <>
      <a
        href="/legal/nonprofit-license/"
        target="_blank"
        rel="noopener"
        className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-2"
        style={{ minHeight: 44 }}
      >
        <ExternalLink size={14} aria-hidden />
        Nonprofit License Agreement
      </a>

      <a
        href="mailto:support@pocketcache.app"
        className="flex items-center justify-center gap-1.5 text-sm text-slate hover:text-ink-2"
        style={{ minHeight: 44 }}
      >
        Contact PocketCache support
      </a>
    </>
  );

  return (
    <NpPage gap={5} cols={2}>
      <NpBlock span="full">
        <>
          <SaveBar show={dirty && !verifying && !previewAdmin} onSave={handleSave} />
          <AdminVerifyModal
            show={verifying}
            adminEmail={npOrg.adminEmail || 'your admin email'}
            onConfirm={commitSave}
            onCancel={() => setVerifying(false)}
          />
          <ChangeAdminEmailModal
            show={showChangeEmail}
            onClose={() => setShowChangeEmail(false)}
            currentEmail={npOrg.adminEmail}
            orgId={npOrg._orgId}
            onChanged={(newAddr) => { setEmail(newAddr); setNpOrg({ ...npOrg, adminEmail: newAddr }); }}
          />
          {/* Eyebrow only on the phone  -  the desktop shell prints a real <h1>. */}
          {!web && <p className="text-[11px] font-semibold text-slate uppercase" style={LABEL_STYLE}>Settings</p>}
        </>
      </NpBlock>

      {/* Branding preview (+ the legal links beneath it on desktop, so the
          left rail is not dead space beside the tall form) */}
      <NpBlock>
        <>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-panel p-5 text-white relative overflow-hidden pc-on-dark"
          style={{ background: `linear-gradient(135deg, ${color} 0%, #001a33 100%)` }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
          <p className="text-white/70 text-[11px] font-semibold uppercase mb-1" style={LABEL_STYLE}>Branding Preview</p>
          <p className="text-white font-bold text-xl relative z-10">{name || 'Your Organization'}</p>
          <p className="text-white/70 text-xs mt-1 relative z-10 leading-relaxed line-clamp-2">{mission}</p>
          <div className="mt-3 flex items-center gap-2 relative z-10">
            <CoinMark size={14} />
            <span className="text-white/70 text-xs">powered by PocketCache</span>
          </div>
        </motion.div>
        {web && <div style={{ marginTop: 16 }}>{links}</div>}
        </>
      </NpBlock>

      {/* Edit form */}
      <NpBlock>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="np-settings-name" className={LABEL} style={LABEL_STYLE}>
              Organization Name
            </label>
            <input
              id="np-settings-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className={fieldClass()}
              style={FIELD_STYLE}
            />
          </div>

          <div>
            <p className={LABEL} style={{ ...LABEL_STYLE, marginBottom: 8 }} id="np-settings-color-label">
              Brand Color
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="np-settings-color-label">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Brand color ${c}`}
                  onClick={() => setColor(c)}
                  className="w-11 h-11 rounded-input border-2 transition-all"
                  style={{ background: c, borderColor: color === c ? 'var(--ink)' : 'transparent', boxShadow: color === c ? '0 0 0 2px #fff inset' : undefined }}
                />
              ))}
              <label
                className="flex items-center justify-center w-11 h-11 rounded-input border-2 cursor-pointer overflow-hidden transition-all"
                style={{ background: color, borderColor: PRESET_COLORS.includes(color) ? 'transparent' : 'var(--ink)' }}
                title="Pick a custom color"
              >
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="opacity-0 w-0 h-0 absolute"
                  aria-label="Custom brand color"
                />
                <span className="text-white text-base font-bold leading-none" style={{ textShadow: '0 0 3px rgba(0,0,0,.5)' }} aria-hidden>+</span>
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="np-settings-mission" className={LABEL} style={LABEL_STYLE}>
              Mission (shown to donors)
            </label>
            <textarea
              id="np-settings-mission"
              value={mission}
              onChange={e => setMission(e.target.value)}
              rows={3}
              maxLength={600}
              className={fieldClass('resize-none')}
              style={FIELD_STYLE}
            />
            <p className="text-slate text-xs text-right mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{mission.length}/600</p>
          </div>

          {/* The monthly minimum is the same for every org (lib/billing). It
              used to be a per-org slider here, which no server field ever read. */}
          <div>
            <p className={LABEL} style={LABEL_STYLE}>Monthly Minimum</p>
            <p className="text-ink text-sm font-semibold">${MONTHLY_FLOOR} for every donor</p>
            <p className="text-slate text-[13px] mt-1">
              Monthly minimum: ${MONTHLY_FLOOR}. Donors under ${MONTHLY_FLOOR} in a month roll forward to the next charge.
            </p>
          </div>

          <div>
            <label htmlFor="np-settings-email" className={LABEL} style={LABEL_STYLE}>
              Admin Email
            </label>
            <input
              id="np-settings-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className={fieldClass()}
              style={FIELD_STYLE}
            />
            {/* The field above edits the org's public admin CONTACT record. To
                change the actual SIGN-IN email (a real Supabase auth change,
                domain-locked to the org), use this. */}
            <button
              type="button"
              onClick={() => setShowChangeEmail(true)}
              data-testid="admin-change-email-open"
              className="mt-1 text-sm font-semibold flex items-center gap-1.5"
              style={{ color: 'var(--teal-700)', minHeight: 44 }}
            >
              <Mail size={14} aria-hidden /> Change sign-in email address
            </button>
          </div>

          <div>
            <p className={LABEL} style={LABEL_STYLE}>Logo</p>
            {logoPreview && (
              <div className="flex items-center gap-3 mb-2">
                <img src={logoPreview} alt="Logo" className="h-10 object-contain rounded-chip bg-surface px-2 py-1" />
                <button type="button" onClick={() => { setLogoPreview(null); setLogoUrlInput(''); }}
                  className="text-xs font-semibold px-2" style={{ color: 'var(--danger)', minHeight: 44 }}>Remove</button>
              </div>
            )}
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setLogoPreview(URL.createObjectURL(f)); }} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-input border-2 border-dashed text-sm font-semibold mb-2"
              style={{ minHeight: 48, borderColor: 'var(--teal-ui)', color: 'var(--teal-700)' }}>
              Upload logo image
            </button>
            <input type="url" placeholder="or paste a logo URL" value={logoUrlInput}
              aria-label="Logo URL"
              onChange={e => setLogoUrlInput(e.target.value)}
              onBlur={e => {
                const url = e.target.value.trim();
                if (!url) return;
                const img = new Image();
                img.onload = () => { setLogoPreview(url); setLogoUrlError(null); };
                img.onerror = () => { setLogoUrlError("We couldn't load that image  -  check the link or upload a file instead"); };
                img.src = url;
              }}
              className={fieldClass()} style={FIELD_STYLE} />
            {logoUrlError && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{logoUrlError}</p>}
            <p className="text-slate text-[13px] mt-1">Shown to donors as your app mark.</p>
          </div>

          <div>
            <label htmlFor="np-settings-story" className={LABEL} style={LABEL_STYLE}>
              Your Landing Page
            </label>
            <p className="text-slate text-[13px] mb-2">
              This appears on your public page at pocketcache.app/{npOrg.joinCode?.toLowerCase() ?? 'your-code'}  -  room for the full story, way beyond the app&apos;s short mission.
            </p>
            <textarea
              id="np-settings-story"
              value={longDesc}
              onChange={e => setLongDesc(e.target.value.slice(0, 5000))}
              rows={6}
              maxLength={5000}
              placeholder="Tell your full story here  -  your history, impact, programs, why you exist…"
              className={fieldClass('resize-none')}
              style={FIELD_STYLE}
            />
            <p className="text-slate text-xs text-right mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{longDesc.length}/5,000</p>
          </div>

          {/* Full-bleed in the phone column; a normal desktop button otherwise. */}
          <div style={{ width: web ? 280 : '100%' }}>
            <Button
              type="submit"
              size="lg"
              surface={web ? 'web' : 'app'}
              disabled={previewAdmin}
              loading={saving}
              onDisabledPress={() => showToast?.(PREVIEW_NOTE)}
              style={saved ? { background: 'var(--green)', color: '#fff' } : undefined}
            >
              {saved
                ? <><CheckCircle size={18} aria-hidden /> Saved!</>
                : saving ? 'Saving…' : 'Save Changes'
              }
            </Button>
            {previewAdmin && <p className="text-slate text-[13px] mt-2">{PREVIEW_NOTE}</p>}
            {showDemo && !previewAdmin && (
              <p className="text-slate text-[13px] mt-2">Demo mode: changes save on this device only.</p>
            )}
          </div>
        </form>
      </NpBlock>

      {/* Legal + support links  -  bottom of the phone column (on desktop they
          already sit in the left rail above) */}
      {!web && <NpBlock span="full">{links}</NpBlock>}
    </NpPage>
  );
}
