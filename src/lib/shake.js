// src/lib/shake.js
//
// Shake-to-toggle-demo-mode detector. Wired ONCE at the app shell level
// (src/components/AppShell.jsx) - the donor shakes the phone and demo mode
// flips on or off (see AppContext's demoMode / setDemoMode).
//
// HOW DETECTION WORKS
// We listen to the standard `devicemotion` event and measure the magnitude of
// `accelerationIncludingGravity` between samples. A real shake produces
// several large direction reversals in under a second, so the detector counts
// "spikes" (delta magnitude above SHAKE_THRESHOLD) and fires once
// SHAKE_SPIKES of them land inside SHAKE_WINDOW_MS. A cooldown stops one
// vigorous shake from toggling the mode twice.
//
// iOS PERMISSION
// iOS 13+ gates motion data behind DeviceMotionEvent.requestPermission(),
// which may ONLY be called from a user gesture. So on platforms where that
// function exists, the hook waits for the first tap anywhere in the shell
// (a one-shot capture-phase listener), asks for permission inside that
// gesture, and only then attaches the motion listener. If the donor declines
// - or the browser has no motion events at all - the hook quietly does
// nothing and the Settings toggle remains the only way to flip demo mode.
// Nothing about that fallback is an error.
//
// TESTABILITY
// The detector reads plain `devicemotion` events off `window`, so a test (or
// Playwright) can simulate a shake by dispatching synthetic DeviceMotionEvent
// objects with large alternating accelerations - no real hardware needed.

import { useEffect, useRef } from 'react';

const SHAKE_THRESHOLD = 14; // m/s^2 of delta between samples that counts as a spike
const SHAKE_SPIKES = 3;     // spikes required inside the window
const SHAKE_WINDOW_MS = 900;
const COOLDOWN_MS = 1600;   // one toggle per shake, not one per wrist-flick

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
    let spikes = [];
    let lastFired = 0;
    let detached = false;

    function onMotion(e) {
      const a = e.accelerationIncludingGravity ?? e.acceleration;
      if (!a || a.x == null) return;
      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      if (lastMag !== null) {
        const delta = Math.abs(mag - lastMag);
        const now = Date.now();
        if (delta > SHAKE_THRESHOLD) {
          spikes.push(now);
          spikes = spikes.filter(t => now - t < SHAKE_WINDOW_MS);
          if (spikes.length >= SHAKE_SPIKES && now - lastFired > COOLDOWN_MS) {
            lastFired = now;
            spikes = [];
            cbRef.current?.();
          }
        }
      }
      lastMag = mag;
    }

    function attach() {
      if (detached) return;
      window.addEventListener('devicemotion', onMotion);
    }

    // iOS 13+: permission must be requested inside a user gesture. One-shot
    // tap listener; declined or failed -> quietly give up (Settings toggle
    // still works, per the graceful-fallback requirement).
    let gestureHandler = null;
    const needsPermission = typeof window.DeviceMotionEvent.requestPermission === 'function';
    if (needsPermission) {
      gestureHandler = () => {
        window.removeEventListener('click', gestureHandler, true);
        window.removeEventListener('touchend', gestureHandler, true);
        window.DeviceMotionEvent.requestPermission()
          .then(state => { if (state === 'granted') attach(); })
          .catch(() => { /* declined/unavailable - settings toggle only */ });
      };
      window.addEventListener('click', gestureHandler, true);
      window.addEventListener('touchend', gestureHandler, true);
    } else {
      attach();
    }

    return () => {
      detached = true;
      window.removeEventListener('devicemotion', onMotion);
      if (gestureHandler) {
        window.removeEventListener('click', gestureHandler, true);
        window.removeEventListener('touchend', gestureHandler, true);
      }
    };
  }, []);
}
