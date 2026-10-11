import { candidatesFor, filterCandidates, type Candidate } from './candidates';
import { isEmpty, pickable, type FillEntry } from './fill';
import type { Profile } from '../profile/schema';

// 候选卡（计划书 V5）：插件没填的字段，用户点进去时在旁边列出档案里的值，点一项写入。
// 卡片放在 shadow DOM 里，不受网申页面样式影响；不抢焦点，用户照常打字也行。

const HOST_ID = 'wangshen-card';
const MAX_SHOWN = 30;

export interface PickEvent {
  entry: FillEntry;
  candidate: Candidate;
  /** 用户勾了“记住” */
  remember: boolean;
}

export interface CardOptions {
  profile: Profile;
  /** 写入并更新记录，返回是否写成功 */
  onPick: (e: PickEvent) => Promise<boolean>;
}

/** 这个字段要不要弹候选卡：插件没填、还空着、能写入、档案里有能填的值 */
export function cardEntry(entries: FillEntry[], target: EventTarget | null, profile: Profile): { entry: FillEntry; list: Candidate[] } | null {
  if (!target || typeof (target as Node).nodeType !== 'number') return null;
  const node = target as Node;
  const entry = entries.find((e) => e.control.el === node || e.control.el.contains(node) || e.control.radios?.includes(node as HTMLInputElement));
  if (!entry || entry.item.status !== 'skip' || !pickable(entry.control) || !isEmpty(entry.control)) return null;
  const list = candidatesFor(entry.control, profile);
  return list.length ? { entry, list } : null;
}

const CSS = `
:host { all: initial; }
.card { position: fixed; z-index: 2147483646; width: 300px; max-width: calc(100vw - 16px); box-sizing: border-box;
  background: #fcfaf8; color: #1f1f1c; border: 1px solid rgba(31, 31, 28, .12); border-radius: 12px;
  box-shadow: 0 8px 28px rgba(31, 31, 28, .16); font: 13px/1.45 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 10px; display: grid; gap: 8px; animation: in 160ms cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes in { from { opacity: 0; transform: translateY(-4px); } }
@media (prefers-reduced-motion: reduce) { .card { animation: none; } }
.head { display: flex; align-items: flex-start; gap: 8px; }
.title { flex: 1; min-width: 0; color: #5f5e57; }
.title b { color: #1f1f1c; font-weight: 600; }
.x { border: 0; background: none; width: 24px; height: 24px; border-radius: 8px; cursor: pointer; color: #5f5e57; font-size: 16px; line-height: 1; flex: none; }
.x:hover { background: #e4e4dc; }
.q { box-sizing: border-box; width: 100%; height: 30px; border: 1px solid rgba(31, 31, 28, .16); border-radius: 8px; padding: 0 10px; font: inherit; background: #fff; color: inherit; }
.q:focus { outline: none; border-color: #364524; box-shadow: 0 0 0 3px rgba(54, 69, 36, .18); }
ul { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow: auto; display: grid; gap: 2px; }
.item { display: grid; width: 100%; text-align: left; border: 0; background: none; border-radius: 8px; padding: 6px 8px; cursor: pointer; font: inherit; color: inherit; }
.item:hover, .item:focus-visible { background: #e4e4dc; outline: none; }
.item small { color: #5f5e57; font-size: 12px; }
.item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { color: #5f5e57; padding: 6px 8px; }
.foot { display: flex; align-items: center; gap: 6px; color: #5f5e57; font-size: 12px; cursor: pointer; user-select: none; }
.foot input { accent-color: #364524; margin: 0; }
.msg { color: #b4432f; font-size: 12px; }
@media (prefers-color-scheme: dark) {
  .card { background: #22221f; color: #ecebe6; border-color: rgba(236, 235, 230, .14); box-shadow: 0 8px 28px rgba(0, 0, 0, .5); }
  .title, .x, .item small, .empty, .foot { color: #a9a8a0; }
  .title b { color: #ecebe6; }
  .x:hover, .item:hover, .item:focus-visible { background: #34342f; }
  .q { background: #1a1a18; border-color: rgba(236, 235, 230, .18); }
  .foot input { accent-color: #9fb07f; }
}
`;

/** 元素在最外层页面里的位置（同源 iframe 里的字段要加上 iframe 的偏移） */
function rectInTop(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  let x = r.left, y = r.top;
  for (let w: Window | null = el.ownerDocument.defaultView; w && w !== w.parent; w = w.parent) {
    const fe = w.frameElement;
    if (!fe) break;
    const fr = fe.getBoundingClientRect();
    x += fr.left; y += fr.top;
  }
  return new DOMRect(x, y, r.width, r.height);
}

/** 自定义组件的根节点可能是隐藏的输入框：往外找看得见的 */
function anchorOf(e: FillEntry): Element {
  let n: Element | null = e.control.el;
  for (let i = 0; n && i < 6; n = n.parentElement, i++) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return n;
  }
  return e.control.el;
}

/** 开始监听字段聚焦；返回停止函数 */
export function startCandidateCard(doc: Document, entries: FillEntry[], opts: CardOptions): () => void {
  const top = doc;
  const win = top.defaultView!;
  const dismissed = new WeakSet<Element>();
  let host: HTMLElement | null = null;
  let current: FillEntry | null = null;

  const close = () => { host?.remove(); host = null; current = null; };

  const place = () => {
    if (!host || !current) return;
    const card = host.shadowRoot!.querySelector<HTMLElement>('.card')!;
    const r = rectInTop(anchorOf(current));
    if (r.bottom < 0 || r.top > win.innerHeight) return close();
    const h = card.offsetHeight || 200;
    const below = r.bottom + 6 + h <= win.innerHeight || r.top - 6 - h < 0;
    card.style.top = `${Math.max(8, below ? r.bottom + 6 : r.top - 6 - h)}px`;
    card.style.left = `${Math.max(8, Math.min(r.left, win.innerWidth - card.offsetWidth - 8))}px`;
  };

  function open(entry: FillEntry, list: Candidate[]) {
    close();
    current = entry;
    host = top.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    const name = entry.item.label.replace(/（.*$/, '') || '这个字段';
    root.innerHTML = `<style>${CSS}</style>
      <div class="card" role="dialog" aria-label="从档案里选一项填入">
        <div class="head"><div class="title">从档案里选一项填入 <b></b></div><button class="x" type="button" aria-label="关闭，这个字段不再提示">×</button></div>
        ${list.length > 6 ? '<input class="q" type="search" placeholder="搜索档案里的内容" aria-label="搜索档案里的内容">' : ''}
        <ul role="listbox"></ul>
        <div class="msg" hidden></div>
        <label class="foot"><input type="checkbox" checked> 记住这个选择，下次在这个网站自动填</label>
      </div>`;
    root.querySelector('b')!.textContent = `「${name}」`;
    const ul = root.querySelector('ul')!;
    const msg = root.querySelector<HTMLElement>('.msg')!;
    const keep = root.querySelector<HTMLInputElement>('.foot input')!;
    const render = (items: Candidate[]) => {
      ul.replaceChildren(...(items.length ? items.slice(0, MAX_SHOWN).map((c) => {
        const li = top.createElement('li');
        const b = top.createElement('button');
        b.type = 'button';
        b.className = 'item';
        b.setAttribute('role', 'option');
        const small = top.createElement('small');
        small.textContent = c.label;
        const span = top.createElement('span');
        span.textContent = c.value;
        b.title = c.value;
        b.append(small, span);
        // 不让按钮抢走字段的焦点
        b.addEventListener('mousedown', (ev) => ev.preventDefault());
        b.addEventListener('click', async () => {
          const ok = await opts.onPick({ entry, candidate: c, remember: keep.checked });
          if (ok) close();
          else { msg.hidden = false; msg.textContent = entry.item.note || '没能填进去，请自己填写'; }
        });
        li.append(b);
        return li;
      }) : [Object.assign(top.createElement('li'), { className: 'empty', textContent: '没有找到' })]));
    };
    render(list);
    root.querySelector<HTMLInputElement>('.q')?.addEventListener('input', (ev) => render(filterCandidates(list, (ev.target as HTMLInputElement).value)));
    root.querySelector('.x')!.addEventListener('click', () => { dismissed.add(entry.control.el); close(); });
    root.querySelector('.foot')!.addEventListener('mousedown', (ev) => { if (ev.target !== keep) ev.preventDefault(); });
    top.documentElement.append(host);
    place();
  }

  const onFocus = (ev: Event) => {
    const target = ev.composedPath()[0] ?? ev.target;
    if (host && ev.composedPath().includes(host)) return;
    const hit = cardEntry(entries, target as EventTarget, opts.profile);
    if (!hit || dismissed.has(hit.entry.control.el)) {
      if (current && !(current.control.el.contains(target as Node))) close();
      return;
    }
    if (hit.entry !== current) open(hit.entry, hit.list);
  };
  const onDown = (ev: Event) => {
    if (!host) return;
    const path = ev.composedPath();
    if (path.includes(host) || path.includes(current!.control.el)) return;
    close();
  };
  // 用户自己打了字，就收起来
  const onInput = () => { if (current && !isEmpty(current.control)) close(); };
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && host) close(); };
  const onMove = () => { if (host) win.requestAnimationFrame(place); };

  // 同源 iframe 里的字段：聚焦事件不会冒泡到外层页面，要在它自己的文档上监听
  const docs = new Set<Document>([top, ...entries.map((e) => e.control.el.ownerDocument)]);
  for (const d of docs) {
    d.addEventListener('focusin', onFocus, true);
    d.addEventListener('mousedown', onDown, true);
    d.addEventListener('keydown', onKey, true);
    d.addEventListener('input', onInput, true);
    d.defaultView?.addEventListener('scroll', onMove, true);
  }
  win.addEventListener('resize', onMove);

  return () => {
    close();
    for (const d of docs) {
      d.removeEventListener('focusin', onFocus, true);
      d.removeEventListener('mousedown', onDown, true);
      d.removeEventListener('keydown', onKey, true);
      d.removeEventListener('input', onInput, true);
      d.defaultView?.removeEventListener('scroll', onMove, true);
    }
    win.removeEventListener('resize', onMove);
  };
}
