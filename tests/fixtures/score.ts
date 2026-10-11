import type { PlannedField } from '../../src/lib/fill/fill';

// 对照测试页上的 data-expect 统计识别结果。在 vitest 和 Playwright 页面里都会用到，所以不依赖其他模块。

export interface Score {
  expected: number;     // 应该识别的字段数
  correct: number;      // 识别正确
  wrong: number;        // 识别成了别的字段（最危险）
  missed: number;       // 没认出来
  falsePositive: number;// 不该填的字段被认成了档案字段
  details: { label: string; expect: string; got: string }[];
}

export function concretePath(path: string | null, index: number): string {
  if (!path) return 'none';
  return path.replace('[]', `[${index}]`);
}

/** root 给出时，页面上标了答案却完全没被发现的字段也算漏认 */
export function scorePlan(plan: Pick<PlannedField, 'control' | 'path' | 'index'>[], root?: ParentNode): Score {
  const s: Score = { expected: 0, correct: 0, wrong: 0, missed: 0, falsePositive: 0, details: [] };
  if (root) {
    for (const box of root.querySelectorAll('[data-expect]')) {
      const expect = box.getAttribute('data-expect')!;
      if (expect === 'none' || plan.some((f) => box.contains(f.control.el))) continue;
      s.expected++;
      s.missed++;
      s.details.push({ label: (box.textContent ?? '').trim().slice(0, 12), expect, got: '没发现这个控件' });
    }
  }
  for (const f of plan) {
    const expect = f.control.el.closest('[data-expect]')?.getAttribute('data-expect');
    if (!expect) continue;
    const got = concretePath(f.path, f.index);
    if (expect === 'none') {
      if (got !== 'none') { s.falsePositive++; s.details.push({ label: f.control.label, expect, got }); }
      continue;
    }
    s.expected++;
    if (got === expect) s.correct++;
    else {
      if (got === 'none') s.missed++; else s.wrong++;
      s.details.push({ label: f.control.label || f.control.placeholder, expect, got });
    }
  }
  return s;
}
