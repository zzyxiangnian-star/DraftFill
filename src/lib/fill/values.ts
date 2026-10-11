import type { Profile, SensitiveKey } from '../profile/schema';

// 按路径从档案里取值，并按“允许自动填写”开关挡住敏感信息。

export type ValueResult = { value: string } | { value: null; reason: string };

const GROUP_NAMES: Record<string, string> = {
  education: '教育经历', internships: '实习经历', projects: '项目经历', campus: '校园经历', awards: '获奖',
  family: '家庭成员', 'skills.languages': '语言', 'skills.certificates': '证书',
};

function sensitiveKey(path: string): SensitiveKey | null {
  if (path === 'basic.phone') return 'phone';
  if (path === 'basic.email') return 'email';
  if (path === 'basic.idNumber') return 'idNumber';
  if (path.startsWith('family[')) return 'family';
  if (path.startsWith('emergencyContact.')) return 'emergencyContact';
  return null;
}

/** 解析 education[].school、education[0].degree、skills.languages[].level */
export function parsePath(path: string): { list: string; index: number | null; field: string } | null {
  const m = /^(.+)\[(\d*)\]\.(\w+)$/.exec(path);
  if (!m) return null;
  return { list: m[1]!, index: m[2] ? Number(m[2]) : null, field: m[3]! };
}

export function resolveValue(profile: Profile, path: string, index = 0): ValueResult {
  const sk = sensitiveKey(path);
  if (sk && !profile.autofill[sk]) return { value: null, reason: '敏感信息，档案里没开启自动填写' };

  if (path.startsWith('custom:')) {
    const f = profile.custom.find((x) => `custom:${x.id}` === path);
    return f?.value ? { value: f.value } : { value: null, reason: '档案里没有这一项' };
  }

  let raw: unknown;
  const arr = parsePath(path);
  if (arr) {
    const list = arr.list.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], profile);
    const i = arr.index ?? index;
    if (!Array.isArray(list) || i >= list.length) {
      const n = Array.isArray(list) ? list.length : 0;
      return { value: null, reason: n ? `档案里只有 ${n} 条${GROUP_NAMES[arr.list] ?? ''}` : `档案里没有${GROUP_NAMES[arr.list] ?? '这一项'}` };
    }
    raw = (list[i] as Record<string, unknown>)[arr.field];
  } else {
    raw = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], profile);
  }
  return typeof raw === 'string' && raw.trim() ? { value: raw.trim() } : { value: null, reason: '档案里没有这一项' };
}

/** 档案路径的中文名，用于结果面板 */
export function pathIndexLabel(path: string, index: number): string {
  const arr = parsePath(path);
  if (!arr || arr.index !== null) return '';
  return index > 0 ? `第 ${index + 1} 条${GROUP_NAMES[arr.list] ?? ''}` : '';
}
