// 结果面板和 AI 认字段（计划书 L2）共用的原因文字
export const UNKNOWN_REASON = '没认出这个字段';

/** 只能点选的框，规则不填 */
export const PICKER_REASON = '这一项要在弹出的面板里点选，请自己选一下';

/** 「AI 帮我填完」能接着处理的：没认出的、只能点选的、填了但不对的。附件、验证码这些不算。 */
export function aiLeftCount(items: { path: string | null; status: string; note: string; attach?: boolean }[]): number {
  return items.filter((i) => !i.attach && (i.status === 'err' || (i.status === 'skip' && (i.note === UNKNOWN_REASON || i.note === PICKER_REASON)))).length;
}
