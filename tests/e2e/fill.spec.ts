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

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
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
