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

  const handleLogoError = () => {
    if (!remoteLogoSrc) return;
    setLogoBroken(true);
    setSiteLogoResolve(remoteLogoSrc, 'broken');
  };

  const handleLogoLoad = () => {
    if (remoteLogoSrc) {
      setSiteLogoResolve(remoteLogoSrc, 'remote');
    }
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
            slot 无论有没有 logo 都必须挂载：它承载 --app-header-logo-slot-width
            这个固定宽度，导航文字的起始位置（--app-header-nav-text-offset）
            也按它推算。以前是整块条件渲染，没配 logo 时 Link 塌成 0 宽，
            导航整体向左跳，视觉上像是「左侧缺了一块」。 */}
        <Link to="/" className="app-header-logo" aria-label={t('header.systemName')}>
          <span className="app-header-logo__slot">
            {showLogoImage ? (
              <img
                src={remoteLogoSrc}
                alt=""
                role="presentation"
                className="app-header-logo__img"
                onLoad={handleLogoLoad}
                onError={handleLogoError}
              />
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
