import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findAddButtons } from '../src/lib/fill/addEntries';
import { runFill } from '../src/lib/fill/fill';
import { sampleProfile } from './fixtures/profile';

// 把测试页的 body 放进 happy-dom，内联脚本换成事件监听
function load() {
  const html = readFileSync(`${import.meta.dirname}/fixtures/forms/multi.html`, 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<script>/.exec(html)![1]!;
  const w = window as unknown as Record<string, unknown>;
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]!;
  new Function(`${script}; Object.assign(window, { addEdu, addJob, openDlg });`)();
  for (const el of document.querySelectorAll<HTMLElement>('[onclick]')) {
    const fn = /(\w+)\(\)/.exec(el.getAttribute('onclick')!)?.[1];
    el.removeAttribute('onclick');
    if (fn && typeof w[fn] === 'function') el.addEventListener('click', () => (w[fn] as () => void)());
    else el.addEventListener('click', () => { w.__saved = true; });
  }
}

describe('自动添加经历（计划书 V1）', () => {
  it('找到三个“添加”按钮并认出分区', () => {
    load();
    expect(findAddButtons(document).map((b) => b.section)).toEqual(['education', 'internship', 'family']);
  });

  it('档案多出来的经历：点添加再填；弹窗的不填，关掉并说明', async () => {
    load();
    const { report } = await runFill(document, sampleProfile(), null, { addEntries: true });
    expect(report.added).toEqual([{ name: '教育经历', count: 1 }, { name: '实习经历', count: 1 }]);
    expect(report.addNotes).toEqual([expect.stringContaining('家庭成员要在弹出的窗口里填写')]);
    const values = [...document.querySelectorAll<HTMLInputElement>('form > div input, #job input, #edu input')].map((i) => i.value);
    expect(values).toEqual(expect.arrayContaining(['北京大学', '计算机技术', '武汉大学', '软件工程', '示例科技', '后端开发实习生']));
    expect(document.getElementById('dlg')!.hidden).toBe(true);
    expect((window as unknown as { __saved?: boolean }).__saved).toBeFalsy();
    // 教育只加了一次（档案 2 段），没有多加
    expect(document.querySelectorAll('#edu .block').length).toBe(2);
  });
});

describe('真实页面上的“添加”按钮', () => {
  it.each([
    ['beisen-zhuanzhuan', ['education']],
    ['moka-danone', ['education', 'internship', 'award']],
  ])('%s', (name, sections) => {
    document.body.innerHTML = readFileSync(`${import.meta.dirname}/fixtures/forms/real/${name}.html`, 'utf8').replace(/^[\s\S]*?<body[^>]*>/, '');
    expect(findAddButtons(document).map((b) => b.section)).toEqual(sections);
  });
});
