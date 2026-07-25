import { useApp } from '../../store/AppContext';
import { useNp } from '../../store/NpContext';
import { findOrgByCode } from '../../store/orgStore';

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
