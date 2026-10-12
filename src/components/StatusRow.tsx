import { Check, CircleMinus, CircleX, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { iconProps } from './icon';

export type Status = 'ok' | 'warn' | 'err' | 'skip';

const META: Record<Status, { Icon: typeof Check; tag: string }> = {
  ok: { Icon: Check, tag: '已核对' },
  warn: { Icon: TriangleAlert, tag: '请确认' },
  err: { Icon: CircleX, tag: '不一致' },
  skip: { Icon: CircleMinus, tag: '未填' },
};

export function StatusRow({ status, name, value, tag, onClick, action }: {
  status: Status; name: string; value: ReactNode; tag?: string; onClick?: () => void;
  /** 行尾的操作按钮（如“确定”），放在定位按钮外面 */
  action?: ReactNode;
}) {
  const { Icon, tag: defaultTag } = META[status];
  const body = (
    <>
      <Icon {...iconProps} aria-hidden />
      <div>
        <div className="name">{name}</div>
        <div className="val">{value}</div>
      </div>
      <span className="tag">{tag ?? defaultTag}</span>
    </>
  );
  // 可点击时整行是按钮：点一下在网页上定位到这个字段
  if (action) {
    return (
      <li className="status-row">
        {onClick
          ? <button type="button" className={`status status-${status} status-btn`} onClick={onClick} title="在页面上定位这个字段">{body}</button>
          : <div className={`status status-${status}`}>{body}</div>}
        {action}
      </li>
    );
  }
  return onClick ? (
    <li><button type="button" className={`status status-${status} status-btn`} onClick={onClick} title="在页面上定位这个字段">{body}</button></li>
  ) : (
    <li className={`status status-${status}`}>{body}</li>
  );
}
