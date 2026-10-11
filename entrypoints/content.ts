import { countNewFillable, runFill, undoFill, type FillEntry } from '@/src/lib/fill/fill';
import { applyMarks, clearMarks, reveal } from '@/src/lib/fill/marks';
import { pageChangeItem } from '@/src/lib/fill/reportStore';
import type { FillResult, Request, RevealResult, UndoResult } from '@/src/lib/messages';
import { activeProfile, loadStore } from '@/src/lib/profile/store';

declare global {
  interface Window {
    __wangshenReady?: boolean; __wangshenBusy?: boolean; __wangshenEntries?: FillEntry[];
    __wangshenWatch?: () => void;
  }
}

const NO_RECORD = '这个页面没有本次的填写记录（可能刷新过），无法定位或撤销';
/** 填写后盯多久页面变化（多步表单一般在这段时间里点下一步） */
const WATCH_MS = 30 * 60 * 1000;

async function exclusive<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; reason: string }> {
  if (window.__wangshenBusy) return { ok: false, reason: '正在处理上一个操作，请稍等' };
  window.__wangshenBusy = true;
  try { return await fn(); } finally { window.__wangshenBusy = false; }
}

/**
 * 计划书 V8：填写后留意页面变化。多步表单点了下一步、或者展开了新的一段时，
 * 只在侧边栏提示“出现了新字段”，由用户再点一次填写，不自动填。
 */
function watchPage(entries: FillEntry[]) {
  window.__wangshenWatch?.();
  const seen = new WeakSet<Element>(entries.map((e) => e.control.el));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  const check = async () => {
    if (window.__wangshenBusy) return;
    const profile = activeProfile(await loadStore());
    if (!profile) return;
    const count = countNewFillable(document, profile, seen);
    if (count === last) return;
    last = count;
    await pageChangeItem.setValue(count ? { url: location.href, at: Date.now(), count } : null);
  };
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void check(), 800);
  });
  // 多步表单常常只是切换 hidden / style / class 来显示下一步
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  const stop = () => { observer.disconnect(); clearTimeout(timer); clearTimeout(expire); window.__wangshenWatch = undefined; };
  const expire = setTimeout(stop, WATCH_MS);
  window.__wangshenWatch = stop;
}

async function fill(): Promise<FillResult> {
  const profile = activeProfile(await loadStore());
  if (!profile) return { ok: false, reason: '还没有档案，请先在设置页创建' };
  window.__wangshenWatch?.();
  const run = await runFill(document, profile);
  window.__wangshenEntries = run.entries;
  applyMarks(document, run.entries);
  await pageChangeItem.setValue(null);
  watchPage(run.entries);
  return { ok: true, report: run.report };
}

async function undo(): Promise<UndoResult> {
  const entries = window.__wangshenEntries;
  if (!entries) return { ok: false, reason: NO_RECORD };
  window.__wangshenWatch?.();
  const r = await undoFill(entries);
  clearMarks(document);
  window.__wangshenEntries = undefined;
  await pageChangeItem.setValue(null);
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
