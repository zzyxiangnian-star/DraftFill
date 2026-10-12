import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iconProps } from '@/src/components/icon';

// 气泡导览：按步骤自动切到对应页面，把要讲的区域高亮出来，旁边用气泡说明怎么用。

export type TourPage = 'profile' | 'backup' | 'ai' | 'rules' | 'guide';

export interface TourStep {
  page: TourPage;
  /** 要高亮的元素；找不到（比如还没建档案）就在屏幕中间显示气泡 */
  target?: string;
  title: string;
  body: string;
}

export const TOUR: TourStep[] = [
  { page: 'profile', target: '[data-tour="nav-profile"]', title: '个人档案',
    body: '网申要填的信息先在这里填一次，以后每家网申都从这里取。左边的小标题可以直接跳到对应部分，改完自动保存到本机。' },
  { page: 'profile', target: '[data-tour="profile-tabs"]', title: '多份档案',
    body: '投不同方向的岗位（比如产品和运营），可以「复制为新档案」改一改。标着小圆点的是一键填充时用的那份。' },
  { page: 'profile', target: '#basic', title: '基本信息和敏感信息',
    body: '手机号、邮箱、证件号默认不自动填，这一栏底部的开关打开后才会填。籍贯、户口、出生日期这类填上后也会标黄，请你核对。' },
  { page: 'profile', target: '#education', title: '多段经历',
    body: '教育、实习、项目都可以加多条，按从新到旧排。网申页面上段数不够时，插件会自动点“添加”补上再填。' },
  { page: 'profile', target: '#custom', title: '其他信息',
    body: '网申上有档案里没有的问题（比如宿舍楼号、公司性质），在这里加一条「名称 + 内容」。页面上字段名一样，就直接填。' },
  { page: 'backup', target: '[data-tour="resume-import"]', title: '从简历导入',
    body: '不想一项项填，可以选一份 PDF 或 Word 简历，自动认出姓名、学校、经历，预览确认后存成新档案。识别在本机完成，不上传。' },
  { page: 'backup', target: '[data-tour="backup-export"]', title: '备份',
    body: '档案只存在这台电脑的浏览器里。换电脑、重装浏览器前先导出备份，到新电脑上再导入。备份文件含个人信息，别发到群里。' },
  { page: 'ai', target: '[data-tour="ai-settings"]', title: 'AI 设置',
    body: '想用 AI 功能，点这里选一家 AI 服务商、填 API Key。不填也没关系，一键填充、候选卡、回答库这些都不需要 AI。' },
  { page: 'ai', target: '[data-tour="ai-tools"]', title: 'AI 的几个功能',
    body: '问 AI、简历诊断、经历润色、岗位分析、开放题写作、回答库、通知整理。每个功能上方都有一句说明。发给 AI 之前会先去掉姓名、电话这些个人信息；AI 不知道的会标成【待补充】让你补，不替你编。' },
  { page: 'rules', target: '[data-tour="rules"]', title: '使用边界',
    body: '插件只填不交：不会点提交、保存、下一步；不碰验证码，不存网站密码；档案只在你自己的浏览器里。' },
  { page: 'rules', target: '[data-tour="memory"]', title: '记住的字段',
    body: '你在候选卡里选过、勾了“记住”的字段，同一个网站下次直接填。记错了可以在这里按网站清除。' },
  { page: 'guide', target: '[data-tour="practice"]', title: '最后：在网申网站上用',
    body: '真正填表是在网申网站上：点浏览器右上角的网申助手图标，再点「一键填充」，然后打开侧边栏逐项核对，自己提交。建议先在练习页上试一遍。' },
];

const GAP = 12;
const PAD = 6;
const W = 340;

function findTarget(sel?: string): HTMLElement | null {
  return sel ? document.querySelector<HTMLElement>(sel) : null;
}

export function Tour({ start = 0, go, onClose }: { start?: number; go: (page: TourPage) => void; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number; side: 'top' | 'bottom' | 'none' }>({ top: 0, left: 0, arrow: 0, side: 'none' });
  const step = TOUR[i]!;
  const last = i === TOUR.length - 1;

  // 切到这一步的页面，等目标元素出现，滚到视野中间
  useEffect(() => {
    setReady(false);
    go(step.page);
    let n = 0;
    let raf = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = () => {
      const el = findTarget(step.target);
      if (el || n++ > 60) {
        el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        setTimeout(() => { setRect(el ? el.getBoundingClientRect() : null); setReady(true); }, reduce ? 0 : 380);
        return;
      }
      raf = requestAnimationFrame(wait);
    };
    raf = requestAnimationFrame(wait);
    return () => cancelAnimationFrame(raf);
  }, [i]);

  // 滚动、改窗口大小时跟着走
  useEffect(() => {
    const update = () => { const el = findTarget(step.target); setRect(el ? el.getBoundingClientRect() : null); };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [i]);

  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b) return;
    const h = b.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!rect) { setPos({ top: (vh - h) / 2, left: (vw - Math.min(W, vw - 32)) / 2, arrow: 0, side: 'none' }); return; }
    const below = rect.bottom + PAD + GAP + h <= vh - 16 || rect.top - PAD - GAP - h < 16;
    const top = below ? Math.min(rect.bottom + PAD + GAP, vh - h - 16) : rect.top - PAD - GAP - h;
    const width = Math.min(W, vw - 32);
    const left = Math.max(16, Math.min(rect.left, vw - width - 16));
    const arrow = Math.max(20, Math.min(rect.left + Math.min(rect.width, 240) / 2 - left, width - 20));
    setPos({ top: Math.max(16, top), left, arrow, side: below ? 'top' : 'bottom' });
  }, [rect, ready, i]);

  useEffect(() => { if (ready) bubble.current?.focus(); }, [ready, i]);

  const next = () => (last ? onClose() : setI(i + 1));
  const prev = () => setI(Math.max(0, i - 1));
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  }

  return createPortal(
    <div className="tour" onKeyDown={onKey}>
      <div className={`tour-shade${rect && ready ? '' : ' is-dim'}`} onClick={(e) => e.stopPropagation()} />
      {rect && ready && (
        <div className="tour-spot" aria-hidden
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      )}
      <div ref={bubble} className={`tour-bubble${ready ? ' is-ready' : ''} side-${pos.side}`} role="dialog" aria-modal="true"
        aria-labelledby="tour-title" tabIndex={-1} style={{ top: pos.top, left: pos.left, ['--arrow' as string]: `${pos.arrow}px` }}>
        <div className="row tour-top">
          <span className="label">{i + 1} / {TOUR.length}</span>
          <span className="spacer" />
          <button className="btn btn-icon tour-x" aria-label="退出导览" title="退出导览（Esc）" onClick={onClose}><X {...iconProps} /></button>
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-dots" aria-hidden>{TOUR.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row tour-actions">
          {!last && <button className="btn btn-text small" onClick={onClose}>跳过</button>}
          <span className="spacer" />
          {i > 0 && <button className="btn btn-secondary" onClick={prev}>上一步</button>}
          <button className="btn btn-primary tour-next" onClick={next}>{last ? '完成' : '下一步'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
