import { describe, expect, it } from 'vitest';
import { pageQuestionsSkill } from '../src/lib/ai/skills/pageQuestions';
import { widgetPlanSkill, type WidgetView } from '../src/lib/ai/skills/widgetPlan';
import { matchesDate, render, widgetVars } from '../src/lib/fill/widget';

const view = (id: number, typable = false): WidgetView => ({ id, label: '出生日期', target: '出生日期', shape: 'YYYY-MM-DD', placeholder: '', typable, panel: ['2026年', '1月'], why: '' });

describe('AI 操作控件', () => {
  it('占位符在本地代入，档案没有日时用不了 {D}', () => {
    const v = widgetVars('2001-05-20');
    expect(render('{YYYY}年{M}月{D}日', v)).toBe('2001年5月20日');
    expect(render('{MM}/{DD}', v)).toBe('05/20');
    expect(render('{D}', widgetVars('2024-09'))).toBeNull();
  });

  it('回读：年月日都对上才算', () => {
    const v = widgetVars('2001-05-20');
    expect(matchesDate('2001/5/20', v)).toBe(true);
    expect(matchesDate('2001-05-21', v)).toBe(false);
    expect(matchesDate('2024年09月', widgetVars('2024-09'))).toBe(true);
    expect(matchesDate('', widgetVars('2024-09'))).toBe(false);
  });

  it('只收已知的步骤和占位符；不能打字的控件不许打字', () => {
    const fields = [view(1), view(2), view(3, true), view(4)];
    const plans = widgetPlanSkill.parse({ fields: [
      { id: 1, steps: [{ do: 'open' }, { do: 'navigate', button: 'prev-year', until: '{YYYY}年', max: 999 }, { do: 'click', text: '{M}月' }] },
      { id: 2, steps: [{ do: 'type', text: '{YYYY}-{MM}' }] },
      { id: 3, steps: [{ do: 'type', text: '{YYYY}-{MM}-{DD}' }] },
      { id: 4, steps: [{ do: 'click', text: '{phone}' }] },
      { id: 9, steps: [{ do: 'open' }] },
      { id: 1, steps: [] },
    ] }, { fields });
    expect(plans.map((p) => p.id)).toEqual([1, 3]);
    expect(plans[0]!.steps[1]).toMatchObject({ do: 'navigate', max: 40 });
  });
});

describe('AI 回答页面上的问题', () => {
  it('选择题只能选页面上的选项；隐私题、超字数的回答丢掉', () => {
    const questions = [
      { id: 1, question: '你是从哪里了解到我们的', kind: 'choice' as const, options: ['官网', '宣讲会'], limit: 0 },
      { id: 2, question: '你是从哪里了解到我们的', kind: 'choice' as const, options: ['官网'], limit: 0 },
      { id: 3, question: '宿舍楼号', kind: 'text' as const, options: [], limit: 0 },
      { id: 4, question: '一句话介绍自己', kind: 'text' as const, options: [], limit: 5 },
      { id: 5, question: '为什么选择我们', kind: 'textarea' as const, options: [], limit: 0 },
    ];
    const out = pageQuestionsSkill.parse({ answers: [
      { id: 1, answer: '宣讲会' }, { id: 2, answer: '朋友推荐' }, { id: 3, answer: '12 号楼' },
      { id: 4, answer: '我是一个热爱后端开发的学生' }, { id: 5, answer: null },
    ] }, { questions, company: '', resume: '' });
    expect(out).toEqual([{ id: 1, answer: '宣讲会' }]);
  });
});
