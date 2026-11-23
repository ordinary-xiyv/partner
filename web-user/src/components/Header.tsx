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
import { resolvePartnerLogo } from '../utils/partnerBrand';
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
  const { status, siteLogosThemed, siteAppearance, partnerBrand, loading: statusLoading } = useStatus();
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
  const showPersonalTopup = !isEnterprise || isPlatformWorker;
  const showThemeSwitcher = siteAppearance.layout_config.show_theme_switcher;
  const showLanguageSwitcher = siteAppearance.layout_config.show_language_switcher;

  const NAV_ITEMS: NavItem[] = React.useMemo(
    () => (siteAppearance.header_config.enabled
      ? resolveHeaderNavItems(siteAppearance.header_config.items, locale)
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

  const cachedResolve = remoteLogoSrc ? getSiteLogoResolve(remoteLogoSrc) : undefined;

  const [logoBroken, setLogoBroken] = React.useState(
    () => cachedResolve === 'broken',
  );

  React.useEffect(() => {
    if (!remoteLogoSrc) {
      setLogoBroken(false);
      return;
    }
    const cached = getSiteLogoResolve(remoteLogoSrc);
    setLogoBroken(cached === 'broken');
  }, [remoteLogoSrc]);

  const showLogoImage = Boolean(remoteLogoSrc && !statusLoading && !logoBroken);

  /*
   * Logo 的原始宽高比。
   *
   * 为什么要记这个：页头 logo 高度锁死 32px，宽度按比例走。于是
   *
   *   · 横版 logo（4~5:1）→ 渲染宽 130~150px，视觉上撑得住页头左段
   *   · 方形图标（1:1）    → 渲染宽只有 32px，旁边一大片空白，
   *                          看起来「孤零零贴在左边」
   *
   * 这不是图片质量问题，是横向分量不足。实测：横版墨迹宽 134.8px、
   * 方形墨迹宽 24.5px，差 5.5 倍，而高度几乎一样（18.6 vs 17.8）。
   * 所以单纯调 CSS 尺寸救不了方形图 —— 把 32px 放大到 40px 也只多 6px 宽。
   *
   * 解法是补宽度而不是放大：宽高比低于阈值时，在图右侧并排品牌名文字
   * （见下面的 needsWordmark）。这是 SaaS 页头的通行做法，而且对任意
   * 尺寸上传都成立 —— 商户传方图、传长图、传带留白的图，最终宽度都够。
   *
   * 用 null 表示「还没测出来」：首次渲染时图片尚未 load，此时不补文字，
   * 避免先闪一下品牌名再变回纯图。
   */
  const [logoAspect, setLogoAspect] = React.useState<number | null>(null);

  /*
   * 低于这个宽高比就判定为「图标型」，需要品牌名补足横向宽度。
   *
   * 3.2 对应渲染宽度约 102px（32 × 3.2）。取这个值是因为：
   *   · 常见横版 wordmark 都在 3.5:1 以上（本例 4.7:1 → 150px）
   *   · 1:1~3:1 的图渲染出来 32~96px，在页头里明显偏窄
   * 宁可多补一点：字体是 17px 的常规字重，补上去就是正常字标，不会难看；
   * 反过来漏补的话，就是一整个空槽。
   */
  const ICON_LOGO_ASPECT_MAX = 3.2;

  const needsWordmark = logoAspect !== null && logoAspect < ICON_LOGO_ASPECT_MAX;

  /*
   * 并排显示的品牌名。
   *
   * 白标站用伙伴填的完整品牌名（不是 short_name —— 那是给方形小标用的
   * 一两个字缩写，放在页头上读起来像残缺）。非白标站退到 i18n 的
   * {{brandName}}，它已经被 StatusContext 按平台配置插过值了。
   */
  const wordmarkText = React.useMemo(() => {
    if (!needsWordmark) return '';
    const partnerName = (partnerBrand?.name ?? '').trim();
    return partnerName || t('header.systemName');
  }, [needsWordmark, partnerBrand, t]);

  /*
   * 没配 logo（或图破了）时画「品牌色方块 + 首字」。
   *
   * 这是伙伴后台 BrandLogo 预览已经在用的规则（web/src/shared/ui/BrandLogo.tsx）：
   * 取 short_name 首字，没有就取品牌名首字。两侧不一致过一段时间 ——
   * 后台预览画了方块首字，客户站只留 148px 空白，商户会以为上传失败了。
   *
   * 取值顺序刻意和后端保持一致：short_name 是商户专门为「方形小标」准备的
   * 缩写（一个汉字/一个字母），品牌名是完整名称，首字取出来通常是
   * 「王」「L」这种还能看但不一定想要的字。所以 short_name 优先。
   */
  const brandInitial = React.useMemo(() => {
    if (!isWhiteLabelSite) return '';
    const short = (partnerBrand?.short_name ?? '').trim();
    const full = (partnerBrand?.name ?? '').trim();
    return (short || full).slice(0, 1);
  }, [isWhiteLabelSite, partnerBrand]);

  const showLogoFallback = !showLogoImage && Boolean(brandInitial);

  const handleLogoError = () => {
    if (!remoteLogoSrc) return;
    setLogoBroken(true);
    setSiteLogoResolve(remoteLogoSrc, 'broken');
  };

  const handleLogoLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (remoteLogoSrc) {
      setSiteLogoResolve(remoteLogoSrc, 'remote');
    }
    const img = event.currentTarget;
    if (img.naturalHeight > 0) {
      setLogoAspect(img.naturalWidth / img.naturalHeight);
    }
  };

  /* 换图后旧的比例立刻失效，否则新图会先按旧比例决定要不要补品牌名 */
  React.useEffect(() => {
    setLogoAspect(null);
  }, [remoteLogoSrc]);

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
        ...(showPersonalTopup ? [{ to: '/topup', label: t('topUp') }] : []),
        { to: '/subscription', label: t('subscription') },
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
          { to: '/org/bank-transfer', label: t('sidebar.corporateTopup') },
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
        {/* ── 左侧：Logo ──
            slot 始终挂载，但它按内容收缩（min-width: 32px 兜底），不再占固定
            宽度 —— 早期版本是 flex: 0 0 148px，理由是「导航位置按它推算」，
            但那个推算变量从未被任何样式消费，导航实际由 flex 流决定。固定
            宽度的唯一效果是让正方形 logo 右边白留 116px。

            三分支，互斥：
              · 有图      → <img>，高度锁 32px、宽度按比例
              · 无图/图破 → 品牌色方块 + 首字（与伙伴后台 BrandLogo 同规则）
              · 都没有    → 空槽，靠 min-width 撑住 32px 不塌陷

            另外，图太窄（方形图标）时在图右侧并排品牌名，补足横向分量 ——
            详见 needsWordmark 的注释。 */}
        <Link to="/" className="app-header-logo" aria-label={t('header.systemName')}>
          <span
            className={
              needsWordmark && wordmarkText
                ? 'app-header-logo__slot app-header-logo__slot--wordmark'
                : 'app-header-logo__slot'
            }
          >
            {showLogoImage ? (
              <img
                src={remoteLogoSrc}
                alt=""
                role="presentation"
                className="app-header-logo__img"
                onLoad={handleLogoLoad}
                onError={handleLogoError}
              />
            ) : showLogoFallback ? (
              <span className="app-header-logo__mark" aria-hidden>
                {brandInitial}
              </span>
            ) : null}
            {showLogoImage && needsWordmark && wordmarkText ? (
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
