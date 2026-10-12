import type { FillReport } from './fill/fill';
import type { JobInfo } from './tracker/jobPage';
import type { FieldGuess, UnknownField } from './ai/skills/fieldMatch';

// popup / 侧边栏 ↔ background ↔ content script 之间的消息约定。
// 带 -active-tab 的发给 background，由它转给当前标签页里的 content script。

export type Request =
  | { type: 'fill-active-tab' }
  | { type: 'fill' }
  | { type: 'undo-active-tab' }
  | { type: 'undo' }
  | { type: 'reveal-active-tab'; index: number }
  | { type: 'reveal'; index: number }
  | { type: 'job-active-tab' }
  | { type: 'job' }
  | { type: 'ai-fields-active-tab' }
  | { type: 'ai-fields' }
  | { type: 'ai-apply-active-tab'; guesses: FieldGuess[] }
  | { type: 'ai-apply'; guesses: FieldGuess[] };

export type FillResult =
  | { ok: true; report: FillReport }
  | { ok: false; reason: string };

export type UndoResult =
  | { ok: true; restored: number; failed: string[] }
  | { ok: false; reason: string };

export type RevealResult = { ok: true } | { ok: false; reason: string };

export type JobResult = { ok: true; job: JobInfo } | { ok: false; reason: string };

/** 计划书 L2：没认出的字段（只有字段名、分区、选项）和档案里自定义字段的名称 */
export type AiFieldsResult =
  | { ok: true; fields: UnknownField[]; custom: { id: string; label: string }[] }
  | { ok: false; reason: string };

export type AiApplyResult = { ok: true; filled: number; skipped: number } | { ok: false; reason: string };
