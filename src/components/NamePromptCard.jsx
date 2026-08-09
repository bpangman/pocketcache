// One-time "What should we call you?" prompt (round-3 item 7c).
//
// Shown on the dashboard of BOTH surfaces to an existing signed-in donor
// whose account has no stored display name - the state every pre-feature
// account (and every Apple private-relay signup) is in, where greetings used
// to read the email local part ("Hello safjbdwkfbd"). Answering stores the
// name server-side (donor_profiles.display_name via AppContext's
// saveDisplayName) and locally in pc_identity, so every greeting and profile
// row on both surfaces picks it up at once. Dismissing marks the prompt done
// (pc_name_prompt_done) so it never nags - the profile card / Settings keep
// an edit affordance for later.
//
// `variant`: 'app' renders the phone card language (rounded-3xl, tailwind),
// 'web' the portal card language (inline styles matching WebDashboard CARD).

import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { loadKey, saveKey } from '../store/identityStore';
import { greetingNameFor } from '../lib/donorAuth';

export default function NamePromptCard({ variant = 'app' }) {
  const { hasAccount, donorProfile, saveDisplayName } = useApp();
  const [dismissed, setDismissed] = useState(() => !!loadKey('pc_name_prompt_done', false));
  const [value, setValue] = useState('');

  // Only for a signed-in donor whose name is genuinely unknown: the server
  // profile has answered (donorProfile fetched), stores no display_name, and
  // the local identity has no trustworthy name either (a real local name
  // would be backfilled up by AppContext's sync effect instead).
  const show = !dismissed
    && hasAccount
    && donorProfile !== null
    && !donorProfile?.display_name
    && !greetingNameFor(hasAccount);
  if (!show) return null;

  function markDone() {
    saveKey('pc_name_prompt_done', true);
    setDismissed(true);
  }

  function submit(e) {
    e?.preventDefault?.();
    if (value.trim()) saveDisplayName(value);
    markDone();
  }

  if (variant === 'app') {
    return (
      <div className="bg-white rounded-3xl p-5 card-shadow" data-testid="name-prompt-card">
        <p className="font-bold text-gray-900 text-sm">👋 What should we call you?</p>
        <p className="text-gray-400 text-xs mt-1 leading-relaxed">
          Just a first name is perfect - it is how we say hello. You can change it anytime from your account.
        </p>
        <form onSubmit={submit} className="flex gap-2 mt-3">
          <input
            type="text"
            value={value}
            maxLength={60}
            onChange={e => setValue(e.target.value)}
            placeholder="Your first name"
            className="flex-1 min-w-0 bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200 focus:border-blue-400 text-gray-900"
            data-testid="name-prompt-input"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-4 py-2.5 rounded-xl text-white text-sm font-bold shrink-0"
            style={{ background: value.trim() ? 'linear-gradient(135deg, #0B2A4A, #003865)' : '#d1d5db' }}
            data-testid="name-prompt-save"
          >
            Save
          </button>
        </form>
        <button onClick={markDone} className="text-gray-400 text-xs font-medium mt-2" data-testid="name-prompt-later">
          Maybe later
        </button>
      </div>
    );
  }

  // 'web' - the portal's card chrome (mirrors WebDashboard's CARD constant).
  return (
    <div
      style={{
        background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
        boxShadow: '0 1px 2px rgba(11,42,74,0.04)', padding: '16px 20px', marginBottom: 20,
      }}
      data-testid="name-prompt-card"
    >
      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#0f172a' }}>👋 What should we call you?</p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.55 }}>
        Just a first name is perfect - it is how we say hello. You can change it anytime in Settings.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 12, maxWidth: 420 }}>
        <input
          type="text"
          value={value}
          maxLength={60}
          onChange={e => setValue(e.target.value)}
          placeholder="Your first name"
          style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 13.5, color: '#0f172a', outline: 'none' }}
          data-testid="name-prompt-input"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          style={{
            padding: '9px 16px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13, color: '#fff',
            cursor: value.trim() ? 'pointer' : 'default', flexShrink: 0,
            background: value.trim() ? 'linear-gradient(135deg, #0B2A4A, #003865)' : '#d1d5db',
          }}
          data-testid="name-prompt-save"
        >
          Save
        </button>
        <button
          type="button"
          onClick={markDone}
          style={{ padding: '9px 10px', borderRadius: 10, border: 'none', background: 'transparent', fontSize: 12.5, color: '#94a3b8', cursor: 'pointer', flexShrink: 0 }}
          data-testid="name-prompt-later"
        >
          Not now
        </button>
      </form>
    </div>
  );
}
