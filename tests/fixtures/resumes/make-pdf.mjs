import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [src, out] = process.argv.slice(2);
const lines = readFileSync(src, 'utf8').split('\n');
const HEAD = /^(教育背景|实习经历|项目经历|校园经历|获奖情况|专业技能)$/;
const body = lines.map((l) => {
  if (!l.trim()) return '';
  if (HEAD.test(l.trim())) return `<h2>${l}</h2>`;
  const cells = l.split(/\s{3,}/);
  if (cells.length > 1) return `<table><tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr></table>`;
  return `<p>${l}</p>`;
}).join('\n');
const html = `<html><head><meta charset="utf-8"><style>body{font-family:'WenQuanYi Zen Hei';font-size:12px;margin:40px}h2{font-size:15px;border-bottom:1px solid #333;margin:14px 0 6px}p{margin:3px 0}table{width:100%;border-collapse:collapse}td{padding:2px 4px}</style></head><body>${body}</body></html>`;
const b = await chromium.launch({ channel: 'chromium' });
const p = await b.newPage();
await p.setContent(html);
await p.pdf({ path: out, format: 'A4' });
await b.close();
