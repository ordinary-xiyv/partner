/**
 * Header — 全站统一顶部导航栏
 * 登录后：头像 + 用户名，点击展开下拉菜单（含快捷导航、主题切换、退出）
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../contexts/UserContext';
import { useStatus } from '../contexts/StatusContext';
import { useAuthModal } from '../contexts/AuthModalContext';
import { resolveHeaderNavItems } from '../utils/headerNavFromConfig';
import HeaderUtilities from './header/HeaderUtilities';
import HeaderUserMenu from './header/HeaderUserMenu';
import { usePermissions } from '../hooks/usePermissions';
import { canAccessLogSummaries } from '../utils/permission';
import { getSiteLogoResolve, setSiteLogoResolve } from '../utils/siteLogoResolveCache';
import { resolveThemedHeaderLogoUrl } from '../types';
import { resolvePartnerLogo, resolvePartnerMarkInitial } from '../utils/partnerBrand';
import { useTheme } from '../contexts/ThemeContext';
import { selectableClass, isHeaderNavItemActive } from '../ui/selectableNav';
import { getDocsAppHref, getDocsHomeUrl, resolveDocLang } from '../config/docs';
import { useLocale } from '../i18n/hooks/useLocale';
import { pickLocalizedLabel } from '../utils/localeLabels';
import { useAppSidebar } from '../contexts/AppSidebarContext';
import { useHeaderScrollState } from '../hooks/useHeaderScrollState';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { clearModelsConsoleEmbed } from '../utils/modelsConsoleEmbed';
import './header.css';

type NavLinkItem = { kind: 'link'; to?: string; href?: string; label: string; external?: boolean };
type NavDropdownItem = { kind: 'dropdown'; label: string; items: { href: string; label: string; external?: boolean }[] };
type NavItem = NavLinkItem | NavDropdownItem;

interface HeaderProps {
  /** 首页 Hero 顶栏：透明无底边 */
  variant?: 'default' | 'hero';
  /**
   * 首页滚动：透明 → 常驻品牌色毛玻璃（与导航折叠断点无关）。
   *
   * 早期这里是「滚动到 120px 后收成居中胶囊」的形变，位移 + 缩放 +
   * 圆角变化一起动，页面向下滚一点导航就漂一下，很吵。现在只做一件事：
   * 滚动后让整条导航背景从透明渐变成品牌色毛玻璃，位置、宽度、圆角
   * 全程不变。滚动进度仍然由 useHeaderScrollState 提供（见 glassOpacity）。
   */
  scrollBehavior?: 'static' | 'shrink-glass';
  /** 控制台壳层：移动端汉堡打开应用侧栏，而非官网导航抽屉 */
  layoutMode?: 'marketing' | 'console';
}

export default function Header({
  variant = 'default',
  scrollBehavior = 'static',
  layoutMode = 'marketing',
}: HeaderProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { user, isEnterprise, isOrgOwner, isPlatformWorker } = useUser();
  const { has } = usePermissions();
  const { status, siteLogosThemed, siteAppearance, partnerBrand } = useStatus();
  const { resolved: themeResolved } = useTheme();
  const { openLogin } = useAuthModal();
  const location = useLocation();
  const appSidebar = useAppSidebar();
  const { isDesktop } = useBreakpoint();
  const isConsoleLayout = layoutMode === 'console';
  const isHeaderNavCollapsed = !isDesktop;
  const isScrollDriven = scrollBehavior === 'shrink-glass';
  const progress = useHeaderScrollState(isScrollDriven);

  React.useEffect(() => {
    if (!isConsoleLayout) clearModelsConsoleEmbed();
  }, [isConsoleLayout]);

  const [openNavDropdownId, setOpenNavDropdownId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const canUserManage = has('user_manage');
  const showLogSummaries = canAccessLogSummaries(user);
  // 「充值」「订阅」不再对外开放侧栏/菜单入口（个人、企业一视同仁），
  // 页面与路由仍在，只是不给入口。与 MainLayout 的侧栏口径保持一致。
  const showThemeSwitcher = siteAppearance.layout_config.show_theme_switcher;
  const showLanguageSwitcher = siteAppearance.layout_config.show_language_switcher;

  /*
   * 顶部导航白名单 —— 目前为空，即页头不显示任何一级菜单。
   *
   * 背景：这些菜单不是写死在前端的，而是由服务端 `lc_site_footer.header_config`
   * 下发（`/api/lynx/branding/site`）。线上库里 6 个菜单的 visible 全是 true：
   * models / app-plaza / chat / enterprise / docs / pricing。
   *
   * 为什么不在数据库里把它们置 false：那张表是**全站单例**（id=1，没有
   * merchant_id / site_id），改库会把平台自营站和管理后台的导航一起改掉，
   * 而这里只需要客户站自己的页头变干净。所以过滤放在前端这一层。
   *
   * 为什么全部去掉：客户站的一级功能都在侧栏（工作台 / 模型与开发 /
   * 体验中心 / 计费中心），顶栏再放一遍属于重复；应用广场下拉里只有一个
   * visible=false 的 TTS 链接（渲染时会因空子项被整个丢掉）；文档和模型
   * 广场侧栏都有入口。留着只占位置。
   *
   * 要恢复某一项，把它的 id 加进这个数组即可，例如 ['chat'] 只留操作台。
   * 可用的 id：models / app-plaza / chat / enterprise / docs / pricing。
   *
   * 注意：这里只影响**页头显示**，不改变路由可达性。路由白名单在
   * utils/siteAppearanceRouteAccess.ts，由 header_config 的 visible 决定。
   * 直接输 URL 仍能访问 /models、/docs 等页面。若需要连路由一起关，
   * 得改那一处，别以为清空这个数组就全关了。
   */
  const HEADER_NAV_ALLOWED_IDS: readonly string[] = [];

  const NAV_ITEMS: NavItem[] = React.useMemo(
    () => (siteAppearance.header_config.enabled
      ? resolveHeaderNavItems(
          siteAppearance.header_config.items.filter(
            (item) => HEADER_NAV_ALLOWED_IDS.includes(item.id),
          ),
          locale,
        )
      : []),
    [siteAppearance.header_config.enabled, siteAppearance.header_config.items, locale],
  );

  const mobileAppPlazaItems = React.useMemo(() => {
    if (!siteAppearance.header_config.enabled) return [];
    const plaza = siteAppearance.header_config.items.find((item) => item.id === 'app-plaza');
    return (plaza?.dropdown_items ?? [])
      .filter((child) => child.visible && child.href)
      .sort((a, b) => a.sort - b.sort)
      .map((child) => ({
        href: child.href,
        label: pickLocalizedLabel(child.labels, locale)
          || pickLocalizedLabel({ 'zh-CN': child.label_zh, en: child.label_en }, locale),
        external: true as const,
      }));
  }, [siteAppearance.header_config.enabled, siteAppearance.header_config.items, locale]);

  /*
   * Logo 取值：白标站只认伙伴那一张，非白标站才走平台亮/暗双版。
   *
   * 这里曾经写成 `partnerLogoSrc ?? 平台双版`，结果是「伙伴删掉 logo 后
   * 仍然显示平台 logo」—— 因为 ?? 把「伙伴明确没配」和「伙伴不参与」
   * 当成了同一件事。对分销商的客户站，回退到平台 logo 等于白标漏底，
   * 所以必须分开：
   *   · partnerBrand 非 null → 这是白标站，只认伙伴的；没配就是不显示
   *   · partnerBrand 为 null → 没绑站点身份 / 伙伴后端没部署，走平台双版
   *
   * 双版按主题选一张这个信息不能合并进 siteAppearance：合并成一格就
   * 分不出「有没有配亮/暗」，切主题时不知道该不该换图。
   */
  const isWhiteLabelSite = partnerBrand !== null;

  const remoteLogoSrc = React.useMemo(
    () =>
      isWhiteLabelSite
        ? resolvePartnerLogo(partnerBrand) ?? undefined
        : resolveThemedHeaderLogoUrl(themeResolved, siteLogosThemed),
    [isWhiteLabelSite, partnerBrand, themeResolved, siteLogosThemed],
  );

  /*
   * 加载结果记的是「哪一张图」，不是布尔值。
   *
   * ★ 为什么不能用 useState(false) + useEffect 翻牌：那样**首帧必然画首字**。
   *   实测连续刷新三轮，中间态分别是 209ms / 9ms / 11ms —— 后两次比一帧
   *   （16.7ms）还短，屏幕上根本画不出那一帧，但 DOM 里确实先渲染了首字。
   *   用户说「刷新会先显示首字」，说的就是这个必然发生的第一帧。
   *
   *   改成从模块级缓存 getSiteLogoResolve 直接派生后，缓存命中时第一帧
   *   就能判定「这张图之前加载成功过」，直接画图，中间态归零。
   *
   * ★ 为什么不用 effect 同步：effect 在 paint 之后才跑，改了状态又要再 paint
   *   一次 —— 中间那一帧正是我们要消掉的东西。派生值在 render 期就算好，
   *   没有第二帧。
   *
   * 记 src 而不是布尔值，是为了换图时自动失效：商户上传了新 logo，
   * 上一张的「已就绪」不能被当成新图的，否则会先画一张不存在的图。
   */
  const [readyLogoSrc, setReadyLogoSrc] = React.useState<string | null>(null);
  const [brokenLogoSrc, setBrokenLogoSrc] = React.useState<string | null>(null);

  const logoBroken = Boolean(
    remoteLogoSrc
      && (brokenLogoSrc === remoteLogoSrc || getSiteLogoResolve(remoteLogoSrc) === 'broken'),
  );

  /*
   * 这张图有没有真正解码完成。
   *
   * <img> 一挂上 DOM 就算「在渲染」了，但图片字节还没下载完，浏览器画出来的
   * 是一片空白。实测（mock 一张延迟 800ms 的图）：
   *   t=302ms  slot 里有 <img>，但视觉空白
   *   t=1102ms 图解码完成才看得见
   * 这 800ms 里品牌名已经显示了、左边却空着，然后 logo「啪」地出现 ——
   * 和先画首字再换图是同一种闪烁，只是换了形态。
   *
   * 处理办法不是「等图加载完才显示品牌名」（那会拖慢首屏可读性），
   * 而是：图没就绪时继续画首字方块，就绪后无缝换成图。
   */
  const logoReady = Boolean(
    remoteLogoSrc
      && (readyLogoSrc === remoteLogoSrc || getSiteLogoResolve(remoteLogoSrc) === 'remote'),
  );

  /*
   * 只要有 logo 就画图，**不等 statusLoading**。
   *
   * ★ 这里曾经写的是 `remoteLogoSrc && !statusLoading && !logoBroken`，那个
   *   `!statusLoading` 是「只有一个平台 logo 来源」时代的遗留：当年 logo 只能
   *   从平台状态接口拿，状态没回来就无从判断有没有 logo，索性等它。
   *
   *   现在白标站的 logo 来自伙伴品牌（独立的 /api/partner/public/site-brand），
   *   和平台那 6 个接口毫无关系。继续等 statusLoading 的后果是实测过的：
   *      t=249ms  伙伴品牌已到，drawing 首字「Q」
   *      t=4144ms 平台 6 个接口才返回，statusLoading 转 false，换成真 logo
   *   —— 首字在页头上挂了近 4 秒再跳成 logo，这就是「刷新闪一下」的来源。
   *
   *   去掉之后：
   *     · 白标站  → 伙伴品牌一到就出图，不再经过首字
   *     · 非白标站 → siteLogosThemed 初值是 {light:null,dark:null}，平台没回来时
   *                remoteLogoSrc 本来就是 undefined，这一条对它是冗余的，去掉无影响
   *
   * 末尾的 logoReady 不是「等平台」，而是「等这张图片自己的字节」——
   * 见上面 logoReady 的注释，它只在图还没解码完时短暂为 false。
   */
  const showLogoImage = Boolean(remoteLogoSrc && !logoBroken && logoReady);

  /*
   * 并排显示的品牌名。
   *
   * ★ 判定规则（2026-11-25 改）：
   *
   *   有 logo 图  → 显示品牌名
   *   只有首字方块 → 显示品牌名
   *   没有品牌名   → 不显示（没东西可显示）
   *
   * 也就是说：**唯一的开关是「有没有品牌名」，跟 logo 宽高比无关。**
   *
   * 之前不是这样。旧实现靠量 logo 的宽高比决定要不要补字（低于 3.2 才补），
   * 带来两个问题：
   *   1. 走首字方块分支时压根没有 <img>，量不出宽高比 → 永远不补字。
   *      明明配了品牌名，页头却只有一个孤零零的方块。
   *   2. 横版 logo（4:1 以上）因为宽高比超阈值也不补字，判定对图片尺寸
   *      过于敏感，同一个品牌换张 logo 表现就变，难以预期。
   *
   * 现在统一按「有没有名字」决定，行为稳定、可预期。窄图标旁边有名字本来
   * 也是 SaaS 页头的通行做法；宽版横 logo 再跟一个品牌名也不难看。
   *
   * 取值来源：
   *   · 白标站（绑了站点的经销商）→ 只认伙伴填的 name，没有就空。
   *     绝不能回落到平台品牌名，那是白标漏底 —— 经销商站挂平台名字
   *     会让人以为这站是平台自己运营的。
   *   · 非白标站 → i18n 的 {{brandName}}，已由 StatusContext 按平台配置
   *     插过值；如果平台也没配，这里拿到的就是空串，同样不显示。
   */
  const wordmarkText = React.useMemo(() => {
    if (isWhiteLabelSite) return (partnerBrand?.name ?? '').trim();
    return t('header.systemName').trim();
  }, [isWhiteLabelSite, partnerBrand, t]);

  /*
   * 没配 logo（或图破了）时画「品牌色方块 + 首字」。
   *
   * 这是伙伴后台 BrandLogo 预览已经在用的规则（web/src/shared/ui/BrandLogo.tsx）：
   * 取 short_name 首字，没有就取品牌名首字。两侧不一致过一段时间 ——
   * 后台预览画了方块首字，客户站只留 148px 空白，商户会以为上传失败了。
   *
   * 取值规则本身抽到了 utils/partnerBrand 的 resolvePartnerMarkInitial，
   * 因为浏览器标签图标（首字 favicon）也要用同一个字。两处各写一遍
   * slice(0,1) 的话，改动一处就会出现「页头是 Q、标签页是王」这种
   * 极难发现的不一致。
   */
  const brandInitial = React.useMemo(
    () => (isWhiteLabelSite ? resolvePartnerMarkInitial(partnerBrand) : ''),
    [isWhiteLabelSite, partnerBrand],
  );

  const showLogoFallback = !showLogoImage && Boolean(brandInitial);

  /*
   * 页头左侧是否真的画出了「品牌标识」（logo 图 或 首字方块）。
   *
   * 品牌名就挂在它后面：有标识 + 有名字 → 一起显示；两者缺一就不显示名字。
   * 这样就不会出现「只有一个孤零零的方块」或者「一个名字孤零零挂着、
   * 旁边没有图形」的观感。
   *
   * 首屏那一帧两个都可能是假（伙伴品牌还没到 → brandInitial 空），
   * 此时什么都不画，也不会先闪一下名字。
   */
  const hasBrandMark = showLogoImage || showLogoFallback;

  const handleLogoError = () => {
    if (!remoteLogoSrc) return;
    setReadyLogoSrc(null);
    setBrokenLogoSrc(remoteLogoSrc);
    setSiteLogoResolve(remoteLogoSrc, 'broken');
  };

  /*
   * 只保留「记录这张图能不能加载成功」这一件事。
   *
   * 这里原来还有一整块「量 logo 宽高比」的逻辑（logoAspect state +
   * measuredLogoSrcRef + measureLogoAspect + logoImgRef + 一个清理 effect），
   * 目的是「图太窄就补品牌名」。2026-11-25 按产品要求改成
   * 「有 logo 就显示品牌名，有首字也显示，没品牌名才不显示」，
   * 判定与图片尺寸彻底无关，那套测量代码已无消费方，整块删除。
   *
   * 顺带除掉的隐患：那套逻辑靠 <img onLoad> 写宽高比，而浏览器缓存命中时
   * load 事件早于 useEffect 触发，导致「刷新一次品牌名就消失」。
   * 现在不再依赖图片加载时序，这个问题从根上没有了。
   */
  const handleLogoLoad = () => {
    if (!remoteLogoSrc) return;
    /*
     * setSiteLogoResolve 写在 setState 前面 —— 它只影响**下一次**挂载，
     * 和这一帧无关，所以顺序其实无关紧要；但先写缓存能让「同一帧里
     * 又有别的组件挂载 Header」这种极端情况下也拿到最新结果。
     *
     * 真正决定这一帧的是 readyLogoSrc：它一变，logoReady 立刻为 true。
     */
    setSiteLogoResolve(remoteLogoSrc, 'remote');
    setBrokenLogoSrc(null);
    setReadyLogoSrc(remoteLogoSrc);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!(target as Element).closest?.('.header-nav-dropdown')) {
        setOpenNavDropdownId(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const MOBILE_APP_GROUPS: { title?: string; items: { to?: string; href?: string; label: string; external?: boolean }[] }[] = user ? [
    ...(mobileAppPlazaItems.length > 0 ? [{
      title: t('header.navAppPlaza'),
      items: mobileAppPlazaItems,
    }] : []),
    {
      items: [
        { to: '/dashboard', label: t('dashboard') },
      ],
    },
    {
      title: t('sidebar.developer'),
      items: [
        { to: '/models', label: t('header.navModels') },
        { to: '/tokens', label: t('tokens') },
        { to: '/logs', label: t('logs') },
        // { to: '/user-pricing', label: t('sidebar.pricing') },
        { href: getDocsAppHref(getDocsHomeUrl(resolveDocLang(locale))), label: t('header.navDocs'), external: true },
      ],
    },
    {
      title: t('chat'),
      items: [
        { to: '/chat', label: t('chatText') },
        { to: '/image-chat', label: t('chatImage') },
        { to: '/video', label: t('videoGen') },
        { to: '/speech', label: t('speechGen') },
      ],
    },
    {
      title: t('sidebar.billing'),
      items: [
        { to: '/billing', label: t('billing') },
      ],
    },
    ...((isEnterprise || canUserManage) ? [{
      title: t('sidebar.enterprise'),
      items: [
        {
          to: '/organizations',
          label: canUserManage
            ? t('organizations')
            : isOrgOwner
              ? t('sidebar.members')
              : t('sidebar.myOrg'),
        },
        ...(isOrgOwner ? [{ to: '/org-bills', label: t('orgBills') }] : []),
        ...((isEnterprise && !isPlatformWorker) ? [
          { to: '/org/discount-rules', label: t('sidebar.orgDiscountRules') },
          // 对公充值入口已按要求对企业账号下线（功能页仍可直接输 URL 访问）
        ] : []),
      ],
    }] : []),
    ...(has('platform_admin') ? [{
      title: t('sidebar.modelRouting'),
      items: [
        { to: '/channels', label: t('channels') },
        { to: '/model-pricing', label: t('modelPricing') },
        { to: '/model-dispatch', label: t('sidebar.dispatch') },
        { to: '/admin/catalog', label: t('sidebar.catalog') },
        { to: '/admin/providers', label: t('sidebar.providers') },
      ],
    }] : []),
    ...(has('user_manage') || has('platform_admin') || showLogSummaries ? [{
      title: t('sidebar.userOps'),
      items: [
        ...(has('user_manage') ? [
          { to: '/users', label: t('users') },
          { to: '/admin/groups', label: t('groupMgmt') },
          { to: '/admin/subscriptions', label: t('subscriptionMgmt') },
          { to: '/admin/enterprise', label: t('sidebar.enterpriseAdmin') },
        ] : []),
        ...(showLogSummaries ? [{ to: '/admin/log-summaries', label: t('logSummaries') }] : []),
        ...(has('platform_admin') ? [{ to: '/admin/locked-accounts', label: t('sidebar.lockedAccounts') }] : []),
      ],
    }] : []),
    ...(has('billing') ? [{
      title: t('sidebar.finance'),
      items: [
        // TODO: web 端暂隐藏营销权益
        // { to: '/redemptions', label: t('redemptions') },
        { to: '/admin/distribution', label: t('distributionMgmt') },
        { to: '/admin/credit', label: t('creditMgmt') },
        { to: '/admin/billing', label: t('adminBilling') },
      ],
    }] : []),
    ...(has('root') || has('billing') || has('audit_read') ? [{
      title: t('sidebar.system'),
      items: [
        ...(has('root') ? [
          { to: '/settings/general', label: t('sidebar.general') },
          { to: '/settings/operation', label: t('sidebar.operation') },
          { to: '/settings/email', label: t('sidebar.email') },
          { to: '/settings/storage', label: t('sidebar.storage') },
          { to: '/debug-logs', label: t('debugLogs') },
        ] : []),
        ...(has('billing') ? [{ to: '/settings/payment', label: t('sidebar.payment') }] : []),
        ...(has('audit_read') ? [{ to: '/audit-logs', label: t('auditLogs') }] : []),
      ],
    }] : []),
    {
      items: [
        { to: '/profile', label: t('profile') },
      ],
    },
  ] : [];

  const handleMobileMenuClick = () => {
    if (isConsoleLayout && isHeaderNavCollapsed && appSidebar) {
      appSidebar.toggleSidebar();
      return;
    }
    setMobileMenuOpen((v) => !v);
  };

  const headerClassName = [
    variant === 'hero' ? 'app-header--hero' : '',
    isScrollDriven ? 'app-header--scroll-driven' : '',
    isConsoleLayout ? 'app-header--console' : '',
  ].filter(Boolean).join(' ') || undefined;

  /*
   * 滚动只驱动「毛玻璃出现多少」，不再驱动任何几何量。
   * progress 写进 --header-progress，CSS 里只拿它算背景透明度和模糊强度，
   * 位置 / 宽度 / 圆角全是固定值 —— 所以页头在滚动时完全静止。
   */
  const headerStyle: React.CSSProperties = isScrollDriven
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        flexShrink: 0,
        ['--header-progress' as string]: progress,
      }
    : isConsoleLayout
      ? {
          zIndex: 1000,
          background: 'transparent',
          flexShrink: 0,
        }
      : {
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          background: variant === 'hero' ? 'transparent' : 'var(--bg-base)',
          backdropFilter: variant === 'hero' ? 'none' : 'blur(16px)',
          borderBottom: variant === 'hero' ? 'none' : '1px solid var(--border-default)',
          flexShrink: 0,
        };

  const mobileNavOverlayTop =
    'calc(var(--app-header-capsule-top, 0px) + var(--app-header-height-expanded, 64px))';

  return (
    <>
    <header
      className={headerClassName}
      style={headerStyle}
    >
      <div className="app-header-capsule">
      <div className="header-bar app-header-bar">
        {/* ── 左侧：Logo + 品牌名 ──
            slot 始终挂载，但它按内容收缩（min-width: 32px 兜底），不再占固定
            宽度 —— 早期版本是 flex: 0 0 148px，理由是「导航位置按它推算」，
            但那个推算变量从未被任何样式消费，导航实际由 flex 流决定。固定
            宽度的唯一效果是让正方形 logo 右边白留 116px。

            logo 三分支，互斥：
              · 有图      → <img>，高度锁 32px、宽度按比例
              · 无图/图破 → 品牌色方块 + 首字（与伙伴后台 BrandLogo 同规则）
              · 都没有    → 空槽，靠 min-width 撑住 32px 不塌陷

            品牌名与 logo 并列，**只要 logo 或首字显示了、且有品牌名就显示**，
            不看图片宽高比。规则见上面 wordmarkText 的注释。 */}
        <Link to="/" className="app-header-logo" aria-label={t('header.systemName')}>
          <span
            className={
              hasBrandMark && wordmarkText
                ? 'app-header-logo__slot app-header-logo__slot--wordmark'
                : 'app-header-logo__slot'
            }
          >
            {/*
             * ★ <img> 必须常驻，不能和首字互斥。
             *
             * 图未解码完时我们画首字、同时把 <img> 留在 DOM 里但不可见
             * （.is-pending 设 opacity:0）。如果按原来的三分支互斥写法，
             * 图没就绪 → 渲染首字 → <img> 不挂载 → onLoad 永远不会触发 →
             * logoReady 永远 false → 永远卡在首字。
             *
             * 用 opacity 而不是 display:none / visibility:hidden 隐藏：
             * 后两者在部分浏览器里仍会触发加载，但 opacity 最稳妥，
             * 且不占位（position:absolute 由 CSS 处理，避免撑开槽宽）。
             */}
            {remoteLogoSrc && !logoBroken ? (
              <img
                src={remoteLogoSrc}
                alt=""
                role="presentation"
                className={
                  showLogoImage
                    ? 'app-header-logo__img'
                    : 'app-header-logo__img is-pending'
                }
                onLoad={handleLogoLoad}
                onError={handleLogoError}
              />
            ) : null}
            {!showLogoImage && showLogoFallback ? (
              <span className="app-header-logo__mark" aria-hidden>
                {brandInitial}
              </span>
            ) : null}
            {hasBrandMark && wordmarkText ? (
              <span className="app-header-logo__wordmark">{wordmarkText}</span>
            ) : null}
          </span>
        </Link>
        <button
            type="button"
            className="mobile-menu-btn mobile-page-trigger"
            aria-label={isConsoleLayout ? t('sidebar.menu', { defaultValue: 'Menu' }) : t('header.navMenu', { defaultValue: 'Navigation' })}
            aria-expanded={isConsoleLayout ? Boolean(appSidebar?.isOpen) : mobileMenuOpen}
            onClick={handleMobileMenuClick}
          >
            ☰
          </button>

        {!isConsoleLayout && (
        <nav className="header-nav">
          {NAV_ITEMS.map((item, navIndex) => {
            if (item.kind === 'dropdown') {
              const dropdownId = `nav-dd-${navIndex}-${item.label}`;
              const isOpen = openNavDropdownId === dropdownId;
              return (
                <div
                  key={dropdownId}
                  className={`header-nav-dropdown${isOpen ? ' header-nav-dropdown--open' : ''}`}
                >
                  <button
                    type="button"
                    className="header-nav-dropdown__trigger"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpenNavDropdownId((prev) => (prev === dropdownId ? null : dropdownId));
                    }}
                  >
                    <span className="header-nav__label header-nav__label--shadow" aria-hidden="true">
                      {item.label}
                    </span>
                    <span className="header-nav__label header-nav-dropdown__label-row">
                      {item.label}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        className="header-nav-dropdown__chevron"
                        aria-hidden
                      >
                        <path
                          d="M2 4l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="header-nav-dropdown__menu-wrap">
                      <div className="header-nav-dropdown__menu" role="menu">
                        {item.items.map((menuItem) => (
                          <a
                            key={menuItem.href}
                            href={menuItem.href}
                            className="header-nav-dropdown__item"
                            role="menuitem"
                            onClick={() => setOpenNavDropdownId(null)}
                            {...(menuItem.external
                              ? { target: '_blank', rel: 'noopener noreferrer' }
                              : {})}
                          >
                            {menuItem.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            }
            if (item.href) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={selectableClass(false, 'header')}
                  {...(item.external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  <span className="header-nav__label header-nav__label--shadow" aria-hidden="true">
                    {item.label}
                  </span>
                  <span className="header-nav__label">{item.label}</span>
                </a>
              );
            }
            const to = item.to ?? '/';
            const active = isHeaderNavItemActive(to, location.pathname);
            return (
              <Link
                key={to}
                to={to}
                className={selectableClass(active, 'header')}
                onClick={to === '/models' ? () => clearModelsConsoleEmbed() : undefined}
              >
                <span className="header-nav__label header-nav__label--shadow" aria-hidden="true">
                  {item.label}
                </span>
                <span className="header-nav__label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        )}

        {/* ── 中间（仅移动端：当前页面入口） ── */}
        {/* <div className="mobile-center-slot" style={{ display: 'none', flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <button
            className="mobile-menu-btn mobile-page-trigger"
            onClick={() => setMobileMenuOpen((v) => !v)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 16,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              cursor: 'pointer',
            }}
          >
            {mobileCurrentPageLabel}
          </button>
        </div> */}

        {/* ── 右侧：营销顶栏保留；操作台改到侧栏底部 ── */}
        {!isConsoleLayout ? (
        <div className="header-actions app-header-actions">
          <HeaderUtilities
            showConsole={Boolean(user)}
            showLanguage={showLanguageSwitcher}
            showTheme={showThemeSwitcher}
          />
          {user ? (
            <HeaderUserMenu nameClassName="hide-mobile hide-below-desktop" />
          ) : (
            <button
              onClick={openLogin}
              style={{
                padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'var(--theme-color-primary)', color: 'var(--btn-primary-text, #fff)',
                fontSize: 15, fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              {t('header.signIn')}
            </button>
          )}
        </div>
        ) : null}
      </div>
      </div>
    </header>

    {/* ── 移动端导航覆盖层（营销壳层；控制台由应用侧栏承担） ── */}
    {!isConsoleLayout && mobileMenuOpen && (
      <div
        className="mobile-nav-overlay"
        style={{
          position: 'fixed',
          top: mobileNavOverlayTop,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--bg-base)',
          zIndex: 999,
          padding: '16px',
          overflowY: 'auto',
          maxWidth: '100vw',
        }}
      >
        {user ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {MOBILE_APP_GROUPS.map((group, idx) => (
              <div key={`${group.title || 'group'}-${idx}`}>
                {group.title && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', margin: '4px 0 6px',
                  }}>
                    {group.title}
                  </div>
                )}
                <div style={{ borderRadius: 10, overflow: 'hidden' }}>
                  {group.items.map((item) => {
                    if (item.href) {
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="mobile-nav-link"
                          {...(item.external
                            ? { target: '_blank', rel: 'noopener noreferrer' }
                            : {})}
                        >
                          {item.label}
                        </a>
                      );
                    }
                    const to = item.to ?? '/';
                    const mobileActive =
                      location.pathname === to ||
                      (to !== '/' && location.pathname.startsWith(`${to}/`));
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={['lynx-selectable', 'mobile-nav-link', mobileActive && 'lynx-selectable--active']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* 未登录仍显示官网导航 */}
            {NAV_ITEMS.map((item) => {
              if (item.kind === 'dropdown') {
                return (
                  <div key={item.label} style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <div style={{
                      padding: '10px 0 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}>
                      {item.label}
                    </div>
                    {item.items.map((menuItem) => (
                      <a
                        key={menuItem.href}
                        href={menuItem.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="mobile-nav-link"
                        {...(menuItem.external
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                      >
                        {menuItem.label}
                      </a>
                    ))}
                  </div>
                );
              }
              if (item.href) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="mobile-nav-link"
                    style={{
                      display: 'block', padding: '12px 0', fontSize: 16,
                      color: 'var(--text-primary)', textDecoration: 'none',
                      borderBottom: '1px solid var(--border-default)',
                      fontWeight: 500,
                    }}
                    {...(item.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {item.label}
                  </a>
                );
              }
              const to = item.to ?? '/';
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block', padding: '12px 0', fontSize: 16,
                    color: 'var(--text-primary)', textDecoration: 'none',
                    borderBottom: '1px solid var(--border-default)',
                    fontWeight: 500,
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </div>
    )}
    </>
  );
}
