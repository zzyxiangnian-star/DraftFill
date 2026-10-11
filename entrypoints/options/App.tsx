import { FileJson, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/src/components/Logo';
import { iconProps } from '@/src/components/icon';

const SECTIONS = [
  { id: 'profile', label: '个人档案', Icon: UserRound },
  { id: 'backup', label: '导入导出', Icon: FileJson },
  { id: 'ai', label: 'AI 设置', Icon: KeyRound },
  { id: 'rules', label: '使用边界', Icon: ShieldCheck },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function App() {
  const [current, setCurrent] = useState<SectionId>('profile');

  return (
    <div className="opt">
      <nav className="nav" aria-label="设置分区">
        <div style={{ padding: '0 12px 16px' }}><Logo /></div>
        {SECTIONS.map(({ id, label, Icon }) => (
          <button key={id} className="nav-item" aria-current={current === id ? 'page' : undefined} onClick={() => setCurrent(id)}>
            <Icon {...iconProps} /> {label}
          </button>
        ))}
      </nav>

      <main className="main enter" key={current}>
        {current === 'profile' && (
          <>
            <div className="stack">
              <h1>个人档案</h1>
              <p className="muted">档案只保存在这台电脑的浏览器里，不上传任何服务器。</p>
            </div>
            <section className="card">
              <h2>还没有档案</h2>
              <p className="small muted" style={{ marginTop: 4 }}>
                阶段 1 会在这里加入档案编辑：基本信息、求职意向、教育、实习、项目、获奖、证书、家庭成员，以及按岗位方向建多份档案。
              </p>
            </section>
          </>
        )}
        {current === 'backup' && (
          <>
            <h1>导入导出</h1>
            <section className="card"><p className="small muted">阶段 1 支持把全部档案导出为 JSON 文件备份，或从备份恢复。备份不含 API Key。</p></section>
          </>
        )}
        {current === 'ai' && (
          <>
            <h1>AI 设置</h1>
            <section className="card"><p className="small muted">第三版接入 DeepSeek（兼容 OpenAI 协议）。字段兜底只发送字段名和选项，不发送你的个人信息。</p></section>
          </>
        )}
        {current === 'rules' && (
          <>
            <h1>使用边界</h1>
            <section className="card">
              <ul className="rules small">
                <li>只填不交：插件不会点击提交、保存或下一步，由你检查后自己提交。</li>
                <li>宁可不填，不填错：没把握的字段标黄，等你确认。</li>
                <li>写入后回读校验，页面显示值不一致的标红。</li>
                <li>不识别、不绕过验证码和滑块，不保存网站账号密码。</li>
                <li>只在你点击时读取当前页面，不申请"读取所有网站"权限。</li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
