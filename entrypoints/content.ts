import { startCandidateCard, type PickEvent } from '@/src/lib/fill/card';
import { ANSWER_PREFIX, countNewFillable, fillFromCandidate, fillFromGuess, guessPath, runFill, undoFill, unknownFields, UNKNOWN_REASON, type FillEntry, type FillItem } from '@/src/lib/fill/fill';
import { applyMarks, clearMarks, reveal } from '@/src/lib/fill/marks';
import { fieldMemoryItem, hostOf, remember, signature } from '@/src/lib/fill/memory';
import { lastReportItem, pageChangeItem } from '@/src/lib/fill/reportStore';
import type { AiApplyResult, AiFieldsResult, FillResult, Request, RevealResult, UndoResult } from '@/src/lib/messages';
import type { FieldGuess } from '@/src/lib/ai/skills/fieldMatch';
import { activeProfile, loadStore } from '@/src/lib/profile/store';
import { extractJob } from '@/src/lib/tracker/jobPage';
import { answerStoreItem, markUsed } from '@/src/lib/answers/library';
import type { Profile } from '@/src/lib/profile/schema';

declare global {
  interface Window {
    __wangshenReady?: boolean; __wangshenBusy?: boolean; __wangshenEntries?: FillEntry[];
    __wangshenWatch?: () => void; __wangshenCard?: () => void;
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
    const count = countNewFillable(document, profile, seen, await fieldMemoryItem.getValue());
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
  window.__wangshenCard?.();
  const run = await runFill(document, profile, await fieldMemoryItem.getValue(), { addEntries: true });
  window.__wangshenEntries = run.entries;
  applyMarks(document, run.entries);
  await pageChangeItem.setValue(null);
  watchPage(run.entries);
  await openCard(run.entries, profile);
  return { ok: true, report: run.report };
}

/** 打开候选卡；多行文本框里同时列出回答库里相似题的旧回答（计划书 L4） */
async function openCard(entries: FillEntry[], profile: Profile) {
  const answers = (await answerStoreItem.getValue()).items;
  window.__wangshenCard = startCandidateCard(document, entries, { profile, answers, onPick: (e) => pick(entries, e) });
}

/** 计划书 V5 + V4：用户在候选卡里选了一项。写入、标色、更新侧边栏；勾了“记住”就按字段签名记下来。 */
async function pick(entries: FillEntry[], { entry, candidate, remember: keep }: PickEvent): Promise<boolean> {
  if (window.__wangshenBusy) return false;
  window.__wangshenBusy = true;
  try {
    const item = await fillFromCandidate(entry, candidate.path, candidate.value);
    const ok = item.status === 'ok' || item.status === 'warn';
    applyMarks(document, entries);
    await updateReport([item]);
    const host = hostOf(location.href);
    const sig = signature(entry.control, host);
    if (ok && candidate.path.startsWith(ANSWER_PREFIX)) {
      // 回答库的旧回答不按字段记住（每家的题不一样），只记用过几次
      await answerStoreItem.setValue(markUsed(await answerStoreItem.getValue(), candidate.path.slice(ANSWER_PREFIX.length)));
    } else if (ok && keep && sig) {
      const label = entry.item.label.replace(/（.*$/, '');
      await fieldMemoryItem.setValue(remember(await fieldMemoryItem.getValue(), sig, { path: candidate.path, label, host }));
    }
    return ok;
  } finally {
    window.__wangshenBusy = false;
  }
}

/** 侧边栏里更新这一项（同一页面、没撤销过的记录） */
async function updateReport(items: FillItem[]) {
  const last = await lastReportItem.getValue();
  if (!last || last.url !== location.href || last.undoneAt) return;
  const byIndex = new Map(items.map((i) => [i.index, i]));
  await lastReportItem.setValue({ ...last, items: last.items.map((i) => byIndex.get(i.index) ?? i) });
}

/** 计划书 L2：把没认出的字段交给侧边栏（只有字段名、分区和选项），由侧边栏去问 AI */
async function aiFields(): Promise<AiFieldsResult> {
  const entries = window.__wangshenEntries;
  if (!entries) return { ok: false, reason: NO_RECORD };
  const profile = activeProfile(await loadStore());
  return { ok: true, fields: unknownFields(entries), custom: (profile?.custom ?? []).filter((f) => f.label).map((f) => ({ id: f.id, label: f.label })) };
}

/** 写入 AI 认出的字段，标黄；按网站记下来，下次直接认（仍标黄） */
async function aiApply(guesses: FieldGuess[]): Promise<AiApplyResult> {
  const entries = window.__wangshenEntries;
  if (!entries) return { ok: false, reason: NO_RECORD };
  const profile = activeProfile(await loadStore());
  if (!profile) return { ok: false, reason: '还没有档案，请先在设置页创建' };
  window.__wangshenCard?.(); // 写入期间先停掉候选卡，写完再按新结果打开
  const host = hostOf(location.href);
  let memory = await fieldMemoryItem.getValue();
  const changed: FillItem[] = [];
  for (const g of guesses) {
    const e = entries[g.id];
    if (!e || e.item.path !== null || e.item.note !== UNKNOWN_REASON) continue;
    const path = guessPath(entries, g.id, g.path);
    const item = await fillFromGuess(e, path, profile);
    changed.push(item);
    const sig = signature(e.control, host);
    if (item.status === 'warn' && sig) {
      memory = remember(memory, sig, { path, label: e.item.label.replace(/（.*$/, ''), host, source: 'ai' });
    }
  }
  await fieldMemoryItem.setValue(memory);
  applyMarks(document, entries);
  await updateReport(changed);
  await openCard(entries, profile);
  const filled = changed.filter((i) => i.status === 'warn').length;
  return { ok: true, filled, skipped: changed.length - filled };
}

async function undo(): Promise<UndoResult> {
  const entries = window.__wangshenEntries;
  if (!entries) return { ok: false, reason: NO_RECORD };
  window.__wangshenWatch?.();
  window.__wangshenCard?.();
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
      if (msg.type === 'job') sendResponse({ ok: true, job: extractJob(document) });
      if (msg.type === 'ai-fields') { aiFields().then(sendResponse, fail); return true; }
      if (msg.type === 'ai-apply') { exclusive(() => aiApply(msg.guesses)).then(sendResponse, fail); return true; }
    });
  },
});
