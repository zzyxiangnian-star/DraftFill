import { fillDocument } from '@/src/lib/fill/fill';
import type { FillResult, Request } from '@/src/lib/messages';
import { activeProfile, loadStore } from '@/src/lib/profile/store';

declare global {
  interface Window { __wangshenReady?: boolean; __wangshenFilling?: boolean }
}

async function fill(): Promise<FillResult> {
  if (window.__wangshenFilling) return { ok: false, reason: '正在填写，请稍等' };
  const profile = activeProfile(await loadStore());
  if (!profile) return { ok: false, reason: '还没有档案，请先在设置页创建' };
  window.__wangshenFilling = true;
  try {
    return { ok: true, report: await fillDocument(document, profile) };
  } finally {
    window.__wangshenFilling = false;
  }
}

// runtime 注册：不写进 manifest 的 content_scripts，只在用户点击后由 background 注入。
export default defineContentScript({
  registration: 'runtime',
  main() {
    // 同一页面可能被多次注入，只挂一次监听
    if (window.__wangshenReady) return;
    window.__wangshenReady = true;

    browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
      if (msg.type === 'fill') {
        fill().then(sendResponse, (e) => sendResponse({ ok: false, reason: `填写出错：${String(e)}` } satisfies FillResult));
        return true;
      }
    });
  },
});
