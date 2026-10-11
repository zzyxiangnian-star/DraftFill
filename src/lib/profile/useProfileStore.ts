import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileStore } from './schema';
import { loadStore, profileStoreItem, saveStore } from './store';

/**
 * 读取并订阅档案存储。commit 立即更新界面，写入存储做 400ms 防抖，
 * 这样连续打字不会频繁写盘；页面关闭前会把最后一次改动写完。
 */
export function useProfileStore() {
  const [store, setStore] = useState<ProfileStore | null>(null);
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saved'>('idle');
  const pending = useRef<ProfileStore | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    loadStore().then(setStore);
    // 其他页面（popup、另一个设置页）改了档案时同步过来；自己有未写入的改动时不覆盖
    return profileStoreItem.watch(() => {
      if (!pending.current) loadStore().then(setStore);
    });
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    await saveStore(next);
    if (pending.current === next) pending.current = null;
    setSaving('saved');
  }, []);

  useEffect(() => {
    const onHide = () => { void flush(); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  const commit = useCallback((next: ProfileStore, immediate = false) => {
    setStore(next);
    pending.current = next;
    setSaving('pending');
    clearTimeout(timer.current);
    if (immediate) void flush();
    else timer.current = setTimeout(flush, 400);
  }, [flush]);

  return { store, commit, saving };
}
