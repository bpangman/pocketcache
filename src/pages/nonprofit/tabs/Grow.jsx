import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Pencil, Lock } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { useApp } from '../../../store/AppContext';
import { isJoinCodeAvailable, JOIN_CODE_RE, renameCustomOrgCode, applyServerJoinCode } from '../../../store/orgStore';
import { CHARGE_DAY, nextChargeLabel } from '../../../lib/billing';
import { orgSignup, currentSessionEmail } from '../../../lib/npApi';
import { escAttr, safeWidgetColor, WIDGET_DEFAULT_COLOR } from '../../../lib/npSignup';
import CoinMark from '../../../components/CoinMark';
import PocketCacheLogo from '../../../components/PocketCacheLogo';
import Button from '../../../components/ui/Button';
import { AdminVerifyModal, SaveBar } from '../AdminVerify';
import DemoPill from '../DemoPill';
import { NpPage, NpBlock, useNpLayout } from '../NpLayout';
import { useNpDemoData, serverOrgIdFor } from '../useNpAdminActions';
import { PREVIEW_NOTE } from './Overview';
import { copyText } from '../../../lib/clipboard';

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setFailed(true);
      setTimeout(() => setFailed(false), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`${label}${copied ? ' (copied)' : ''}`}
      className="flex items-center gap-1.5 text-[13px] font-semibold px-3 rounded-input transition-colors shrink-0"
      style={{ minHeight: 44, background: copied ? 'var(--green-50)' : failed ? 'var(--danger-50)' : 'var(--surface)', color: copied ? 'var(--green-700)' : failed ? 'var(--danger)' : 'var(--ink-2)' }}
      title={failed ? 'Copy failed  -  select and copy manually' : undefined}
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? 'Copied!' : failed ? 'Try again' : 'Copy'}
    </button>
  );
}

// Section label used throughout this tab: 11px, slate, 0.06em tracking.
function Eyebrow({ children, className = '', style }) {
  return (
    <p className={`text-[11px] font-semibold text-slate uppercase ${className}`} style={{ letterSpacing: '0.06em', ...style }}>
      {children}
    </p>
  );
}

// "11" -> "11th". Keeps the copy readable while the day itself stays owned by
// lib/billing.
function ordinal(n) {
  const teen = n % 100 > 10 && n % 100 < 14;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

// Step 3 quotes the billing schedule, so it is built from lib/billing rather
// than hardcoded: the date an admin is promised money has to be the same date
// the donor is told they will be charged.
function buildSteps() {
  return [
    { num: 1, title: 'Share your code or link',  body: "Donors enter your unique code or scan your QR in the PocketCache app to lock in as your supporter." },
    // Two separate links, not one: Plaid reads the card to count round-ups,
    // Stripe holds the payment method that is actually charged.
    { num: 2, title: 'They link a card once',    body: "Donor links the card to round up from (read-only, via Plaid) and adds a payment method with Stripe. Setup takes under 60 seconds and only happens once." },
    {
      num: 3,
      title: 'You collect every month',
      body: `On the 1st, PocketCache locks the month's round-ups and emails each donor their exact amount; on the ${ordinal(CHARGE_DAY)}, payment initiates directly to your Stripe account. Next run: ${nextChargeLabel()}.`,
    },
  ];
}

// The Grow assets (join code, QR, website widget) belong to an APPROVED org -
// a pending org's page, QR link, and widget do not resolve for donors yet, so
// handing out the assets early would only produce printed QR codes and pasted
// widgets that point at a held-back page. This replaces the whole tab while
// orgs.status is 'pending_review'; the shells' PendingReviewBanner notices
// server-side approval and flips status, which unlocks this automatically.
function GrowPending({ web, accent }) {
  const locked = [
    ['Your donor join code', 'What donors type into PocketCache to find you.'],
    ['Your QR code', 'For posters, newsletters, and event tables.'],
    ['Your website widget', 'The one-line embed for your own site.'],
  ];
  return (
    <NpPage gap={5} cols={2}>
      <NpBlock span="full">
        <>
          {!web && <Eyebrow className="mb-3">Grow your donor base</Eyebrow>}
          <div className="rounded-panel p-6 flex items-start gap-3" style={{ background: 'var(--warning-50)', border: '1px solid #FDE68A' }}>
            <Lock size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} aria-hidden />
            <div>
              <p className="font-bold text-base text-ink">Your growth assets unlock at approval</p>
              <p className="text-sm mt-1.5 leading-relaxed text-ink-2">
                PocketCache is reviewing your organization. The assets below go live - and arrive in
                your launch-kit email - the moment you are approved. Until then your page is held
                back, so donors cannot join yet.
              </p>
            </div>
          </div>
        </>
      </NpBlock>
      {locked.map(([title, body]) => (
        <NpBlock key={title}>
          <div className="bg-white rounded-panel p-5 card-shadow" style={{ opacity: 0.75 }}>
            <Eyebrow className="mb-2">{title}</Eyebrow>
            <div className="rounded-card flex items-center justify-center" style={{ height: 90, background: `${accent}0d`, border: `1px dashed ${accent}55` }}>
              <Lock size={24} style={{ color: accent }} aria-hidden />
            </div>
            <p className="text-slate text-xs mt-3">{body}</p>
          </div>
        </NpBlock>
      ))}
    </NpPage>
  );
}

const DEFAULT_WIDGET_LABEL = 'Start giving →';
const DEFAULT_WIDGET_WIDTH = 340;

export default function Grow() {
  const { npOrg, setNpOrg, previewAdmin } = useNp();
  const { adminRole, setAdminRole, showToast } = useApp();
  const { web } = useNpLayout();
  const showDemo = useNpDemoData();
  const accent   = npOrg.color || '#0D9488';
  const joinCode = npOrg.joinCode || 'BGCA';
  const shareUrl = `https://pocketcache.app/demo/?org=${encodeURIComponent(joinCode)}`;
  const orgDisplayName = npOrg.name || joinCode;
  const steps = buildSteps();
  const surface = web ? 'web' : 'app';

  // ── Join-code editing (custom orgs; established codes go through support) ──
  const isCustomOrg = !!npOrg._orgId;
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState(joinCode);
  const [codeError, setCodeError] = useState(null);
  const [savingCode, setSavingCode] = useState(false);

  function handleCodeDraft(raw) {
    const v = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
    setCodeDraft(v);
    if (!JOIN_CODE_RE.test(v)) setCodeError('Letters, numbers, dashes  -  2 to 8 characters.');
    else if (v !== joinCode && !isJoinCodeAvailable(v, npOrg._orgId)) setCodeError('That code is taken  -  try another.');
    else setCodeError(null);
  }

  // Saving a code change requires email verification (AdminVerifyModal)  -  and
  // the modal repeats the printed-QR warning, so it's impossible to miss.
  const [verifyingCode, setVerifyingCode] = useState(false);
  const codeDirty = editingCode && codeDraft !== joinCode && !codeError && JOIN_CODE_RE.test(codeDraft);

  function requestSaveCode() {
    if (previewAdmin) { showToast?.(PREVIEW_NOTE); return; }
    if (codeError) return;
    if (codeDraft === joinCode) { setEditingCode(false); return; }
    setVerifyingCode(true);
  }

  // Apply a confirmed rename to this device: npOrg, the admin role, the toast.
  function finishRename(newOrgId) {
    setNpOrg({ ...npOrg, joinCode: codeDraft, shortName: codeDraft, _orgId: newOrgId });
    if (adminRole?.orgId === npOrg._orgId) setAdminRole({ ...adminRole, orgId: newOrgId, joinCode: codeDraft });
    setVerifyingCode(false);
    setEditingCode(false);
    showToast?.(`Join code updated to ${codeDraft}. Reprint any QR codes that used the old one.`);
  }

  async function commitCode() {
    const serverId = serverOrgIdFor(npOrg);
    if (!serverId) {
      // Practice / local org: moves the record to a new id (id === current
      // code, lowercased) so the NEW code resolves immediately and the OLD code
      // stops resolving - see orgStore.renameCustomOrgCode.
      const renamed = npOrg._orgId ? renameCustomOrgCode(npOrg._orgId, codeDraft) : null;
      finishRename(renamed?.id ?? npOrg._orgId);
      return;
    }
    // A real org. Donors on other devices resolve codes through orgs_public,
    // so the server has to accept the new code BEFORE anything moves locally.
    // The local availability check above is only a hint: the server's
    // uniqueness check is the one that counts.
    if (!(await currentSessionEmail())) {
      setVerifyingCode(false);
      showToast?.('Sign in as your organization\'s admin to change the code.');
      return;
    }
    setSavingCode(true);
    const res = await orgSignup({ joinCode: codeDraft });
    setSavingCode(false);
    const serverCode = res.data?.org?.join_code;
    if (!res.ok) {
      setVerifyingCode(false);
      showToast?.(res.status === 401
        ? 'Your admin session has expired. Sign in again to change the code.'
        : "Couldn't save the new code right now. Your current code still works.");
      return;
    }
    if (res.data?.joinCodeTaken || serverCode !== codeDraft) {
      setVerifyingCode(false);
      setCodeError('That code is taken  -  try another.');
      showToast?.(`That code is taken. Your code is still ${joinCode}.`);
      return;
    }
    const renamed = applyServerJoinCode(npOrg._orgId, joinCode, codeDraft);
    finishRename(renamed?.id ?? codeDraft.toLowerCase());
  }

  // ── Widget customization (drives the snippet + live preview) ──
  const [widgetColor, setWidgetColor] = useState(safeWidgetColor(accent));
  const [widgetWidth, setWidgetWidth] = useState(DEFAULT_WIDGET_WIDTH);
  const [widgetLabel, setWidgetLabel] = useState(DEFAULT_WIDGET_LABEL);
  // Every value lands inside an HTML attribute on the org's own website, so
  // each is attribute-escaped and the color is only accepted as a hex literal.
  const colorAttr = safeWidgetColor(widgetColor);
  const embedSnippet = `<script src="https://pocketcache.app/widget.js" data-org="${escAttr(joinCode)}" data-name="${escAttr(orgDisplayName)}"`
    + (colorAttr.toLowerCase() !== WIDGET_DEFAULT_COLOR ? ` data-color="${escAttr(colorAttr)}"` : '')
    + (widgetWidth !== DEFAULT_WIDGET_WIDTH ? ` data-width="${widgetWidth}"` : '')
    + (widgetLabel !== DEFAULT_WIDGET_LABEL ? ` data-label="${escAttr(widgetLabel)}"` : '')
    + `></script>`;

  // After every hook above (rules of hooks) - a pending org sees the locked
  // version of this tab instead of assets that do not resolve for donors yet.
  if (npOrg.status === 'pending_review') return <GrowPending web={web} accent={accent} />;

  return (
    <NpPage gap={5} cols={2}>
      <NpBlock span="full">
        <>
          <SaveBar show={codeDirty && !verifyingCode} onSave={requestSaveCode} label="Unsaved join-code change" />
          <AdminVerifyModal
            show={verifyingCode}
            adminEmail={npOrg.adminEmail || 'your admin email'}
            warning={`Changing your code to ${codeDraft} changes your link, QR, AND website widget  -  anything printed with ${joinCode} stops working, and any widget embedded on your website must be re-pasted with the new code.`}
            onConfirm={commitCode}
            onCancel={() => setVerifyingCode(false)}
          />
          {/* Eyebrow only on the phone  -  the desktop shell prints a real <h1>. */}
          {!web && <Eyebrow>Grow your donor base</Eyebrow>}
        </>
      </NpBlock>

      {/* Big join code block */}
      <NpBlock>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-panel p-6 text-center"
          style={{ background: `${accent}14`, border: `1px solid ${accent}40` }}
        >
          <Eyebrow className="mb-2" style={{ color: accent }}>Your Donor Join Code</Eyebrow>
          {editingCode ? (
            <div className="space-y-2">
              <input
                value={codeDraft}
                onChange={e => handleCodeDraft(e.target.value)}
                aria-label="New join code"
                aria-invalid={!!codeError}
                className="w-full text-center text-3xl font-extrabold tracking-wider bg-white rounded-card px-4 py-3 outline-none border-2 font-mono"
                style={{ borderColor: codeError ? 'var(--danger)' : accent, color: accent, minHeight: 48 }}
              />
              {codeError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{codeError}</p>}
              <p className="text-slate text-[13px] text-left leading-relaxed">
                Heads up: changing your code changes your link, QR, AND website widget. Anything
                printed with the old code stops working, and any widget already embedded on your
                website must be re-pasted with the new code.
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  size="md"
                  surface={surface}
                  fullWidth={false}
                  disabled={!!codeError || previewAdmin}
                  loading={savingCode}
                  onDisabledPress={() => previewAdmin && showToast?.(PREVIEW_NOTE)}
                  onClick={requestSaveCode}
                  style={{ fontSize: 14 }}
                >
                  Save new code
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  surface={surface}
                  fullWidth={false}
                  onClick={() => { setEditingCode(false); setCodeDraft(joinCode); setCodeError(null); }}
                  style={{ fontSize: 14 }}
                >
                  Cancel
                </Button>
              </div>
              {previewAdmin && <p className="text-slate text-[13px]">{PREVIEW_NOTE}</p>}
            </div>
          ) : (
            <>
              <p className="text-5xl font-extrabold tracking-wider mb-4" style={{ color: accent }}>{joinCode}</p>
              <div className="flex items-center justify-center gap-2">
                <CopyButton text={joinCode} label="Copy join code" />
                {isCustomOrg ? (
                  <button
                    type="button"
                    onClick={() => { setCodeDraft(joinCode); setEditingCode(true); }}
                    className="flex items-center gap-1.5 text-[13px] font-semibold px-3 rounded-input"
                    style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--ink-2)' }}
                  >
                    <Pencil size={13} aria-hidden /> Change code
                  </button>
                ) : null}
              </div>
              <p className="text-slate text-[13px] mt-3">
                Donors enter this code in the PocketCache app to join your program.
                {!isCustomOrg && ' Established codes are changed through support@pocketcache.app (so printed QR codes don\'t silently break).'}
              </p>
            </>
          )}
        </motion.div>
      </NpBlock>

      {/* QR code */}
      <NpBlock>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white rounded-panel p-5 flex flex-col items-center gap-4 card-shadow"
        >
          <Eyebrow className="self-start">QR Code</Eyebrow>
          <div className="bg-white rounded-card p-3" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-1)' }}>
            <QRCodeSVG value={shareUrl} size={web ? 160 : 120} level="M" includeMargin />
          </div>
          <div className="flex items-center gap-2 w-full bg-surface rounded-input pl-3 pr-1 py-1">
            <span className="text-xs text-ink-2 truncate flex-1 font-mono">{shareUrl}</span>
            <CopyButton text={shareUrl} label="Copy link" />
          </div>
          <p className="text-slate text-[13px] text-center">
            Add this QR to your newsletters, event materials, or website to let supporters join instantly.
          </p>
        </motion.div>
      </NpBlock>

      {/* Embed snippet */}
      <NpBlock span="full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-white rounded-panel p-5 card-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>Website Embed</Eyebrow>
            <CopyButton text={embedSnippet} label="Copy embed code" />
          </div>
          <div className="rounded-card p-4 overflow-x-auto" style={{ background: 'var(--navy-900)' }}>
            <code className="text-xs whitespace-pre-wrap break-all" style={{ color: '#86EFAC' }}>{embedSnippet}</code>
          </div>
          <p className="text-slate text-[13px] mt-3">
            Drop this on your website to show a &quot;Round Up for us&quot; widget that links directly to your program.
            The snippet updates as you customize below  -  copy it whenever it looks right.
          </p>

          {/* Customize + preview. Side by side once there is room for it. */}
          <div style={web ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' } : undefined}>
            <div>
              <Eyebrow className="mt-4 mb-2">Customize</Eyebrow>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label htmlFor="grow-widget-color" className="text-[13px] text-slate w-24 shrink-0">Button color</label>
                  <input id="grow-widget-color" type="color" value={colorAttr} onChange={e => setWidgetColor(e.target.value)}
                    className="h-11 w-14 rounded-chip cursor-pointer" style={{ border: '1px solid var(--line)' }} />
                  <span className="text-xs text-slate font-mono">{colorAttr}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label htmlFor="grow-widget-width" className="text-[13px] text-slate w-24 shrink-0">Width · {widgetWidth}px</label>
                  <input id="grow-widget-width" type="range" min={240} max={600} step={10} value={widgetWidth}
                    onChange={e => setWidgetWidth(Number(e.target.value))} className="flex-1" style={{ accentColor: accent, minHeight: 44 }} />
                </div>
                <div className="flex items-center gap-3">
                  <label htmlFor="grow-widget-label" className="text-[13px] text-slate w-24 shrink-0">Button text</label>
                  <input id="grow-widget-label" type="text" value={widgetLabel} maxLength={40} onChange={e => setWidgetLabel(e.target.value)}
                    className="flex-1 bg-surface rounded-input px-3 text-ink outline-none"
                    style={{ fontSize: 16, minHeight: web ? 44 : 48, border: '1px solid var(--line)' }} />
                </div>
              </div>
            </div>

            {/* Live preview  -  visually identical to what widget.js renders on the org's site */}
            <div>
              <Eyebrow className="mt-4 mb-2">Preview  -  what visitors see</Eyebrow>
              <div className="rounded-card p-4 overflow-x-auto" style={{ background: 'var(--surface)' }}>
                <div style={{ maxWidth: widgetWidth, background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <CoinMark size={30} />
                    <strong style={{ fontSize: 15, color: 'var(--ink)' }}>Round up for {orgDisplayName}</strong>
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)' }}>
                    Spare change from your everyday purchases, sent to us automatically once a month. Takes a minute to set up.
                  </p>
                  <div style={{ textAlign: 'center', padding: '11px 14px', borderRadius: 12, background: `linear-gradient(135deg, ${colorAttr}, #001a33)`, color: '#fff', fontWeight: 700, fontSize: 14 }}>
                    {widgetLabel || DEFAULT_WIDGET_LABEL}
                  </div>
                  <div style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    Powered by <PocketCacheLogo size={11} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Widget performance. The widget does not report clicks yet, so the
              tiles only show the seeded sample numbers in demo mode; a real org
              sees "Not tracked yet" rather than a figure nobody measured. */}
          <Eyebrow className="mt-4 mb-2">Widget performance</Eyebrow>
          <div className="flex items-start gap-3">
            <div className="bg-surface rounded-card px-4 py-3 flex-1">
              <p className="text-slate text-xs font-medium">Website clicks · this month</p>
              <p className="text-ink font-bold text-xl mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {showDemo ? 128 : <span className="text-slate text-sm font-semibold">Not tracked yet</span>}
                {showDemo && <span className="ml-2 align-middle"><DemoPill /></span>}
              </p>
            </div>
            <div className="bg-surface rounded-card px-4 py-3 flex-1">
              <p className="text-slate text-xs font-medium">Donors from widget</p>
              <p className="text-ink font-bold text-xl mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {showDemo ? 9 : <span className="text-slate text-sm font-semibold">Not tracked yet</span>}
                {showDemo && <span className="ml-2 align-middle"><DemoPill /></span>}
              </p>
            </div>
          </div>
          <p className="text-slate text-[13px] mt-2">
            {showDemo
              ? 'Widget attribution is coming soon - these are sample numbers.'
              : 'Widget attribution is coming soon.'}
          </p>
        </motion.div>
      </NpBlock>

      {/* How donors join */}
      <NpBlock span="full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="bg-white rounded-panel p-5 card-shadow"
        >
          <Eyebrow className="mb-4">How Donors Join</Eyebrow>
          <div
            className={web ? undefined : 'space-y-4'}
            style={web ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 } : undefined}
          >
            {steps.map(s => (
              <div key={s.num} className="flex items-start gap-4">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0 mt-0.5"
                  style={{ background: `linear-gradient(135deg, ${accent}, #001a33)` }}
                >
                  {s.num}
                </div>
                <div>
                  <p className="font-bold text-ink text-sm">{s.title}</p>
                  <p className="text-slate text-[13px] mt-0.5 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </NpBlock>
    </NpPage>
  );
}
