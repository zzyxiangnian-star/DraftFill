import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { routeByKeywords } from '../src/lib/ai/router';

// 用 docs/job-questions.md（从牛客、知乎、小红书、B 站收集的真实问法）检查自动选技能。
// 关键词只命中一个技能时直接用它，所以“只命中一个且选错”必须为 0；没命中的交给模型判断。

const ALLOWED: Record<string, string[]> = {
  简历: ['resume-review', 'bullet-polish', 'english-resume'],
  网申问答题: ['open-question', 'answer-review', 'interview-qa'],
  笔试测评: ['written-test'],
  面试: ['mock-interview', 'group-interview', 'self-intro', 'interview-qa', 'answer-review'],
  'Offer 与签约': ['offer-compare', 'contract-rights', 'email-writing'],
  薪资: ['salary-negotiation', 'offer-compare', 'contract-rights'],
  方向选择: ['career-direction'],
  沟通邮件: ['email-writing', 'application-message'],
};

function questions() {
  const out: { section: string; q: string }[] = [];
  let section = '';
  for (const line of readFileSync(`${import.meta.dirname}/../docs/job-questions.md`, 'utf8').split('\n')) {
    const h = /^##\s+[一二三四五六七八九十]+、(.+?)(（.*)?$/.exec(line);
    if (h) { section = Object.keys(ALLOWED).find((k) => h[1]!.startsWith(k)) ?? ''; continue; }
    const m = /^\d+\.\s+(.+?)\s*$/.exec(line);
    if (m && section) out.push({ section, q: m[1]! });
  }
  return out;
}

it('真实问法：关键词直接选中的不能选错，能直接选中的占大多数', () => {
  const qs = questions();
  expect(qs.length).toBeGreaterThan(90);
  let right = 0;
  const wrong: string[] = [];
  const missed: string[] = [];
  for (const { section, q } of qs) {
    const hits = routeByKeywords(q).map((s) => s.id);
    const ok = hits.filter((h) => ALLOWED[section]!.includes(h));
    if (hits.length === 1 && !ok.length) wrong.push(`[${section}] ${q} → ${hits[0]}`);
    else if (ok.length) right++;
    else missed.push(`[${section}] ${q} → ${hits.join(',') || '无'}`);
  }
  console.log(`命中 ${right}/${qs.length}\n选错：\n${wrong.join('\n')}\n没选中：\n${missed.join('\n')}`);
  expect(wrong).toEqual([]);
  expect(right / qs.length).toBeGreaterThanOrEqual(0.85);
});
