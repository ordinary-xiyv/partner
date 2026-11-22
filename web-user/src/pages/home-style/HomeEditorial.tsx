import { useEffect } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useHomePrimaryAction } from './shared/useHomePrimaryAction';
import { useHomeStyleTokens } from './shared/useHomeStyleTokens';
import { useScrollTriggerCleanup } from './shared/motion';
import { EditorialHero } from './editorial/EditorialHero';
import { EditorialSdk } from './editorial/EditorialSdk';
import { EditorialScenes } from './editorial/EditorialScenes';
import { EditorialCta } from './editorial/EditorialCta';
import './editorial/editorial.css';

/**
 * 首页 · A 纸感编辑
 *
 * 这个文件只做装配，不含任何视觉细节：
 * 1. 算出本次渲染的主色令牌（跟随伙伴主色 + 明暗模式变化）
 * 2. 把令牌铺成 CSS 变量到根节点
 * 3. 按顺序摆区块
 *
 * 结构与 HomeTerminal 完全对齐（同样的四块、同样的顺序），
 * 两套风格切换时访客看到的信息顺序一致，只有视觉语言不同。
 *
 * 这一版把模块从 8 块压到 4 块，删掉的四块及理由：
 *
 *   · 特性带（Routing / Gateway / Catalog）
 *     讲的是「统一 API 接入」「智能路由」「模型覆盖」，而这三件事
 *     首屏副标题和下面的代码段已经说完了。三张卡只是同一句话说三遍。
 *
 *   · 治理/管理系统（API 管理 / Token 分析 / 组织 / 审计）
 *     这是企业采购才会关心的内容，语气上把整页推向了「卖 SaaS 平台」。
 *     站点实际面向的是拿 Key 就要跑通的人，不是走采购流程的 IT 部门。
 *
 *   · 热门模型（原第 3 块）
 *     用户明确要求去掉。模型清单在「模型广场」页有完整版，首页不必重复；
 *     首页真正要回答的是「怎么用上」，不是「一共有哪些」。
 *
 *   · 合作/客户背书条
 *     那是企业销售逻辑的产物（谁在用我们），与上面同样的问题。
 *     站点面向开发者时，一段能跑通的代码比一排 logo 更有说服力。
 *     而且真实站点多数并没有可公开展示的客户，那一排位置常常是空的或凑的。
 *
 * 顺序上把代码段从原来的第 5 提到第 2：开发者看到能跑的代码，
 * 比看三张特性卡更能下决心。
 *
 * 令牌走 inline style 而不是 CSS class：
 * 主色是运行时才知道的值（伙伴配的 hex），没法预先写进样式表。
 * 铺在根节点上让整棵子树都能用 var(--ed-brand-*)，
 * 比把颜色当 prop 传进十几个组件干净得多。
 */
export default function HomeEditorial() {
  const { handlePrimary } = useHomePrimaryAction();
  const { cssVars } = useHomeStyleTokens('editorial');

  useScrollTriggerCleanup();

  /*
   * 给 html 打个标记。用途有两个：
   *   · 页头（Header）需要知道当前是哪套风格，好把边框/透明度调成协调的样子
   *   · 全局样式里需要针对首页做少量覆盖（比如去掉 main 的默认内边距）
   * 卸载时清掉，避免离开首页后残留影响控制台页面。
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('home-style-editorial');
    return () => {
      root.classList.remove('home-style-editorial');
    };
  }, []);

  return (
    <div className="ed-page" style={cssVars as React.CSSProperties}>
      <Header variant="hero" scrollBehavior="shrink-glass" />

      <main>
        <EditorialHero onPrimaryAction={handlePrimary} />
        <EditorialSdk />
        <EditorialScenes />
        <EditorialCta onPrimaryAction={handlePrimary} />
      </main>

      <Footer />
    </div>
  );
}
