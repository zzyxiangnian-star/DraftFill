// 录入时的格式提示。只提示不拦截：同学可能有特殊情况（境外手机号、港澳证件等）。

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = '10X98765432';

export function checkIdNumber(id: string): string | null {
  if (!id) return null;
  const v = id.toUpperCase();
  if (!/^\d{17}[\dX]$/.test(v)) return '居民身份证号应为 18 位';
  const sum = ID_WEIGHTS.reduce((s, w, i) => s + w * Number(v[i]), 0);
  return ID_CHECK[sum % 11] === v[17] ? null : '校验位不对，请核对是否输错';
}

export function checkPhone(phone: string): string | null {
  if (!phone) return null;
  return /^1[3-9]\d{9}$/.test(phone.replace(/[\s-]/g, '')) ? null : '大陆手机号应为 11 位，以 1 开头';
}

export function checkEmail(email: string): string | null {
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : '邮箱格式不对';
}

/** 起止时间（YYYY-MM 或 YYYY-MM-DD）顺序检查 */
export function checkRange(start: string, end: string): string | null {
  if (!start || !end) return null;
  return start <= end ? null : '结束时间早于开始时间';
}

export function checkGpa(gpa: string, scale: string): string | null {
  if (!gpa) return null;
  const g = Number(gpa);
  if (Number.isNaN(g) || g < 0) return '请填写数字';
  const s = Number(scale);
  return scale && !Number.isNaN(s) && g > s ? '绩点大于满分' : null;
}
