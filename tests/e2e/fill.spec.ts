import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { FillReport } from '../../src/lib/fill/fill';
import { sampleProfile } from '../fixtures/profile';
import type { Score } from '../fixtures/score';

// 这些回调在插件的 service worker 里执行
declare const chrome: any;

const ROOT = resolve(import.meta.dirname, '../..');
const DIST = join(ROOT, 'tests/fixtures/dist');
const PORT = 8790;
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

let ctx: BrowserContext;
let sw: Worker;
let server: http.Server;
const aiRequests: string[] = [];

function fakeAnswer(body: string): string {
  const sys: string = JSON.parse(body).messages[0].content;
  if (sys.includes('你是一个分类器')) return '{"skill":"general"}';
  if (sys.includes('把下面这份简历正文整理成档案')) {
    return JSON.stringify({
      education: [{ school: '北京理工大学', major: '计算机科学与技术', degree: '硕士研究生', degreeType: '硕士', start: '2024.09', end: '2027.06' },
        { school: '华中科技大学', major: '软件工程', degree: '本科', degreeType: '学士', start: '2020.09', end: '2024.06' }],
      internships: [{ company: '字节跳动科技有限公司', title: '后端开发实习生', department: '抖音电商部', start: '2025.06', end: '2025.09', description: '负责订单服务接口开发，QPS 提升 30%\n参与压测与容量评估' }],
      projects: [{ name: '校园二手交易平台', role: '后端负责人', start: '2024.10', end: '2025.03', description: '使用 Go + MySQL 搭建交易服务' }],
      awards: [{ name: '国家奖学金', level: '国家级', date: '2022.10' }, { name: '全国大学生数学建模竞赛省级一等奖', level: '省级', date: '2023.05' }],
    });
  }
  if (sys.includes('现在遇到一道相似的新题')) {
    return JSON.stringify({ text: '我选择示例科技，是因为在校园二手交易平台项目里做过订单服务，想在电商后端继续深入，项目里把下单接口提速了【待补充：提速了多少】。', changes: ['把原来的公司名换成了示例科技'] });
  }
  if (sys.includes('从用户粘贴的校招通知')) {
    return JSON.stringify({ company: '示例科技', position: '后端开发工程师', kind: '面试',
      events: [{ title: '一面', start: '2026-10-15 14:00', end: '2026-10-15 15:00', place: '腾讯会议', link: 'https://meeting.example.com/abc123' },
        { title: '在线测评', start: '2026-10-14 23:59', deadline: true, link: 'https://made-up.example.com/x' }],
      prepare: ['提前测试摄像头和麦克风'], notes: [] });
  }
  if (sys.includes('填表插件没认出来')) {
    // 认字段：把“昵称”认成学校（只为测试流程），其余认不出
    const user: string = JSON.parse(body).messages[1].content;
    const fields = [...user.matchAll(/(\d+)\. 字段名“([^”]*)”/g)].map((m) => ({ id: Number(m[1]), path: m[2] === '昵称' ? 'education[].school' : null }));
    return JSON.stringify({ fields });
  }
  if (sys.includes('填表插件没能自动填上')) {
    // 操作控件：按面板写法给步骤，值用占位符
    const user: string = JSON.parse(body).messages[1].content;
    const fields = [...user.matchAll(/(\d+)\. 字段“([^”]*)”/g)].map((m) => ({
      id: Number(m[1]),
      steps: m[2] === '出生日期'
        ? [{ do: 'open' }, { do: 'navigate', button: 'cal-prev-year', until: '{YYYY}年', max: 40 }, { do: 'click', text: '{M}月' }, { do: 'click', text: '{D}' }]
        : [{ do: 'open' }, { do: 'click', text: '{YYYY}' }, { do: 'click', text: '{MM}' }],
    }));
    return JSON.stringify({ fields });
  }
  if (sys.includes('候选人的档案里没有现成答案')) {
    const user: string = JSON.parse(body).messages[1].content;
    const answers = [...user.matchAll(/(\d+)\. ([^（\n]+)（/g)].map((m) => ({
      id: Number(m[1]),
      answer: m[2]!.includes('了解') ? '校园宣讲会' : m[2]!.includes('为什么') ? '我在订单服务实习中做过后端开发，想继续做电商后端。' : null,
    }));
    return JSON.stringify({ answers });
  }
  if (sys.includes('"followUps"')) {
    return JSON.stringify({ score: 72, scores: [{ name: '可信度', score: 80 }], summary: '经历扎实，结果写得不够。', strengths: ['有大厂相关实习'],
      issues: [{ level: '高', where: '实习经历', problem: '没有量化结果', fix: '写清压测把接口延迟降低了多少' }], missing: [], followUps: ['压测是怎么做的'] });
  }
  return '### 1 分钟自我介绍\n\n面试官您好，我是**计算机技术**专业的硕士生。\n\n- 在示例科技做过后端开发实习\n- 负责订单服务接口开发';
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    // 假的 AI 服务商：记下收到的请求，按系统提示词返回固定内容
    if (req.url?.startsWith('/v1/')) {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        aiRequests.push(body);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: fakeAnswer(body) } }] }));
      });
      return;
    }
    const f = join(DIST, decodeURIComponent((req.url ?? '/').split('?')[0]!));
    if (!f.startsWith(DIST) || !existsSync(f)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', TYPES[extname(f)] ?? 'application/octet-stream');
    res.end(readFileSync(f));
  }).listen(PORT);

  // 测试时插件拿不到用户点击带来的 activeTab 授权，所以复制一份构建产物并临时加上 host 权限
  const ext = mkdtempSync(join(tmpdir(), 'wangshen-ext-'));
  cpSync(join(ROOT, '.output/chrome-mv3'), ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [`http://localhost:${PORT}/*`];
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));

  ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  const profile = sampleProfile();
  await sw.evaluate((p) => chrome.storage.local.set({ profiles: { schemaVersion: 1, activeId: p.id, profiles: [p] } }), profile);
});

test.afterAll(async () => {
  await ctx?.close();
  server?.close();
});

async function run(name: string) {
  const url = `http://localhost:${PORT}/${name}.html`;
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.addScriptTag({ url: '/probe.js' });
  const score = await page.evaluate(() => (window as unknown as { __probe: () => Score }).__probe());
  const res = await sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ['/content-scripts/content.js'] });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'fill' });
  }, url) as { ok: true; report: FillReport };
  const values = await page.evaluate(() => (window as unknown as { __values?: Record<string, unknown> }).__values ?? null);
  const submitted = await page.evaluate(() => (window as unknown as { __submitted?: boolean }).__submitted ?? false);
  const counts = { ok: 0, warn: 0, err: 0, skip: 0 };
  res.report.items.forEach((i) => counts[i.status]++);
  console.log(`${name}: 识别 ${score.correct}/${score.expected}，填写 ${JSON.stringify(counts)}`);
  const undo = async () => {
    const r = await sw.evaluate(async (u) => {
      const [tab] = await chrome.tabs.query({ url: u });
      return chrome.tabs.sendMessage(tab!.id!, { type: 'undo' });
    }, url) as { ok: true; restored: number; failed: string[] };
    const after = await page.evaluate(() => (window as unknown as { __values?: Record<string, unknown> }).__values ?? null);
    return { ...r, values: after };
  };
  const close = () => page.close(); // 同一地址只保留一个标签页，避免下一次填到旧页面上
  return { score, report: res.report, values, submitted, undo, close };
}

for (const name of ['native', 'antd', 'element']) {
  test(`${name}：识别率 ≥ 90%，无错认，填写无失败，不提交`, async () => {
    const { score, report, submitted, close } = await run(name);
    await close();
    expect(score.details.filter((d) => d.got !== 'none')).toEqual([]);
    expect(score.correct / score.expected).toBeGreaterThanOrEqual(0.9);
    expect(report.items.filter((i) => i.status === 'err')).toEqual([]);
    expect(submitted).toBe(false);
  });
}

test('antd：组件内部状态同步更新（不只是改了输入框文字）', async () => {
  const { values, close } = await run('antd');
  await close();
  expect(values).toMatchObject({ name: '王小明', nation: '汉族', political: '共青团员', topDegree: '硕士', school: '北京大学', adjust: '是', gender: '男' });
  // 级联选省市、专业选项带学科代码（计划书 V2）
  expect(values).toMatchObject({ hukou: ['湖南省', '长沙市'], major: '计算机技术(085404)' });
  expect(values).toHaveProperty('graduate');
  expect(values).not.toHaveProperty('agree', true);
});

test('element：组件内部状态同步更新', async () => {
  const { values, close } = await run('element');
  await close();
  expect(values).toMatchObject({
    name: '王小明', gender: '男', birth: '2001-05', political: '共青团员', idType: '身份证', degree: '硕士研究生',
    degreeType: '硕士', start: '2024-09', end: '2027-06', rel: '父亲', fname: '王大明', avail: '2027-07-01',
  });
  expect(values).toMatchObject({ native: ['湖南省', '长沙市'], school: '北京大学(Peking University)' });
  expect(values).not.toHaveProperty('self');
});

test('antd：撤销后组件状态清空；清不掉的（无清空按钮的下拉、React 单选）如实报告', async () => {
  const { undo, close } = await run('antd');
  const r = await undo();
  await close();
  expect(r.failed.sort()).toEqual(['性别', '是否接受调剂', '最高学历'].sort());
  for (const k of ['name', 'mobile', 'nation', 'political', 'school', 'major', 'graduate', 'birthday', 'desc', 'hukou']) {
    expect(r.values?.[k] ?? '').toBeFalsy();
  }
});

test('element：撤销后组件状态清空；没有清空按钮的下拉如实报告', async () => {
  const { undo, close } = await run('element');
  const r = await undo();
  await close();
  expect(r.failed).toEqual(['学历']);
  for (const k of ['name', 'gender', 'birth', 'political', 'nation', 'start', 'end', 'rel', 'fname', 'avail', 'native', 'school']) {
    expect(r.values?.[k] ?? '').toBeFalsy();
  }
});

test('设置页：简历导入后点「用 AI 整理经历」，只发去掉个人信息的正文，基本信息不变', async () => {
  aiRequests.length = 0;
  await sw.evaluate((port) => chrome.storage.local.set({ aiSettings: { provider: 'custom', apiKey: 'test-key', model: 'fake', baseUrl: `http://localhost:${port}/v1` } }), PORT);
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1180, height: 1400 });
  await page.goto(`chrome-extension://${id}/options.html#backup`);
  await page.locator('input[type=file][accept*=pdf]').setInputFiles(join(ROOT, 'tests/fixtures/resumes/a-classic.pdf'));
  await expect(page.getByText(/认出了 \d+ 项/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '用 AI 整理经历' }).click();
  await expect(page.getByText('经历部分是 AI 按简历原文整理的')).toBeVisible();
  await expect(page.locator('.resume-preview')).toContainText('数学建模');
  await expect(page.locator('.resume-preview')).toContainText('王小明'); // 基本信息来自本地识别
  if (process.env.SHOT_RESUME_AI) await page.screenshot({ path: process.env.SHOT_RESUME_AI, fullPage: true });
  const sent = aiRequests.join('\n');
  expect(sent).toContain('北京理工大学');
  for (const x of ['王小明', '138', 'wangxm@example.com']) expect(JSON.parse(aiRequests[0]!).messages[1].content).not.toContain(x);
  await page.getByRole('button', { name: '取消' }).click();
  await sw.evaluate(() => chrome.storage.local.remove('aiSettings'));
  await page.close();
});

test('通知整理：粘贴面试通知，摘出日程，下载日历文件，记到投递看板', async () => {
  aiRequests.length = 0;
  await sw.evaluate((port) => chrome.storage.local.set({ aiSettings: { provider: 'custom', apiKey: 'test-key', model: 'fake', baseUrl: `http://localhost:${port}/v1` } }), PORT);
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1180, height: 1300 });
  await page.goto(`chrome-extension://${id}/options.html#ai`);
  await page.getByRole('tab', { name: '通知整理' }).click();
  await page.getByPlaceholder(/笔试、测评、面试通知/).fill('王小明你好，诚邀参加示例科技一面：10月15日 14:00-15:00，腾讯会议 https://meeting.example.com/abc123 ，联系电话 13800138000。另请于10月14日23:59前完成测评。');
  await page.getByRole('button', { name: '整理通知' }).click();
  await expect(page.locator('.events li')).toHaveCount(2);
  await expect(page.locator('.events')).toContainText('10 月 15 日（周四） 14:00–15:00');
  await expect(page.locator('.events a')).toHaveCount(1); // 编出来的测评链接不显示
  if (process.env.SHOT_NOTICE) await page.screenshot({ path: process.env.SHOT_NOTICE, fullPage: true });
  const sent = JSON.parse(aiRequests[0]!).messages[1].content as string;
  for (const x of ['王小明', '13800138000']) expect(sent).not.toContain(x);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下载日历文件' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^draftfill-schedule-\d{8}\.ics$/);
  const ics = readFileSync((await download.path())!, 'utf8');
  expect(ics).toContain('DTSTART:20261015T140000');
  expect(ics).toContain('SUMMARY:示例科技 面试 一面');

  await page.getByRole('button', { name: '记到投递看板' }).click();
  await expect(page.getByText(/新记一条「示例科技」|已更新投递看板/)).toBeVisible();
  const apps = await sw.evaluate(async () => (await chrome.storage.local.get('applications')).applications.items);
  expect(apps.find((a: { company: string }) => a.company === '示例科技')).toMatchObject({ status: '面试' });
  await sw.evaluate(() => chrome.storage.local.remove(['aiSettings', 'applications']));
  await page.close();
});

// 简历导入在插件设置页里跑：PDF 用 pdf.js 的 worker，Word 用 mammoth 的浏览器版，都要在 MV3 的安全策略下能用
for (const [file, name] of [['a-classic.pdf', '王小明'], ['b-kv.docx', '李思雨']] as const) {
  test(`设置页：从简历导入 ${file}，预览后存为新档案`, async () => {
    const id = new URL(sw.url()).host;
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${id}/options.html#backup`);
    await page.locator('input[type=file][accept*=pdf]').setInputFiles(join(ROOT, 'tests/fixtures/resumes', file));
    await expect(page.getByText(/认出了 \d+ 项/)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.resume-preview')).toContainText(name);
    await page.getByRole('button', { name: '存为新档案' }).click();
    await expect(page.locator('.title-input')).toHaveValue(`${name}的简历`);
    const stored = await sw.evaluate(() => chrome.storage.local.get('profiles')) as { profiles: { profiles: { title: string; basic: { name: string } }[] } };
    expect(stored.profiles.profiles.some((p) => p.basic.name === name)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
}

test('侧边栏投递看板：填完记一条、改状态、导出表格', async () => {
  const r = await run('native');
  await sw.evaluate((rep) => chrome.storage.local.set({ lastReport: rep }), r.report);
  await sw.evaluate(() => chrome.storage.local.remove('applications'));
  await r.close();
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.getByRole('tab', { name: '投递看板' }).click();
  await page.getByLabel('公司').fill('示例公司');
  await page.getByLabel('岗位').fill('后端开发');
  await page.getByRole('button', { name: '记到看板' }).click();
  await expect(page.locator('.app-item')).toHaveCount(1);
  await expect(page.getByText('刚填写的页面已经记过了')).toBeVisible();
  await page.getByLabel('状态', { exact: true }).selectOption('面试');
  type Stored = { applications: { items: { company: string; status: string; url: string }[] } };
  await expect.poll(async () => ((await sw.evaluate(() => chrome.storage.local.get('applications'))) as Stored).applications.items[0])
    .toMatchObject({ company: '示例公司', status: '面试', url: expect.stringContaining('native.html') });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出表格' }).click();
  expect((await download).suggestedFilename()).toMatch(/^wangshen-applications-\d{8}\.csv$/);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.close();
});

test('多步表单：同源 iframe、shadow DOM 里的字段也能填；必填和附件单独标出；点下一步后提示新字段', async () => {
  const { report, submitted, close } = await run('steps');
  const by = (label: string) => report.items.find((i) => i.label.startsWith(label));
  expect(by('姓名')).toMatchObject({ status: 'ok', value: '王小明', required: true });
  expect(by('户口所在地')).toMatchObject({ required: true });
  expect(by('昵称')?.required).toBeFalsy();
  expect(by('兴趣爱好')).toMatchObject({ status: 'skip', required: true });
  expect(by('上传简历')).toMatchObject({ status: 'skip', attach: true, required: true });
  expect(by('学校名称')).toMatchObject({ status: 'ok', value: '北京大学', required: true });
  expect(by('专业')).toMatchObject({ status: 'ok' });
  expect(by('民族')).toMatchObject({ status: 'ok', value: '汉' });
  expect(report.items.some((i) => i.label.startsWith('公司名称'))).toBe(false);

  // 用户自己点“下一步”，第二步的字段出现，侧边栏收到提示（不会自动填）
  const page = ctx.pages().find((p) => p.url().endsWith('/steps.html'))!;
  await page.click('#next');
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('pageChange')).pageChange?.count ?? 0), { timeout: 5000 }).toBe(2);
  expect(await page.inputValue('#gs')).toBe('');

  // 侧边栏：必填还空着、附件单独成组，并提示填写新出现的字段
  await sw.evaluate((rep) => chrome.storage.local.set({ lastReport: rep }), report);
  const side = await ctx.newPage();
  await side.setViewportSize({ width: 400, height: 900 });
  await side.goto(`chrome-extension://${new URL(sw.url()).host}/sidepanel.html`);
  await expect(side.getByRole('heading', { name: /必填还空着/ })).toBeVisible();
  await expect(side.getByRole('heading', { name: /要你自己上传的附件/ })).toBeVisible();
  await expect(side.getByText('页面上新出现了 2 个能填的字段')).toBeVisible();
  if (process.env.SHOT_STEPS) await side.screenshot({ path: process.env.SHOT_STEPS, fullPage: true });
  await side.close();

  const again = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://localhost/*steps.html' });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'fill' });
  }) as { ok: true; report: FillReport };
  const by2 = (label: string) => again.report.items.find((i) => i.label.startsWith(label));
  expect(by2('公司名称')).toMatchObject({ status: 'ok', value: '示例科技' });
  expect(by2('职位名称')).toMatchObject({ status: 'ok' });
  expect(submitted).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __submitted?: boolean }).__submitted ?? false)).toBe(false);
  await close();
});

test('多段经历：档案比页面多时点“添加”再填；弹出窗口的不填、不点保存', async () => {
  const { report, submitted, close } = await run('multi');
  const page = ctx.pages().find((p) => p.url().endsWith('/multi.html'))!;
  expect(report.added).toEqual([{ name: '教育经历', count: 1 }, { name: '实习经历', count: 1 }]);
  expect(report.addNotes?.[0]).toContain('家庭成员');
  const vals = await page.$$eval('#edu input, #job input', (els) => els.map((e) => (e as HTMLInputElement).value));
  expect(vals).toEqual(['北京大学', '计算机技术', '武汉大学', '软件工程', '示例科技', '后端开发实习生']);
  expect(await page.isHidden('#dlg')).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __saved?: boolean }).__saved ?? false)).toBe(false);
  expect(submitted).toBe(false);

  await sw.evaluate((rep) => chrome.storage.local.set({ lastReport: rep }), report);
  const side = await ctx.newPage();
  await side.setViewportSize({ width: 400, height: 900 });
  await side.goto(`chrome-extension://${new URL(sw.url()).host}/sidepanel.html`);
  await expect(side.getByText('自动添加了 1 段教育经历、1 段实习经历')).toBeVisible();
  await expect(side.getByText(/家庭成员要在弹出的窗口里填写/)).toBeVisible();
  if (process.env.SHOT_MULTI) await side.screenshot({ path: process.env.SHOT_MULTI, fullPage: true });
  await side.close();
  await close();
});

test('候选卡：没填的字段点进去，从档案里选一项填上；记住后下次自动填', async () => {
  const first = await run('steps');
  expect(first.report.items.find((i) => i.label.startsWith('昵称'))).toMatchObject({ status: 'skip' });
  const page = ctx.pages().find((p) => p.url().endsWith('/steps.html'))!;
  await page.click('#nick');
  const card = page.locator('#wangshen-card');
  await expect(card.getByRole('dialog')).toBeVisible();
  await card.getByPlaceholder('搜索档案里的内容').fill('武汉');
  if (process.env.SHOT_CARD) await page.screenshot({ path: process.env.SHOT_CARD });
  await card.getByRole('option', { name: /武汉大学/ }).click();
  await expect(card).toHaveCount(0);
  expect(await page.inputValue('#nick')).toBe('武汉大学');
  await expect.poll(() => sw.evaluate(async () => Object.keys((await chrome.storage.local.get('fieldMemory')).fieldMemory?.items ?? {}).length)).toBe(1);
  // 已经填了的字段、密码框不会弹
  await page.click('#xm');
  await expect(card).toHaveCount(0);
  await first.close();

  const again = await run('steps');
  expect(again.report.items.find((i) => i.label.startsWith('昵称'))).toMatchObject({ status: 'ok', value: '武汉大学', note: '按你之前的选择' });
  expect(again.submitted).toBe(false);
  await sw.evaluate(() => chrome.storage.local.remove('fieldMemory'));
  await again.close();
});

test('AI 认字段：侧边栏点一下，只发字段名；认出的标黄并按网站记住', async () => {
  aiRequests.length = 0;
  await sw.evaluate((port) => chrome.storage.local.set({ aiSettings: { provider: 'custom', apiKey: 'test-key', model: 'fake', baseUrl: `http://localhost:${port}/v1` } }), PORT);
  const first = await run('steps');
  expect(first.report.items.find((i) => i.label.startsWith('昵称'))).toMatchObject({ status: 'skip', note: '没认出这个字段' });
  await sw.evaluate((r) => chrome.storage.local.set({ lastReport: r }), first.report);
  const id = new URL(sw.url()).host;
  const side = await ctx.newPage();
  await side.setViewportSize({ width: 400, height: 1000 });
  await side.goto(`chrome-extension://${id}/sidepanel.html`);
  const page = ctx.pages().find((p) => p.url().endsWith('/steps.html'))!;
  await page.bringToFront(); // 侧边栏操作的是当前标签页
  await side.getByRole('button', { name: 'AI 帮我填完' }).click();
  await expect(side.getByText(/AI 认出 1 个字段，都已标黄/)).toBeVisible({ timeout: 30_000 });
  if (process.env.SHOT_AI_GUESS) await side.screenshot({ path: process.env.SHOT_AI_GUESS, fullPage: true });
  expect(await page.inputValue('#nick')).toBe('北京大学');
  await expect(side.locator('.report-list li', { hasText: '昵称' })).toContainText('AI 认作“学校”，请核对');

  const p = sampleProfile();
  // 认字段只发字段名，不含任何档案内容；回答问题时才带去掉个人信息的简历（有学校、公司，没有姓名电话）
  const match = aiRequests.find((b) => b.includes('填表插件没认出来'))!;
  expect(match).toContain('昵称');
  for (const x of [p.basic.name, p.basic.phone, p.basic.email, p.education[0]!.school, p.internships[0]!.company]) expect(match).not.toContain(x);
  const sent = aiRequests.join('\n');
  for (const x of [p.basic.name, p.basic.phone, p.basic.email]) expect(sent).not.toContain(x);
  const mem = await sw.evaluate(async () => Object.values((await chrome.storage.local.get('fieldMemory')).fieldMemory?.items ?? {}));
  expect(mem).toEqual([expect.objectContaining({ path: 'education[0].school', source: 'ai' })]);
  await first.close();
  await side.close();

  const again = await run('steps');
  expect(again.report.items.find((i) => i.label.startsWith('昵称'))).toMatchObject({ status: 'warn', value: '北京大学', note: 'AI 按字段名认的，请核对' });
  expect(again.submitted).toBe(false);
  await sw.evaluate(() => chrome.storage.local.remove(['fieldMemory', 'aiSettings', 'lastReport']));
  await again.close();
});

test('AI 帮我填完：日期面板按 AI 步骤点选、档案里没有的问题让 AI 回答；不发个人信息，不提交', async () => {
  aiRequests.length = 0;
  await sw.evaluate((port) => chrome.storage.local.set({ aiSettings: { provider: 'custom', apiKey: 'test-key', model: 'fake', baseUrl: `http://localhost:${port}/v1` } }), PORT);
  const first = await run('widgets');
  expect(first.report.items.find((i) => i.label.startsWith('出生日期'))).toMatchObject({ status: 'skip' });
  await sw.evaluate((r) => chrome.storage.local.set({ lastReport: r }), first.report);
  const id = new URL(sw.url()).host;
  const side = await ctx.newPage();
  await side.setViewportSize({ width: 400, height: 1000 });
  await side.goto(`chrome-extension://${id}/sidepanel.html`);
  const page = ctx.pages().find((p) => p.url().endsWith('/widgets.html'))!;
  await page.bringToFront();
  await side.getByRole('button', { name: 'AI 帮我填完' }).click();
  await expect(side.getByText(/都已标黄/)).toBeVisible({ timeout: 30_000 });
  if (process.env.SHOT_AI_FILL) await side.screenshot({ path: process.env.SHOT_AI_FILL, fullPage: true });
  expect(await page.inputValue('#birth')).toBe('2001/5/20');
  expect(await page.inputValue('#enter')).toBe('2024年09月');
  expect(await page.inputValue('#why')).toContain('后端');
  expect(await page.inputValue('#from')).toBe('校园宣讲会');
  expect(await page.inputValue('#dorm')).toBe('');
  await expect(side.locator('.report-list li', { hasText: '出生日期' })).toContainText('AI 操作面板填的');
  await expect(side.locator('.report-list li', { hasText: '为什么' })).toContainText('AI 按你的简历回答的');

  const p = sampleProfile();
  const sent = aiRequests.join('\n');
  expect(sent).toContain('2026年'); // 面板上的按钮文字
  expect(sent).toContain('cal-prev-year');
  // 认字段只发字段名（宿舍楼号会出现）；回答问题时只人知道的题不交给 AI
  expect(aiRequests.find((b) => b.includes('候选人的档案里没有现成答案'))).not.toContain('宿舍楼号');
  for (const x of [p.basic.name, p.basic.phone, p.basic.email, p.basic.birthDate, '2001']) expect(sent).not.toContain(x);
  expect(await page.evaluate(() => (window as unknown as { __submitted?: boolean }).__submitted ?? false)).toBe(false);
  await sw.evaluate(() => chrome.storage.local.remove(['fieldMemory', 'aiSettings', 'lastReport']));
  await first.close();
  await side.close();
});

test('回答库：网申页面的问答题里列出相似题的旧回答；开放题写作里让 AI 按新题改写并存进回答库', async () => {
  const now = Date.now();
  await sw.evaluate((t) => chrome.storage.local.set({ answers: { version: 1, items: [
    { id: 'a1', question: '请做一个自我评价', text: '我做事踏实，喜欢把问题追到底。', company: '华润电力', uses: 0, createdAt: t, updatedAt: t },
    { id: 'a2', question: '为什么选择加入华润电力', text: '我看好华润电力在新能源上的投入。', company: '华润电力', uses: 0, createdAt: t, updatedAt: t },
  ] } }), now);
  const r = await run('native');
  const page = ctx.pages().find((p) => p.url().endsWith('/native.html'))!;
  await page.click('#zwpj');
  const card = page.locator('#wangshen-card');
  await expect(card.getByText('从回答库或档案里选一项填入')).toBeVisible();
  if (process.env.SHOT_ANSWER_CARD) { await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT_ANSWER_CARD }); }
  await card.getByRole('option', { name: /回答库 · 请做一个自我评价/ }).click();
  expect(await page.inputValue('#zwpj')).toBe('我做事踏实，喜欢把问题追到底。');
  await expect.poll(() => sw.evaluate(async () => (await chrome.storage.local.get('answers')).answers.items.find((a: { id: string }) => a.id === 'a1').uses)).toBe(1);
  expect(Object.keys(await sw.evaluate(async () => (await chrome.storage.local.get('fieldMemory')).fieldMemory?.items ?? {}))).toEqual([]);
  expect(r.submitted).toBe(false);
  await r.close();

  aiRequests.length = 0;
  await sw.evaluate((port) => chrome.storage.local.set({ aiSettings: { provider: 'custom', apiKey: 'test-key', model: 'fake', baseUrl: `http://localhost:${port}/v1` } }), PORT);
  const id = new URL(sw.url()).host;
  const opt = await ctx.newPage();
  await opt.setViewportSize({ width: 1180, height: 1300 });
  await opt.goto(`chrome-extension://${id}/options.html#ai`);
  await opt.getByRole('tab', { name: '开放题写作' }).click();
  await opt.getByPlaceholder(/请描述一次你遇到困难/).fill('你为什么选择我们公司？（200字以内）');
  await expect(opt.getByText('回答库里有相似的题')).toBeVisible();
  await opt.getByRole('button', { name: '让 AI 按这道题改写' }).first().click();
  await expect(opt.getByText(/把原来的公司名换成了示例科技/)).toBeVisible();
  const p = sampleProfile();
  const sent = aiRequests.join('\n');
  expect(sent).toContain('华润电力在新能源');
  for (const x of [p.basic.name, p.basic.phone, p.internships[0]!.company]) expect(sent).not.toContain(x);
  // 缺的信息补上之前不能存（计划书 L6）
  await expect(opt.getByText('先补上 1 处再存')).toBeVisible();
  await expect(opt.getByRole('button', { name: '存进回答库' })).toHaveCount(0);
  await opt.getByLabel('提速了多少').fill('40%');
  if (process.env.SHOT_GAPS) await opt.screenshot({ path: process.env.SHOT_GAPS, fullPage: true });
  await opt.getByRole('button', { name: '存进回答库' }).first().click();
  await expect(opt.getByRole('button', { name: '已存进回答库' })).toBeVisible();
  const kept = await sw.evaluate(async () => (await chrome.storage.local.get('answers')).answers.items[0].text);
  expect(kept).toContain('提速了40%');
  if (process.env.SHOT_ANSWERS) await opt.screenshot({ path: process.env.SHOT_ANSWERS, fullPage: true });
  await opt.getByRole('tab', { name: '回答库' }).click();
  await expect(opt.locator('.answer-item')).toHaveCount(3);
  if (process.env.SHOT_ANSWER_LIB) await opt.screenshot({ path: process.env.SHOT_ANSWER_LIB, fullPage: true });
  await sw.evaluate(() => chrome.storage.local.remove(['answers', 'aiSettings', 'lastReport']));
  await opt.close();
});

test('缺信息询问：必填项档案里没有，侧边栏问你；答了才写进页面，存进档案后下次直接填', async () => {
  const before = await sw.evaluate(() => chrome.storage.local.get('profiles'));
  const first = await run('steps');
  expect(first.report.items.find((i) => i.label === '兴趣爱好')).toMatchObject({ status: 'skip', required: true });
  await sw.evaluate((r) => chrome.storage.local.set({ lastReport: r }), first.report);
  const id = new URL(sw.url()).host;
  const side = await ctx.newPage();
  await side.setViewportSize({ width: 400, height: 1000 });
  await side.goto(`chrome-extension://${id}/sidepanel.html`);
  const page = ctx.pages().find((p) => p.url().endsWith('/steps.html'))!;
  await page.bringToFront();
  await expect(side.getByText('有 1 个必填项要问你')).toBeVisible();
  expect(await page.inputValue('#hobby')).toBe(''); // 问之前不填
  await side.getByLabel('兴趣爱好').fill('跑步、摄影');
  if (process.env.SHOT_ASK) await side.screenshot({ path: process.env.SHOT_ASK, fullPage: true });
  await side.getByRole('button', { name: '填上' }).click();
  await expect(side.getByText(/兴趣爱好：已填上，也存进了档案的「其他信息」/)).toBeVisible();
  expect(await page.inputValue('#hobby')).toBe('跑步、摄影');
  expect(first.submitted).toBe(false);
  const custom = await sw.evaluate(async () => (await chrome.storage.local.get('profiles')).profiles.profiles[0].custom);
  expect(custom).toEqual([expect.objectContaining({ label: '兴趣爱好', value: '跑步、摄影' })]);
  await first.close();
  await side.close();

  const again = await run('steps');
  expect(again.report.items.find((i) => i.label === '兴趣爱好')).toMatchObject({ status: 'ok', value: '跑步、摄影' });
  await sw.evaluate((b) => chrome.storage.local.set(b), before);
  await sw.evaluate(() => chrome.storage.local.remove(['lastReport']));
  await again.close();
});

test('使用教程：气泡导览逐页走完；练习页上一键填充能用、不提交', async () => {
  const id = new URL(sw.url()).host;
  const opt = await ctx.newPage();
  await opt.setViewportSize({ width: 1180, height: 860 });
  const errors: string[] = [];
  opt.on('pageerror', (e) => errors.push(e.message));
  await opt.goto(`chrome-extension://${id}/options.html#guide`);
  await expect(opt.getByRole('heading', { name: '使用教程', level: 1 })).toBeVisible();
  if (process.env.SHOT_GUIDE) await opt.screenshot({ path: process.env.SHOT_GUIDE });
  await opt.getByRole('button', { name: '开始导览' }).click();
  const bubble = opt.getByRole('dialog');
  const pages: string[] = [];
  for (let n = 1; ; n++) {
    await expect(bubble).toContainText(new RegExp(`^${n} / \\d+`));
    pages.push(new URL(opt.url()).hash);
    if (process.env.SHOT_TOUR && n === 3) { await opt.waitForTimeout(500); await opt.screenshot({ path: process.env.SHOT_TOUR }); }
    const done = bubble.getByRole('button', { name: '完成' });
    if (await done.count()) { await done.click(); break; }
    await bubble.getByRole('button', { name: '下一步' }).click();
  }
  await expect(bubble).toHaveCount(0);
  expect(new Set(pages)).toEqual(new Set(['#profile', '#backup', '#ai', '#rules', '#guide']));
  expect(errors).toEqual([]);

  // 练习页：从侧边栏点填写，填到练习页上
  const [practice] = await Promise.all([ctx.waitForEvent('page'), opt.getByRole('button', { name: '打开练习页' }).first().click()]);
  await practice.waitForLoadState();
  const side = await ctx.newPage();
  await side.goto(`chrome-extension://${id}/sidepanel.html`);
  await practice.bringToFront();
  const r = await side.evaluate(() => chrome.runtime.sendMessage({ type: 'fill-active-tab' })) as { ok: boolean; report: { items: { label: string; status: string }[] } };

  expect(r).toMatchObject({ ok: true });
  expect(await practice.inputValue('#xm')).toBe('王小明');
  expect(await practice.inputValue('#ssl')).toBe('');
  expect(await practice.locator('#submit-msg').textContent()).toBe('');
  await practice.click('#ssl');
  await expect(practice.locator('#wangshen-card').getByRole('dialog')).toBeVisible();
  if (process.env.SHOT_PRACTICE) await practice.screenshot({ path: process.env.SHOT_PRACTICE, fullPage: true });
  await sw.evaluate(() => chrome.storage.local.remove(['lastReport']));
  await Promise.all([opt.close(), practice.close(), side.close()]);
});

test('收藏岗位：摘出岗位和截止日期，快截止时图标提醒，看板里能跳去分析匹配度', async () => {
  const url = `http://localhost:${PORT}/job.html`;
  const page = await ctx.newPage();
  await page.goto(url);
  const { job } = await sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ['/content-scripts/content.js'] });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'job' });
  }, url) as { job: { company: string; position: string; deadline: string; jd: string; url: string } };
  expect(job).toMatchObject({ company: '示例科技', position: '后端开发工程师', url });
  expect(job.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(job.jd).toContain('负责订单系统');
  expect(job.jd).not.toContain('相关推荐');

  // 弹窗里点“收藏”等于存一条“已收藏”
  await sw.evaluate((j) => chrome.storage.local.set({ applications: { version: 1, items: [{
    id: 'job1', company: j.company, position: j.position, url: j.url, date: '2026-10-01', profileTitle: '', status: '已收藏',
    note: '', deadline: j.deadline, jd: j.jd, createdAt: 1, updatedAt: 1 }] } }), job);
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('1');

  const side = await ctx.newPage();
  await side.setViewportSize({ width: 400, height: 900 });
  await side.goto(`chrome-extension://${new URL(sw.url()).host}/sidepanel.html`);
  await side.getByRole('tab', { name: '投递看板' }).click();
  await expect(side.getByText(/1 个收藏的岗位 3 天内截止/)).toBeVisible();
  await expect(side.getByText('还剩 2 天截止')).toBeVisible();
  if (process.env.SHOT_JOB) await side.screenshot({ path: process.env.SHOT_JOB, fullPage: true });
  const [opt] = await Promise.all([ctx.waitForEvent('page'), side.getByRole('button', { name: '分析匹配度' }).click()]);
  await expect(opt.getByPlaceholder(/岗位职责、任职要求/)).toHaveValue(/负责订单系统/);
  await opt.close();

  await sw.evaluate(() => chrome.storage.local.remove('applications'));
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  await side.close();
  await page.close();
});

test('AI 助手：问问题自动选技能；简历诊断按格式展示；发出去的内容不含个人信息', async () => {
  aiRequests.length = 0;
  await sw.evaluate((port) => chrome.storage.local.set({ aiSettings: { provider: 'custom', apiKey: 'test-key', model: 'fake', baseUrl: `http://localhost:${port}/v1` } }), PORT);
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1180, height: 1100 });
  await page.goto(`chrome-extension://${id}/options.html#ai`);
  await page.getByPlaceholder(/输入问题/).fill('帮我写一个 1 分钟面试自我介绍');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.locator('.skill-tag')).toContainText('自我介绍 · 自动选择');
  await expect(page.locator('.bubble-assistant h4')).toHaveText('1 分钟自我介绍');
  if (process.env.SHOT_AI) await page.screenshot({ path: process.env.SHOT_AI, fullPage: true });

  await page.getByRole('tab', { name: '简历诊断' }).click();
  await page.getByRole('button', { name: '开始诊断' }).click();
  await expect(page.locator('.score').first()).toContainText('72');
  await expect(page.getByText('没有量化结果')).toBeVisible();
  await expect(page.getByText('压测是怎么做的')).toBeVisible();

  const p = sampleProfile();
  const sent = aiRequests.join('\n');
  expect(aiRequests.length).toBe(2); // 关键词选中技能，不用再问模型
  for (const x of [p.basic.name, p.basic.phone, p.basic.email, p.basic.idNumber, '王大明']) expect(sent).not.toContain(x);
  expect(sent).toContain('示例科技');

  // 设置收在「设置」按钮里：API 和技能两栏；关掉的技能不出现在手动选择里
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: 'AI 服务商' })).toBeVisible();
  await page.getByRole('tab', { name: '技能' }).click();
  await page.getByRole('switch', { name: '启用群面准备' }).uncheck({ force: true });
  await expect(page.getByText(/已开启 \d+ \/ \d+ 个技能/)).toBeVisible();
  if (process.env.SHOT_AI_SET) await page.screenshot({ path: process.env.SHOT_AI_SET, fullPage: true });
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('tab', { name: '问 AI' }).click();
  await expect(page.getByRole('combobox', { name: '用哪个技能回答' }).locator('option', { hasText: '模拟面试' })).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: '用哪个技能回答' }).locator('option', { hasText: '群面准备' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '用哪个技能回答' }).locator('option', { hasText: '签约与权益' })).toHaveCount(1);
  await sw.evaluate(() => chrome.storage.local.remove('aiSkillPrefs'));
  await page.close();
});

test('导出简历：只导出勾选的内容，不含身份证号和家庭成员', async () => {
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1180, height: 1200 });
  await page.goto(`chrome-extension://${id}/resume.html`);
  const p = sampleProfile();
  await expect(page.locator('.rs-head h1')).toHaveText(p.basic.name);
  const paper = page.locator('.rs-paper');
  await expect(paper).toContainText('北京大学');
  for (const x of [p.basic.idNumber, '王大明', p.basic.hukou]) if (x) await expect(paper).not.toContainText(x);
  await page.getByRole('switch', { name: /项目经历/ }).uncheck({ force: true });
  await expect(paper).not.toContainText('校园二手交易平台');
  if (process.env.SHOT_RESUME) await page.screenshot({ path: process.env.SHOT_RESUME });
  await page.close();
});
