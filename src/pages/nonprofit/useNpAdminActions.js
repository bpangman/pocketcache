import { useApp } from '../../store/AppContext';
import { useNp } from '../../store/NpContext';
import { findOrgByCode, getCustomOrg } from '../../store/orgStore';
import { useShowDemoAffordances } from '../../lib/demo';

/**
 * Should the admin tabs show demoData.js (the fabricated donors, charge runs
 * and stats)? Only when the donor's own demo-mode toggle is on (pc_demo_mode,
 * Settings or shake), inside the demo build / marketing demo shell, or during
 * the read-only "preview the admin side" tour. Everywhere else - a real org,
 * and the seeded BGCA too - the tabs render honest empty states until
 * server-backed stats exist. Gating on the org id would be wrong: BGCA is the
 * launch partner and will be a real org.
 */
export function useNpDemoData() {
  const { demoMode } = useApp();
  const { previewAdmin } = useNp();
  const demoAffordances = useShowDemoAffordances(demoMode);
  return demoAffordances || !!previewAdmin;
}

/**
 * The server row id (orgs.id) behind the admin's npOrg, or null for a seeded
 * or practice-mode org that only exists on this device. Settings, Grow and
 * the Overview card use it to decide whether a change has to go through
 * org-signup (server orgs) or may stay a local write (BGCA seed, practice).
 */
export function serverOrgIdFor(npOrg) {
  if (!npOrg?._orgId) return null;
  return getCustomOrg(npOrg._orgId)?._serverId ?? null;
}

/**
 * The two things the admin account menu can do. Shared by the phone shell's
 * header menu and the desktop shell's nav menu so the mode-switch rules live in
 * one place.
 *
 * goGiving: one tap to giving mode - the donor dashboard if they already have a
 * donor account, otherwise STRAIGHT to donor account creation pre-bound to
 * their own org (they run the org, so skip the join gate AND the intro pitch).
 * Their personal donor identity stays a separate sign-in by design: the admin
 * login belongs to the org and may be shared or rotated among staff, while
 * personal giving stays personal.
 */
export function useNpAdminActions(npOrg) {
  const {
    hasAccount, setPage, signOut, setLastMode, setSelectedNonprofit, goToOnboardingStep,
  } = useApp();
  const { resetNpContent } = useNp();

  function handleSignOut() {
    resetNpContent();
    signOut();
  }

  function goGiving() {
    setLastMode('giving');
    if (hasAccount) { setPage('home'); return; }
    const org = findOrgByCode(npOrg.joinCode);
    if (org) setSelectedNonprofit(org);
    goToOnboardingStep('signup');
  }

  const givingLabel = hasAccount
    ? 'Switch to Giving'
    : `Start giving  -  join ${npOrg.shortName ?? 'your org'} as a donor`;

  return { hasAccount, goGiving, handleSignOut, givingLabel };
}
