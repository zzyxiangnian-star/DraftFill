import { useEffect, useState } from 'react';
import { Toggle } from '@/src/components/form';
import { fabSitesItem, sitePattern } from '@/src/lib/content/fabSites';

// 悬浮按钮「在这个网站一直显示」：浏览器会问一次这个网站的权限，只对这一个网站生效。
// 关掉就把权限还回去。

export function FabToggle({ onNotice }: { onNotice: (t: string) => void }) {
  const [site, setSite] = useState<{ pattern: string; tabId: number } | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const pattern = sitePattern(tab?.url);
      if (!pattern || tab?.id == null) return;
      setSite({ pattern, tabId: tab.id });
      const sites = await fabSitesItem.getValue();
      setOn(sites.includes(pattern) && await browser.permissions.contains({ origins: [pattern] }));
    })();
  }, []);

  if (!site) return null;
  const host = site.pattern.replace(/^https?:\/\/|\/\*$/g, '');

  async function change(v: boolean) {
    const sites = await fabSitesItem.getValue();
    if (v) {
      // 先请浏览器问权限（要紧跟着用户这次点击）；列表同时记下，background 看到权限到了就登记
      const asked = browser.permissions.request({ origins: [site!.pattern] });
      void fabSitesItem.setValue([...new Set([...sites, site!.pattern])]);
      if (!await asked) { setOn(false); return onNotice('浏览器没给权限，悬浮按钮只会在你点过插件之后出现。'); }
      setOn(true);
      await browser.scripting.executeScript({ target: { tabId: site!.tabId }, files: ['/content-scripts/content.js'] }).catch(() => {});
      onNotice(`以后打开 ${host} 的页面，右下角会直接出现悬浮按钮，点了才会填。`);
    } else {
      await fabSitesItem.setValue(sites.filter((s) => s !== site!.pattern));
      await browser.permissions.remove({ origins: [site!.pattern] }).catch(() => false);
      setOn(false);
      onNotice(`以后打开 ${host} 不再自动显示悬浮按钮，点插件图标后仍会出现。`);
    }
  }

  return <Toggle checked={on} onChange={(v) => void change(v)}>在这个网站一直显示悬浮按钮</Toggle>;
}
