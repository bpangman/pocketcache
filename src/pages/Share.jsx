import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Share2, Copy, Mail, CheckCircle, Flame } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useTheme } from '../store/ThemeContext';
import Logo from '../components/Logo';
import OrgLogo from '../components/OrgLogo';
import { monthsGiving, FIRST_MONTH_LABEL } from '../data/derived';
import { fmtMoney } from '../lib/format';
import { copyText } from '../lib/clipboard';
import { safeBottomAtLeast } from '../lib/safeArea';

export default function Share() {
  const { selectedNonprofit, totalDonated, showToast, demoActive } = useApp();
  const brand = useTheme();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  if (!selectedNonprofit) return null;

  const orgCode = selectedNonprofit.id?.toUpperCase() ?? 'BGCA';
  // The link a donor shares is the ORG's link and nothing else. There used to
  // be a per-user referral code (&ref=ALEX-GIVES) attached to it, backed by a
  // "we waive their first month's fee" promise - the code was a demo constant
  // the backend never issued and the waiver was never built, so both are gone.
  // shareUrl is the functional deep-link (public/404.html also rewrites the
  // short pocketcache.app/{CODE} form to it); displayUrl is the shortened form
  // for display only. Copy always copies the full URL so it works when shared.
  const shareUrl = `https://pocketcache.app/demo/?org=${orgCode}`;
  const displayUrl = `pocketcache.app/demo/?org=${orgCode.toLowerCase()}`;

  // Legal note: PocketCache is a technology vendor  -  it does not make donations
  // or solicitations. Share copy positions it as the tool, not the benefactor.
  const shareText = `I give to ${selectedNonprofit.name} with every purchase I make - spare change that actually adds up. You should try it too. 💙`;

  async function handleCopy() {
    const ok = await copyText(`${shareText}\n${shareUrl}`);
    if (ok) {
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2500);
    }
  }

  // navigator.share is missing on plenty of browsers, and even where it exists
  // the call can reject for a real reason (no share targets registered,
  // permission denied). A user-cancelled share (AbortError) is silent by
  // design - anything else falls back to copying the link, with an honest
  // toast either way.
  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: brand.appName, text: shareText, url: shareUrl });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
        // fall through to the clipboard fallback below
      }
    }
    const ok = await copyText(`${shareText}\n${shareUrl}`);
    showToast(ok ? 'Link copied instead - paste it anywhere' : 'Could not share or copy - select and copy manually');
  }

  // NOT window.open(): inside the Capacitor WKWebView a mailto: through
  // window.open() is routinely blocked and fails silently. Assigning
  // location.href hands the URL to the OS, the same way AppShell's Help &
  // Support row does. Subject is encoded too - a space-bearing app name used
  // to go into the URL raw.
  function emailFriend() {
    window.location.href = 'mailto:?subject=' + encodeURIComponent('Join me on ' + brand.appName)
      + '&body=' + encodeURIComponent(shareText + '\n' + shareUrl);
  }

  // One tint for all three chips (brand.primary - navy under BGCA): the old
  // textAccent / secondary pair put BGCA red on two of them.
  const SHARE_OPTIONS = [
    {
      label: copyFailed ? 'Copy failed - try again' : copied ? 'Copied!' : 'Copy Link',
      icon: copied ? <CheckCircle size={18} /> : <Copy size={18} />,
      onPress: handleCopy,
    },
    {
      label: 'Share via...',
      icon: <Share2 size={18} />,
      onPress: handleShare,
    },
    {
      label: 'Email a Friend',
      icon: <Mail size={18} />,
      onPress: emailFriend,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <motion.div
        animate={{ background: brand.headerGradient }}
        transition={{ duration: 0.6 }}
        className="px-5 pb-5"
        style={{ paddingTop: 'calc(var(--pc-safe-top) + 12px)' }}
      >
        <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.3px' }}>Share</h1>
        <p className="text-white/70 text-sm mt-0.5">Spread the word</p>
      </motion.div>

      <div className="flex-1 scrollable pc-scrollbar px-4 pt-4 space-y-4" style={{ paddingBottom: safeBottomAtLeast(112, 106) }}>

        {/* Impact card preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-panel overflow-hidden card-shadow"
        >
          <div className="p-6 text-white relative overflow-hidden pc-on-dark" style={{ background: brand.gradient }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                {brand.brandLogoUrl ? (
                  <div className="w-8 h-8 rounded-input flex items-center justify-center overflow-hidden bg-white">
                    <img src={brand.brandLogoUrl} alt={brand.appName} className="w-full h-full object-contain p-1" style={{ display: 'block' }} />
                  </div>
                ) : brand.logoEmoji ? (
                  <div className="w-8 h-8 rounded-input flex items-center justify-center text-base bg-white/20">{brand.logoEmoji}</div>
                ) : <Logo size={28} />}
                <span className="font-bold text-white">{brand.appName}</span>
              </div>
              <p className="text-white/80 text-sm mb-2">I&apos;ve donated</p>
              {/* fmtMoney, not toFixed(2): this card gets screenshotted, and above
                  $999 toFixed rendered "1234.56" while Home read "1,234.56". */}
              <p className="text-5xl font-bold tabular-nums" style={{ lineHeight: 1.2 }}>${fmtMoney(totalDonated)}</p>
              <p className="text-white/80 text-sm mt-2">to {selectedNonprofit.name}</p>
              {/* This card is PUBLIC - a donor sends this link to friends, so it
                  must never show a demo number for a real account. A real
                  account with no charge history yet reads the same honest
                  "first month" framing the dashboards use, with no streak
                  badge; demo mode keeps the streak, clearly labeled, exactly
                  like everywhere else the same demo total shows up. */}
              {!demoActive ? (
                <p className="text-white/70 text-xs mt-3">{FIRST_MONTH_LABEL}</p>
              ) : (
                <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 rounded-pill px-3 py-1">
                  <Flame size={13} className="text-amber-300" />
                  <span className="text-white/90 text-xs font-semibold">{monthsGiving}-month giving streak · Demo data</span>
                </div>
              )}
              <div className="mt-3 pt-4 border-t border-white/20">
                <p className="text-white/70 text-xs">{selectedNonprofit.impact}</p>
              </div>
            </div>
          </div>
          <div className="bg-white px-5 py-3 flex items-center gap-2">
            {/* The real org logo, like every other screen  -  not the raw emoji */}
            <OrgLogo nonprofit={selectedNonprofit} size={7} rounded="lg" />
            <p className="text-slate text-[13px] flex-1">Spare change from every purchase - it adds up. 💙</p>
          </div>
        </motion.div>

        {/* Share message preview */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-card p-4 card-shadow"
        >
          <p className="text-slate text-[11px] font-semibold uppercase tracking-[0.06em] mb-3">Message Preview</p>
          <p className="text-ink-2 text-sm leading-relaxed">{shareText}</p>
          {/* displayUrl is a shortened form of shareUrl for readability */}
          <p className="text-sm font-semibold mt-2 break-all" style={{ color: brand.textAccent }}>{displayUrl}</p>
        </motion.div>

        {/* Share buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-card overflow-hidden card-shadow"
        >
          {SHARE_OPTIONS.map((opt, i) => (
            <div key={opt.label}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={opt.onPress}
                className="w-full flex items-center gap-4 px-4 py-3 min-h-[56px] text-left"
              >
                <div className="w-9 h-9 rounded-input flex items-center justify-center shrink-0"
                  style={{ background: `${brand.primary}14`, color: brand.primary }}>
                  {opt.icon}
                </div>
                <p className="font-semibold text-ink text-sm">{opt.label}</p>
              </motion.button>
              {i < SHARE_OPTIONS.length - 1 && <div className="h-px bg-line mx-4" />}
            </div>
          ))}
        </motion.div>

      </div>
    </div>
  );
}
