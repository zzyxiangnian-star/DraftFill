import type { FillReport } from './fill/fill';

// popup / 侧边栏 ↔ background ↔ content script 之间的消息约定。
// 带 -active-tab 的发给 background，由它转给当前标签页里的 content script。

export type Request =
  | { type: 'fill-active-tab' }
  | { type: 'fill' }
  | { type: 'undo-active-tab' }
  | { type: 'undo' }
  | { type: 'reveal-active-tab'; index: number }
  | { type: 'reveal'; index: number };

export type FillResult =
  | { ok: true; report: FillReport }
  | { ok: false; reason: string };

export type UndoResult =
  | { ok: true; restored: number; failed: string[] }
  | { ok: false; reason: string };

export type RevealResult = { ok: true } | { ok: false; reason: string };
