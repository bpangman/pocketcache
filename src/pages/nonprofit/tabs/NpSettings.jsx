import { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { LogOut, ExternalLink, CheckCircle } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import { useApp } from '../../../store/AppContext';
import CoinMark from '../../../components/CoinMark';

const PRESET_COLORS = [
  '#003865', '#0D9488', '#059669', '#2563EB', '#4F46E5',
  '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#F59E0B',
];

export default function NpSettings() {
  const { npOrg, setNpOrg, npSignOut } = useNp();
  const { setPage } = useApp();

  const [name,    setName]    = useState(npOrg.name);
  const [color,   setColor]   = useState(npOrg.color || '#003865');
  const [mission, setMission] = useState(npOrg.mission);
  const [minAmt,  setMinAmt]  = useState(npOrg.monthlyMinimum);
  const [email,   setEmail]   = useState(npOrg.adminEmail);
  const [saved,   setSaved]   = useState(false);

  function handleSave(e) {
    e.preventDefault();
    setNpOrg({ ...npOrg, name, color, mission, monthlyMinimum: minAmt, adminEmail: email });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  function handleSignOut() {
    npSignOut(setPage);
  }

  return (
    <div className="flex-1 scrollable px-4 pb-28 pt-4 space-y-5">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Settings</p>

      {/* Branding preview */}
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

      {/* Edit form */}
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
            Monthly Minimum — ${minAmt}
          </label>
          <input
            type="range" min={5} max={50} step={5}
            value={minAmt}
            onChange={e => setMinAmt(Number(e.target.value))}
            className="w-full accent-teal-600"
          />
          <p className="text-gray-400 text-xs mt-1">
            Donors below this in a month roll over to the next. Default $10.
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
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-colors"
          style={{ background: saved ? '#059669' : `linear-gradient(135deg, ${color}, #001a33)` }}
        >
          {saved
            ? <><CheckCircle size={18} /> Saved!</>
            : 'Save Changes'
          }
        </motion.button>
      </form>

      {/* Legal link */}
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

      {/* Sign out */}
      <div className="border-t border-gray-100 pt-4">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-50 text-left"
        >
          <LogOut size={18} className="text-red-400 shrink-0" />
          <span className="flex-1 text-red-500 font-semibold text-sm">Sign out of dashboard</span>
        </button>
        <p className="text-center text-gray-400 text-xs mt-3">
          Returns to the PocketCache home screen. Your data and donor program remain intact.
        </p>
      </div>
    </div>
  );
}
