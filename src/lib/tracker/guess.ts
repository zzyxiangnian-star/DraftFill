// 从网申页面猜公司和岗位，填进“记到看板”的输入框，用户可以改。猜不出就留空。

const TITLE_NOISE = /(校园招聘|社会招聘|实习生招聘|校招|社招|招聘官网|人才招聘|招聘网站|招聘|官网|加入我们|careers?|jobs?|申请职位|投递简历|职位详情)/gi;

export function guessCompany(title: string): string {
  const parts = title.split(/\s*[|｜\-–—_·]\s*/).map((p) => p.replace(TITLE_NOISE, '').trim()).filter((p) => p.length >= 2 && p.length <= 20);
  return parts[0] ?? '';
}

const POSITION_HINT = /(?:正在投递(?:职位)?|投递职位|申请职位|应聘职位|申请岗位|投递岗位)\s*[:：]\s*([^\n]{2,60})/;

export function guessPosition(doc: Document): string {
  const text = doc.body?.innerText ?? doc.body?.textContent ?? '';
  const m = POSITION_HINT.exec(text);
  return m ? m[1]!.trim().replace(/\s*\(J?\d+\)\s*$/, '') : '';
}

export function guessJob(doc: Document): { company: string; position: string } {
  return { company: guessCompany(doc.title), position: guessPosition(doc) };
}
