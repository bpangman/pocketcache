import { useState, useRef } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { ExternalLink, CheckCircle } from 'lucide-react';
import { useNp } from '../../../store/NpContext';
import CoinMark from '../../../components/CoinMark';

const PRESET_COLORS = [
  '#003865', '#0D9488', '#059669', '#2563EB', '#4F46E5',
  '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#F59E0B',
];

export default function NpSettings() {
  const { npOrg, setNpOrg } = useNp();

  const TEXT_SCALE_OPTIONS = [
    { value: 0.85, label: 'Smaller' },
    { value: 1,    label: 'Default' },
    { value: 1.1,  label: 'Large' },
    { value: 1.2,  label: 'XL' },
  ];
  const [textScale, setTextScaleState] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem('pc_text_scale'));
      return [0.85, 1, 1.1, 1.2].includes(v) ? v : 1;
    } catch { return 1; }
  });
  function handleTextScale(v) {
    localStorage.setItem('pc_text_scale', String(v));
    setTextScaleState(v);
    window.dispatchEvent(new CustomEvent('pc-text-scale-change', { detail: v }));
  }

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
  const fileInputRef = useRef(null);

  function handleSave(e) {
    e.preventDefault();
    setNpOrg({ ...npOrg, name, color, mission, monthlyMinimum: minAmt, adminEmail: email, logoPreview, longDescription: longDesc });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div className="flex-1 scrollable pc-scrollbar px-4 pb-28 pt-4 space-y-5">
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
              img.onerror = () => { setLogoUrlError("We couldn't load that image — check the link or upload a file instead"); };
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
            This appears on your public page at pocketcache.app/{npOrg.joinCode?.toLowerCase() ?? 'your-code'} — room for the full story, way beyond the app&apos;s short mission.
          </p>
          <textarea
            value={longDesc}
            onChange={e => setLongDesc(e.target.value.slice(0, 5000))}
            rows={6}
            maxLength={5000}
            placeholder="Tell your full story here — your history, impact, programs, why you exist…"
            className="w-full bg-gray-50 rounded-2xl px-4 py-3.5 text-sm outline-none border border-gray-200 focus:border-teal-400 resize-none"
          />
          <p className="text-gray-400 text-xs text-right mt-0.5">{longDesc.length}/5,000</p>
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

      {/* Text Size preference */}
      <div className="bg-white rounded-3xl px-4 py-4 space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Text Size</p>
        <div className="flex gap-1.5">
          {TEXT_SCALE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleTextScale(opt.value)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
              style={textScale === opt.value
                ? { background: '#003865', color: '#fff' }
                : { background: '#f3f4f6', color: '#6b7280' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-gray-400 text-xs">You can also use your phone&apos;s system zoom.</p>
      </div>

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

      <a
        href="mailto:support@pocketcache.app"
        className="flex items-center justify-center gap-1.5 text-sm py-2 text-gray-400 hover:text-gray-600"
      >
        Contact PocketCache support
      </a>

    </div>
  );
}
