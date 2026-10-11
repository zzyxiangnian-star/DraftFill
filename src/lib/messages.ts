// popup / 侧边栏 ↔ background ↔ content script 之间的消息约定。

export interface ScanSummary {
  url: string;
  title: string;
  /** 可填写的控件数（不含跳过的敏感控件） */
  fillable: number;
  byKind: Record<FieldKind, number>;
  /** 按第 2 节边界跳过的控件：密码、验证码、文件上传 */
  skipped: number;
  /** 当前页里的 iframe 数量（阶段 0 只扫顶层文档） */
  frames: number;
}

export type FieldKind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date';

export type Request =
  | { type: 'scan-active-tab' }
  | { type: 'scan' };

export type ScanResult =
  | { ok: true; summary: ScanSummary }
  | { ok: false; reason: string };
