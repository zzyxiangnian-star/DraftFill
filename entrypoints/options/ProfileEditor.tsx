import { Lock } from 'lucide-react';
import { Choice, Grid, LongText, RepeatList, Section, Text, Toggle } from '@/src/components/form';
import { iconProps } from '@/src/components/icon';
import * as O from '@/src/lib/profile/options';
import {
  emptyAward, emptyCampusRole, emptyCertificate, emptyCustomField, emptyEducation, emptyFamilyMember, emptyInternship,
  emptyLanguage, emptyProject, type Profile, type SensitiveKey,
} from '@/src/lib/profile/schema';
import { checkEmail, checkGpa, checkIdNumber, checkPhone, checkRange } from '@/src/lib/profile/validate';

export const SECTIONS = [
  ['basic', '基本信息'], ['intention', '求职意向'], ['education', '教育经历'], ['internships', '实习经历'],
  ['projects', '项目经历'], ['campus', '校园经历'], ['awards', '获奖情况'], ['skills', '语言与证书'],
  ['family', '家庭成员'], ['emergency', '紧急联系人'], ['custom', '其他信息'],
] as const;

type Group = 'basic' | 'intention' | 'skills' | 'emergencyContact';

const filled = (o: object) => Object.values(o).filter((v) => typeof v === 'string' && v.trim()).length;
const total = (o: object) => Object.values(o).filter((v) => typeof v === 'string').length;

export function ProfileEditor({ profile: p, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const set = (patch: Partial<Profile>) => onChange({ ...p, ...patch });

  function bind<G extends Group>(group: G, key: keyof Profile[G] & string) {
    const obj = p[group] as unknown as Record<string, string>;
    return { value: obj[key] ?? '', onChange: (v: string) => set({ [group]: { ...obj, [key]: v } } as Partial<Profile>) };
  }

  const autofill = (key: SensitiveKey, label = '允许自动填写') => (
    <Toggle checked={p.autofill[key]} onChange={(v) => set({ autofill: { ...p.autofill, [key]: v } })}>{label}</Toggle>
  );
  const lockHint = (key: SensitiveKey) => (p.autofill[key] ? null : (
    <span className="row" style={{ gap: 4 }}><Lock {...iconProps} size={12} />默认不自动填写</span>
  ));

  return (
    <div className="editor">
      <Section id="basic" title="基本信息" meta={`${filled(p.basic)}/${total(p.basic)}`}
        hint="手机、邮箱、证件号属于敏感信息，打开右侧开关后才会自动填写。">
        <Grid>
          <Text label="姓名" {...bind('basic', 'name')} />
          <Choice label="性别" options={O.GENDERS} {...bind('basic', 'gender')} />
          <Text label="出生日期" type="date" {...bind('basic', 'birthDate')} />
          <Choice label="民族" options={O.ETHNICITIES} {...bind('basic', 'ethnicity')} />
          <Choice label="政治面貌" options={O.POLITICAL_STATUSES} {...bind('basic', 'politicalStatus')} />
          <Text label="籍贯" placeholder="例如：湖南长沙" {...bind('basic', 'nativePlace')} />
          <Text label="户口所在地" placeholder="例如：湖南省长沙市" {...bind('basic', 'hukou')} />
          <Text label="生源地" placeholder="高考所在省市" {...bind('basic', 'sourceRegion')} />
          <Text label="现居城市" {...bind('basic', 'currentCity')} />
          <Text label="手机号" type="tel" inputMode="tel" error={checkPhone(p.basic.phone)} hint={lockHint('phone')} {...bind('basic', 'phone')} />
          <Text label="邮箱" type="email" inputMode="email" error={checkEmail(p.basic.email)} hint={lockHint('email')} {...bind('basic', 'email')} />
          <Choice label="证件类型" options={O.ID_TYPES} {...bind('basic', 'idType')} />
          <Text label="证件号码" hint={lockHint('idNumber')}
            error={p.basic.idType === '居民身份证' ? checkIdNumber(p.basic.idNumber) : null} {...bind('basic', 'idNumber')} />
          <Text label="通讯地址" wide {...bind('basic', 'address')} />
        </Grid>
        <div className="toggles">
          {autofill('phone', '自动填写手机号')}
          {autofill('email', '自动填写邮箱')}
          {autofill('idNumber', '自动填写证件号码')}
        </div>
      </Section>

      <Section id="intention" title="求职意向" meta={`${filled(p.intention)}/${total(p.intention)}`}>
        <Grid>
          <Text label="意向岗位" placeholder="可写多个，用顿号分隔" {...bind('intention', 'positions')} />
          <Text label="期望城市" placeholder="例如：北京、上海" {...bind('intention', 'cities')} />
          <Text label="期望薪资" placeholder="例如：面议 / 20k" {...bind('intention', 'salary')} />
          <Text label="最早到岗时间" type="date" {...bind('intention', 'availableDate')} />
          <Choice label="是否服从调剂" options={O.YES_NO} {...bind('intention', 'acceptAdjust')} />
          <Text label="信息来源" placeholder="例如：学校宣讲会、官网" {...bind('intention', 'infoSource')} />
          <Text label="内推码" hint="不同公司的内推码不同，填写时会再提醒你核对" {...bind('intention', 'referralCode')} />
        </Grid>
      </Section>

      <Section id="education" title="教育经历" meta={`${p.education.length} 条`} hint="从最高学历开始填，顺序就是填写顺序。">
        <RepeatList items={p.education} onChange={(education) => set({ education })} create={emptyEducation}
          addLabel="添加教育经历" empty="还没有教育经历。"
          title={(e, i) => [e.school, e.degree].filter(Boolean).join(' · ') || `第 ${i + 1} 段教育经历`}>
          {(e, up) => (
            <Grid>
              <Text label="学校" value={e.school} onChange={(school) => up({ school })} />
              <Choice label="学历" options={O.DEGREES} value={e.degree} onChange={(degree) => up({ degree })} />
              <Choice label="学位" options={O.DEGREE_TYPES} value={e.degreeType} onChange={(degreeType) => up({ degreeType })} />
              <Choice label="学习形式" options={O.STUDY_MODES} value={e.studyMode} onChange={(studyMode) => up({ studyMode })} />
              <Text label="院系" value={e.college} onChange={(college) => up({ college })} />
              <Text label="专业" value={e.major} onChange={(major) => up({ major })} />
              <Text label="入学时间" type="month" value={e.start} onChange={(start) => up({ start })} />
              <Text label="毕业时间" type="month" value={e.end} onChange={(end) => up({ end })} error={checkRange(e.start, e.end)} />
              <Text label="GPA" inputMode="decimal" value={e.gpa} onChange={(gpa) => up({ gpa })} error={checkGpa(e.gpa, e.gpaScale)} />
              <Text label="GPA 满分" inputMode="decimal" placeholder="例如：4.0" value={e.gpaScale} onChange={(gpaScale) => up({ gpaScale })} />
              <Text label="专业排名" inputMode="numeric" value={e.rank} onChange={(rank) => up({ rank })} />
              <Text label="专业总人数" inputMode="numeric" value={e.rankTotal} onChange={(rankTotal) => up({ rankTotal })} />
              <LongText label="主修课程" rows={2} value={e.courses} onChange={(courses) => up({ courses })} />
            </Grid>
          )}
        </RepeatList>
      </Section>

      <Section id="internships" title="实习经历" meta={`${p.internships.length} 条`}>
        <RepeatList items={p.internships} onChange={(internships) => set({ internships })} create={emptyInternship}
          addLabel="添加实习经历" empty="还没有实习经历。"
          title={(x, i) => [x.company, x.title].filter(Boolean).join(' · ') || `第 ${i + 1} 段实习`}>
          {(x, up) => (
            <Grid>
              <Text label="公司" value={x.company} onChange={(company) => up({ company })} />
              <Text label="职位" value={x.title} onChange={(title) => up({ title })} />
              <Text label="部门" value={x.department} onChange={(department) => up({ department })} />
              <Text label="城市" value={x.city} onChange={(city) => up({ city })} />
              <Text label="开始时间" type="month" value={x.start} onChange={(start) => up({ start })} />
              <Text label="结束时间" type="month" hint="还在实习可以留空" value={x.end} onChange={(end) => up({ end })} error={checkRange(x.start, x.end)} />
              <LongText label="工作内容" value={x.description} onChange={(description) => up({ description })} />
            </Grid>
          )}
        </RepeatList>
      </Section>

      <Section id="projects" title="项目经历" meta={`${p.projects.length} 条`}>
        <RepeatList items={p.projects} onChange={(projects) => set({ projects })} create={emptyProject}
          addLabel="添加项目经历" empty="还没有项目经历。"
          title={(x, i) => x.name || `第 ${i + 1} 个项目`}>
          {(x, up) => (
            <Grid>
              <Text label="项目名称" value={x.name} onChange={(name) => up({ name })} />
              <Text label="担任角色" value={x.role} onChange={(role) => up({ role })} />
              <Text label="开始时间" type="month" value={x.start} onChange={(start) => up({ start })} />
              <Text label="结束时间" type="month" value={x.end} onChange={(end) => up({ end })} error={checkRange(x.start, x.end)} />
              <Text label="项目链接" type="url" wide placeholder="GitHub、作品集等，可不填" value={x.link} onChange={(link) => up({ link })} />
              <LongText label="项目描述" value={x.description} onChange={(description) => up({ description })} />
            </Grid>
          )}
        </RepeatList>
      </Section>

      <Section id="campus" title="校园经历" meta={`${p.campus.length} 条`} hint="学生干部、社团、志愿活动等。">
        <RepeatList items={p.campus} onChange={(campus) => set({ campus })} create={emptyCampusRole}
          addLabel="添加校园经历" empty="还没有校园经历。"
          title={(x, i) => [x.organization, x.role].filter(Boolean).join(' · ') || `第 ${i + 1} 段校园经历`}>
          {(x, up) => (
            <Grid>
              <Text label="组织名称" value={x.organization} onChange={(organization) => up({ organization })} />
              <Text label="担任职务" value={x.role} onChange={(role) => up({ role })} />
              <Text label="开始时间" type="month" value={x.start} onChange={(start) => up({ start })} />
              <Text label="结束时间" type="month" value={x.end} onChange={(end) => up({ end })} error={checkRange(x.start, x.end)} />
              <LongText label="经历描述" rows={3} value={x.description} onChange={(description) => up({ description })} />
            </Grid>
          )}
        </RepeatList>
      </Section>

      <Section id="awards" title="获奖情况" meta={`${p.awards.length} 条`} hint="奖学金也填在这里。">
        <RepeatList items={p.awards} onChange={(awards) => set({ awards })} create={emptyAward}
          addLabel="添加获奖" empty="还没有获奖记录。"
          title={(x, i) => x.name || `第 ${i + 1} 项`}>
          {(x, up) => (
            <Grid>
              <Text label="奖项名称" value={x.name} onChange={(name) => up({ name })} />
              <Choice label="级别" options={O.AWARD_LEVELS} value={x.level} onChange={(level) => up({ level })} />
              <Text label="获奖时间" type="month" value={x.date} onChange={(date) => up({ date })} />
              <LongText label="说明" rows={2} value={x.description} onChange={(description) => up({ description })} />
            </Grid>
          )}
        </RepeatList>
      </Section>

      <Section id="skills" title="语言与证书">
        <Grid>
          <Text label="四级成绩" inputMode="numeric" placeholder="未考可留空" {...bind('skills', 'cet4')} />
          <Text label="六级成绩" inputMode="numeric" placeholder="未考可留空" {...bind('skills', 'cet6')} />
          <Choice label="计算机等级" options={O.COMPUTER_LEVELS} {...bind('skills', 'computerLevel')} />
        </Grid>
        <h3 className="sub-head">其他语言</h3>
        <RepeatList items={p.skills.languages} onChange={(languages) => set({ skills: { ...p.skills, languages } })}
          create={emptyLanguage} addLabel="添加语言" empty="雅思、托福、日语等可以加在这里。"
          title={(x, i) => x.language || `语言 ${i + 1}`}>
          {(x, up) => (
            <Grid>
              <Text label="语言" value={x.language} onChange={(language) => up({ language })} />
              <Text label="等级或成绩" placeholder="例如：雅思 7.0、N2" value={x.level} onChange={(level) => up({ level })} />
            </Grid>
          )}
        </RepeatList>
        <h3 className="sub-head">证书</h3>
        <RepeatList items={p.skills.certificates} onChange={(certificates) => set({ skills: { ...p.skills, certificates } })}
          create={emptyCertificate} addLabel="添加证书" empty="还没有证书。"
          title={(x, i) => x.name || `证书 ${i + 1}`}>
          {(x, up) => (
            <Grid>
              <Text label="证书名称" value={x.name} onChange={(name) => up({ name })} />
              <Text label="获得时间" type="month" value={x.date} onChange={(date) => up({ date })} />
            </Grid>
          )}
        </RepeatList>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <LongText label="专业技能" rows={3} placeholder="例如：熟悉 Python、SQL；会用 Figma" {...bind('skills', 'summary')} />
        </div>
      </Section>

      <Section id="family" title="家庭成员" meta={`${p.family.length} 人`} hint="国企、银行常要求填写。" actions={autofill('family')}>
        <RepeatList items={p.family} onChange={(family) => set({ family })} create={emptyFamilyMember}
          addLabel="添加家庭成员" empty="还没有家庭成员信息。"
          title={(x, i) => [x.relation, x.name].filter(Boolean).join(' · ') || `成员 ${i + 1}`}>
          {(x, up) => (
            <Grid>
              <Choice label="关系" options={O.RELATIONS} value={x.relation} onChange={(relation) => up({ relation })} />
              <Text label="姓名" value={x.name} onChange={(name) => up({ name })} />
              <Text label="工作单位" value={x.employer} onChange={(employer) => up({ employer })} />
              <Text label="职务" value={x.title} onChange={(title) => up({ title })} />
              <Text label="联系电话" type="tel" value={x.phone} onChange={(phone) => up({ phone })} error={checkPhone(x.phone)} />
            </Grid>
          )}
        </RepeatList>
      </Section>

      <Section id="emergency" title="紧急联系人" actions={autofill('emergencyContact')}>
        <Grid>
          <Text label="姓名" {...bind('emergencyContact', 'name')} />
          <Choice label="关系" options={O.RELATIONS} {...bind('emergencyContact', 'relation')} />
          <Text label="电话" type="tel" error={checkPhone(p.emergencyContact.phone)} {...bind('emergencyContact', 'phone')} />
        </Grid>
      </Section>

      <Section id="custom" title="其他信息" hint="上面没有的字段，例如“身高”“是否有亲属在本公司”。填写时按字段名匹配。">
        <RepeatList items={p.custom} onChange={(custom) => set({ custom })} create={emptyCustomField}
          addLabel="添加字段" empty="还没有自定义字段。"
          title={(x, i) => x.label || `字段 ${i + 1}`}>
          {(x, up) => (
            <Grid>
              <Text label="字段名" value={x.label} onChange={(label) => up({ label })} />
              <Text label="内容" value={x.value} onChange={(value) => up({ value })} />
            </Grid>
          )}
        </RepeatList>
      </Section>
    </div>
  );
}

