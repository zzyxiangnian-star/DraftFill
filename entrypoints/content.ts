import { runFill, undoFill, type FillEntry } from '@/src/lib/fill/fill';
import { applyMarks, clearMarks, reveal } from '@/src/lib/fill/marks';
import type { FillResult, Request, RevealResult, UndoResult } from '@/src/lib/messages';
import { activeProfile, loadStore } from '@/src/lib/profile/store';

declare global {
  interface Window { __wangshenReady?: boolean; __wangshenBusy?: boolean; __wangshenEntries?: FillEntry[] }
}

const NO_RECORD = '这个页面没有本次的填写记录（可能刷新过），无法定位或撤销';

async function exclusive<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; reason: string }> {
  if (window.__wangshenBusy) return { ok: false, reason: '正在处理上一个操作，请稍等' };
  window.__wangshenBusy = true;
  try { return await fn(); } finally { window.__wangshenBusy = false; }
}

async function fill(): Promise<FillResult> {
  const profile = activeProfile(await loadStore());
  if (!profile) return { ok: false, reason: '还没有档案，请先在设置页创建' };
  const run = await runFill(document, profile);
  window.__wangshenEntries = run.entries;
  applyMarks(document, run.entries);
  return { ok: true, report: run.report };
}

async function undo(): Promise<UndoResult> {
  const entries = window.__wangshenEntries;
  if (!entries) return { ok: false, reason: NO_RECORD };
  const r = await undoFill(entries);
  clearMarks(document);
  window.__wangshenEntries = undefined;
  return { ok: true, ...r };
}

function revealAt(index: number): RevealResult {
  const entry = window.__wangshenEntries?.[index];
  if (!entry || !entry.control.el.isConnected) return { ok: false, reason: NO_RECORD };
  reveal(entry);
  return { ok: true };
}

// runtime 注册：不写进 manifest 的 content_scripts，只在用户点击后由 background 注入。
export default defineContentScript({
  registration: 'runtime',
  main() {
    // 同一页面可能被多次注入，只挂一次监听
    if (window.__wangshenReady) return;
    window.__wangshenReady = true;

    browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
      const fail = (e: unknown) => sendResponse({ ok: false, reason: `出错了：${String(e)}` });
      if (msg.type === 'fill') { exclusive(fill).then(sendResponse, fail); return true; }
      if (msg.type === 'undo') { exclusive(undo).then(sendResponse, fail); return true; }
      if (msg.type === 'reveal') sendResponse(revealAt(msg.index));
    });
  },
});
