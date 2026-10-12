import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fabSummary, mountFab, type FabActions } from '../src/lib/content/fab';
import { sitePattern } from '../src/lib/content/fabSites';
import type { FillItem, FillReport } from '../src/lib/fill/fill';
import { UNKNOWN_REASON } from '../src/lib/fill/reasons';
import { collectRoots } from '../src/lib/fill/roots';

const item = (index: number, status: FillItem['status'], note = ''): FillItem =>
  ({ index, label: `字段${index}`, path: null, status, value: '', note } as FillItem);

const report = (items: FillItem[]): FillReport =>
  ({ url: location.href, title: '测试页', profileTitle: '默认', at: Date.now(), items } as unknown as FillReport);

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('悬浮按钮', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    document.documentElement.querySelectorAll('#wangshen-fab').forEach((e) => e.remove());
    window.__wangshenFab = undefined;
  });

  it('小结只列有的状态', () => {
    expect(fabSummary([item(0, 'ok'), item(1, 'ok'), item(2, 'warn'), item(3, 'skip')])).toBe('已填 2 · 需确认 1 · 未填 1');
    expect(fabSummary([item(0, 'ok')])).toBe('已填 1 · 未填 0');
  });

  it('网站权限写法：只给普通网页', () => {
    expect(sitePattern('https://app.mokahr.com/campus/apply?id=1#x')).toBe('https://app.mokahr.com/*');
    expect(sitePattern('http://localhost:8790/a.html')).toBe('http://localhost/*');
    expect(sitePattern('chrome://extensions')).toBeNull();
    expect(sitePattern('file:///C:/a.html')).toBeNull();
    expect(sitePattern(undefined)).toBeNull();
  });

  it('识别字段时不把插件自己的按钮算进去', () => {
    const actions: FabActions = { fill: vi.fn(), undo: vi.fn(), openPanel: vi.fn() };
    mountFab(document, actions);
    expect(collectRoots(document).roots).toHaveLength(1);
  });

  it('点一下填写，显示小结；剩下没认出的出现「AI 帮我填完」；隐藏后再点插件图标又出现', async () => {
    const rep = report([item(0, 'ok'), item(1, 'warn'), item(2, 'skip', UNKNOWN_REASON)]);
    const actions: FabActions = {
      fill: vi.fn(async () => ({ ok: true as const, report: rep })),
      undo: vi.fn(),
      openPanel: vi.fn(async () => null),
    };
    mountFab(document, actions);
    const root = document.getElementById('wangshen-fab')!.shadowRoot!;
    const main = root.querySelector<HTMLButtonElement>('.main')!;
    expect(main.textContent).toContain('一键填充');
    main.click();
    await flush();
    expect(actions.fill).toHaveBeenCalledOnce();
    expect(main.textContent).toContain('再填一次');
    expect(root.querySelector('.tip')!.textContent).toContain('已填 1 · 需确认 1 · 未填 1');
    const ai = root.querySelector<HTMLButtonElement>('[data-act="ai"]')!;
    expect(ai.hidden).toBe(false);
    expect(ai.textContent).toContain('还有 1 项没填上');
    ai.click();
    await flush();
    expect(actions.openPanel).toHaveBeenCalledWith(true);

    root.querySelector<HTMLButtonElement>('[data-act="hide"]')!.click();
    await flush();
    expect(document.getElementById('wangshen-fab')).toBeNull();
    mountFab(document, actions);
    expect(document.getElementById('wangshen-fab')).not.toBeNull();
  });

  it('填写失败把原因写在按钮上方', async () => {
    const actions: FabActions = { fill: vi.fn(async () => ({ ok: false as const, reason: '还没有档案，请先在设置页创建' })), undo: vi.fn(), openPanel: vi.fn() };
    mountFab(document, actions);
    const root = document.getElementById('wangshen-fab')!.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.main')!.click();
    await flush();
    expect(root.querySelector('.tip')!.textContent).toBe('还没有档案，请先在设置页创建');
  });
});
