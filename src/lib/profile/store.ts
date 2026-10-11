import { storage } from 'wxt/utils/storage';
import { normalizeProfile } from './normalize';
import { deriveProfile, emptyProfile, SCHEMA_VERSION, type Profile, type ProfileStore } from './schema';

// 所有档案存在一个 chrome.storage.local 键里；popup、设置页通过 watch 同步。

export const profileStoreItem = storage.defineItem<ProfileStore>('local:profiles', {
  fallback: { schemaVersion: SCHEMA_VERSION, activeId: '', profiles: [] },
});

export async function loadStore(): Promise<ProfileStore> {
  const raw = await profileStoreItem.getValue();
  return {
    schemaVersion: SCHEMA_VERSION,
    activeId: raw.activeId,
    profiles: raw.profiles.map(normalizeProfile),
  };
}

export const saveStore = (s: ProfileStore) => profileStoreItem.setValue(s);

export function activeProfile(s: ProfileStore): Profile | undefined {
  return s.profiles.find((p) => p.id === s.activeId) ?? s.profiles[0];
}

// —— 纯函数操作，便于测试 ——

export function addProfile(s: ProfileStore, title?: string): ProfileStore {
  const p = emptyProfile(title ?? (s.profiles.length ? `档案 ${s.profiles.length + 1}` : '主档案'));
  return { ...s, activeId: s.activeId || p.id, profiles: [...s.profiles, p] };
}

export function duplicateProfile(s: ProfileStore, id: string, title: string): ProfileStore {
  const src = s.profiles.find((p) => p.id === id);
  if (!src) return s;
  return { ...s, profiles: [...s.profiles, deriveProfile(src, title)] };
}

export function updateProfile(s: ProfileStore, next: Profile): ProfileStore {
  return { ...s, profiles: s.profiles.map((p) => (p.id === next.id ? { ...next, updatedAt: Date.now() } : p)) };
}

export function removeProfile(s: ProfileStore, id: string): ProfileStore {
  const profiles = s.profiles.filter((p) => p.id !== id);
  const activeId = s.activeId === id ? (profiles[0]?.id ?? '') : s.activeId;
  return { ...s, activeId, profiles };
}

export function setActive(s: ProfileStore, id: string): ProfileStore {
  return s.profiles.some((p) => p.id === id) ? { ...s, activeId: id } : s;
}

export function appendProfiles(s: ProfileStore, list: Profile[]): ProfileStore {
  return { ...s, activeId: s.activeId || list[0]?.id || '', profiles: [...s.profiles, ...list] };
}
