import { FileJson, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { iconProps } from '@/src/components/icon';
import { useProfileStore } from '@/src/lib/profile/useProfileStore';
import { AiPage } from './AiPage';
import { BackupPage } from './BackupPage';
import { SECTIONS } from './ProfileEditor';
import { ProfilePage } from './ProfilePage';

const PAGES = [
  { id: 'profile', label: '个人档案', Icon: UserRound },
  { id: 'backup', label: '导入（简历/备份）', Icon: FileJson },
  { id: 'ai', label: 'AI 助手', Icon: Sparkles },
  { id: 'rules', label: '使用边界', Icon: ShieldCheck },
] as const;

type PageId = (typeof PAGES)[number]['id'];

function pageFromHash(): PageId {
  const h = location.hash.slice(1);
  return PAGES.some((p) => p.id === h) ? (h as PageId) : 'profile';
}

export function App() {
  const { store, commit, saving } = useProfileStore();
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [editingId, setEditingId] = useState('');

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: PageId) => { location.hash = id; setPage(id); };
  const hasProfile = !!store?.profiles.length;

  return (
    <div className="opt">
      <nav className="nav" aria-label="设置分区">
        <div style={{ padding: '0 12px 16px' }}><Logo /></div>
        {PAGES.map(({ id, label, Icon }) => (
          <div key={id}>
            <button className="nav-item" aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon {...iconProps} /> {label}
            </button>
            {id === 'profile' && page === 'profile' && hasProfile && (
              <div className="nav-sub">
                {SECTIONS.map(([sid, name]) => (
                  <a key={sid} href={`#${sid}`} onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(sid)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                  }}>{name}</a>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="save-state small" aria-live="polite">
          {saving === 'pending' ? '正在保存…' : saving === 'saved' ? '已自动保存到本机' : ''}
        </div>
      </nav>

      <main className="main" key={page}>
        {!store ? null : page === 'profile' ? (
          <ProfilePage store={store} commit={commit} editingId={editingId} setEditingId={setEditingId} goImport={() => go('backup')} />
        ) : page === 'backup' ? (
          <BackupPage store={store} commit={commit} onCreated={(id) => { setEditingId(id); go('profile'); }} />
        ) : page === 'ai' ? (
          <AiPage store={store} commit={commit} />
        ) : (
          <>
            <h1>使用边界</h1>
            <section className="card">
              <ul className="rules small">
                <li>只填不交：插件不会点击提交、保存或下一步，由你检查后自己提交。</li>
                <li>宁可不填，不填错：没把握的字段标黄，等你确认。</li>
                <li>写入后回读校验，页面显示值不一致的标红。</li>
                <li>不识别、不绕过验证码和滑块，不保存网站账号密码。</li>
                <li>只在你点击时读取当前页面，不申请"读取所有网站"权限。</li>
                <li>档案只存在你自己的浏览器里，没有服务器，开发者也看不到。</li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
