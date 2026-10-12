import { objs, str, type Skill } from './index';

// 「AI 帮我填完」第二步：规则没能操作的控件（各家写法不同的日期面板、只能点选的框），
// 让 AI 看控件的样子和点开后的面板（只有面板上的按钮文字，如“2026年”“3月”“15”），给出操作步骤。
// 不发任何档案内容：步骤里用 {YYYY}{MM}{DD}{value} 这类占位符，插件在本地换成档案里的值再执行。

export interface WidgetView {
  /** 本次填写里的序号 */
  id: number;
  label: string;
  /** 这一项对应档案里的什么，如“出生日期”（只有名称） */
  target: string;
  /** 档案值的形状，如 YYYY-MM-DD，不含具体值 */
  shape: string;
  placeholder: string;
  /** 输入框能不能直接打字 */
  typable: boolean;
  /** 点开后出现的面板：按钮文字和图标按钮的类名片段，按页面顺序 */
  panel: string[];
  /** 规则方式为什么没填上 */
  why: string;
}

export type WidgetStep =
  | { do: 'open' }
  | { do: 'type'; text: string }
  | { do: 'click'; text: string }
  | { do: 'navigate'; button: string; until: string; max: number };

export interface WidgetPlan { id: number; steps: WidgetStep[] }

export interface WidgetPlanInput { fields: WidgetView[] }

export const DATE_VARS = ['YYYY', 'YY', 'MM', 'M', 'DD', 'D'] as const;
const VAR = /\{([A-Za-z]+)\}/g;
const MAX_STEPS = 8;

const METHOD = `任务：网申页面上有几个控件，填表插件没能自动填上（多半是各家写法不同的日期面板、只能点选的框）。
请根据每个控件的样子和点开后面板上的按钮文字，给出操作步骤。

你看不到候选人的真实信息，步骤里用占位符代替，插件会在本地换成真实值：
- 日期：{YYYY} 四位年，{YY} 两位年，{MM} 两位月（03），{M} 不补零的月（3），{DD} 两位日，{D} 不补零的日
- 其他：{value} 档案里的原值

可用的步骤（按顺序执行）：
- {"do":"open"}：点开这个控件
- {"do":"type","text":"{YYYY}-{MM}"}：直接往输入框里打字（只有“能直接打字”的控件才用）
- {"do":"click","text":"{YYYY}年"}：点面板里文字正好是这个的按钮（文字要和面板上的写法一致，如“3月”就写 {M}月，“03”就写 {MM}）
- {"do":"navigate","button":"prev-year","until":"{YYYY}","max":30}：面板上没有目标时，反复点翻页按钮（button 写按钮文字或类名片段，如 « ‹ prev-year），直到出现 until 的文字

规则：
1. 能直接打字的优先打字，格式按提示文字或面板上的写法。
2. 点选时按面板的层级：先年、再月、再日。面板上看不到目标年份时用 navigate 翻页（往前翻还是往后翻看面板上的年份）。
3. 不要点“确定”“提交”“保存”这类按钮，插件也会拒绝。
4. 看不懂的控件就给空步骤 []，不要猜。
只输出 JSON：{"fields":[{"id":序号,"steps":[...]}]}，不要输出别的文字。`;

function describeView(v: WidgetView): string {
  const parts = [`${v.id}. 字段“${v.label || '（无名）'}”，要填：${v.target}（格式 ${v.shape}）`];
  if (v.placeholder) parts.push(`提示文字“${v.placeholder}”`);
  parts.push(v.typable ? '能直接打字' : '不能打字，只能点选');
  parts.push(`规则没填上的原因：${v.why || '未知'}`);
  parts.push(v.panel.length ? `点开后面板上有：${v.panel.join(' | ')}` : '点开后没有看到面板');
  return parts.join('；');
}

/** 只允许已知的占位符；文字里不能夹带别的花括号 */
function cleanText(t: unknown, vars: readonly string[]): string | null {
  const s = str(t, 40);
  if (!s) return null;
  for (const m of s.matchAll(VAR)) if (!vars.includes(m[1]!)) return null;
  return /[{}]/.test(s.replace(VAR, '')) ? null : s;
}

export function parseSteps(raw: unknown, vars: readonly string[]): WidgetStep[] {
  const out: WidgetStep[] = [];
  for (const s of objs(raw, MAX_STEPS)) {
    const kind = str(s.do, 20);
    if (kind === 'open') out.push({ do: 'open' });
    else if (kind === 'type' || kind === 'click') {
      const text = cleanText(s.text, vars);
      if (!text) return [];
      out.push({ do: kind, text });
    } else if (kind === 'navigate') {
      const button = str(s.button, 40);
      const until = cleanText(s.until, vars);
      if (!button || !until || /[{}]/.test(button)) return [];
      const max = Math.min(Math.max(Number(s.max) || 20, 1), 40);
      out.push({ do: 'navigate', button, until, max });
    } else return []; // 不认识的步骤：整条作废
  }
  return out;
}

export const widgetPlanSkill: Skill<WidgetPlanInput, WidgetPlan[]> = {
  id: 'widget-plan',
  name: '操作控件',
  temperature: 0,
  build: ({ fields }) => [
    { role: 'system', content: METHOD },
    { role: 'user', content: `控件：\n${fields.map(describeView).join('\n')}` },
  ],
  parse: (raw, { fields }) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const byId = new Map(fields.map((f) => [f.id, f]));
    const out: WidgetPlan[] = [];
    for (const f of objs(r.fields, 100)) {
      const v = byId.get(Number(f.id));
      if (!v || out.some((p) => p.id === v.id)) continue;
      const vars = /Y/.test(v.shape) ? [...DATE_VARS, 'value'] : ['value'];
      const steps = parseSteps(f.steps, vars);
      // 不能打字的控件不许打字
      if (!steps.length || (!v.typable && steps.some((s) => s.do === 'type'))) continue;
      out.push({ id: v.id, steps });
    }
    return out;
  },
};
