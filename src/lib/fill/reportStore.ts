import { storage } from 'wxt/utils/storage';
import type { FillReport } from './fill';

// 最近一次填写结果，侧边栏读取展示。只存在本机。
export const lastReportItem = storage.defineItem<FillReport | null>('local:lastReport', { fallback: null });
