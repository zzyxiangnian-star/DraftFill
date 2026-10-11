import type { Request, ScanResult } from '@/src/lib/messages';
import { scanDocument } from '@/src/lib/scan';

declare global {
  interface Window { __wangshenReady?: boolean }
}

// runtime 注册：不写进 manifest 的 content_scripts，只在用户点击后由 background 注入。
export default defineContentScript({
  registration: 'runtime',
  main() {
    // 同一页面可能被多次注入，只挂一次监听
    if (window.__wangshenReady) return;
    window.__wangshenReady = true;

    browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
      if (msg.type === 'scan') {
        sendResponse({ ok: true, summary: scanDocument(document) } satisfies ScanResult);
      }
    });
  },
});
