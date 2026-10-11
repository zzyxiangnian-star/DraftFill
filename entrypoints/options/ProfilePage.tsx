import { Check, Copy, Plus, Trash2, Upload, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import type { Profile, ProfileStore } from '@/src/lib/profile/schema';
import { activeProfile, addProfile, duplicateProfile, removeProfile, setActive, updateProfile } from '@/src/lib/profile/store';
import { ProfileEditor } from './ProfileEditor';

export function ProfilePage({ store, commit, editingId, setEditingId, goImport }: {
  store: ProfileStore;
  commit: (s: ProfileStore, immediate?: boolean) => void;
  editingId: string;
  setEditingId: (id: string) => void;
  goImport: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const current: Profile | undefined = store.profiles.find((p) => p.id === editingId) ?? activeProfile(store);

  useEffect(() => setConfirmDelete(false), [current?.id]);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  if (!current) {
    return (
      <>
        <div className="stack">
          <h1>个人档案</h1>
          <p className="muted">档案只保存在这台电脑的浏览器里，不会上传。</p>
        </div>
        <section className="card empty-start">
          <UserRound size={28} strokeWidth={1.5} />
          <h2>先建一份主档案</h2>
          <p className="small muted">填一次，以后每家网申都从这里取。按岗位方向需要不同内容时，可以复制出多份。</p>
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <button className="btn btn-primary" onClick={() => {
              const next = addProfile(store);
              commit(next, true);
              setEditingId(next.profiles[0]!.id);
            }}><Plus {...iconProps} /> 创建主档案</button>
            <button className="btn btn-secondary" onClick={goImport}><Upload {...iconProps} /> 从简历或备份导入</button>
          </div>
        </section>
      </>
    );
  }

  const isActive = store.activeId === current.id || (!store.activeId && store.profiles[0]?.id === current.id);

  return (
    <>
      <div className="profile-tabs" role="tablist" aria-label="档案">
        {store.profiles.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === current.id} className="profile-tab" onClick={() => setEditingId(p.id)}>
            {p.title || '未命名档案'}
            {p.id === store.activeId && <span className="dot" title="当前使用" />}
          </button>
        ))}
        <button className="profile-tab profile-tab-add" onClick={() => {
          const next = duplicateProfile(store, current.id, `${current.title} 副本`);
          commit(next, true);
          setEditingId(next.profiles.at(-1)!.id);
        }} title="复制当前档案，按另一个岗位方向修改"><Copy {...iconProps} /> 复制为新档案</button>
      </div>

      <div className="profile-bar">
        <input className="title-input" aria-label="档案名称" value={current.title} placeholder="档案名称"
          onChange={(e) => commit(updateProfile(store, { ...current, title: e.target.value }))} />
        <span className="spacer" />
        {isActive ? (
          <span className="pill pill-brand"><Check {...iconProps} size={12} /> 填写时使用这份</span>
        ) : (
          <button className="btn btn-secondary" onClick={() => commit(setActive(store, current.id), true)}>设为填写时使用</button>
        )}
        <button className={`btn ${confirmDelete ? 'btn-secondary btn-confirm-danger' : 'btn-icon btn-danger'}`}
          title="删除这份档案" aria-label="删除这份档案"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            const next = removeProfile(store, current.id);
            commit(next, true);
            setEditingId(next.activeId);
          }}>
          <Trash2 {...iconProps} />{confirmDelete && '再点一次删除'}
        </button>
      </div>

      <ProfileEditor profile={current} onChange={(p) => commit(updateProfile(store, p))} />
    </>
  );
}
