import type { FillItem, FillReport } from '../fill/fill';
import { aiLeftCount } from '../fill/reasons';
import { lastReportItem, pageChangeItem } from '../fill/reportStore';
import { fabBottomItem } from './fabSites';

// 页面右下角的悬浮按钮：一键填充、AI 帮我填完、打开侧边栏、撤销。
// 放在 shadow DOM 里、挂在 <html> 上：网申页面的样式影响不到它；识别字段（roots.ts 跳过 wangshen- 开头的）、找弹出面板（只看 body 下）也不会把它算进去。
// 它只是按钮：不自动填、不点页面上的任何东西，用户点了才动。

const HOST_ID = 'wangshen-fab';

export interface FabActions {
  fill: () => Promise<{ ok: true; report: FillReport } | { ok: false; reason: string }>;
  undo: () => Promise<{ ok: true; restored: number; failed: string[] } | { ok: false; reason: string }>;
  /** 打开侧边栏；ai 为 true 时打开后接着跑「AI 帮我填完」。失败返回原因 */
  openPanel: (ai: boolean) => Promise<string | null>;
}

/** 按钮上方的一行小结：已填 12 · 需确认 3 · 未填 5 */
export function fabSummary(items: FillItem[]): string {
  const c = { ok: 0, warn: 0, err: 0, skip: 0 };
  items.forEach((i) => c[i.status]++);
  return [`已填 ${c.ok}`, c.warn && `需确认 ${c.warn}`, c.err && `不一致 ${c.err}`, `未填 ${c.skip}`].filter(Boolean).join(' · ');
}

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  sparkles: svg('<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>'),
  more: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  grip: svg('<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>'),
  panel: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'),
  hide: svg('<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>'),
};

const CSS = `
:host { all: initial; }
.fab { position: fixed; right: 20px; z-index: 2147483645; display: grid; justify-items: end; gap: 8px;
  font: 13px/1.45 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #141413; }
.bar { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 9999px; background: #fcfaf8;
  border: 1px solid rgba(20, 20, 19, .12); box-shadow: 0 8px 28px rgba(20, 20, 19, .16); animation: in 240ms cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes in { from { opacity: 0; transform: translateY(6px); } }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; display: inline-flex; align-items: center; gap: 6px; }
button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(54, 69, 36, .28); }
.grip { width: 20px; height: 32px; justify-content: center; color: #87867f; cursor: grab; touch-action: none; }
.grip:active { cursor: grabbing; }
.main { height: 32px; padding: 0 14px; border-radius: 9999px; background: #000; color: #fcfaf8; font-weight: 500; white-space: nowrap;
  transition: background 150ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.main:hover { background: #3d3d3a; }
.main:disabled { opacity: .6; cursor: default; }
.more { width: 32px; height: 32px; justify-content: center; border-radius: 9999px; color: #5d5c5b; }
.more:hover, .more[aria-expanded="true"] { background: #e4e4dc; }
.tip { max-width: 280px; padding: 6px 10px; border-radius: 12px; background: #fcfaf8; border: 1px solid rgba(20, 20, 19, .12);
  box-shadow: 0 4px 12px rgba(20, 20, 19, .06); color: #5d5c5b; font-size: 12px; }
.tip.warn { color: #a86b12; }
.menu { min-width: 200px; padding: 6px; border-radius: 20px; background: #fcfaf8; border: 1px solid rgba(20, 20, 19, .12);
  box-shadow: 0 24px 48px rgba(20, 20, 19, .16); display: grid; gap: 2px; animation: in 150ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.menu button { width: 100%; padding: 8px 10px; border-radius: 12px; text-align: left; }
.menu button:hover { background: #e4e4dc; }
.menu .ai { color: #364524; font-weight: 500; }
[hidden] { display: none !important; }
@media (prefers-reduced-motion: reduce) { .bar, .menu { animation: none; } .main { transition: none; } }
@media (prefers-color-scheme: dark) {
  .fab { color: #ecebe6; }
  .bar, .tip, .menu { background: #22221f; border-color: rgba(236, 235, 230, .14); box-shadow: 0 8px 28px rgba(0, 0, 0, .5); }
  .main { background: #fcfaf8; color: #141413; }
  .main:hover { background: #d5d8cc; }
  .tip, .more { color: #a9a8a0; }
  .tip.warn { color: #e0a64a; }
  .more:hover, .more[aria-expanded="true"], .menu button:hover { background: #34342f; }
  .menu .ai { color: #b5c49a; }
}
`;

declare global {
  interface Window { __wangshenFab?: HTMLElement }
}

/** 显示悬浮按钮（已经有了就不重复加；用户隐藏过、又点了插件图标，就重新显示） */
export function mountFab(doc: Document, actions: FabActions) {
  const win = doc.defaultView!;
  if (win.__wangshenFab?.isConnected) return;
  if (win.__wangshenFab) { doc.documentElement.append(win.__wangshenFab); return; }

  const host = doc.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
    <div class="fab" role="region" aria-label="网申助手">
      <div class="menu" role="menu" hidden>
        <button class="ai" type="button" role="menuitem" data-act="ai">${ICON.sparkles}<span></span></button>
        <button type="button" role="menuitem" data-act="panel">${ICON.panel}打开侧边栏看全部结果</button>
        <button type="button" role="menuitem" data-act="undo" hidden>${ICON.undo}撤销本次填写</button>
        <button type="button" role="menuitem" data-act="hide">${ICON.hide}这个页面先隐藏</button>
      </div>
      <div class="tip" role="status" hidden></div>
      <div class="bar">
        <button class="grip" type="button" title="按住上下拖动" aria-label="拖动悬浮按钮">${ICON.grip}</button>
        <button class="main" type="button">${ICON.sparkles}<span>一键填充</span></button>
        <button class="more" type="button" aria-label="更多操作" aria-expanded="false" aria-haspopup="menu">${ICON.more}</button>
      </div>
    </div>`;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const box = $('.fab'), menu = $('.menu'), tip = $('.tip'), main = $<HTMLButtonElement>('.main'), more = $('.more');
  const aiBtn = $('[data-act="ai"]'), undoBtn = $('[data-act="undo"]');

  let report: FillReport | null = null;
  let newCount = 0;
  let busy = false;
  let notice: { text: string; warn?: boolean } | null = null;

  const render = () => {
    const live = report && !report.undoneAt ? report : null;
    main.querySelector('span')!.textContent = busy ? '正在填写…'
      : newCount ? `新出现 ${newCount} 项，再填一次` : live ? '再填一次' : '一键填充';
    main.disabled = busy;
    const left = live ? aiLeftCount(live.items) : 0;
    aiBtn.querySelector('span')!.textContent = left ? `还有 ${left} 项没填上，AI 帮我填完` : 'AI 帮我填完';
    undoBtn.hidden = !live;
    const text = notice?.text ?? (live ? `${fabSummary(live.items)}。黄色的请核对，检查无误后自己提交` : '');
    tip.textContent = text;
    tip.hidden = !text;
    tip.classList.toggle('warn', !!notice?.warn);
  };
  const say = (text: string | null, warn = false) => { notice = text ? { text, warn } : null; render(); };
  const toggleMenu = (open = menu.hidden) => { menu.hidden = !open; more.setAttribute('aria-expanded', String(open)); };

  const here = () => location.href;
  const load = async () => {
    const last = await lastReportItem.getValue();
    const change = await pageChangeItem.getValue();
    if (busy || report) return; // 读到之前用户已经点过填写了，以那次为准
    report = last?.url === here() ? last : null;
    newCount = change?.url === here() ? change.count : 0;
    render();
  };
  // 弹窗、侧边栏填的、AI 填的，也在这里更新
  lastReportItem.watch((v) => { report = v?.url === here() ? v : null; render(); });
  pageChangeItem.watch((v) => { newCount = v?.url === here() ? v.count : 0; render(); });

  main.addEventListener('click', async () => {
    if (busy) return;
    toggleMenu(false);
    busy = true; say(null);
    try {
      const r = await actions.fill();
      if (!r.ok) say(r.reason, true);
      else { report = r.report; newCount = 0; }
    } finally {
      busy = false; render();
    }
  });
  more.addEventListener('click', () => toggleMenu());
  menu.addEventListener('click', async (ev) => {
    const act = (ev.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    toggleMenu(false);
    if (act === 'ai' && !(report && !report.undoneAt)) {
      // 还没填过：先按规则填一遍，剩下的再交给 AI
      busy = true; say(null);
      const r = await actions.fill().finally(() => { busy = false; });
      if (!r.ok) return say(r.reason, true);
      report = r.report; newCount = 0; render();
    }
    if (act === 'ai' || act === 'panel') {
      const err = await actions.openPanel(act === 'ai');
      say(err ? `浏览器没让插件直接打开侧边栏。请点右上角的网申助手图标，再点${act === 'ai' ? '「AI 帮我填完」' : '「查看全部」'}。` : null, !!err);
    } else if (act === 'undo') {
      const r = await actions.undo();
      say(!r.ok ? r.reason : r.failed.length ? `已恢复 ${r.restored} 项。${r.failed.join('、')} 没能自动清空，请手动处理。` : `已恢复 ${r.restored} 项。`, !r.ok || !!r.failed.length);
    } else if (act === 'hide') {
      host.remove();
    }
  });
  // 点页面别处收起菜单
  doc.addEventListener('mousedown', (ev) => { if (!ev.composedPath().includes(host)) toggleMenu(false); }, true);
  doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') toggleMenu(false); });

  // 上下拖动，记住位置
  const grip = $('.grip');
  const clamp = (b: number) => Math.max(12, Math.min(b, win.innerHeight - 60));
  const place = (b: number) => { box.style.bottom = `${clamp(b)}px`; };
  place(24);
  void fabBottomItem.getValue().then((b) => { if (b != null) place(b); });
  grip.addEventListener('pointerdown', (ev) => {
    grip.setPointerCapture(ev.pointerId);
    const start = ev.clientY;
    const from = parseFloat(box.style.bottom) || 24;
    const move = (e: PointerEvent) => place(from + start - e.clientY);
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      void fabBottomItem.setValue(parseFloat(box.style.bottom));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });

  doc.documentElement.append(host);
  win.__wangshenFab = host;
  void load();
}
