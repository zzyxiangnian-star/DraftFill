import { lastReportItem } from '@/src/lib/fill/reportStore';
import type { FillResult, Request, RevealResult, UndoResult } from '@/src/lib/messages';

// 用户在 popup 或侧边栏点击后才把 content script 注入当前标签页（activeTab），不常驻任何网站。
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

async function forward<T extends { ok: boolean }>(msg: Request): Promise<T | { ok: false; reason: string }> {
  const t = await injectIntoActiveTab();
  if ('reason' in t) return { ok: false, reason: t.reason };
  return browser.tabs.sendMessage(t.tabId, msg);
}

async function handle(msg: Request): Promise<unknown> {
  switch (msg.type) {
    case 'fill-active-tab': {
      const r = await forward<FillResult>({ type: 'fill' });
      if (r.ok) await lastReportItem.setValue(r.report);
      return r;
    }
    case 'undo-active-tab': {
      const r = await forward<UndoResult>({ type: 'undo' });
      const last = await lastReportItem.getValue();
      if (r.ok && last) await lastReportItem.setValue({ ...last, undoneAt: Date.now() });
      return r;
    }
    case 'reveal-active-tab':
      return forward<RevealResult>({ type: 'reveal', index: msg.index });
    default:
      return undefined;
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    if (!msg.type.endsWith('-active-tab')) return;
    handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) }));
    return true;
  });
});
