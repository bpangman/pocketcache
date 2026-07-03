import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check } from 'lucide-react';
import { useNp } from '../../../store/NpContext';

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
  { num: 3, title: 'You collect every month',  body: "On the 1st of each month, PocketCache tallies round-ups and initiates payment directly to your Stripe account." },
];

export default function Grow() {
  const { npOrg } = useNp();
  const accent   = npOrg.color || '#0D9488';
  const joinCode = npOrg.joinCode || 'BGCA';
  const shareUrl = `https://pocketcache.app/demo/?org=${joinCode}`;
  const embedSnippet = `<script src="https://cdn.pocketcache.app/widget.js" data-org="${joinCode.toLowerCase()}"></script>`;

  return (
    <div className="flex-1 scrollable pc-scrollbar px-4 pb-28 pt-4 space-y-5">
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
        <p className="text-5xl font-black tracking-wider mb-4" style={{ color: accent }}>{joinCode}</p>
        <CopyButton text={joinCode} />
        <p className="text-gray-500 text-xs mt-3">
          Donors enter this code in the PocketCache app to join your program.
        </p>
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
