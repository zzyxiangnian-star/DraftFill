// 生成 README 用的截图（docs/screenshots）：练习页一键填充、候选卡、缺信息询问、档案、简历导入、AI 助手、导览、投递看板。
// 用法：npm run screens（需要 ffmpeg 拼图）。用 playwright.demo.config.ts 单独跑，平时的 e2e 不包含它。所有数据都是虚构的。
import { chromium, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { sampleProfile } from '../fixtures/profile';

declare const chrome: any;
const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'docs/screenshots');
const PORT = 8792;
const SCALE = 2;

// 假的 AI 服务商，只给截图用
function fakeAnswer(body: string): string {
  const sys: string = JSON.parse(body).messages[0].content;
  if (sys.includes('你是一个分类器')) return '{"skill":"general"}';
  return '### 1 分钟自我介绍\n\n面试官您好，我是北京大学**计算机技术**专业的硕士生，想应聘后端开发工程师。\n\n'
    + '- **实习**：在示例科技基础架构部做后端开发，负责订单服务的接口开发与压测\n'
    + '- **项目**：校园二手交易平台的后端负责人，用 Go 实现交易与消息模块\n'
    + '- **为什么是这个岗位**：喜欢把系统做稳、做快，也希望在高并发场景里继续积累\n\n'
    + '小提示：把压测带来的提升换成具体数字（比如延迟降低了多少），会更有说服力。';
}

test('生成 README 截图', async () => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: fakeAnswer(body) } }] }));
    });
  }).listen(PORT);

  const ext = mkdtempSync(join(tmpdir(), 'draftfill-shots-'));
  cpSync(join(ROOT, '.output/chrome-mv3'), ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [`http://localhost:${PORT}/*`];
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', deviceScaleFactor: SCALE, colorScheme: 'light', locale: 'zh-CN',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--lang=zh-CN'],
  });
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const base = `chrome-extension://${id}`;
  for (const p of ctx.pages()) if (p.url().includes('options.html')) await p.close(); // 安装时自动打开的教程

  const profile = sampleProfile();
  profile.title = '后端开发';
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const app = (company: string, position: string, status: string, deadline = '', date = day(-3)) =>
    ({ id: `${company}-${position}`, company, position, url: '', date, profileTitle: '后端开发', status, note: '', deadline, jd: '', createdAt: Date.now(), updatedAt: Date.now() });
  await sw.evaluate(([p, apps, port]) => chrome.storage.local.set({
    profiles: { schemaVersion: 1, activeId: p.id, profiles: [p] },
    applications: { version: 1, items: apps },
    aiSettings: { provider: 'custom', apiKey: 'demo', model: 'demo', baseUrl: `http://localhost:${port}/v1` },
  }), [profile, [
    app('示例科技', '后端开发工程师', '面试', '', day(-6)),
    app('星河互娱', '服务端开发', '笔试/测评', '', day(-4)),
    app('青禾电力', '信息技术岗', '已投递', '', day(-1)),
    app('远山云', '后端开发（存储方向）', '已收藏', day(2), day(0)),
    app('木棉银行', '金融科技岗', '已收藏', day(9), day(0)),
  ], PORT] as const);

  const shot = (name: string) => join(OUT, `${name}.png`);
  // 只截几个元素所在的区域，四周留白
  async function around(page: import('@playwright/test').Page, sels: import('@playwright/test').Locator[], path: string, pad = 24) {
    const boxes = await Promise.all(sels.map(async (l) => (await l.boundingBox())!));
    const vp = page.viewportSize()!;
    const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const r = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), b = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
    await page.screenshot({ path, clip: { x, y, width: r - x, height: b - y } });
  }
  const optimize = (file: string) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', `scale=iw/${SCALE * 0.75}:-1:flags=lanczos`, `${file}.tmp.png`]) && execFileSync('mv', [`${file}.tmp.png`, file]);

  // 1. 练习页一键填充 + 侧边栏结果，拼成一张
  const practice = await ctx.newPage();
  await practice.setViewportSize({ width: 860, height: 820 });
  await practice.goto(`${base}/practice.html`);
  const side = await ctx.newPage();
  await side.setViewportSize({ width: 400, height: 820 });
  await side.goto(`${base}/sidepanel.html`);
  await practice.bringToFront();
  const r = await side.evaluate(() => chrome.runtime.sendMessage({ type: 'fill-active-tab' })) as { ok: boolean };
  expect(r.ok).toBe(true);
  await practice.bringToFront();
  await expect(side.getByText(/必填项要问你/)).toBeVisible({ timeout: 10_000 });
  await practice.evaluate(() => document.querySelector('form')!.scrollIntoView());
  await practice.waitForTimeout(300);
  await practice.screenshot({ path: shot('_a') });
  await side.screenshot({ path: shot('_b') });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', shot('_a'), '-i', shot('_b'), '-filter_complex', 'hstack=inputs=2', shot('fill')]);
  optimize(shot('fill'));

  // 2. 缺信息询问（侧边栏）
  await side.getByLabel('宿舍楼号').fill('12 号楼');
  await around(side, [side.locator('section', { hasText: '必填项要问你' })], shot('ask'), 16);
  optimize(shot('ask'));

  // 3. 候选卡
  await practice.locator('#ssl').scrollIntoViewIfNeeded();
  await practice.click('#ssl');
  await expect(practice.locator('#wangshen-card').getByRole('dialog')).toBeVisible();
  await practice.waitForTimeout(300);
  await around(practice, [practice.getByText('电子邮箱').first(), practice.getByText('宿舍楼号').first(), practice.locator('#ssl'), practice.locator('#wangshen-card').getByRole('dialog')], shot('card'), 32);
  optimize(shot('card'));
  await practice.keyboard.press('Escape');

  // 4. 投递看板（清掉刚才的填写记录，只看列表）
  await sw.evaluate(() => chrome.storage.local.remove('lastReport'));
  await side.reload();
  await side.getByRole('tab', { name: '投递看板' }).click();
  await side.waitForTimeout(300);
  await side.screenshot({ path: shot('board'), clip: { x: 0, y: 60, width: 400, height: 480 } });
  optimize(shot('board'));
  await Promise.all([practice.close(), side.close()]);

  const opt = await ctx.newPage();
  await opt.setViewportSize({ width: 1200, height: 800 });

  // 5. 个人档案
  await opt.goto(`${base}/options.html#profile`);
  await expect(opt.locator('#education')).toBeVisible();
  await opt.waitForTimeout(300);
  await opt.screenshot({ path: shot('profile') });
  optimize(shot('profile'));

  // 6. 从简历导入
  await opt.goto(`${base}/options.html#backup`);
  await opt.locator('input[type=file][accept*=pdf]').setInputFiles(join(ROOT, 'tests/fixtures/resumes/a-classic.pdf'));
  await expect(opt.getByText(/认出了 \d+ 项/)).toBeVisible({ timeout: 15_000 });
  await opt.waitForTimeout(300);
  await opt.screenshot({ path: shot('import') });
  optimize(shot('import'));

  // 7. AI 助手
  await opt.goto(`${base}/options.html#ai`);
  await opt.getByPlaceholder(/输入问题/).fill('帮我写一个 1 分钟面试自我介绍');
  await opt.getByRole('button', { name: '发送' }).click();
  await expect(opt.locator('.bubble-assistant h4')).toHaveText('1 分钟自我介绍');
  await opt.waitForTimeout(300);
  await opt.screenshot({ path: shot('ai') });
  optimize(shot('ai'));

  // 8. 气泡导览
  await opt.goto(`${base}/options.html#guide`);
  await opt.getByRole('button', { name: '开始导览' }).click();
  const bubble = opt.getByRole('dialog');
  await expect(bubble).toContainText(/^1 \//);
  await bubble.getByRole('button', { name: '下一步' }).click();
  await expect(bubble).toContainText(/^2 \//);
  await opt.waitForTimeout(700);
  await around(opt, [opt.locator('.tour-bubble'), opt.locator('[data-tour="profile-tabs"]')], shot('tour'), 40);
  optimize(shot('tour'));

  execFileSync('rm', ['-f', shot('_a'), shot('_b')]);
  console.log(`已生成截图到 ${OUT}`);
  await ctx.close();
  server.close();
});
