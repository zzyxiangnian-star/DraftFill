import { objs, oneOf, str, strs, type Skill } from './index';

// 计划书 L7：用户粘贴笔试、测评、面试通知，提取事项、时间和链接，生成日历条目。
// 只发用户粘贴的通知（发送前抹掉手机号、邮箱、证件号和本人姓名），不发档案。
// 链接必须在原文里原样出现，时间必须是合法的日期时间，否则丢掉，避免 AI 编出来的链接和时间。

export const NOTICE_KINDS = ['笔试/测评', '面试', '其他'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export interface NoticeEvent {
  title: string;
  /** YYYY-MM-DD HH:mm；只有日期时 HH:mm 为空，记成全天 */
  start: string;
  end: string;
  /** 这是截止时间（如“请于 10 月 15 日 23:59 前完成测评”） */
  deadline: boolean;
  place: string;
  link: string;
}

export interface NoticeResult {
  company: string;
  position: string;
  kind: NoticeKind;
  events: NoticeEvent[];
  prepare: string[];
  notes: string[];
}

export interface NoticeInput {
  text: string;
  /** 今天的日期 YYYY-MM-DD，用来补全通知里没写年份的日期 */
  today: string;
}

const METHOD = `任务：从用户粘贴的校招通知（笔试、测评、面试邀请，邮件或短信）里提取日程。
规则：
1. 只依据原文，原文没写的字段给空字符串，不要推测。
2. 时间写成“YYYY-MM-DD HH:mm”（24 小时制）；原文只写了日期就写“YYYY-MM-DD”。原文没写年份时，按今天的日期推断最近的将来那一年。
3. “请于某时前完成”这类是截止时间：start 写截止时间，deadline 为 true。有开始和结束时间的，分别写 start 和 end。
4. link 只能原样复制原文里出现的网址，没有就给空字符串，不许自己拼网址。
5. kind 只能是“笔试/测评”“面试”“其他”。
6. prepare 写原文要求准备的东西（设备、证件、材料、测试链接提前调试等）；notes 写其他要注意的（迟到规定、不能切屏、着装等）。
只输出 JSON：
{"company": "公司", "position": "岗位", "kind": "笔试/测评|面试|其他",
 "events": [{"title": "事项，如 在线笔试、一面", "start": "", "end": "", "deadline": false, "place": "地点或线上平台", "link": ""}],
 "prepare": ["要准备的"], "notes": ["注意事项"]}`;

const DT = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** 合法的“YYYY-MM-DD [HH:mm]”，否则给空 */
export function normalizeDateTime(v: unknown): string {
  const m = DT.exec(str(v, 25).replace('T', ' ').replace(/[/.]/g, '-'));
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return '';
  const day = `${y}-${pad(mo)}-${pad(d)}`;
  if (m[4] === undefined) return day;
  const [h, mi] = [Number(m[4]), Number(m[5])];
  return h <= 23 && mi <= 59 ? `${day} ${pad(h)}:${pad(mi)}` : day;
}

export const noticeSkill: Skill<NoticeInput, NoticeResult> = {
  id: 'notice',
  name: '通知整理',
  temperature: 0,
  build: ({ text, today }) => [
    { role: 'system', content: METHOD },
    { role: 'user', content: `今天是 ${today}。\n\n通知原文：\n${text}` },
  ],
  parse: (raw, { text }) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const events = objs(r.events, 10).map((e) => {
      const link = str(e.link, 500);
      return {
        title: str(e.title, 40) || '日程',
        start: normalizeDateTime(e.start),
        end: normalizeDateTime(e.end),
        deadline: e.deadline === true,
        place: str(e.place, 80),
        // 链接必须在原文里原样出现
        link: link && text.includes(link) ? link : '',
      };
    }).filter((e) => e.start).sort((a, b) => a.start.localeCompare(b.start));
    return {
      company: str(r.company, 40),
      position: str(r.position, 60),
      kind: oneOf(r.kind, NOTICE_KINDS, '其他'),
      events,
      prepare: strs(r.prepare, 8, 200),
      notes: strs(r.notes, 8, 200),
    };
  },
};
