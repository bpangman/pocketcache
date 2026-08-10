// src/lib/shake.js
//
// Shake-to-toggle-demo-mode detector. Wired ONCE at the app shell level
// (src/components/AppShell.jsx) - the donor shakes the phone and demo mode
// flips on or off (see AppContext's demoMode / setDemoMode).
//
// HOW DETECTION WORKS (round-4 hardening)
// We listen to the standard `devicemotion` event and measure the magnitude of
// `accelerationIncludingGravity` between samples. A real shake produces
// several large direction reversals in under a second, so the detector keeps
// a ROLLING WINDOW of recent "spikes" (delta magnitude above SPIKE_THRESHOLD)
// and fires once SPIKES_TO_FIRE of them land inside SPIKE_WINDOW_MS.
//
// Tuning notes, in the order they matter on a real phone:
//   - SPIKE_THRESHOLD is 9 m/s^2 (was 14). 14 required a genuinely violent
//     shake on some devices - a normal two-flick wrist shake peaks around
//     12-20 m/s^2 of delta, so real shakes were being dropped. 9 catches
//     every deliberate flick while staying far above walking/handling noise
//     (typically under 5-6).
//   - MIN_SPIKE_GAP_MS de-bounces the spike count itself: one hard jolt can
//     put several CONSECUTIVE samples over threshold (~16ms apart at 60Hz),
//     and counting those as 3 "spikes" would fire on a single bump. Samples
//     over threshold within 60ms of the last counted spike are the same
//     movement, counted once. A two-flick shake still lands 3+ countable
//     spikes comfortably inside the window (each flick = accelerate +
//     reverse, ~100-200ms apart).
//   - REFRACTORY_MS: after a fire, ALL samples are ignored for 1.5s and the
//     window is cleared, so one vigorous shake can never double-fire - the
//     tail of the same shake lands inside the refractory period and dies.
//
// LIFECYCLE
// iOS/WKWebView can quietly stop delivering devicemotion after the app is
// backgrounded or the tab is frozen. The hook re-attaches its listener (a
// no-op when still attached - same function reference) and resets the
// detector state on visibilitychange->visible and on pageshow (bfcache
// restore). Resetting matters as much as re-attaching: the first sample
// after a long gap would otherwise diff against a stale magnitude and count
// a phantom spike.
//
// iOS PERMISSION
// iOS 13+ gates motion data behind DeviceMotionEvent.requestPermission(),
// which may only show its PROMPT from a user gesture. So on platforms where
// that function exists, the hook waits for the first tap anywhere in the
// shell, asks inside that gesture, and only then attaches the motion
// listener. The grant persists for the browsing session: once granted we
// remember it (sessionStorage), and any later mount of this hook re-requests
// immediately - a no-prompt resolve on an already-granted session - so the
// listener survives AppShell unmount/remount without waiting for another
// tap. If the donor declines - or the browser has no motion events at all -
// the hook quietly does nothing and the Settings toggle remains the only way
// to flip demo mode. Nothing about that fallback is an error.
//
// TESTABILITY
// The detector reads plain `devicemotion` events off `window`, so a test (or
// Playwright) can simulate a shake by dispatching synthetic events carrying
// accelerationIncludingGravity - no real hardware needed.

import { useEffect, useRef } from 'react';

const SPIKE_THRESHOLD = 9;    // m/s^2 of delta between samples that counts as a spike
const SPIKES_TO_FIRE = 3;     // countable spikes required inside the window
const SPIKE_WINDOW_MS = 1000; // rolling window the spikes must land in
const MIN_SPIKE_GAP_MS = 60;  // over-threshold samples closer than this are ONE movement
const REFRACTORY_MS = 1500;   // one toggle per shake - everything in here is ignored

// Session marker: the iOS motion permission was granted at least once this
// browsing session, so a fresh mount may re-request without a user gesture
// (the prompt only exists the first time; later calls resolve silently).
const GRANT_KEY = 'pc_motion_granted';

function sessionGranted() {
  try { return window.sessionStorage.getItem(GRANT_KEY) === '1'; } catch { return false; }
}
function rememberGrant() {
  try { window.sessionStorage.setItem(GRANT_KEY, '1'); } catch { /* storage blocked - grant just won't persist */ }
}

/**
 * Attach a shake listener for the life of the component.
 * @param {Function} onShake - called once per detected shake.
 */
export function useShakeDetector(onShake) {
  const cbRef = useRef(onShake);
  // Keep the latest callback without re-attaching listeners (ref write in an
  // effect, never during render).
  useEffect(() => { cbRef.current = onShake; });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') {
      return undefined; // no motion events here - Settings toggle only
    }

    let lastMag = null;
    let spikes = [];       // timestamps of counted spikes, newest last
    let lastFired = 0;
    let detached = false;

    function resetDetector() {
      lastMag = null;
      spikes = [];
    }

    function onMotion(e) {
      const a = e.accelerationIncludingGravity ?? e.acceleration;
      if (!a || a.x == null) return;
      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      const prev = lastMag;
      lastMag = mag;
      if (prev === null) return;
      const now = Date.now();
      // Refractory: the tail of the shake that just fired must die here.
      if (now - lastFired < REFRACTORY_MS) { spikes = []; return; }
      const delta = Math.abs(mag - prev);
      if (delta <= SPIKE_THRESHOLD) return;
      // One physical jolt spans several consecutive over-threshold samples -
      // count it once.
      if (spikes.length > 0 && now - spikes[spikes.length - 1] < MIN_SPIKE_GAP_MS) return;
      spikes.push(now);
      spikes = spikes.filter(t => now - t < SPIKE_WINDOW_MS);
      if (spikes.length >= SPIKES_TO_FIRE) {
        lastFired = now;
        spikes = [];
        cbRef.current?.();
      }
    }

    function attach() {
      if (detached) return;
      // Same function reference: addEventListener de-dupes, so calling this
      // from every lifecycle hook is safe and keeps exactly one listener.
      window.addEventListener('devicemotion', onMotion);
    }

    // WKWebView/Safari can drop motion delivery across background/foreground
    // and bfcache restores - re-attach and reset on every return to the
    // foreground so the first post-resume sample never diffs a stale value.
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      resetDetector();
      attach();
    }
    function onPageShow() {
      resetDetector();
      attach();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);

    // iOS 13+: the permission PROMPT must come from a user gesture. Once this
    // session has granted, request immediately (resolves silently) so the
    // listener survives shell remounts without a fresh tap.
    let gestureHandler = null;
    const needsPermission = typeof window.DeviceMotionEvent.requestPermission === 'function';

    function removeGestureListeners() {
      if (!gestureHandler) return;
      window.removeEventListener('click', gestureHandler, true);
      window.removeEventListener('touchend', gestureHandler, true);
      gestureHandler = null;
    }

    function armGestureListeners() {
      if (detached || gestureHandler) return;
      gestureHandler = () => {
        removeGestureListeners();
        window.DeviceMotionEvent.requestPermission()
          .then(state => {
            if (state === 'granted') { rememberGrant(); attach(); }
            // 'denied' is final for this session - settings toggle only.
          })
          .catch(() => {
            // The call itself failed (some browsers throw outside a "real"
            // gesture) - re-arm so the next tap tries again instead of
            // silently losing the feature for the whole session.
            armGestureListeners();
          });
      };
      window.addEventListener('click', gestureHandler, true);
      window.addEventListener('touchend', gestureHandler, true);
    }

    if (!needsPermission) {
      attach();
    } else if (sessionGranted()) {
      // Already granted this session: no prompt will be shown, so this is
      // safe outside a gesture. If it unexpectedly fails, fall back to the
      // normal first-tap flow.
      window.DeviceMotionEvent.requestPermission()
        .then(state => { if (state === 'granted') attach(); else if (state !== 'denied') armGestureListeners(); })
        .catch(() => armGestureListeners());
    } else {
      armGestureListeners();
    }

    return () => {
      detached = true;
      window.removeEventListener('devicemotion', onMotion);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      removeGestureListeners();
    };
  }, []);
}
