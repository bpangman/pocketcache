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
import Button from './ui/Button';

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
      <div className="bg-white rounded-card p-4 card-shadow" data-testid="name-prompt-card">
        <p className="font-bold text-ink text-sm">👋 What should we call you?</p>
        <p className="text-slate text-[13px] mt-1 leading-relaxed">
          Just a first name is perfect - it is how we say hello. You can change it anytime from your account.
        </p>
        <form onSubmit={submit} className="flex gap-2 mt-3">
          <input
            type="text"
            value={value}
            maxLength={60}
            onChange={e => setValue(e.target.value)}
            placeholder="Your first name"
            aria-label="Your first name"
            className="flex-1 min-w-0 rounded-input px-3 outline-none text-ink"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 16, height: 48 }}
            data-testid="name-prompt-input"
          />
          <Button type="submit" size="md" fullWidth={false} disabled={!value.trim()} data-testid="name-prompt-save">
            Save
          </Button>
        </form>
        <button type="button" onClick={markDone} className="text-slate text-[13px] font-medium mt-1 -mb-2 min-h-[44px]" data-testid="name-prompt-later">
          Maybe later
        </button>
      </div>
    );
  }

  // 'web' - the portal's card chrome (mirrors WebDashboard's CARD constant).
  return (
    <div
      style={{
        background: '#fff', borderRadius: 'var(--r-md)', border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-1)', padding: '16px 20px', marginBottom: 20,
      }}
      data-testid="name-prompt-card"
    >
      <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>👋 What should we call you?</p>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.55 }}>
        Just a first name is perfect - it is how we say hello. You can change it anytime in Settings.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 12, maxWidth: 420 }}>
        <input
          type="text"
          value={value}
          maxLength={60}
          onChange={e => setValue(e.target.value)}
          placeholder="Your first name"
          aria-label="Your first name"
          style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '0 12px', height: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 16, color: 'var(--ink)', outline: 'none' }}
          data-testid="name-prompt-input"
        />
        <Button type="submit" size="md" surface="web" fullWidth={false} disabled={!value.trim()} data-testid="name-prompt-save">
          Save
        </Button>
        <Button type="button" variant="tertiary" size="md" surface="web" fullWidth={false} onClick={markDone} data-testid="name-prompt-later">
          Not now
        </Button>
      </form>
    </div>
  );
}
