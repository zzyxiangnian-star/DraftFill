import { storage } from 'wxt/utils/storage';
import { CHAT_SKILLS, type ChatSkill } from './chatSkills';

// “问 AI”的技能设置：关掉的技能不会被自动选中，也不出现在手动选择里。只存在本机。

export interface SkillPrefs {
  /** 关掉的技能 id（“求职问答”兜底，不能关） */
  disabled: string[];
  /** 需要经历的技能是否附上档案里的经历（已去掉个人信息） */
  attachResume: boolean;
}

export const DEFAULT_SKILL_PREFS: SkillPrefs = { disabled: [], attachResume: true };

export const skillPrefsItem = storage.defineItem<SkillPrefs>('local:aiSkillPrefs', { fallback: DEFAULT_SKILL_PREFS });

export function enabledSkills(prefs: SkillPrefs): ChatSkill[] {
  return CHAT_SKILLS.filter((s) => s.id === 'general' || !prefs.disabled.includes(s.id));
}
