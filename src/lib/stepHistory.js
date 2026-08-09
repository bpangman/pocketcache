// src/lib/stepHistory.js
//
// ─── Hardware/browser back for a state-driven app with no router ─────────────
//
// WHY THIS EXISTS
// Nothing in this codebase ever calls history.pushState - every screen change
// is a plain useState (AppContext's page/tab, each wizard's own `step`, each
// sheet's own `show` boolean). That means the hardware/browser back button has
// never done anything useful: there is no history entry to go back TO, so it
// either lands on about:blank or exits the app outright.
//
// This file does not add a router. It adds ONE small primitive - a global
// history stack, LIFO like the real one - that a wizard or a sheet can opt
// into with a single hook call. Popping it never invents a new transition: it
// always calls the exact same function the screen's own in-UI back
// control/close button already calls, so hardware back and the on-screen
// button stay perfectly in sync by construction.
//
// THE ONE RULE THIS FILE FOLLOWS
// Every flow instance (a wizard, a sheet) keeps AT MOST ONE entry of its own
// on the shared stack at a time - the one entry that represents "how do I
// undo being here". Whenever the flow's value changes for ANY reason (a
// forward tap, an in-UI back tap, or hardware back itself), that one entry is
// replaced, never accumulated. That is what keeps a long forward run followed
// by a browser-back-mashing session from ever drifting out of sync or
// requiring more than one press per step - see the two effects below for the
// exact bookkeeping.
//
// A sheet opened ON TOP of a wizard pushes its own entry AFTER the wizard's,
// so it naturally sits on top of the ONE shared stack and is what a popstate
// pops first - "close the topmost sheet, else step the wizard back" falls out
// of using a single shared stack for everything, no type-checking required.

import { useEffect, useRef } from 'react';

// One LIFO for the whole app - browser history really is one stack per tab,
// so tracking it as one stack here (instead of scoping per flow) is what
// makes cross-flow ordering (sheet-over-wizard) correct for free.
const stack = [];
let seq = 0;

// Set for the lifetime of "we are currently reacting to a popstate", so the
// value-change it triggers (e.g. a wizard's setStep(prev) inside its own
// back()) is recognised as already-handled instead of being pushed again as
// a fresh forward step - THAT double-bookkeeping is exactly the kind of loop
// this file has to avoid.
let suppressNextPush = false;
// Reentrancy guard: if an onBack handler somehow triggers another popstate
// synchronously (it should never call history.back() itself - nothing here
// does), this drops the nested call instead of recursing.
let handlingPop = false;
let listenerInstalled = false;

function installListener() {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;
  window.addEventListener('popstate', () => {
    if (handlingPop) return;
    const entry = stack.pop();
    // Nothing of ours was showing - let the browser do whatever it would
    // have done anyway (leave the app / land on about:blank), unchanged from
    // today. We only ever intercept back while one of our own entries is on
    // top.
    if (!entry) return;
    handlingPop = true;
    suppressNextPush = true;
    try {
      entry.onBack();
    } finally {
      handlingPop = false;
      // Effects run asynchronously after the state change above commits, so
      // the flag has to survive past this line - the effect below is the
      // normal path that clears it. This is only the safety net for an
      // onBack() that turns out to be a no-op (e.g. the very first step's
      // exit handler is itself a no-op because there is nowhere to exit to):
      // with nothing to consume the flag, it would otherwise stay stuck
      // `true` and wrongly swallow the next, unrelated push.
      setTimeout(() => { suppressNextPush = false; }, 0);
    }
  });
}

/** Push one entry and return an idempotent remover for it. */
function pushEntry(onBackRef) {
  const entry = { onBack: () => onBackRef.current() };
  seq += 1;
  window.history.pushState({ pcHist: seq }, '');
  stack.push(entry);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const idx = stack.indexOf(entry);
    if (idx !== -1) stack.splice(idx, 1);
  };
}

/**
 * useStepHistory - wire ONE flow instance's forward/back transitions to the
 * browser/hardware back button.
 *
 * @param {*}        value    The flow's current position - a wizard's step
 *                             string, or a sheet's open/closed marker (see
 *                             useSheetHistory below). Any change is treated
 *                             as "the flow moved" and gets its own entry;
 *                             direction (forward vs back) does not matter,
 *                             which is what lets an in-UI back tap and a
 *                             hardware back press stay interchangeable.
 * @param {function} onBack   EXACTLY the function the flow's own in-UI back
 *                             control / close button already calls (a
 *                             wizard's `back()`, a sheet's `onClose`). Read
 *                             fresh through a ref on every call, so a stale
 *                             closure never fires - the transition it
 *                             performs always matches the CURRENT value, not
 *                             whatever value was current when it was pushed.
 * @param {object}   [opts]
 * @param {boolean}  [opts.active=true]  False suspends this flow (no entry
 *                             kept on the stack) without needing to unmount
 *                             the hook - e.g. a sheet that is currently
 *                             closed.
 */
export function useStepHistory(value, onBack, { active = true } = {}) {
  const onBackRef = useRef(onBack);
  // Kept current in its own effect, not during render - refs are read only
  // later, from the async popstate handler, so there is no need for this to
  // be synchronous with render, and writing a ref's `.current` while
  // rendering is exactly what react-hooks/refs flags.
  useEffect(() => { onBackRef.current = onBack; });
  // This hook instance's OWN single entry, if it currently has one, tagged
  // with the value it represents. Private per instance (a plain ref, not the
  // module-level stack) so replacing/removing it can never touch an entry
  // that belongs to some other flow, e.g. a sheet layered on top.
  const ownRef = useRef(null); // { value, remove } | null

  useEffect(() => { installListener(); }, []);

  useEffect(() => {
    if (suppressNextPush) {
      // We got here because a popstate just fired and called this flow's own
      // onBack, which changed `value` - the entry that represented where we
      // WERE has already been popped by the listener itself. Nothing to
      // remove; fall through to record a fresh entry for where we landed, so
      // the next hardware-back still has something to pop.
      suppressNextPush = false;
      ownRef.current = null;
    } else if (ownRef.current?.value === value) {
      // Unchanged. Covers React StrictMode's synchronous dev-only double
      // invoke of a fresh effect (setup, teardown-that-is-a-no-op, setup
      // again for the same value) as well as an `active` flip back to a
      // value this instance already represents - neither is a real move.
      return;
    } else if (ownRef.current) {
      // A real move away from wherever this instance's one entry was - drop
      // it before (maybe) recording the new position, so a flow never
      // accumulates more than its single current entry no matter how many
      // forward taps, in-UI back taps, or hardware presses got it here.
      ownRef.current.remove();
      ownRef.current = null;
    }
    if (active) {
      ownRef.current = { value, remove: pushEntry(onBackRef) };
    }
  }, [value, active]);
}

/**
 * useSheetHistory - convenience wrapper matching Sheet.jsx's own public API
 * (`show`, `onClose`) exactly, so wiring it in once there covers every sheet
 * built on top of Sheet.jsx for free instead of touching each one.
 *
 * Push while shown; nothing while hidden. Closing through the sheet's own UI
 * (X button, scrim tap, Cancel) drops the entry immediately (see the `active`
 * branch in useStepHistory above) rather than leaving it for hardware-back to
 * find later - so a hardware-back press right after an in-UI close steps the
 * PAGE back, instead of trying to close a sheet that is already closed.
 */
export function useSheetHistory(show, onClose) {
  useStepHistory(show ? 'pc-sheet-open' : 'pc-sheet-closed', onClose, { active: show });
}
