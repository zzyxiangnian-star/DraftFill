import { describe, expect, it, vi } from 'vitest';
import { cardEntry, startCandidateCard } from '../src/lib/fill/card';
import { fillFromCandidate, runFill } from '../src/lib/fill/fill';
import { remember, signature } from '../src/lib/fill/memory';
import { sampleProfile } from './fixtures/profile';

const PAGE = `
  <form>
    <label>姓名 <input name="n"></label>
    <label>宿舍楼号 <input name="dorm"></label>
    <label>登录密码 <input type="password" name="pwd"></label>
  </form>`;

describe('候选卡', () => {
  it('只给插件没填、还空着、能写入的字段弹出', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    const { entries } = await runFill(document, p);
    const [name, dorm, pwd] = ['n', 'dorm', 'pwd'].map((n) => document.querySelector(`[name=${n}]`)!);
    expect(cardEntry(entries, name, p)).toBeNull(); // 已经填了
    expect(cardEntry(entries, pwd, p)).toBeNull(); // 密码框不填
    const hit = cardEntry(entries, dorm, p)!;
    expect(hit.list.map((c) => c.value)).toContain('北京大学');
    expect(hit.list.map((c) => c.value)).not.toContain('');
  });

  it('聚焦弹出，点一项写入；关闭后这个字段不再弹出', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    const { entries } = await runFill(document, p);
    const onPick = vi.fn(async ({ entry, candidate }) => (await fillFromCandidate(entry, candidate.path, candidate.value)).status === 'ok');
    const stop = startCandidateCard(document, entries, { profile: p, onPick });
    const dorm = document.querySelector<HTMLInputElement>('[name=dorm]')!;
    dorm.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    const root = document.getElementById('wangshen-card')!.shadowRoot!;
    root.querySelector<HTMLInputElement>('.q')!.value = '武汉';
    root.querySelector('.q')!.dispatchEvent(new Event('input'));
    const btn = [...root.querySelectorAll<HTMLButtonElement>('.item')].find((b) => b.textContent!.includes('武汉大学'))!;
    btn.click();
    await vi.waitFor(() => expect(dorm.value).toBe('武汉大学'));
    expect(onPick.mock.calls[0]![0]).toMatchObject({ remember: true, candidate: { path: 'education[1].school' } });
    expect(document.getElementById('wangshen-card')).toBeNull();

    dorm.value = '';
    entries.find((e) => e.control.el === dorm)!.item.status = 'skip';
    dorm.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    document.getElementById('wangshen-card')!.shadowRoot!.querySelector<HTMLButtonElement>('.x')!.click();
    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    dorm.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    expect(document.getElementById('wangshen-card')).toBeNull();
    stop();
  });

  it('记住之后，下次在同一网站直接填；别的网站不套用', async () => {
    document.body.innerHTML = PAGE;
    const p = sampleProfile();
    const dorm = () => document.querySelector<HTMLInputElement>('[name=dorm]')!;
    const first = await runFill(document, p);
    const c = first.entries.find((e) => e.control.el === dorm())!.control;
    const host = new URL(location.href).host;
    const mem = remember({ version: 1, items: {} }, signature(c, host)!, { path: 'education[1].school', label: '宿舍楼号', host });

    document.body.innerHTML = PAGE;
    const again = await runFill(document, p, mem);
    const item = again.report.items.find((i) => i.label.startsWith('宿舍楼号'))!;
    expect(item).toMatchObject({ status: 'ok', note: '按你之前的选择' });
    expect(dorm().value).toBe('武汉大学'); // 记到第几条：上次选的是第 2 段教育经历

    // 同名字段重复出现（每段经历一组）时按出现顺序填
    document.body.innerHTML = PAGE + '<label>宿舍楼号 <input name="dorm2"></label>';
    await runFill(document, p, mem);
    expect([dorm().value, document.querySelector<HTMLInputElement>('[name=dorm2]')!.value]).toEqual(['北京大学', '武汉大学']);

    document.body.innerHTML = PAGE;
    const other = remember({ version: 1, items: {} }, signature(c, 'other.example.com')!, { path: 'education[].school', label: '宿舍楼号', host: 'other.example.com' });
    await runFill(document, p, other);
    expect(dorm().value).toBe('');
  });
});
