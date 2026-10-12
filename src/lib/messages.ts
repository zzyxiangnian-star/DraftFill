import type { FillItem, FillReport } from './fill/fill';
import type { AskField } from './fill/ask';
import type { JobInfo } from './tracker/jobPage';
import type { FieldGuess, UnknownField } from './ai/skills/fieldMatch';
import type { WidgetPlan, WidgetView } from './ai/skills/widgetPlan';
import type { PageQuestion, QuestionAnswer } from './ai/skills/pageQuestions';

// popup / 侧边栏 ↔ background ↔ content script 之间的消息约定。
// 带 -active-tab 的发给 background，由它转给当前标签页里的 content script。

export type Request =
  | { type: 'fill-active-tab' }
  | { type: 'fill' }
  | { type: 'undo-active-tab' }
  | { type: 'undo' }
  | { type: 'reveal-active-tab'; index: number }
  | { type: 'confirm-active-tab'; index: number }
  | { type: 'confirm'; index: number }
  | { type: 'reveal'; index: number }
  | { type: 'job-active-tab' }
  | { type: 'job' }
  | { type: 'ai-fields-active-tab' }
  | { type: 'ai-fields' }
  | { type: 'ai-apply-active-tab'; guesses: FieldGuess[] }
  | { type: 'ai-apply'; guesses: FieldGuess[] }
  | { type: 'ai-widgets-active-tab' }
  | { type: 'ai-widgets' }
  | { type: 'ai-widgets-apply-active-tab'; plans: WidgetPlan[] }
  | { type: 'ai-widgets-apply'; plans: WidgetPlan[] }
  | { type: 'ai-questions-active-tab' }
  | { type: 'ai-questions' }
  | { type: 'ai-answers-apply-active-tab'; answers: QuestionAnswer[] }
  | { type: 'ai-answers-apply'; answers: QuestionAnswer[] }
  | { type: 'ask-fields-active-tab' }
  | { type: 'ask-fields' }
  | { type: 'ask-answer-active-tab'; index: number; value: string; save: boolean }
  | { type: 'ask-answer'; index: number; value: string; save: boolean }
  /** 问一个标签页是不是插件自带的练习页（没有 tabs 权限时读不到扩展页的地址） */
  | { type: 'practice-ping' };

export type FillResult =
  | { ok: true; report: FillReport }
  | { ok: false; reason: string };

export type UndoResult =
  | { ok: true; restored: number; failed: string[] }
  | { ok: false; reason: string };

export type RevealResult = { ok: true } | { ok: false; reason: string };

export type ConfirmResult = { ok: true; item: FillItem } | { ok: false; reason: string };

export type JobResult = { ok: true; job: JobInfo } | { ok: false; reason: string };

/** 计划书 L2：没认出的字段（只有字段名、分区、选项）和档案里自定义字段的名称 */
export type AiFieldsResult =
  | { ok: true; fields: UnknownField[]; custom: { id: string; label: string }[] }
  | { ok: false; reason: string };

export type AiApplyResult = { ok: true; filled: number; skipped: number } | { ok: false; reason: string };

/** AI 帮我填完：规则没能操作的控件和点开后面板的样子（只有按钮文字） */
export type AiWidgetsResult = { ok: true; views: WidgetView[] } | { ok: false; reason: string };

/** AI 帮我填完：档案里没有的问题（题目和选项）和从页面猜出的公司岗位 */
export type AiQuestionsResult = { ok: true; questions: PageQuestion[]; company: string } | { ok: false; reason: string };

/** 计划书 L6：必填但档案里没有依据的字段，侧边栏逐个问用户 */
export type AskFieldsResult = { ok: true; fields: AskField[] } | { ok: false; reason: string };

/** saved：存进了档案的哪里（对应的档案项 / 其他信息），没存为 null */
export type AskAnswerResult = { ok: true; item: FillItem; saved: 'profile' | 'custom' | null } | { ok: false; reason: string };
