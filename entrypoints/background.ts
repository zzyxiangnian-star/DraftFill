import { lastReportItem } from '@/src/lib/fill/reportStore';
import type { FillResult, Request } from '@/src/lib/messages';

// 用户在 popup 点击后才把 content script 注入当前标签页（activeTab），不常驻任何网站。
async function injectIntoActiveTab(): Promise<{ tabId: number } | { reason: string }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:|^file:/.test(tab.url)) {
    return { reason: '当前页面不是网页，浏览器不允许插件读取。' };
  }
  try {
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/content.js'] });
    return { tabId: tab.id };
  } catch (e) {
    return { reason: `无法读取这个页面：${e instanceof Error ? e.message : String(e)}` };
  }
}

async function fillActiveTab(): Promise<FillResult> {
  const t = await injectIntoActiveTab();
  if ('reason' in t) return { ok: false, reason: t.reason };
  const r: FillResult = await browser.tabs.sendMessage(t.tabId, { type: 'fill' } satisfies Request);
  if (r.ok) await lastReportItem.setValue(r.report);
  return r;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    if (msg.type === 'fill-active-tab') {
      fillActiveTab().then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) } satisfies FillResult));
      return true;
    }
  });
});
