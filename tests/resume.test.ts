import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { itemsToLines, type TextItem } from '../src/lib/resume/lines';
import { parseResume } from '../src/lib/resume/parse';

// 虚构的简历（tests/fixtures/resumes），三种常见写法；PDF、Word 版本由 txt 生成，用来测读文字这一步。

const dir = `${import.meta.dirname}/fixtures/resumes`;
const txt = (f: string) => readFileSync(`${dir}/${f}`, 'utf8');

async function pdfText(file: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`${dir}/${file}`)) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(itemsToLines(c.items.filter((x) => 'str' in x) as TextItem[]).join('\n'));
  }
  return out.join('\n');
}

async function docxText(file: string): Promise<string> {
  const mammoth = await import('mammoth');
  return (await mammoth.extractRawText({ buffer: readFileSync(`${dir}/${file}`) })).value;
}

function checkClassic(text: string) {
  const { profile: p, notes } = parseResume(text);
  expect(notes).toEqual([]);
  expect(p.basic).toMatchObject({ name: '王小明', gender: '男', phone: '13800138000', email: 'wangxm@example.com', politicalStatus: '中共党员' });
  expect(p.intention).toMatchObject({ positions: '后端开发工程师', cities: '北京、上海' });
  expect(p.education).toHaveLength(2);
  expect(p.education[0]).toMatchObject({ school: '北京理工大学', major: '计算机科学与技术', degree: '硕士研究生', start: '2024-09', end: '2027-06',
    gpa: '3.8', gpaScale: '4.0', rank: '5', rankTotal: '120' });
  expect(p.education[0]!.courses).toContain('操作系统');
  expect(p.education[1]).toMatchObject({ school: '华中科技大学', major: '软件工程', degree: '本科', start: '2020-09', end: '2024-06' });
  expect(p.internships).toHaveLength(1);
  expect(p.internships[0]).toMatchObject({ company: '字节跳动科技有限公司', title: '后端开发实习生', department: '抖音电商部', start: '2025-06', end: '2025-09' });
  expect(p.internships[0]!.description).toContain('订单服务');
  expect(p.projects[0]).toMatchObject({ name: '校园二手交易平台', role: '后端负责人', start: '2024-10' });
  expect(p.campus[0]).toMatchObject({ organization: '校学生会技术部', role: '部长' });
  expect(p.awards.map((a) => [a.name, a.date])).toEqual([['国家奖学金', '2022-10'], ['全国大学生数学建模竞赛省级一等奖', '2023-05']]);
  expect(p.awards[1]!.level).toBe('省级');
  expect(p.skills).toMatchObject({ cet4: '580', cet6: '520', computerLevel: '二级' });
}

function checkKv(text: string) {
  const { profile: p } = parseResume(text);
  expect(p.basic).toMatchObject({ name: '李思雨', gender: '女', birthDate: '2002-03', ethnicity: '汉族', politicalStatus: '共青团员',
    nativePlace: '浙江杭州', phone: '15912345678', email: 'lisiyu@example.com' });
  expect(p.education[0]).toMatchObject({ school: '复旦大学', college: '新闻学院', major: '新闻学', degree: '本科', start: '2020-09', end: '2024-06', gpa: '3.6', rank: '前10%' });
  expect(p.internships[0]).toMatchObject({ company: '上海文化传媒有限公司', title: '内容运营实习生', start: '2023-07', end: '2023-09' });
  expect(p.awards.map((a) => a.name)).toEqual(['校级一等奖学金（2022.11）'.replace('（2022.11）', ''), '全国大学生广告艺术大赛三等奖']);
  expect(p.awards[0]!.date).toBe('2022-11');
  expect(p.skills.cet6).toBe('550');
  expect(p.skills.certificates.map((c) => c.name)).toContain('普通话二级甲等证书');
}

describe('简历识别（文字）', () => {
  it('常见的“时间 学校 专业 学历”一行写法', () => checkClassic(txt('a-classic.txt')));
  it('“姓名：xx”键值写法，时间在第二行', () => checkKv(txt('b-kv.txt')));
  it('信息很少的简历：认出的填上，“至今”结束时间留空', () => {
    const { profile: p } = parseResume(txt('c-minimal.txt'));
    expect(p.basic).toMatchObject({ name: '张伟', phone: '13700001111', email: 'zhangwei@example.com' });
    expect(p.education[0]).toMatchObject({ school: '四川大学', major: '电子信息工程', degree: '本科', start: '2019-09', end: '2023-06' });
    expect(p.internships[0]).toMatchObject({ company: '成都某某科技有限公司', title: '嵌入式软件工程师', start: '2023-07', end: '' });
  });
  it('不是简历的文字：不瞎猜，提示认不出来', () => {
    const r = parseResume('今天天气很好，我们去公园散步。\n晚上吃了火锅。');
    expect(r.profile.basic.name).toBe('');
    expect(r.notes.length).toBeGreaterThan(0);
  });
  it('敏感信息导入后仍默认不自动填写', () => {
    expect(parseResume(txt('a-classic.txt')).profile.autofill).toMatchObject({ phone: false, email: false });
  });
});

describe('简历识别（读文件）', () => {
  it('PDF：表格排版也能按行读出来', async () => checkClassic(await pdfText('a-classic.pdf')));
  it('Word（.docx）', async () => checkKv(await docxText('b-kv.docx')));
});
