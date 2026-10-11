import type { FillReport } from './fill/fill';

// popup / 侧边栏 ↔ background ↔ content script 之间的消息约定。

export type Request =
  | { type: 'fill-active-tab' }
  | { type: 'fill' };

export type FillResult =
  | { ok: true; report: FillReport }
  | { ok: false; reason: string };
