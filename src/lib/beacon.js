// src/lib/beacon.js
//
// Fire-and-forget product-event beacon. Publishes to ntfy.sh (which feeds the
// platform admin console's live activity view) when real activity happens
// (waitlist joins, nonprofit go-live, etc). Never throws, never awaited
// meaningfully by the caller, never blocks the UI, and never carries donor/user
// PII - the ntfy topic is discoverable in the page source.
//
// As of 2026-08-01, the Mac-side watcher that used to relay these events is
// retired. Every event now also goes out as EMAIL to blake@pocketcache.app
// via FormSubmit.co - a second, separate fire-and-forget POST alongside the
// ntfy publish below. No local Mac process is involved in either path.
//
// The Apps Script waitlist endpoint is NOT used here: a pipe audit on
// 2026-08-01 found it returns HTTP 403 (Access Denied) for every request
// right now, waitlist or otherwise - it is broken, not merely schema-locked.
// Wiring a generic beacon into a dead endpoint would add a dependency on
// something that already does not work.

const NTFY_URL = 'https://ntfy.sh/pocketcache-wl-x7k2m9q4';

// FormSubmit delivery needs Blake's one-time FormSubmit activation click
// (activation email sent 2026-08-01) before it will actually send - until
// then it returns a "needs activation" response, which is expected and
// harmless for a fire-and-forget call. The destination address is visible in
// site source (same trust level as the ntfy topic name). If spam becomes a
// problem, swap in the FormSubmit "random string alias" endpoint (shown to
// Blake after he activates) without changing anything else in this file.
const FORMSUBMIT_URL = 'https://formsubmit.co/ajax/blake@pocketcache.app';

// Supabase events table - a permanent, PII-free activity log that the
// platform admin console reads back directly from the browser. The anon key
// below is public by design (Supabase's anon key is meant to be shipped in
// client-side source, same trust level as the ntfy topic name above) - it is
// scoped by row-level security policies on the events table to insert and
// select only, and that table never stores donor/user PII.
const SUPABASE_EVENTS_URL = 'https://yeptifozaytoglfwxksz.supabase.co/rest/v1/events';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHRpZm96YXl0b2dsZnd4a3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDI4ODYsImV4cCI6MjEwMTM3ODg4Nn0.ZnQZXdXIVO6s0yuIN74ihkgPsDVqoxkTk0LIykBZo9U';

/** Only fire on the real production host - stay silent on localhost, preview
 *  deploys, and any test/SSR runner where window/document don't exist. */
function isProdBrowser() {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      window.location.hostname === 'pocketcache.app'
    );
  } catch {
    return false;
  }
}

/** Compact one-line body from a flat detail object. Never include personal
 *  emails or names - org names and join codes are fine. */
function formatDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  return Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

/**
 * Fire a product event notification. Safe to call from anywhere - never
 * throws, never returns a promise the caller needs to handle.
 *
 * @param {string} event  short event name, e.g. 'nonprofit signup'
 * @param {object} [detail] flat key/value pairs for the notification body
 */
export function pcBeacon(event, detail) {
  try {
    if (!isProdBrowser()) return;
    const body = formatDetail(detail) || event;
    fetch(NTFY_URL, {
      method: 'POST',
      body,
      headers: { Title: `PocketCache: ${event}` },
    }).catch(() => {});

    fetch(FORMSUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _subject: `PocketCache: ${event}`, event, ...detail }),
    }).catch(() => {});

    fetch(SUPABASE_EVENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ event, detail: detail || {} }),
    }).catch(() => {});
  } catch {
    // Never let a beacon failure touch the caller.
  }
}
