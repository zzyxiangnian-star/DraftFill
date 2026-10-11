import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describe as describeControl, detectControls } from '../src/lib/fill/detect';
import { fillDocument, planFill } from '../src/lib/fill/fill';
import { sampleProfile } from './fixtures/profile';
import { scorePlan } from './fixtures/score';

// 真实网申页面快照（tests/fixtures/forms/real）。这里只验证识别；下拉框的真实交互要在真页面上验证。

function load(file: string) {
  const html = readFileSync(`${import.meta.dirname}/fixtures/forms/real/${file}`, 'utf8');
  document.documentElement.innerHTML = html.replace(/^<!--[\s\S]*?-->\s*/, '').replace(/^<!doctype html>/i, '');
}

describe.each([
  ['moka-danone.html', 'Moka · 达能'],
  ['beisen-zhuanzhuan.html', '北森 · 转转'],
])('%s', (file, name) => {
  it(`${name}：没有错认、不该填的不碰，识别率 ≥ 90%`, () => {
    load(file);
    const plan = planFill(document, sampleProfile());
    const s = scorePlan(plan, document);
    console.log(`${name} 识别 ${s.correct}/${s.expected}`, s.details);
    expect(s.wrong).toBe(0);
    expect(s.falsePositive).toBe(0);
    expect(s.correct / s.expected).toBeGreaterThanOrEqual(0.9);
  });
});

describe('必填标记（计划书 V7）', () => {
  // 对照快照里的星号逐个核对：北森 form-item__required，Moka required-asterisk
  const required = (file: string) => {
    load(file);
    return [...new Set(detectControls(document).filter((c) => c.required).map(describeControl))];
  };
  it('北森：13 个必填字段，上传简历、推荐码不是必填', () => {
    expect(required('beisen-zhuanzhuan.html')).toEqual(['姓名', '性别', '出生日期', '邮箱', '手机号码', '期望工作城市', '到岗时间',
      '学校名称', '开始时间', '结束时间', '专业名称', '学历', '学位']);
  });
  it('Moka：必填的附件、意向城市、起止时间都认出；荣誉、照片等选填的不算', () => {
    const r = required('moka-danone.html');
    expect(r).toEqual(expect.arrayContaining(['上传简历', '第二意向城市', '姓名', '性别', '邮箱', '就读时间', '学校名称', '起止时间', '公司名称', '招聘信息来源渠道']));
    for (const optional of ['英文名', '上传照片', '荣誉类型', '荣誉名称', '获奖时间', '推荐码', '最高学历GPA证明']) expect(r).not.toContain(optional);
  });
});

describe('真实页面上的填写（静态快照，没有页面脚本）', () => {
  it('北森：文本框写入并回读；性别单选按北森的选中样式回读；下拉框打不开时如实标红', async () => {
    load('beisen-zhuanzhuan.html');
    // 快照里没有页面脚本：模拟北森单选“点击后加上 --checked 样式”的行为（类名取自北森自己的样式表）
    for (const w of document.querySelectorAll('.phoenix-radio__wrapper')) {
      w.addEventListener('click', () => w.querySelector('.phoenix-radio__dot')!.classList.add('phoenix-radio__dot--checked'));
    }
    const report = await fillDocument(document, sampleProfile());
    const by = (label: string) => report.items.find((i) => i.label.startsWith(label));
    expect(by('姓名')).toMatchObject({ status: 'ok', value: '王小明' });
    expect(by('性别')).toMatchObject({ status: 'ok', value: '男' });
    expect(by('学校名称')).toMatchObject({ status: 'ok' });
    expect(by('学历')).toMatchObject({ status: 'err', note: '下拉框没有打开' });
    expect(report.items.filter((i) => i.status === 'ok').length).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it('Moka：文本框写入；区号、英文名、附件、只读日期不碰', async () => {
    load('moka-danone.html');
    const report = await fillDocument(document, sampleProfile());
    const by = (label: string) => report.items.find((i) => i.label.startsWith(label));
    expect(by('姓名')).toMatchObject({ status: 'ok', value: '王小明' });
    expect(by('英文名')).toMatchObject({ status: 'skip' });
    expect(by('出生日期')).toMatchObject({ status: 'skip', note: expect.stringContaining('面板') });
    expect(by('公司名称')).toMatchObject({ status: 'ok' });
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[placeholder="英文名"], input[readonly]')];
    expect(inputs.every((i) => i.value === '')).toBe(true);
  }, 60_000);
});
