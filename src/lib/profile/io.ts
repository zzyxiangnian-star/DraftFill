import { normalizeProfile } from './normalize';
import { normalizeApplication, type Application } from '../tracker/applications';
import { newId, SCHEMA_VERSION, type Profile } from './schema';
import type { Answer } from '../answers/library';

// 备份文件格式。含档案和投递记录，不含 API Key（计划书第 7 节）。
// applications、answers 是后来加的，旧备份没有这两项，导入时当作空列表。
export interface BackupFile {
  app: 'wangshen-helper';
  schemaVersion: number;
  exportedAt: string;
  profiles: Profile[];
  applications?: Application[];
  /** 回答库（计划书 L4） */
  answers?: Answer[];
}

export function exportBackup(profiles: Profile[], applications: Application[] = [], answers: Answer[] = []): string {
  const file: BackupFile = {
    app: 'wangshen-helper',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    applications,
    answers,
  };
  return JSON.stringify(file, null, 2);
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  // 用英文文件名：部分环境下 Chrome 会把中文下载名替换成 "download"
  return `wangshen-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.json`;
}

export type ImportResult =
  | { ok: true; profiles: Profile[]; applications: Application[]; answers: unknown[] }
  | { ok: false; reason: string };

/**
 * 解析备份文件。导入的档案一律作为新档案追加（重新生成 id），不覆盖已有档案；
 * 名称与已有档案重复时加“（导入）”后缀。
 */
export function parseBackup(text: string, existingTitles: string[] = []): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: '文件不是有效的 JSON，可能已损坏。' };
  }
  if (typeof data !== 'object' || data === null || (data as { app?: unknown }).app !== 'wangshen-helper') {
    return { ok: false, reason: '这不是网申助手导出的备份文件。' };
  }
  const { schemaVersion, profiles, applications, answers } = data as Partial<BackupFile>;
  const ans: unknown[] = Array.isArray(answers) ? answers : [];
  const apps = Array.isArray(applications) ? applications.map(normalizeApplication) : [];
  if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) {
    return { ok: false, reason: '这份备份来自更新版本的网申助手，请先更新插件再导入。' };
  }
  if ((!Array.isArray(profiles) || profiles.length === 0) && !apps.length && !ans.length) {
    return { ok: false, reason: '备份文件里没有档案。' };
  }

  const titles = new Set(existingTitles);
  const now = Date.now();
  const result = (profiles ?? []).map((raw) => {
    const p = normalizeProfile(raw);
    let title = p.title || '导入的档案';
    while (titles.has(title)) title += '（导入）';
    titles.add(title);
    return { ...p, id: newId(), title, basedOn: '', updatedAt: now };
  });
  return { ok: true, profiles: result, applications: apps, answers: ans };
}
