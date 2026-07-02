/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import { saveCustomOrg, getCustomOrg, saveBgcaOverrides, computeBrandFromColor } from './orgStore';

// localStorage keys — all prefixed pc_np_ so they don't collide with donor keys
const NP_KEYS = {
  org:      'pc_np_org',
  tab:      'pc_np_tab',
  signedIn: 'pc_np_signed_in',
};

function npLoad(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v != null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function npSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export const DEFAULT_NP_ORG = {
  name:           'Boys & Girls Clubs of America',
  shortName:      'BGCA',
  color:          '#003865',
  logoPreview:    null,        // null → NpShell falls back to bgca-logo.png for joinCode===BGCA
  mission:        'Enabling young people to reach their full potential as productive, caring, responsible citizens.',
  monthlyMinimum: 10,
  adminEmail:     'info@bgca.org',
  joinCode:       'BGCA',
};

const NpContext = createContext(null);

export function NpProvider({ children }) {
  const [npOrg,      setNpOrgState]      = useState(() => npLoad(NP_KEYS.org,      DEFAULT_NP_ORG));
  const [npTab,      setNpTabState]      = useState(() => npLoad(NP_KEYS.tab,      'overview'));
  const [npSignedIn, setNpSignedInState] = useState(() => npLoad(NP_KEYS.signedIn, false));

  function setNpOrg(org) {
    npSave(NP_KEYS.org, org);
    setNpOrgState(org);
    // Propagate to donor-side org store
    const id = org._orgId || (org.joinCode ? org.joinCode.toLowerCase() : null);
    if (id && id !== 'bgca') {
      // Custom org: update the stored org
      const existing = getCustomOrg(id);
      if (existing) {
        saveCustomOrg({
          ...existing,
          name: org.name,
          description: org.mission || existing.description,
          monthlyMinimum: org.monthlyMinimum ?? existing.monthlyMinimum,
          adminEmail: org.adminEmail || existing.adminEmail,
          logoUrl: org.logoPreview !== undefined ? org.logoPreview : existing.logoUrl,
          brand: org.color
            ? { ...existing.brand, ...computeBrandFromColor(org.color, existing.shortName) }
            : existing.brand,
        });
      }
    } else if (!id || id === 'bgca') {
      // BGCA demo session — save overrides
      saveBgcaOverrides({
        name: org.name,
        description: org.mission,
        monthlyMinimum: org.monthlyMinimum,
        color: org.color,
        logoUrl: org.logoPreview,
      });
    }
  }

  function setNpTab(tab) {
    npSave(NP_KEYS.tab, tab);
    setNpTabState(tab);
  }

  function setNpSignedIn(v) {
    npSave(NP_KEYS.signedIn, v);
    setNpSignedInState(v);
  }

  // setPageFn comes from useApp().setPage — passed in at call site to avoid circular import
  function npSignOut(setPageFn) {
    Object.values(NP_KEYS).forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
    setNpOrgState(DEFAULT_NP_ORG);
    setNpTabState('overview');
    setNpSignedInState(false);
    if (setPageFn) setPageFn('onboarding');
  }

  return (
    <NpContext.Provider value={{
      npOrg, setNpOrg,
      npTab, setNpTab,
      npSignedIn, setNpSignedIn,
      npSignOut,
    }}>
      {children}
    </NpContext.Provider>
  );
}

export const useNp = () => useContext(NpContext);
