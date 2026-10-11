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
  expect(values).not.toHaveProperty('self');
});

test('antd：撤销后组件状态清空；清不掉的（无清空按钮的下拉、React 单选）如实报告', async () => {
  const { undo, close } = await run('antd');
  const r = await undo();
  await close();
  expect(r.failed.sort()).toEqual(['性别', '是否接受调剂', '最高学历'].sort());
  for (const k of ['name', 'mobile', 'nation', 'political', 'school', 'major', 'graduate', 'birthday', 'desc']) {
    expect(r.values?.[k] ?? '').toBeFalsy();
  }
});

test('element：撤销后组件状态清空；没有清空按钮的下拉如实报告', async () => {
  const { undo, close } = await run('element');
  const r = await undo();
  await close();
  expect(r.failed).toEqual(['学历']);
  for (const k of ['name', 'gender', 'birth', 'political', 'nation', 'start', 'end', 'rel', 'fname', 'avail']) {
    expect(r.values?.[k] ?? '').toBeFalsy();
  }
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
