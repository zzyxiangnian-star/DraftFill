import { lastReportItem } from '@/src/lib/fill/reportStore';
import { applicationStoreItem, dueSoon } from '@/src/lib/tracker/applications';
import type { AiApplyResult, AiFieldsResult, AskAnswerResult, AskFieldsResult, FillResult, JobResult, Request, RevealResult, UndoResult } from '@/src/lib/messages';

// 用户在 popup 或侧边栏点击后才把 content script 注入当前标签页（activeTab），不常驻任何网站。
async function injectIntoActiveTab(): Promise<{ tabId: number; practice?: boolean } | { reason: string }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  // 插件自带的练习页：页面自己带着填写助手，不用注入。没有 tabs 权限时可能读不到地址，就问一下这个标签页
  if (tab?.id && (!tab.url || tab.url.startsWith(browser.runtime.getURL('/practice.html')))) {
    const pong = await browser.runtime.sendMessage({ type: 'practice-ping', practiceTab: tab.id }).catch(() => null) as { ok?: boolean } | null;
    if (pong?.ok) return { tabId: tab.id, practice: true };
  }
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
  if (t.practice) return browser.runtime.sendMessage({ ...msg, practiceTab: t.tabId });
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
    case 'job-active-tab':
      return forward<JobResult>({ type: 'job' });
    case 'ai-fields-active-tab':
      return forward<AiFieldsResult>({ type: 'ai-fields' });
    case 'ai-apply-active-tab':
      return forward<AiApplyResult>({ type: 'ai-apply', guesses: msg.guesses });
    case 'ask-fields-active-tab':
      return forward<AskFieldsResult>({ type: 'ask-fields' });
    case 'ask-answer-active-tab':
      return forward<AskAnswerResult>({ type: 'ask-answer', index: msg.index, value: msg.value, save: msg.save });
    default:
      return undefined;
  }
}

// 计划书 V6：收藏的岗位 3 天内截止时，在工具栏图标上显示数字。每小时检查一次（日期会变），收藏变化时也更新。
async function updateBadge() {
  const { items } = await applicationStoreItem.getValue();
  const n = dueSoon(items).length;
  const base = browser.runtime.getManifest().action?.default_title ?? '';
  await browser.action.setBadgeBackgroundColor({ color: '#b4432f' });
  await browser.action.setBadgeText({ text: n ? String(n) : '' });
  await browser.action.setTitle({ title: n ? `${base}：${n} 个收藏的岗位快截止了` : base });
}

export default defineBackground(() => {
  // 第一次装上时打开使用教程（更新版本时不打开）
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/options.html#guide') });
  });
  browser.alarms.create('deadline', { periodInMinutes: 60 });
  browser.alarms.onAlarm.addListener((a) => { if (a.name === 'deadline') void updateBadge(); });
  browser.runtime.onStartup.addListener(() => void updateBadge());
  applicationStoreItem.watch(() => void updateBadge());
  void updateBadge();

  browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    if (!msg.type.endsWith('-active-tab')) return;
    handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) }));
    return true;
  });
});
