import { Compass, MousePointerClick, PlayCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { iconProps } from '@/src/components/icon';
import { TOUR } from './Tour';

// 使用教程：每个功能讲清楚怎么用；「开始导览」逐页带着看，「打开练习页」在假表单上走一遍一键填充。

const stepOf = (title: string) => TOUR.findIndex((s) => s.title === title);

function Part({ title, tour, onTour, children }: { title: string; tour?: string; onTour: (i: number) => void; children: ReactNode }) {
  const step = tour ? stepOf(tour) : -1;
  return (
    <section className="card stack guide-part" style={{ gap: 'var(--space-2)' }}>
      <div className="row">
        <h2 style={{ flex: 1 }}>{title}</h2>
        {step >= 0 && <button className="btn btn-text small" onClick={() => onTour(step)}><Compass {...iconProps} /> 带我去看</button>}
      </div>
      {children}
    </section>
  );
}

const openPractice = () => browser.tabs.create({ url: browser.runtime.getURL('/practice.html') });

export function GuidePage({ startTour }: { startTour: (i: number) => void }) {
  return (
    <>
      <div className="stack">
        <h1>使用教程</h1>
        <p className="muted">第一次用，建议先点「开始导览」看一遍设置页，再到练习页上试一次一键填充。</p>
      </div>

      <section className="card-plain stack guide-hero" style={{ gap: 'var(--space-3)' }}>
        <h2>三步上手</h2>
        <ol className="guide-steps">
          <li><strong>建档案</strong>：在「个人档案」里填一次，或者在「导入」里选一份简历自动认出来。</li>
          <li><strong>一键填充</strong>：打开网申页面，点浏览器右上角的网申助手图标，再点「一键填充」。</li>
          <li><strong>核对后自己提交</strong>：打开侧边栏逐项看，黄色的核对一下，没填的补上，然后自己点提交。</li>
        </ol>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => startTour(0)}><PlayCircle {...iconProps} /> 开始导览</button>
          <button className="btn btn-secondary" onClick={openPractice}><MousePointerClick {...iconProps} /> 打开练习页</button>
        </div>
      </section>

      <section className="card stack guide-part" style={{ gap: 'var(--space-2)' }} data-tour="practice">
        <h2>在网申网站上</h2>
        <p className="small muted">这一部分在网申网站上用，导览带不过去。可以先在练习页（假表单，不会提交）上照着试一遍。</p>
        <ul className="guide-list">
          <li><strong>一键填充</strong>：点工具栏的网申助手图标（没看到的话在拼图图标里，可以固定到工具栏），再点「一键填充」。插件只在你点的时候读这个页面。</li>
          <li><strong>看颜色</strong>：填好的字段边框变<span className="g-ok">绿</span>；<span className="g-warn">黄</span>色是没把握或者重要信息（籍贯、户口、学历等），请核对；<span className="g-err">红</span>色是填了但页面显示的不一样；<span className="g-need">红色虚线</span>是必填但没填上。</li>
          <li><strong>侧边栏</strong>：在弹窗里点「打开侧边栏」，按“必填还空着 / 需要你看一下 / 附件 / 已填写 / 没有填写”分组列出每一项和原因，点一项会定位到页面上的字段。</li>
          <li><strong>缺信息时问你</strong>：必填、但档案里没有的字段，侧边栏最上面会逐个问你。你答了才填，勾上「存进档案」下次直接填。</li>
          <li><strong>候选卡</strong>：插件没填的字段，点进去旁边会列出档案里能填的内容，点一下填上；勾「记住」，同一网站下次自动填。问答题里还会列出回答库里相似题的回答。</li>
          <li><strong>AI 帮我填完</strong>：一键填充后，在弹窗、侧边栏或悬浮按钮里点「AI 帮我填完」，用不用由你决定（要先设置 API Key）。AI 会认出插件没认出的字段、按面板上的写法点选各家不同的日期框、按你的简历回答档案里没有的问题。只发字段名、选项、面板按钮文字和去掉姓名电话的简历，不截图；AI 填的一律标黄，请核对后自己提交。</li>
          <li><strong>悬浮按钮</strong>：点过一次插件后，网页右下角会出现悬浮按钮：点它一键填充，点「…」里有「AI 帮我填完」、打开侧边栏、撤销、先隐藏。按住左边的点点能上下拖。想一打开网申网站就有按钮，在弹窗里打开「在这个网站一直显示悬浮按钮」，浏览器会问一次这个网站的权限，只对这个网站生效；按钮只是显示，点了才填，不会自动提交。</li>
          <li><strong>多步表单</strong>：点了“下一步”出现新字段，侧边栏会提示，再点一次填写就行，已经填过的不会被覆盖。</li>
          <li><strong>附件、复选框、验证码</strong>：浏览器不允许插件替你选文件；同意条款的勾选框和验证码也要你自己来。</li>
          <li><strong>撤销</strong>：弹窗或侧边栏里点「撤销本次填写」，页面回到填写前的样子。</li>
          <li><strong>收藏岗位</strong>：在招聘详情页点图标，再点「收藏这个岗位」，会存下岗位名、截止日期和岗位描述。3 天内截止的会在图标上显示数字。</li>
          <li><strong>投递看板</strong>：侧边栏的「投递看板」记录投了哪些、到哪一步（已投递、笔试、面试、offer……），可以导出成表格。</li>
        </ul>
        <div><button className="btn btn-secondary" onClick={openPractice}><MousePointerClick {...iconProps} /> 打开练习页试一试</button></div>
      </section>

      <Part onTour={startTour} title="个人档案" tour="个人档案">
        <ul className="guide-list">
          <li>按网申常见的栏目分好了：基本信息、求职意向、教育、实习、项目、校园、获奖、语言与证书、家庭成员、紧急联系人、其他信息。</li>
          <li>经历可以加多条，用右边的箭头调顺序，从新到旧排。网申页面段数不够时，插件会自动点“添加”。</li>
          <li>手机号、邮箱、证件号、家庭成员默认不自动填，打开对应开关才填。</li>
          <li>投不同方向可以「复制为新档案」，标小圆点的那份是填写时用的。</li>
          <li>网申上档案里没有的问题，在「其他信息」里加「名称 + 内容」，名称一样就会填。</li>
        </ul>
      </Part>

      <Part onTour={startTour} title="导入和备份" tour="从简历导入">
        <ul className="guide-list">
          <li><strong>从简历导入</strong>：选 PDF 或 Word 简历，本机认出姓名、学校、经历等，预览后存成新档案。设置了 AI 的话，可以点「用 AI 整理经历」让结果更完整（只发去掉个人信息的经历正文）。</li>
          <li><strong>导出为简历</strong>：把档案排成一页简历，存成 PDF 或复制文字。</li>
          <li><strong>备份</strong>：档案、投递记录、回答库一起导出成一个文件，换电脑后导入。备份不含 API Key。</li>
        </ul>
      </Part>

      <Part onTour={startTour} title="AI 助手" tour="AI 设置">
        <ul className="guide-list">
          <li><strong>先设置</strong>：右上角「设置」里选服务商（DeepSeek、通义千问、智谱、Kimi 等），填 API Key。不用 AI 的话可以跳过，其他功能都能用。</li>
          <li><strong>问 AI</strong>：求职的任何问题，插件自动挑合适的技能回答。</li>
          <li><strong>简历诊断、经历润色、岗位分析</strong>：按 HR 初筛的标准找问题、按 STAR 改写经历、对照岗位描述看匹配和缺口。</li>
          <li><strong>开放题写作</strong>：网申问答题写 3 个版本，严格控制字数；题目里写了字数会自动带上。</li>
          <li><strong>回答库</strong>：写过的好回答存起来，网申页面上点进相似的问答题会列出来，也能让 AI 按新题改写。这个不需要 AI 也能用。</li>
          <li><strong>通知整理</strong>：粘贴笔试、面试通知，摘出时间和链接，存成手机、电脑都能导入的日历文件，并记到投递看板。</li>
          <li>发给 AI 前会去掉姓名、电话、邮箱、证件号；AI 不知道的数字和细节会标【待补充】，你补上或删掉之后才能存。</li>
        </ul>
      </Part>

      <Part onTour={startTour} title="使用边界和记住的字段" tour="使用边界">
        <ul className="guide-list">
          <li>只填不交：插件从不点提交、保存、下一步。</li>
          <li>不碰验证码和滑块，不保存网站账号密码。</li>
          <li>档案只在你自己的浏览器里，没有服务器。</li>
          <li>「记住的字段」里可以按网站清除插件记住的选择。</li>
        </ul>
      </Part>

      <Part onTour={startTour} title="常见问题">
        <ul className="guide-list">
          <li><strong>为什么有的字段没填？</strong>插件认不准就不填，宁可漏填也不填错。侧边栏里每一项都写了原因，点进字段可以从候选卡里选。</li>
          <li><strong>能帮我自动提交、批量投递吗？</strong>不能，这是故意的。填完请自己检查后提交。</li>
          <li><strong>换电脑了档案怎么办？</strong>在旧电脑「导入（简历/备份）」里导出备份，到新电脑导入。</li>
          <li><strong>点图标没反应 / 提示不是网页？</strong>浏览器自己的页面（设置页、新标签页、应用商店）插件读不了，换到网申网站上再点。</li>
        </ul>
      </Part>
    </>
  );
}
