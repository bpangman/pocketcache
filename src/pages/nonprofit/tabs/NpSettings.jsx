import { useState, useRef, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, CheckCircle, Mail, X } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import CoinMark from '../../../components/CoinMark';
import { AdminVerifyModal, SaveBar } from '../AdminVerify';
import { NpPage, NpBlock, useNpLayout } from '../NpLayout';
import { requestEmailChange, pollConfirmed, syncServerEmail, hasRealSession, isValidEmail, emailDomain } from '../../../lib/emailChange';

const PRESET_COLORS = [
  '#003865', '#0D9488', '#059669', '#2563EB', '#4F46E5',
  '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#F59E0B',
];

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
          style={{ width: 'min(420px,100%)', background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={18} style={{ color: '#0D9488' }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Change sign-in email</h3>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#f1f5f9', width: 30, height: 30, borderRadius: 999, cursor: 'pointer' }}><X size={15} /></button>
          </div>
          {stage === 'done' ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }} data-testid="admin-change-email-done">
              <div style={{ fontSize: 40 }}>✅</div>
              <p style={{ fontWeight: 800, color: '#0f172a', margin: '8px 0 4px' }}>Email updated</p>
              <p style={{ fontSize: 13, color: '#475569', margin: '0 0 14px' }}>You now sign in with <strong>{newEmail.trim()}</strong>.</p>
              <button onClick={onClose} style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: '#f1f5f9', fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          ) : stage === 'nosession' ? (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 32 }}>🔑</div>
              <p style={{ fontWeight: 800, color: '#0f172a', margin: '8px 0 4px' }}>Sign in first</p>
              <p style={{ fontSize: 13, color: '#475569', margin: '0 0 14px' }}>You need to sign in again before changing your email. Sign out and back in, then try again.</p>
              <button onClick={onClose} style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: '#f1f5f9', fontWeight: 700, cursor: 'pointer' }}>Got it</button>
            </div>
          ) : stage === 'sent' ? (
            <div data-testid="admin-change-email-sent">
              <div style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 14, color: '#0f172a' }}>Check your inbox</p>
                <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.55 }}>We sent a confirmation link to <strong>{newEmail.trim()}</strong> and to your current address ({currentEmail}). Open the link in each, then come back  -  we&apos;ll update automatically.</p>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Waiting for you to confirm…</p>
              <button onClick={onClose} style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: '#f1f5f9', fontWeight: 700, cursor: 'pointer' }}>Close  -  I&apos;ll finish later</button>
            </div>
          ) : (
            <form onSubmit={handleSend}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>Your sign-in email is <strong>{currentEmail}</strong>. Your new email must be on the <strong>@{requiredDomain}</strong> domain.</p>
              <input type="email" inputMode="email" autoComplete="email" placeholder={`you@${requiredDomain}`}
                value={newEmail} onChange={e => { setNewEmail(e.target.value); setError(null); }}
                data-testid="admin-change-email-input"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${error ? '#ef4444' : '#d1d5db'}`, fontSize: 14, marginBottom: 8 }} />
              {error && <p data-testid="admin-change-email-error" style={{ margin: '0 0 8px', fontSize: 12, color: '#dc2626' }}>{error}</p>}
              <button type="submit" disabled={!newEmail.trim() || sending}
                style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', cursor: (!newEmail.trim() || sending) ? 'default' : 'pointer', fontWeight: 700, color: '#fff', opacity: (!newEmail.trim() || sending) ? 0.5 : 1, background: 'linear-gradient(135deg,#0d9488,#003865)' }}>
                {sending ? 'Sending…' : 'Send confirmation link'}
              </button>
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#94a3b8', textAlign: 'center' }}>We&apos;ll email a link to confirm it&apos;s really you. Nothing changes until you open it.</p>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function NpSettings() {
  const { npOrg, setNpOrg } = useNp();
  const { web } = useNpLayout();

  const [name,    setName]    = useState(npOrg.name);
  const [color,   setColor]   = useState(npOrg.color || '#003865');
  const [mission, setMission] = useState(npOrg.mission);
  const [minAmt,  setMinAmt]  = useState(npOrg.monthlyMinimum);
  const [email,   setEmail]   = useState(npOrg.adminEmail);
  const [saved,   setSaved]   = useState(false);
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
    minAmt !== npOrg.monthlyMinimum ||
    email !== npOrg.adminEmail ||
    logoPreview !== (npOrg.logoPreview ?? null) ||
    longDesc !== (npOrg.longDescription ?? '');
  const [verifying, setVerifying] = useState(false);

  function handleSave(e) {
    e?.preventDefault?.();
    if (!dirty) return;
    setVerifying(true);
  }

  function commitSave() {
    setNpOrg({ ...npOrg, name, color, mission, monthlyMinimum: minAmt, adminEmail: email, logoPreview, longDescription: longDesc });
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
        className="flex items-center justify-center gap-1.5 text-sm font-semibold py-2"
        style={{ color: '#374151' }}
      >
        <ExternalLink size={14} />
        Nonprofit License Agreement
      </a>

      <a
        href="mailto:support@pocketcache.app"
        className="flex items-center justify-center gap-1.5 text-sm py-2 text-gray-400 hover:text-gray-600"
      >
        Contact PocketCache support
      </a>
    </>
  );

  return (
    <NpPage gap={5} cols={2}>
      <NpBlock span="full">
        <>
          <SaveBar show={dirty && !verifying} onSave={handleSave} />
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
          {!web && <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Settings</p>}
        </>
      </NpBlock>

      {/* Branding preview (+ the legal links beneath it on desktop, so the
          left rail is not dead space beside the tall form) */}
      <NpBlock>
        <>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${color} 0%, #001a33 100%)` }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Branding Preview</p>
          <p className="text-white font-bold text-xl relative z-10">{name || 'Your Organization'}</p>
          <p className="text-white/60 text-xs mt-1 relative z-10 leading-relaxed line-clamp-2">{mission}</p>
          <div className="mt-3 flex items-center gap-2 relative z-10">
            <CoinMark size={14} />
            <span className="text-white/50 text-xs">powered by PocketCache</span>
          </div>
        </motion.div>
        {web && <div style={{ marginTop: 18 }}>{links}</div>}
        </>
      </NpBlock>

      {/* Edit form */}
      <NpBlock>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">
              Organization Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">
              Brand Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-9 h-9 rounded-xl border-2 transition-all"
                  style={{ background: c, borderColor: color === c ? '#111827' : 'transparent' }}
                />
              ))}
              <label
                className="flex items-center justify-center w-9 h-9 rounded-xl border-2 cursor-pointer overflow-hidden transition-all"
                style={{ background: color, borderColor: PRESET_COLORS.includes(color) ? 'transparent' : '#111827' }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="opacity-0 w-0 h-0 absolute"
                />
                <span className="text-white text-xs font-bold leading-none" style={{ textShadow: '0 0 3px rgba(0,0,0,.5)' }}>+</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">
              Mission (shown to donors)
            </label>
            <textarea
              value={mission}
              onChange={e => setMission(e.target.value)}
              rows={3}
              maxLength={600}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400 resize-none"
            />
            <p className="text-gray-400 text-xs text-right mt-0.5">{mission.length}/600</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">
              Monthly Minimum  -  ${minAmt}
            </label>
            <input
              type="range" min={5} max={50} step={5}
              value={minAmt}
              onChange={e => setMinAmt(Number(e.target.value))}
              className="w-full accent-teal-600"
            />
            <p className="text-gray-400 text-xs mt-1">
              Donors below this in a month roll over to the next. Default $5.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">
              Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400"
            />
            {/* The field above edits the org's public admin CONTACT record. To
                change the actual SIGN-IN email (a real Supabase auth change,
                domain-locked to the org), use this. */}
            <button
              type="button"
              onClick={() => setShowChangeEmail(true)}
              data-testid="admin-change-email-open"
              className="mt-2 text-sm font-semibold text-teal-600 flex items-center gap-1.5"
            >
              <Mail size={14} /> Change sign-in email address
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Logo</label>
            {logoPreview && (
              <div className="flex items-center gap-3 mb-2">
                <img src={logoPreview} alt="Logo" className="h-10 object-contain rounded-lg bg-gray-100 px-2 py-1" />
                <button type="button" onClick={() => { setLogoPreview(null); setLogoUrlInput(''); }}
                  className="text-xs text-red-400 font-semibold">Remove</button>
              </div>
            )}
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setLogoPreview(URL.createObjectURL(f)); }} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-teal-300 text-teal-600 text-sm font-semibold mb-2">
              Upload logo image
            </button>
            <input type="url" placeholder="or paste a logo URL" value={logoUrlInput}
              onChange={e => setLogoUrlInput(e.target.value)}
              onBlur={e => {
                const url = e.target.value.trim();
                if (!url) return;
                const img = new Image();
                img.onload = () => { setLogoPreview(url); setLogoUrlError(null); };
                img.onerror = () => { setLogoUrlError("We couldn't load that image  -  check the link or upload a file instead"); };
                img.src = url;
              }}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none border border-gray-200 focus:border-teal-400" />
            {logoUrlError && <p className="text-red-500 text-xs mt-1">{logoUrlError}</p>}
            <p className="text-gray-400 text-xs mt-1">Shown to donors as your app mark.</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">
              Your Landing Page
            </label>
            <p className="text-gray-400 text-xs mb-2">
              This appears on your public page at pocketcache.app/{npOrg.joinCode?.toLowerCase() ?? 'your-code'}  -  room for the full story, way beyond the app&apos;s short mission.
            </p>
            <textarea
              value={longDesc}
              onChange={e => setLongDesc(e.target.value.slice(0, 5000))}
              rows={6}
              maxLength={5000}
              placeholder="Tell your full story here  -  your history, impact, programs, why you exist…"
              className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400 resize-none"
            />
            <p className="text-gray-400 text-xs text-right mt-0.5">{longDesc.length}/5,000</p>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            className="py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-colors"
            // Full-bleed in the phone column; a normal desktop button otherwise.
            style={{ background: saved ? '#059669' : `linear-gradient(135deg, ${color}, #001a33)`, width: web ? 280 : '100%' }}
          >
            {saved
              ? <><CheckCircle size={18} /> Saved!</>
              : 'Save Changes'
            }
          </motion.button>
        </form>
      </NpBlock>

      {/* Legal + support links  -  bottom of the phone column (on desktop they
          already sit in the left rail above) */}
      {!web && <NpBlock span="full">{links}</NpBlock>}
    </NpPage>
  );
}
