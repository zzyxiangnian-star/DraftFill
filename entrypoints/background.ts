import type { Request, ScanResult } from '@/src/lib/messages';

// 用户在 popup 点击后才把 content script 注入当前标签页（activeTab），不常驻任何网站。
async function scanActiveTab(): Promise<ScanResult> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:|^file:/.test(tab.url)) {
    return { ok: false, reason: '当前页面不是网页，浏览器不允许插件读取。' };
  }
  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['/content-scripts/content.js'],
    });
    return await browser.tabs.sendMessage(tab.id, { type: 'scan' } satisfies Request);
  } catch (e) {
    return { ok: false, reason: `无法读取这个页面：${e instanceof Error ? e.message : String(e)}` };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    if (msg.type === 'scan-active-tab') {
      scanActiveTab().then(sendResponse);
      return true;
    }
  });
});
