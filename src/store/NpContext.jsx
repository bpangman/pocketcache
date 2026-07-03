/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import { saveCustomOrg, getCustomOrg, saveBgcaOverrides, computeBrandFromColor } from './orgStore';
import { loadKey, saveKey, removeKeys } from './identityStore';

// localStorage keys — all prefixed pc_np_ so they don't collide with donor keys
const NP_KEYS = {
  org: 'pc_np_org',
  tab: 'pc_np_tab',
};

export const DEFAULT_NP_ORG = {
  name:           'Boys & Girls Clubs of America',
  shortName:      'BGCA',
  color:          '#003865',
  logoPreview:    null,        // null → NpShell falls back to bgca-logo.png for joinCode===BGCA
  mission:        'Enabling young people to reach their full potential as productive, caring, responsible citizens.',
  monthlyMinimum: 5,
  adminEmail:     'info@bgca.org',
  joinCode:       'BGCA',
};

const NpContext = createContext(null);

export function NpProvider({ children }) {
  const [npOrg,      setNpOrgState]      = useState(() => loadKey(NP_KEYS.org,      DEFAULT_NP_ORG));
  const [npTab,      setNpTabState]      = useState(() => loadKey(NP_KEYS.tab,      'overview'));

  function setNpOrg(org) {
    saveKey(NP_KEYS.org, org);
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
          longDescription: org.longDescription !== undefined ? org.longDescription : (existing.longDescription ?? ''),
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
        longDescription: org.longDescription,
        monthlyMinimum: org.monthlyMinimum,
        color: org.color,
        logoUrl: org.logoPreview,
      });
    }
  }

  function setNpTab(tab) {
    saveKey(NP_KEYS.tab, tab);
    setNpTabState(tab);
  }

  function resetNpContent() {
    removeKeys(Object.values(NP_KEYS));
    setNpOrgState(DEFAULT_NP_ORG);
    setNpTabState('overview');
  }

  return (
    <NpContext.Provider value={{
      npOrg, setNpOrg,
      npTab, setNpTab,
      resetNpContent,
    }}>
      {children}
    </NpContext.Provider>
  );
}

export const useNp = () => useContext(NpContext);
