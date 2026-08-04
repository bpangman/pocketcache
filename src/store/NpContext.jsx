/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import { saveCustomOrg, getCustomOrg, saveBgcaOverrides, getBgcaOverrides, computeBrandFromColor, cacheServerOrgLocally } from './orgStore';
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

  // Admin sign-in resolves WHICH org an email administers (adminRole - see
  // orgStore.resolveAdminOrg), but npOrg is separate state that otherwise only
  // ever changes at org creation or an explicit Settings edit. Nothing kept
  // them in sync, so an admin signing in on a device that last had a DIFFERENT
  // org loaded here (BGCA is the device default) saw, and could edit, THAT
  // org's data instead of their own - the exact way a stranger's "Cancel my
  // giving subscription"-adjacent Settings edit used to land in BGCA's shared
  // demo record. Call right after setAdminRole resolves a real org.
  function adoptOrgById(orgId) {
    const currentId = npOrg._orgId || (npOrg.joinCode ? npOrg.joinCode.toLowerCase() : 'bgca');
    if (currentId === orgId) return; // already showing the right org
    if (orgId === 'bgca') {
      const next = { ...DEFAULT_NP_ORG, ...(getBgcaOverrides() ?? {}) };
      saveKey(NP_KEYS.org, next);
      setNpOrgState(next);
      return;
    }
    const org = getCustomOrg(orgId);
    if (!org) return;
    const next = {
      name: org.name,
      shortName: org.shortName,
      color: org.brand?.primary ?? '#0D9488',
      logoPreview: org.logoUrl,
      mission: org.description,
      longDescription: org.longDescription ?? '',
      monthlyMinimum: org.monthlyMinimum,
      adminEmail: org.adminEmail,
      joinCode: org.shortName,
      _orgId: org.id,
    };
    saveKey(NP_KEYS.org, next);
    setNpOrgState(next);
  }

  // Real admin sign-in (org-admin-lookup) resolves a SERVER org, not a local
  // one - adoptOrgById above only knows how to read localStorage. This mirrors
  // the server row into the local cache (cacheServerOrgLocally) and then adopts
  // it the same way adoptOrgById does for a custom org, so both paths end up
  // in the same npOrg shape and the dashboard can't tell them apart.
  function adoptServerOrg(serverOrg, adminEmail) {
    const local = cacheServerOrgLocally(serverOrg, adminEmail);
    const next = {
      name: local.name,
      shortName: local.shortName,
      color: local.brand?.primary ?? '#0D9488',
      logoPreview: local.logoUrl,
      mission: local.description,
      longDescription: local.longDescription ?? '',
      monthlyMinimum: local.monthlyMinimum,
      adminEmail: local.adminEmail,
      joinCode: local.shortName,
      _orgId: local.id,
    };
    saveKey(NP_KEYS.org, next);
    setNpOrgState(next);
    return next;
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
      adoptOrgById,
      adoptServerOrg,
    }}>
      {children}
    </NpContext.Provider>
  );
}

export const useNp = () => useContext(NpContext);
