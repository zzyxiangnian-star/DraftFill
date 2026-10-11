import { describe, expect, it } from 'vitest';
import { scanDocument } from '../src/lib/scan';

describe('scanDocument', () => {
  it('统计可填控件，合并单选组，跳过敏感控件', () => {
    document.body.innerHTML = `
      <input name="name"> <input type="email" name="email">
      <textarea name="intro"></textarea>
      <select name="degree"><option>本科</option></select>
      <input type="radio" name="gender" value="男"><input type="radio" name="gender" value="女">
      <input type="checkbox" name="agree">
      <input type="month" name="start">
      <input type="password" name="pwd">
      <input name="captcha" placeholder="请输入验证码">
      <input type="file" name="resume">
      <input type="hidden" name="token">
      <button type="submit">提交</button>
      <input name="off" disabled>
      <input name="gone" style="display:none">
    `;
    const s = scanDocument(document);
    expect(s.byKind).toEqual({ text: 2, textarea: 1, select: 1, radio: 1, checkbox: 1, date: 1 });
    expect(s.fillable).toBe(7);
    expect(s.skipped).toBe(3);
  });
});
