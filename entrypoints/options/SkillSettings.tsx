import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Toggle } from '@/src/components/form';
import { iconProps } from '@/src/components/icon';
import { CHAT_SKILLS } from '@/src/lib/ai/chatSkills';
import { DEFAULT_SKILL_PREFS, skillPrefsItem, type SkillPrefs } from '@/src/lib/ai/skillPrefs';

export function useSkillPrefs() {
  const [p, setP] = useState<SkillPrefs | null>(null);
  useEffect(() => {
    skillPrefsItem.getValue().then(setP);
    return skillPrefsItem.watch(setP);
  }, []);
  return [p, setP] as const;
}

/** 技能设置：开关每个技能，决定要不要附上经历 */
export function SkillSettings() {
  const [prefs, setPrefs] = useSkillPrefs();
  if (!prefs) return null;
  const save = (patch: Partial<SkillPrefs>) => { const next = { ...prefs, ...patch }; setPrefs(next); void skillPrefsItem.setValue(next); };
  const setOn = (id: string, on: boolean) =>
    save({ disabled: on ? prefs.disabled.filter((x) => x !== id) : [...new Set([...prefs.disabled, id])] });
  const on = CHAT_SKILLS.filter((s) => s.id !== 'general' && !prefs.disabled.includes(s.id)).length;

  return (
    <section className="card stack" style={{ gap: 'var(--space-4)' }}>
      <div className="stack">
        <h2>技能</h2>
        <p className="small muted">「问 AI」会按问题自动挑一个技能回答，每个技能配了专门的方法。用不到的可以关掉，关掉后不会被自动选中，也不出现在手动选择里。</p>
      </div>
      <div className="stack skill-opts">
        <Toggle checked={prefs.attachResume} onChange={(v) => save({ attachResume: v })}>
          需要时附上档案里的经历（简历诊断、润色、面试等技能会用到；姓名、电话等个人信息始终不发）
        </Toggle>
      </div>
      <div className="row">
        <span className="small muted">已开启 {on} / {CHAT_SKILLS.length - 1} 个技能</span>
        <span className="spacer" />
        <button className="btn btn-text small" onClick={() => save(DEFAULT_SKILL_PREFS)}><RotateCcw {...iconProps} /> 恢复默认</button>
      </div>
      <ul className="skill-list">
        {CHAT_SKILLS.map((s) => (
          <li key={s.id} className={`skill-row${s.id !== 'general' && prefs.disabled.includes(s.id) ? ' off' : ''}`}>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <strong>{s.name}{s.needsResume && <span className="tag">用到经历</span>}</strong>
              <span className="small muted">{s.desc}</span>
              <span className="small skill-eg">例：{s.examples.join('；')}</span>
            </div>
            {s.id === 'general'
              ? <span className="small muted skill-fixed">兜底，始终开启</span>
              : <Toggle checked={!prefs.disabled.includes(s.id)} onChange={(v) => setOn(s.id, v)}><span className="sr-only">启用{s.name}</span></Toggle>}
          </li>
        ))}
      </ul>
    </section>
  );
}
