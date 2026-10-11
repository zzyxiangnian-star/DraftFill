import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fillDocument, planFill, runFill, undoFill } from '../src/lib/fill/fill';
import { sampleProfile } from './fixtures/profile';
import { scorePlan } from './fixtures/score';

function load(file: string) {
  const html = readFileSync(`${import.meta.dirname}/fixtures/forms/${file}`, 'utf8');
  document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '');
}

describe('原生表单识别率', () => {
  it('native.html：识别率 ≥ 90%，没有错认，不该填的不碰', () => {
    load('native.html');
    const s = scorePlan(planFill(document, sampleProfile()));
    console.log(`native.html 识别 ${s.correct}/${s.expected}`, s.details);
    expect(s.wrong).toBe(0);
    expect(s.falsePositive).toBe(0);
    expect(s.correct / s.expected).toBeGreaterThanOrEqual(0.9);
  });
});

describe('原生表单填写', () => {
  it('native.html：写入正确的值、敏感信息不填、不提交', async () => {
    load('native.html');
    const report = await fillDocument(document, sampleProfile());
    const $ = (sel: string) => document.querySelector(sel) as HTMLInputElement;
    const sel = (sel: string) => (document.querySelector(sel) as HTMLSelectElement).selectedOptions[0]?.text;

    expect($('#xm').value).toBe('王小明');
    expect($('input[name=sex][value="1"]').checked).toBe(true);
    expect($('#csrq').value).toBe('2001-05-20');
    expect(sel('#mz')).toBe('汉');
    expect(sel('#zzmm')).toBe('中国共产主义青年团团员');
    expect($('#rx1').value).toBe('2024.09');
    expect($('#by2').value).toBe('2024.06');
    expect(sel('#xl1')).toBe('硕士研究生');
    expect(sel('#xl2')).toBe('大学本科');
    expect($('#ks').value).toBe('2025-06');
    expect($('input[name=tj][value=Y]').checked).toBe(true);
    expect(sel('select[name=gx]')).toBe('父');
    expect($('input[name=jtxm]').value).toBe('王大明');
    expect($('#jjxm').value).toBe('王大明');
    expect($('input[name=sfz]').value).toBe('');
    expect($('#yzm').value).toBe('');
    expect($('#tjr').value).toBe('');
    expect($('#ywm').value).toBe('');
    expect($('#ty').checked).toBe(false);
    expect((window as unknown as { __submitted?: boolean }).__submitted).toBeUndefined();

    const by = (label: string) => report.items.find((i) => i.label.startsWith(label));
    expect(by('身份证号码')).toMatchObject({ status: 'skip', note: expect.stringContaining('敏感') });
    expect(by('信息来源')).toMatchObject({ status: 'warn', value: '公司官网' });
    expect(by('验证码')).toMatchObject({ status: 'skip' });
    expect(report.items.filter((i) => i.status === 'err')).toEqual([]);
  });

  it('页面上已有内容时不覆盖', async () => {
    load('native.html');
    ($('#xm') as HTMLInputElement).value = '张三';
    const report = await fillDocument(document, sampleProfile());
    expect(($('#xm') as HTMLInputElement).value).toBe('张三');
    expect(report.items.find((i) => i.label.startsWith('姓名'))).toMatchObject({ status: 'skip' });
  });
});

function $(sel: string) { return document.querySelector(sel); }

describe('高风险字段与撤销', () => {
  it('籍贯、学历等填上后也标黄请核对', async () => {
    load('native.html');
    const report = await fillDocument(document, sampleProfile());
    const by = (label: string) => report.items.find((i) => i.label.startsWith(label));
    expect(by('籍贯')).toMatchObject({ status: 'warn', value: '湖南长沙', note: '重要信息，请核对' });
    expect(by('学历')).toMatchObject({ status: 'warn' });
    expect(by('姓名')).toMatchObject({ status: 'ok' });
  });

  it('撤销后恢复成填写前的样子', async () => {
    load('native.html');
    ($('#zy2') as HTMLInputElement).value = '已有内容';
    const run = await runFill(document, sampleProfile());
    expect(($('#xm') as HTMLInputElement).value).toBe('王小明');
    const r = await undoFill(run.entries);
    expect(r.failed).toEqual([]);
    expect(r.restored).toBeGreaterThan(30);
    expect(($('#xm') as HTMLInputElement).value).toBe('');
    expect(($('#mz') as HTMLSelectElement).value).toBe('');
    expect(($('input[name=sex][value="1"]') as HTMLInputElement).checked).toBe(false);
    expect(($('#ks') as HTMLInputElement).value).toBe('');
    expect(($('#zy2') as HTMLInputElement).value).toBe('已有内容');
  });

  it('“请选择”占位选项算空，会正常填写', async () => {
    document.body.innerHTML = `<h3>基本信息</h3><label for="g">性别</label>
      <select id="g"><option value="-1">请选择</option><option value="1">男</option><option value="2">女</option></select>`;
    const report = await fillDocument(document, sampleProfile());
    expect(report.items[0]).toMatchObject({ status: 'ok', value: '男' });
  });
});
