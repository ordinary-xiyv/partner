import { useEffect } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useHomePrimaryAction } from './shared/useHomePrimaryAction';
import { useHomeStyleTokens } from './shared/useHomeStyleTokens';
import { useScrollTriggerCleanup } from './shared/motion';
import { TerminalHero } from './terminal/TerminalHero';
import { TerminalSdk } from './terminal/TerminalSdk';
import { TerminalScenes } from './terminal/TerminalScenes';
import { TerminalCta } from './terminal/TerminalCta';
import './terminal/terminal.css';

/**
 * 首页 · B 终端网格
 *
 * 结构与 HomeEditorial 完全对齐（同样的四块、同样的顺序），
 * 两套风格切换时访客看到的信息顺序一致，只有视觉语言不同。
 *
 * 这一版把模块从 7 块压到 4 块，删掉的三块及理由：
 *
 *   · 特性带（Routing / Gateway / Catalog）
 *     讲的是「统一 API 接入」「智能路由」「模型覆盖」，而这三件事
 *     首屏副标题和下面的代码段已经说完了。三张卡只是同一句话说三遍。
 *
 *   · 企业管理系统（API 管理 / Token 分析 / 组织 / 审计）
 *     这是企业采购才会关心的内容，语气上把整页推向了「卖 SaaS 平台」。
 *     站点实际面向的是拿 Key 就要跑通的人，不是走采购流程的 IT 部门。
 *     而且「多级组织」「企业授信」这类功能多数站点并没有真开。
 *
 *   · 热门模型（原第 3 块）
 *     用户明确要求去掉。模型清单在「模型广场」页有完整版，首页不必重复；
 *     首页真正要回答的是「怎么用上」，不是「一共有哪些」。
 *
 * 顺序上把代码段从原来的第 5 提到第 2：开发者看到能跑的代码，
 * 比看三张特性卡更能下决心。
 */
export default function HomeTerminal() {
  const { handlePrimary } = useHomePrimaryAction();
  const { cssVars } = useHomeStyleTokens('terminal');

  useScrollTriggerCleanup();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('home-style-terminal');
    return () => {
      root.classList.remove('home-style-terminal');
    };
  }, []);

  return (
    <div className="tm-page" style={cssVars as React.CSSProperties}>
      <Header variant="hero" scrollBehavior="shrink-glass" />

      <main>
        <TerminalHero onPrimaryAction={handlePrimary} />
        <TerminalSdk />
        <TerminalScenes />
        <TerminalCta onPrimaryAction={handlePrimary} />
      </main>

      <Footer />
    </div>
  );
}
