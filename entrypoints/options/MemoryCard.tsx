import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { iconProps } from '@/src/components/icon';
import { ALIASES } from '@/src/lib/fill/aliases';
import { fieldMemoryItem, forget, type FieldMemory } from '@/src/lib/fill/memory';
import type { ProfileStore } from '@/src/lib/profile/schema';

// 字段记忆（计划书 V4）：在候选卡里选过并勾了“记住”的字段，按网站列出，可以单独或全部清除。

function pathName(path: string, store: ProfileStore): string {
  if (path.startsWith('custom:')) {
    const id = path.slice(7);
    const f = store.profiles.flatMap((p) => p.custom).find((x) => x.id === id);
    return f ? `其他信息：${f.label}` : '其他信息里已删除的一项';
  }
  return ALIASES.find((a) => a.path === path)?.strong[0] ?? path;
}

export function MemoryCard({ store }: { store: ProfileStore }) {
  const [mem, setMem] = useState<FieldMemory | null>(null);
  useEffect(() => {
    fieldMemoryItem.getValue().then(setMem);
    return fieldMemoryItem.watch(setMem);
  }, []);
  if (!mem) return null;
  const save = (m: FieldMemory) => { setMem(m); void fieldMemoryItem.setValue(m); };

  const byHost = new Map<string, { label: string; path: string; at: number }[]>();
  for (const r of Object.values(mem.items)) byHost.set(r.host, [...(byHost.get(r.host) ?? []), r]);
  const hosts = [...byHost.entries()].sort((a, b) => Math.max(...b[1].map((x) => x.at)) - Math.max(...a[1].map((x) => x.at)));

  return (
    <section className="card stack" style={{ gap: 'var(--space-3)' }}>
      <div className="row">
        <h2 style={{ flex: 1 }}>记住的字段</h2>
        {hosts.length > 0 && <button className="btn btn-text small" onClick={() => save(forget(mem))}><Trash2 {...iconProps} /> 全部清除</button>}
      </div>
      <p className="small muted">插件没认出的字段，你在候选卡里选过一次并勾了“记住”，下次在同一个网站就会自动填。只按网站记，不会套用到别的网站。</p>
      {!hosts.length ? <p className="small muted">还没有记住的字段。</p> : (
        <ul className="memory-list">
          {hosts.map(([host, items]) => (
            <li key={host}>
              <details>
                <summary><strong>{host}</strong> <span className="muted small">{items.length} 个字段</span></summary>
                <ul className="small">
                  {items.map((x) => <li key={x.label + x.path}>{x.label} <span className="muted">→ {pathName(x.path, store)}</span></li>)}
                </ul>
              </details>
              <button className="btn btn-text small" aria-label={`清除 ${host} 的记录`} onClick={() => save(forget(mem, host))}><Trash2 {...iconProps} /> 清除</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
