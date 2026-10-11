import { storage } from 'wxt/utils/storage';
import type { FillReport } from './fill';

// 最近一次填写结果，侧边栏读取展示。只存在本机。
export const lastReportItem = storage.defineItem<FillReport | null>('local:lastReport', { fallback: null });

/** 填写之后页面上又出现了能填的字段（多步表单点了下一步、展开了新的一段） */
export interface PageChange {
  url: string;
  at: number;
  /** 新出现、插件认得、还空着的字段数 */
  count: number;
}
export const pageChangeItem = storage.defineItem<PageChange | null>('local:pageChange', { fallback: null });
