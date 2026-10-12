import { storage } from 'wxt/utils/storage';

// 悬浮按钮：用户在弹窗里打开「在这个网站一直显示」的网站。
// 只有这些网站会多一项权限（浏览器问过用户），打开页面时只显示按钮，不读表单，点了才填。

export const fabSitesItem = storage.defineItem<string[]>('local:fabSites', { fallback: [] });

/** 悬浮按钮拖到的位置：离窗口底部多少像素 */
export const fabBottomItem = storage.defineItem<number | null>('local:fabBottom', { fallback: null });

/** 网页地址 → 这个网站的权限写法（https://a.com/*）；不是普通网页返回 null */
export function sitePattern(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && u.hostname ? `${u.protocol}//${u.hostname}/*` : null;
  } catch {
    return null;
  }
}

export const FAB_SCRIPT_ID = 'wangshen-fab';
