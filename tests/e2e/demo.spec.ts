// 生成 README 用的演示动图：在测试表单上一键填写 → 页面标色 → 侧边栏结果 → 投递看板。
// 用法：npm run demo（需要 ffmpeg）。用 playwright.demo.config.ts 单独跑，平时的 e2e 不包含它。
import { chromium, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

import { sampleProfile } from '../fixtures/profile';

declare const chrome: any;
const ROOT = resolve(import.meta.dirname, '../..');
const DIST = join(ROOT, 'tests/fixtures/dist');
const OUT = join(ROOT, 'docs/demo.gif');
const PORT = 8791;

test('生成演示动图', async () => {
test.setTimeout(120_000);
const server = http.createServer((req, res) => {
  const f = join(DIST, decodeURIComponent((req.url ?? '/').split('?')[0]!));
  if (!f.startsWith(DIST) || !existsSync(f)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(f)] ?? 'application/octet-stream');
  res.end(readFileSync(f));
}).listen(PORT);

const ext = mkdtempSync(join(tmpdir(), 'wangshen-demo-'));
cpSync(join(ROOT, '.output/chrome-mv3'), ext, { recursive: true });
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = [`http://localhost:${PORT}/*`];
writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', viewport: { width: 860, height: 720 }, deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;

// 虚构档案
const profile = sampleProfile();
await sw.evaluate((p) => chrome.storage.local.set({ profiles: { schemaVersion: 1, activeId: p.id, profiles: [p] }, applications: { version: 1, items: [] } }), profile);

const frames = mkdtempSync(join(tmpdir(), 'wangshen-frames-'));
let n = 0;
const page = await ctx.newPage();
const side = await ctx.newPage();
await side.setViewportSize({ width: 380, height: 720 });
const url = `http://localhost:${PORT}/antd.html`;
await page.goto(url);
await page.waitForLoadState('networkidle');

async function frame(hold = 1) {
  await page.bringToFront();
  const a = join(frames, `a${n}.png`), b = join(frames, `b${n}.png`);
  await page.screenshot({ path: a });
  await side.screenshot({ path: b });
  for (let i = 0; i < hold; i++) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', a, '-i', b, '-filter_complex', 'hstack=inputs=2', join(frames, `f${String(n).padStart(3, '0')}.png`)]);
    n++;
  }
}

await side.goto(`chrome-extension://${id}/sidepanel.html`);
await frame(3);
const res = await sw.evaluate(async (u) => {
  const [tab] = await chrome.tabs.query({ url: u });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/content.js'] });
  return chrome.tabs.sendMessage(tab.id, { type: 'fill' });
}, url) as { report: unknown };
await sw.evaluate((rep) => chrome.storage.local.set({ lastReport: rep }), res.report);
await side.waitForTimeout(300);
await frame(4);
await page.mouse.wheel(0, 500);
await page.waitForTimeout(200);
await frame(3);
await side.getByRole('tab', { name: '投递看板' }).click();
await side.getByLabel('公司').fill('示例科技');
await side.getByLabel('岗位').fill('后端开发');
await frame(2);
await side.getByRole('button', { name: '记到看板' }).click();
await side.waitForTimeout(200);
await frame(4);

execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', join(frames, 'f%03d.png'),
  '-vf', 'scale=1240:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=none', OUT]);
console.log(`已生成 ${OUT}`);
await ctx.close();
server.close();
});
