// src/lib/beacon.js
//
// Fire-and-forget product-event beacon. Pings ntfy.sh so Blake gets a phone
// notification when real activity happens (waitlist joins, nonprofit go-live,
// etc). Never throws, never awaited meaningfully by the caller, never blocks
// the UI, and never carries donor/user PII.
//
// The Apps Script waitlist endpoint is NOT used here: a pipe audit on
// 2026-08-01 found it returns HTTP 403 (Access Denied) for every request
// right now, waitlist or otherwise - it is broken, not merely schema-locked.
// Wiring a generic beacon into a dead endpoint would add a dependency on
// something that already does not work, so this only ever talks to ntfy.

const NTFY_URL = 'https://ntfy.sh/pocketcache-wl-x7k2m9q4';

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
  } catch {
    // Never let a beacon failure touch the caller.
  }
}
