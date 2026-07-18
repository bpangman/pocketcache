import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { useApp } from '../../../store/AppContext';
import { getCustomOrg, saveCustomOrg, isJoinCodeAvailable, JOIN_CODE_RE } from '../../../store/orgStore';
import CoinMark from '../../../components/CoinMark';
import PocketCacheLogo from '../../../components/PocketCacheLogo';
import { AdminVerifyModal, SaveBar } from '../AdminVerify';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
      style={{ background: copied ? '#d1fae5' : '#f3f4f6', color: copied ? '#065f46' : '#374151' }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

const STEPS = [
  { num: 1, title: 'Share your code or link',  body: "Donors enter your unique code or scan your QR in the PocketCache app to lock in as your supporter." },
  { num: 2, title: 'They link a card once',    body: "Donor connects a debit or credit card through Plaid. Setup takes under 60 seconds and only happens once." },
  { num: 3, title: 'You collect every month',  body: "On the 1st, PocketCache locks the month's round-ups and emails each donor their exact amount; on the 11th, payment initiates directly to your Stripe account." },
];

export default function Grow() {
  const { npOrg, setNpOrg } = useNp();
  const { adminRole, setAdminRole, showToast } = useApp();
  const accent   = npOrg.color || '#0D9488';
  const joinCode = npOrg.joinCode || 'BGCA';
  const shareUrl = `https://pocketcache.app/demo/?org=${joinCode}`;
  const orgDisplayName = npOrg.name || joinCode;

  // ── Join-code editing (custom orgs; established codes go through support) ──
  const isCustomOrg = !!npOrg._orgId;
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState(joinCode);
  const [codeError, setCodeError] = useState(null);

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
    if (codeError) return;
    if (codeDraft === joinCode) { setEditingCode(false); return; }
    setVerifyingCode(true);
  }

  function commitCode() {
    const record = getCustomOrg(npOrg._orgId);
    if (record) saveCustomOrg({ ...record, shortName: codeDraft });
    setNpOrg({ ...npOrg, joinCode: codeDraft });
    if (adminRole?.orgId === npOrg._orgId) setAdminRole({ ...adminRole, joinCode: codeDraft });
    setVerifyingCode(false);
    setEditingCode(false);
    showToast?.(`Join code updated to ${codeDraft}. Reprint any QR codes that used the old one.`);
  }

  // ── Widget customization (drives the snippet + live preview) ──
  const [widgetColor, setWidgetColor] = useState(accent);
  const [widgetWidth, setWidgetWidth] = useState(340);
  const [widgetLabel, setWidgetLabel] = useState('Start giving →');
  const embedSnippet = `<script src="https://pocketcache.app/widget.js" data-org="${joinCode}" data-name="${orgDisplayName}"`
    + (widgetColor.toLowerCase() !== '#003865' ? ` data-color="${widgetColor}"` : '')
    + (widgetWidth !== 340 ? ` data-width="${widgetWidth}"` : '')
    + (widgetLabel !== 'Start giving →' ? ` data-label="${widgetLabel}"` : '')
    + `></script>`;

  return (
    <div className="flex-1 scrollable pc-scrollbar px-4 pb-28 pt-4 space-y-5">
      <SaveBar show={codeDirty && !verifyingCode} onSave={requestSaveCode} label="Unsaved join-code change" />
      <AdminVerifyModal
        show={verifyingCode}
        adminEmail={npOrg.adminEmail || 'your admin email'}
        warning={`Changing your code to ${codeDraft} changes your link, QR, AND website widget  -  anything printed with ${joinCode} stops working, and any widget embedded on your website must be re-pasted with the new code.`}
        onConfirm={commitCode}
        onCancel={() => setVerifyingCode(false)}
      />
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Grow your donor base</p>

      {/* Big join code block */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-3xl p-6 text-center"
        style={{ background: `linear-gradient(135deg, ${accent}18, ${accent}08)`, border: `2px solid ${accent}40` }}
      >
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>
          Your Donor Join Code
        </p>
        {editingCode ? (
          <div className="space-y-2">
            <input
              value={codeDraft}
              onChange={e => handleCodeDraft(e.target.value)}
              className="w-full text-center text-3xl font-black tracking-wider bg-white rounded-2xl px-4 py-3 outline-none border-2 font-mono"
              style={{ borderColor: codeError ? '#ef4444' : accent, color: accent }}
            />
            {codeError && <p className="text-red-500 text-xs">{codeError}</p>}
            <p className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-left">
              Heads up: changing your code changes your link, QR, AND website widget. Anything
              printed with the old code stops working, and any widget already embedded on your
              website must be re-pasted with the new code.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={requestSaveCode} disabled={!!codeError}
                className="px-4 py-2 rounded-xl text-white text-xs font-bold"
                style={{ background: accent, opacity: codeError ? 0.4 : 1 }}>
                Save new code
              </button>
              <button onClick={() => { setEditingCode(false); setCodeDraft(joinCode); setCodeError(null); }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-5xl font-black tracking-wider mb-4" style={{ color: accent }}>{joinCode}</p>
            <div className="flex items-center justify-center gap-2">
              <CopyButton text={joinCode} />
              {isCustomOrg ? (
                <button
                  onClick={() => { setCodeDraft(joinCode); setEditingCode(true); }}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700"
                >
                  ✏️ Change code
                </button>
              ) : null}
            </div>
            <p className="text-gray-500 text-xs mt-3">
              Donors enter this code in the PocketCache app to join your program.
              {!isCustomOrg && ' Established codes are changed through support@pocketcache.app (so printed QR codes don’t silently break).'}
            </p>
          </>
        )}
      </motion.div>

      {/* QR code */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="bg-white rounded-3xl p-5 flex flex-col items-center gap-4 card-shadow"
      >
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest self-start">QR Code</p>
        <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
          <QRCodeSVG value={shareUrl} size={120} level="M" includeMargin />
        </div>
        <div className="flex items-center gap-2 w-full bg-gray-50 rounded-xl px-3 py-2.5">
          <span className="text-xs text-gray-500 truncate flex-1 font-mono">{shareUrl}</span>
          <CopyButton text={shareUrl} />
        </div>
        <p className="text-gray-400 text-xs text-center">
          Add this QR to your newsletters, event materials, or website to let supporters join instantly.
        </p>
      </motion.div>

      {/* Embed snippet */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="bg-white rounded-3xl p-5 card-shadow"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Website Embed</p>
          <CopyButton text={embedSnippet} />
        </div>
        <div className="bg-gray-900 rounded-2xl p-4 overflow-x-auto">
          <code className="text-green-400 text-xs whitespace-pre-wrap break-all">{embedSnippet}</code>
        </div>
        <p className="text-gray-400 text-xs mt-3">
          Drop this on your website to show a &quot;Round Up for us&quot; widget that links directly to your program.
          The snippet updates as you customize below  -  copy it whenever it looks right.
        </p>

        {/* Customize */}
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2">Customize</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-24 shrink-0">Button color</label>
            <input type="color" value={widgetColor} onChange={e => setWidgetColor(e.target.value)}
              className="h-8 w-14 rounded cursor-pointer border border-gray-200" />
            <span className="text-xs text-gray-400 font-mono">{widgetColor}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-24 shrink-0">Width · {widgetWidth}px</label>
            <input type="range" min={240} max={600} step={10} value={widgetWidth}
              onChange={e => setWidgetWidth(Number(e.target.value))} className="flex-1 accent-teal-600" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-24 shrink-0">Button text</label>
            <input type="text" value={widgetLabel} maxLength={40} onChange={e => setWidgetLabel(e.target.value)}
              className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none border border-gray-200 focus:border-teal-400" />
          </div>
        </div>

        {/* Live preview  -  visually identical to what widget.js renders on the org's site */}
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2">Preview  -  what visitors see</p>
        <div className="rounded-2xl p-4 overflow-x-auto" style={{ background: '#f1f5f9' }}>
          <div style={{ maxWidth: widgetWidth, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(11,42,74,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <CoinMark size={30} />
              <strong style={{ fontSize: 14.5, color: '#0f172a' }}>Round up for {orgDisplayName}</strong>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#475569' }}>
              Spare change from your everyday purchases, sent to us automatically once a month. Takes a minute to set up.
            </p>
            <div style={{ textAlign: 'center', padding: '11px 14px', borderRadius: 12, background: `linear-gradient(135deg, ${widgetColor}, #001a33)`, color: '#fff', fontWeight: 700, fontSize: 14 }}>
              {widgetLabel || 'Start giving →'}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 10.5, color: '#94a3b8', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              Powered by <PocketCacheLogo size={11} />
            </p>
          </div>
        </div>

        {/* Widget performance */}
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2">Widget performance</p>
        <div className="flex items-start gap-3">
          <div className="bg-gray-50 rounded-2xl px-4 py-3 flex-1">
            <p className="text-gray-400 text-xs font-medium">Website clicks · this month</p>
            <p className="text-gray-900 font-bold text-xl mt-0.5">128
              <span className="ml-2 align-middle inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Demo data</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-2xl px-4 py-3 flex-1">
            <p className="text-gray-400 text-xs font-medium">Donors from widget</p>
            <p className="text-gray-900 font-bold text-xl mt-0.5">9
              <span className="ml-2 align-middle inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Demo data</span>
            </p>
          </div>
        </div>
        <p className="text-gray-400 text-xs mt-2">
          Every widget click is tagged, so you&apos;ll see real counts here from day one of launch.
        </p>
      </motion.div>

      {/* How donors join */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="bg-white rounded-3xl p-5 card-shadow"
      >
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">How Donors Join</p>
        <div className="space-y-4">
          {STEPS.map(s => (
            <div key={s.num} className="flex items-start gap-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 mt-0.5"
                style={{ background: `linear-gradient(135deg, ${accent}, #001a33)` }}
              >
                {s.num}
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{s.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
