// src/store/identityStore.js — ONE person (pc_identity) with roles attached.
// pc_donor_role: completed donor onboarding · pc_admin_role: {orgId, joinCode} · pc_last_mode: 'giving' | 'admin'
// Also home of the shared localStorage helpers used across stores.

export const IDENTITY_KEYS = {
  identity:  'pc_identity',
  donorRole: 'pc_donor_role',
  adminRole: 'pc_admin_role',
  lastMode:  'pc_last_mode',
};

export function loadKey(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

export function saveKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function removeKeys(keys) {
  keys.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
}

// Fold the legacy two-session keys (pc_has_account, pc_np_signed_in) into the
// identity model. Idempotent — only fires while a legacy key is still present.
export function migrate() {
  const legacy = loadKey('pc_has_account');
  if (legacy && !loadKey(IDENTITY_KEYS.identity)) {
    saveKey(IDENTITY_KEYS.identity, legacy);
    saveKey(IDENTITY_KEYS.donorRole, { active: true });
  }
  if (loadKey('pc_np_signed_in') && !loadKey(IDENTITY_KEYS.adminRole)) {
    const org = loadKey('pc_np_org');
    saveKey(IDENTITY_KEYS.adminRole, {
      orgId: org?._orgId || org?.joinCode?.toLowerCase() || 'bgca',
      joinCode: org?.joinCode ?? 'BGCA',
    });
  }
}

export function clearIdentityKeys() {
  removeKeys([...Object.values(IDENTITY_KEYS), 'pc_has_account', 'pc_np_signed_in']);
}
