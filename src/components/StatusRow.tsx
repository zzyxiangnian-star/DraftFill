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

export function StatusRow({ status, name, value, tag }: { status: Status; name: string; value: ReactNode; tag?: string }) {
  const { Icon, tag: defaultTag } = META[status];
  return (
    <li className={`status status-${status}`}>
      <Icon {...iconProps} aria-hidden />
      <div>
        <div className="name">{name}</div>
        <div className="val">{value}</div>
      </div>
      <span className="tag">{tag ?? defaultTag}</span>
    </li>
  );
}
