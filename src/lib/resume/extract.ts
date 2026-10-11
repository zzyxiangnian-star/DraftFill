import { itemsToLines, type TextItem } from './lines';

// 读出简历文件里的文字。全部在本机完成，不上传。

export type ExtractResult = { ok: true; text: string } | { ok: false; reason: string };

async function pdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(itemsToLines(content.items.filter((x): x is TextItem & typeof x => 'str' in x)).join('\n'));
  }
  await task.destroy();
  return pages.join('\n');
}

async function docxText(data: ArrayBuffer): Promise<string> {
  // 打包时按 mammoth 的 browser 字段换成浏览器版
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ arrayBuffer: data });
  return r.value;
}

export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  if (file.size > 20 * 1024 * 1024) return { ok: false, reason: '文件太大了，简历一般不超过 20MB。' };
  try {
    let text: string;
    if (name.endsWith('.pdf')) text = await pdfText(await file.arrayBuffer());
    else if (name.endsWith('.docx')) text = await docxText(await file.arrayBuffer());
    else if (name.endsWith('.txt')) text = await file.text();
    else if (name.endsWith('.doc')) return { ok: false, reason: '老版 Word（.doc）读不了，请在 Word 里“另存为” .docx 或 PDF 再导入。' };
    else return { ok: false, reason: '只支持 PDF、Word（.docx）和 TXT 格式的简历。' };
    if (text.replace(/\s/g, '').length < 20) {
      return { ok: false, reason: name.endsWith('.pdf') ? '这份 PDF 里读不出文字，可能是扫描件或图片。请用 Word 导出的 PDF 或直接导入 Word 文件。' : '文件里几乎没有文字。' };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, reason: '文件打不开，可能已损坏或设置了密码。' };
  }
}
