import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { fieldMatchSkill, type UnknownField } from '../../src/lib/ai/skills/fieldMatch';
import { extractJson } from '../../src/lib/ai/skills/index';
import { describe as describeControl } from '../../src/lib/fill/detect';
import { planFill, type PlannedField } from '../../src/lib/fill/fill';
import { hostOf, remember, signature, type FieldMemory } from '../../src/lib/fill/memory';
import { sampleProfile } from '../fixtures/profile';
import { scorePlan, type Score } from '../fixtures/score';

// 计划书第 8 节第 4 条：规则 only / 规则 + 字段记忆 / 规则 + 字段记忆 + LLM 的对照实验。
// 在真实网申页面快照上统计识别结果（data-expect 是人工标注的正确答案）。
//
// 三组：
//   A 规则：只用词典规则，第一次打开页面。
//   B 规则 + 记忆：模拟用户第一次在候选卡里把漏认的字段逐个选对（并勾了“记住”），第二次打开同一网站。
//   C 规则 + LLM：第一次打开页面，把规则没认出的字段交给 LLM（只发字段名、分区、选项），结果按网站记住；
//     第二次打开时从记忆里认，不再调用。需要真实的 API：设置 EXP_AI_BASE、EXP_AI_KEY、EXP_AI_MODEL，
//     没设置时只统计会发送多少字段、多少字符，不编造准确率。
//
// 运行：npm run experiment（结果写到 EXP_OUT，默认 docs/experiment/results.json）

const PAGES = [
  ['moka-danone.html', 'Moka · 达能', 'https://app.mokahr.com/'],
  ['beisen-zhuanzhuan.html', '北森 · 转转', 'https://zhuanzhuan.zhiye.com/'],
  ['hotjob-crpower.html', 'Wecruit · 华润电力', 'https://wecruit.hotjob.cn/'],
  ['feishu-moonton.html', '飞书招聘 · 沐瞳科技', 'https://moonton.jobs.feishu.cn/'],
] as const;

const NOT_PICKABLE = new Set(['password', 'captcha', 'file', 'checkbox', 'readonly']);

function load(file: string, url: string) {
  const html = readFileSync(`${import.meta.dirname}/../fixtures/forms/real/${file}`, 'utf8');
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
  document.documentElement.innerHTML = html.replace(/^<!--[\s\S]*?-->\s*/, '').replace(/^<!doctype html>/i, '');
}

const expectOf = (f: PlannedField) => f.control.el.closest('[data-expect]')?.getAttribute('data-expect') ?? null;

/** 规则没认出、能写入、有字段名的字段：L2 发给 LLM 的就是这些 */
function unknownOf(plan: PlannedField[]): UnknownField[] {
  const out: UnknownField[] = [];
  plan.forEach((f, id) => {
    const c = f.control;
    if (f.path !== null || NOT_PICKABLE.has(c.kind) || (!c.label && !c.placeholder)) return;
    const kind = c.kind === 'textarea' ? 'textarea' : c.kind === 'text' || c.kind === 'date' || c.kind === 'month' ? 'text' : 'choice';
    out.push({ id, label: describeControl(c), placeholder: c.placeholder.slice(0, 40), section: c.section, kind, options: c.options.slice(0, 20) });
  });
  return out;
}

/** AI 给的通用路径落到第几条：跟着前面最近的同一类经历字段（同 fill.ts 的 guessPath） */
function concreteGuess(plan: PlannedField[], id: number, path: string): string {
  if (plan[id]!.control.section === 'basic' && path.startsWith('education[]')) return path.replace('[]', '[0]');
  const m = /^(.+)\[\]\.(\w+)$/.exec(path);
  if (!m) return path;
  for (let i = id - 1; i >= 0; i--) {
    const p = plan[i]!.path;
    if (p && p.startsWith(`${m[1]}[`)) return `${m[1]}[${/\[(\d+)\]/.exec(p)?.[1] ?? plan[i]!.index}].${m[2]}`;
  }
  return path.replace('[]', '[0]');
}

async function askLlm(fields: UnknownField[]): Promise<{ guesses: { id: number; path: string }[]; tokens: number | null }> {
  const base = process.env.EXP_AI_BASE!.replace(/\/$/, '');
  const input = { fields, custom: [] };
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.EXP_AI_KEY}` },
    body: JSON.stringify({ model: process.env.EXP_AI_MODEL, temperature: fieldMatchSkill.temperature, messages: fieldMatchSkill.build(input) }),
  });
  if (!res.ok) throw new Error(`LLM 请求失败：${res.status} ${await res.text()}`);
  const data = await res.json() as { choices: { message: { content: string } }[]; usage?: { total_tokens?: number } };
  return { guesses: fieldMatchSkill.parse(extractJson(data.choices[0]!.message.content), input), tokens: data.usage?.total_tokens ?? null };
}

const brief = (s: Score) => ({ expected: s.expected, correct: s.correct, wrong: s.wrong, missed: s.missed, falsePositive: s.falsePositive });

it('对照实验', async () => {
  const profile = sampleProfile();
  const llm = !!(process.env.EXP_AI_BASE && process.env.EXP_AI_KEY && process.env.EXP_AI_MODEL);
  const rows = [];
  for (const [file, name, url] of PAGES) {
    load(file, url);
    const host = hostOf(url);
    const plan = planFill(document, profile);
    const a = scorePlan(plan, document);
    const unknown = unknownOf(plan);
    const prompt = fieldMatchSkill.build({ fields: unknown, custom: [] });
    const promptChars = prompt.reduce((n, m) => n + m.content.length, 0);
    const text = prompt.map((m) => m.content).join('');
    const cjk = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) ?? []).length;
    // DeepSeek 文档的估算：1 个中文字符约 0.6 token，1 个英文字符约 0.3 token
    const tokenEstimate = Math.round(cjk * 0.6 + (text.length - cjk) * 0.3);
    // 发给 LLM 的字段里，有正确答案的（LLM 认对能加分）和本该留空的（LLM 认出来就是填错）
    const unknownExpect = unknown.map((u) => expectOf(plan[u.id]!));
    const canGain = unknownExpect.filter((e) => e && e !== 'none').length;

    // B：用户第一次把漏认的字段在候选卡里选对，记住
    let mem: FieldMemory = { version: 1, items: {} };
    let picks = 0;
    for (const f of plan) {
      const exp = expectOf(f);
      const sig = signature(f.control, host);
      if (!exp || exp === 'none' || f.path !== null || !sig) continue;
      mem = remember(mem, sig, { path: exp, label: describeControl(f.control), host });
      picks++;
    }
    load(file, url);
    const b = scorePlan(planFill(document, profile, mem), document);

    // C：LLM 认没认出的字段
    let c: ReturnType<typeof brief> | null = null;
    let cRevisit: ReturnType<typeof brief> | null = null;
    let tokens: number | null = null;
    if (llm && unknown.length) {
      const r = await askLlm(unknown);
      tokens = r.tokens;
      const guessed = plan.map((f, id) => {
        const g = r.guesses.find((x) => x.id === id);
        return g ? { ...f, path: concreteGuess(plan, id, g.path), index: 0 } : f;
      });
      c = brief(scorePlan(guessed, document));
      let aiMem: FieldMemory = { version: 1, items: {} };
      for (const g of r.guesses) {
        const sig = signature(plan[g.id]!.control, host);
        if (sig) aiMem = remember(aiMem, sig, { path: concreteGuess(plan, g.id, g.path), label: '', host, source: 'ai' });
      }
      load(file, url);
      cRevisit = brief(scorePlan(planFill(document, profile, aiMem), document));
    }
    rows.push({
      page: name, controls: plan.length,
      rules: brief(a),
      rulesMemory: { ...brief(b), userPicks: picks },
      llm: { unknownFields: unknown.length, canGain, shouldStayEmpty: unknown.length - canGain, calls: unknown.length ? 1 : 0, revisitCalls: 0, promptChars, tokenEstimate, tokens, firstVisit: c, revisit: cRevisit },
      missedDetails: a.details,
      unknownList: unknown.map((u) => ({ label: u.label, section: u.section, kind: u.kind, expect: expectOf(plan[u.id]!) })),
    });
  }
  const out = { at: new Date().toISOString(), llmModel: llm ? process.env.EXP_AI_MODEL : null, rows };
  writeFileSync(process.env.EXP_OUT ?? 'docs/experiment/results.json', `${JSON.stringify(out, null, 2)}\n`);
  for (const r of rows) {
    console.log(`${r.page}：规则 ${r.rules.correct}/${r.rules.expected}（错认 ${r.rules.wrong}）→ 加记忆 ${r.rulesMemory.correct}/${r.rulesMemory.expected}；`
      + `没认出 ${r.llm.unknownFields} 个，发给 LLM ${r.llm.promptChars} 字符`);
  }
});
