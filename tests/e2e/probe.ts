// 打包后注入到测试页面，用来在真实浏览器里统计识别率。
import { planFill } from '../../src/lib/fill/fill';
import { sampleProfile } from '../fixtures/profile';
import { scorePlan } from '../fixtures/score';

(window as unknown as { __probe: () => unknown }).__probe = () => scorePlan(planFill(document, sampleProfile()));
