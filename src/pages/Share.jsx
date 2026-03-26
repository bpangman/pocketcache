import { motion } from 'framer-motion';
import { Share2, Copy, Mail, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import Logo from '../components/Logo';

export default function Share() {
  const { selectedNonprofit, totalDonated } = useApp();
  const brand = useTheme();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  if (!selectedNonprofit) return null;

  const shareText = `I've donated $${totalDonated.toFixed(2)} to ${selectedNonprofit.name} through ${brand.appName} — an app that rounds up every purchase and gives the change to charity. Join me! 💙`;
  const shareUrl = 'https://getspareapp.com';
  const referralCode = 'ALEX-GIVES';

  function handleCopy() {
    navigator.clipboard?.writeText(`${shareText}\n${shareUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyCode() {
    navigator.clipboard?.writeText(referralCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const SHARE_OPTIONS = [
    {
      label: 'Copy Link',
      icon: copied ? <CheckCircle size={20} /> : <Copy size={20} />,
      color: brand.primary,
      onPress: handleCopy,
    },
    {
      label: 'Share via...',
      icon: <Share2 size={20} />,
      color: '#6366f1',
      onPress: () => navigator.share?.({ title: brand.appName, text: shareText, url: shareUrl }),
    },
    {
      label: 'Email a Friend',
      icon: <Mail size={20} />,
      color: '#10b981',
      onPress: () => window.open(`mailto:?subject=Join me on ${brand.appName}&body=${encodeURIComponent(shareText + '\n' + shareUrl)}`),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pt-14 pb-5"
      >
        <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Share</h1>
        <p className="text-white/70 text-sm mt-0.5">Spread the word</p>
      </motion.div>

      <div className="flex-1 scrollable px-4 pb-28 pt-4 space-y-4">

        {/* Impact card preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl overflow-hidden card-shadow"
        >
          {/* Shareable card */}
          <div className="p-6 text-white relative overflow-hidden" style={{ background: brand.gradient }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                {brand.logoEmoji ? (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base bg-white/20">{brand.logoEmoji}</div>
                ) : <Logo size={28} />}
                <span className="font-bold text-white">{brand.appName}</span>
              </div>
              <p className="text-white/80 text-sm mb-2">I've donated</p>
              <p className="text-5xl font-bold">${totalDonated.toFixed(2)}</p>
              <p className="text-white/80 text-sm mt-2">to {selectedNonprofit.name}</p>
              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-white/70 text-xs">{selectedNonprofit.impact}</p>
              </div>
            </div>
          </div>
          <div className="bg-white px-5 py-3 flex items-center gap-2">
            <span className="text-2xl">{selectedNonprofit.logo}</span>
            <p className="text-gray-500 text-xs flex-1">Every purchase I make rounds up and donates the change 💙</p>
          </div>
        </motion.div>

        {/* Share message preview */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-5 card-shadow"
        >
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">Message Preview</p>
          <p className="text-gray-700 text-sm leading-relaxed">{shareText}</p>
          <p className="text-sm font-semibold mt-2" style={{ color: brand.primary }}>{shareUrl}</p>
        </motion.div>

        {/* Share buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-3xl overflow-hidden card-shadow"
        >
          {SHARE_OPTIONS.map((opt, i) => (
            <div key={opt.label}>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={opt.onPress}
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
              >
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: opt.color + '18', color: opt.color }}>
                  {opt.icon}
                </div>
                <p className="font-semibold text-gray-900 text-sm">{opt.label}</p>
              </motion.button>
              {i < SHARE_OPTIONS.length - 1 && <div className="h-px bg-gray-50 mx-5" />}
            </div>
          ))}
        </motion.div>

        {/* Referral */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-3xl p-5 text-white"
          style={{ background: brand.gradient }}
        >
          <p className="font-bold text-base mb-1">Refer a Friend</p>
          <p className="text-white/80 text-sm leading-relaxed mb-4">
            When a friend joins using your link and makes their first round-up, {brand.appName} donates an extra $1 to your cause on their behalf.
          </p>
          <div className="bg-white/20 rounded-2xl px-4 py-3 flex items-center justify-between">
            <span className="font-mono text-white font-bold tracking-wider text-sm">{referralCode}</span>
            <button
              onClick={handleCopyCode}
              className="bg-white/20 rounded-xl px-3 py-1.5 text-white text-xs font-semibold"
            >
              {codeCopied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
