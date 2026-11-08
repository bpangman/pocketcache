// src/lib/demo.js
//
// The one answer to "should this surface show demo scaffolding?" - the
// Demo-code hint on the gate, the fake QR scan, the demo admin link, the Plaid
// test-credential hint, the simulated Apple Pay card, the typed-in card form,
// the bank-debit option. Three independent switches, any one of which turns
// the affordances on:
//
//   DEMO_BUILD       - a build made with VITE_DEMO=1 (the pitch / preview
//                      build). Production builds leave it unset.
//   DemoShellContext - true inside the marketing PhoneFrame demo shell
//                      (src/App.jsx wraps the frame in the provider), so the
//                      pocketcache.app landing demo keeps every affordance
//                      while the same screens in the real app do not.
//   demoMode         - the donor's own Settings toggle / shake gesture.
//
// Outside all three (a production build, the real app or web portal, demo
// mode off) the affordances are hidden and real donors see only real paths.
//
// No imports from src/store/ here, on purpose: this module is imported by
// components that the store itself renders, and a cycle would be easy to
// create by accident.
import { createContext, useContext } from 'react';

/** Build-time flag: `VITE_DEMO=1 npm run build` produces the demo build. */
export const DEMO_BUILD = import.meta.env.VITE_DEMO === '1';

/** True inside the marketing PhoneFrame demo shell. Default false. */
export const DemoShellContext = createContext(false);

/** Are we rendering inside the PhoneFrame demo shell? */
export function useInDemoShell() {
  return useContext(DemoShellContext);
}

/**
 * Should demo-only controls and copy render on this surface?
 * @param {boolean} [demoMode] - the donor's demo-mode toggle (demoActive).
 * @returns {boolean}
 */
export function useShowDemoAffordances(demoMode) {
  const inDemoShell = useInDemoShell();
  return DEMO_BUILD || inDemoShell || !!demoMode;
}
