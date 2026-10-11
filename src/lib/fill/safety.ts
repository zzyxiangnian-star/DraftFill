import { textOf } from './text';

// 计划书第 2 节“只填不交”：所有程序化点击都经过这里，拒绝点击提交、保存、下一步类按钮。

const FORBIDDEN_TEXT = /提交|保存|下一步|上一步|投递|申请|确认|确定|完成|发送|登录|注册|submit|save|next|apply|confirm|send/i;

export class SafetyError extends Error {}

export function assertSafeClick(el: Element): void {
  const clickable = el.closest('button, a, [role=button], input[type=submit], input[type=button], input[type=image]');
  if (!clickable) return;
  if (clickable.matches('input[type=submit], button[type=submit], input[type=image]')) throw new SafetyError('拒绝点击提交按钮');
  const label = `${textOf(clickable)} ${clickable.getAttribute('value') ?? ''} ${clickable.getAttribute('aria-label') ?? ''}`;
  if (FORBIDDEN_TEXT.test(label)) throw new SafetyError(`拒绝点击“${label.trim()}”按钮`);
}

export function safeClick(el: Element): void {
  assertSafeClick(el);
  (el as HTMLElement).click();
}

/** 自定义下拉需要用 mousedown 打开 */
export function safeMouseDown(el: Element): void {
  assertSafeClick(el);
  const view = el.ownerDocument.defaultView;
  for (const type of ['pointerdown', 'mousedown'] as const) {
    el.dispatchEvent(new (view?.MouseEvent ?? MouseEvent)(type, { bubbles: true, cancelable: true, view, button: 0 }));
  }
}
