import React, { useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  HomeOutlined, KeyOutlined, BarChartOutlined,
  CreditCardOutlined, FileTextOutlined, ReadOutlined,
  TeamOutlined,
  CommentOutlined, PictureOutlined, CameraOutlined,
  AppstoreOutlined, ExportOutlined,
  AccountBookOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useUser } from '../contexts/UserContext';
import type { PlatformPermission, User } from '../types';
import { hasPermissionForUser } from '../utils/permission';
import AppHeader from '../components/Header';
import { AppSidebarProvider, useAppSidebar } from '../contexts/AppSidebarContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import SpeechOutlinedIcon from '../assets/icons/speech-outlined.svg?react';
import SidebarAccountDock from './SidebarAccountDock';
import './layout-sidebar.css';
import './console-scale.css';
import { markModelsConsoleEmbed } from '../utils/modelsConsoleEmbed';

const speechMenuIcon = <SpeechOutlinedIcon aria-hidden style={{ display: 'block', fontSize: 'inherit' }} />;

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  permission?: PlatformPermission;
  /** 指定角色不展示（如财务不展示系统设置） */
  excludeRoles?: number[];
  /** 指定角色才展示（与 permission 互斥，仅按角色判断） */
  allowedRoles?: number[];
  /** 新标签打开，当前操作台页不跳转 */
  openInNewTab?: boolean;
  children?: MenuItem[];
}

function toAppHref(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${prefix}${path}`;
}

function toAntdMenuLabel(item: MenuItem): React.ReactNode {
  if (!item.openInNewTab) return item.label;
  return (
    <a href={toAppHref(item.key)} target="_blank" rel="noopener noreferrer" className="layout-sidebar-menu__link">
      <span>{item.label}</span>
      <ExportOutlined className="layout-sidebar-menu__ext" />
    </a>
  );
}

function isOpenInNewTabMenuKey(items: MenuItem[], key: string): boolean {
  return items.some((item) => {
    if (item.key === key) return Boolean(item.openInNewTab);
    return Boolean(item.children?.some((child) => child.key === key && child.openInNewTab));
  });
}

function isMenuItemVisible(user: User | null, item: MenuItem): boolean {
  if (!user) return false;
  if (item.excludeRoles?.includes(user.role)) return false;
  if (item.allowedRoles?.length) return item.allowedRoles.includes(user.role);
  if (item.permission && !hasPermissionForUser(user, item.permission)) return false;
  return true;
}

function filterMenuItems(user: User | null, items: MenuItem[]): MenuItem[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        if (!isMenuItemVisible(user, item)) return null;
        const children = filterMenuItems(user, item.children);
        if (children.length === 0) return null;
        return { ...item, children };
      }
      if (!isMenuItemVisible(user, item)) return null;
      return item;
    })
    .filter((item): item is MenuItem => item !== null);
}

interface MenuGroup {
  title?: string;
  /** 分组唯一 key */
  categoryKey?: string;
  items: MenuItem[];
}

function isSidebarPathActive(pathname: string, menuKey: string): boolean {
  if (pathname === menuKey) return true;
  return menuKey !== '/' && pathname.startsWith(`${menuKey}/`);
}

function toAntdGroupedMenuItems(groups: MenuGroup[]): NonNullable<MenuProps['items']> {
  return groups.flatMap((group, index) => {
    const children = toAntdMenuItems(group.items);
    if (!group.title) return children;
    return [{
      type: 'group' as const,
      key: `user-group-${group.categoryKey ?? index}`,
      label: group.title,
      children,
    }];
  });
}

function toAntdMenuItems(items: MenuItem[]): NonNullable<MenuProps['items']> {
  return items.map((item) => {
    if (item.children?.length) {
      return {
        key: item.key,
        icon: item.icon,
        label: toAntdMenuLabel(item),
        children: item.children.map((child) => ({
          key: child.key,
          icon: child.icon,
          label: toAntdMenuLabel(child),
        })),
      };
    }
    return {
      key: item.key,
      icon: item.icon,
      label: toAntdMenuLabel(item),
    };
  });
}

function resolveMenuSelectedKey(items: MenuItem[], pathname: string): string | undefined {
  for (const item of items) {
    if (item.children?.length) {
      const activeChild = item.children.find((child) => isSidebarPathActive(pathname, child.key));
      if (activeChild) return activeChild.key;
    }
    if (isSidebarPathActive(pathname, item.key)) return item.key;
  }
  return undefined;
}

export default function MainLayout() {
  return (
    <AppSidebarProvider>
      <MainLayoutShell />
    </AppSidebarProvider>
  );
}

function MainLayoutShell() {
  const { t } = useTranslation();
  const { user, logout, isEnterprise, isOrgOwner, isPlatformWorker } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { isOpen: sidebarOpen, closeSidebar } = useAppSidebar()!;
  const { isDesktop } = useBreakpoint();
  const sidebarNavRef = React.useRef<HTMLElement>(null);

  const showPersonalTopup = !isEnterprise || isPlatformWorker;

  // ── 菜单结构（用户区按设计稿分组标题；管理员区折叠分类）────────────

  const menuGroups: MenuGroup[] = [
    {
      categoryKey: 'workbench',
      title: t('sidebar.workbench'),
      items: [
        { key: '/dashboard', label: t('dashboard'), icon: <HomeOutlined /> },
      ],
    },

    {
      categoryKey: 'model-and-dev',
      title: t('sidebar.modelAndDev'),
      items: [
        { key: '/models', label: t('header.navModels'), icon: <AppstoreOutlined /> },
        { key: '/tokens', label: t('tokens'), icon: <KeyOutlined /> },
        { key: '/logs', label: t('dashboard.callLogs'), icon: <BarChartOutlined /> },
        { key: '/docs/auth', label: t('docCenter.sidebarTitle'), icon: <ReadOutlined />, openInNewTab: true },
      ],
    },

    {
      categoryKey: 'experience',
      title: t('sidebar.experienceCenter'),
      items: [
        { key: '/chat', label: t('chatText'), icon: <CommentOutlined /> },
        { key: '/image-chat', label: t('chat.imageGeneration'), icon: <PictureOutlined /> },
        { key: '/video', label: t('sidebar.videoGeneration'), icon: <CameraOutlined /> },
        { key: '/speech', label: t('speechGen'), icon: speechMenuIcon },
      ],
    },

    {
      categoryKey: 'billing-center',
      title: t('sidebar.billingCenter'),
      items: [
        ...(showPersonalTopup ? [{ key: '/topup', label: t('topUp'), icon: <CreditCardOutlined /> }] : []),
        { key: '/billing', label: t('billing'), icon: <FileTextOutlined /> },
        { key: '/subscription', label: t('subscription'), icon: <IdcardOutlined /> },
      ],
    },

    // 企业管理：企业账户（平台管理员视图已随管理侧页面一并裁剪）
    ...(isEnterprise ? [{
      categoryKey: 'enterprise',
      title: t('sidebar.enterprise'),
      items: [
        {
          key: '/organizations',
          label: isOrgOwner ? t('sidebar.members') : t('sidebar.myOrg'),
          icon: <TeamOutlined />,
        },
        ...(isOrgOwner ? [{
          key: '/org-bills',
          label: t('orgBills'),
          icon: <AccountBookOutlined />,
        }] : []),
        ...(isEnterprise ? [{
          key: '/org/discount-rules',
          label: t('sidebar.orgDiscountRules'),
          icon: <FileTextOutlined />,
        }] : []),
        ...(isEnterprise ? [{
          key: '/org/bank-transfer',
          label: t('sidebar.corporateTopup'),
          icon: <CreditCardOutlined />,
        }] : []),
      ],
    }] : []),
  ];

  const visibleGroups = menuGroups
    .map((g) => ({ ...g, items: filterMenuItems(user, g.items) }))
    .filter((g) => g.items.length > 0);

  const userGroups = visibleGroups;
  const userMenuItems = userGroups.flatMap((g) => g.items);

  const userMenuAntItems = useMemo<MenuProps['items']>(
    () => toAntdGroupedMenuItems(userGroups),
    [userGroups],
  );

  const userSelectedKey = resolveMenuSelectedKey(userMenuItems, location.pathname);

  // 路由变化后关闭移动端侧栏
  React.useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  // 拉回桌面宽度时收起抽屉，避免 CSS/JS 断点不一致
  React.useEffect(() => {
    if (isDesktop) closeSidebar();
  }, [isDesktop, closeSidebar]);

  // 移动端侧栏打开时锁定 body 滚动，避免 iOS Safari 触摸滚动穿透
  React.useEffect(() => {
    if (!sidebarOpen) return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    if (!mq.matches) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [sidebarOpen]);

  // 路由变化后将当前选中项滚入可视区域（勿监听 openKeys，收起菜单时会误触发滚动跳动）
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const activeEl = sidebarNavRef.current?.querySelector(
        '.layout-sidebar-menu .ant-menu-item-selected',
      );
      activeEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const handleSidebarMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    if (isOpenInNewTabMenuKey(userMenuItems, key)) {
      domEvent.preventDefault();
      window.open(toAppHref(key), '_blank', 'noopener,noreferrer');
      closeSidebar();
      return;
    }
    if (key === '/models') markModelsConsoleEmbed();
    navigate(key);
    closeSidebar();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  /** 文本 / 图像 / 视频对话 / 模型广场：主列自行滚动，layout-main 禁止整页纵向滚动 */
  const isFillMainRoute =
    location.pathname === '/chat'
    || location.pathname === '/image-chat'
    || location.pathname === '/video'
    || location.pathname === '/speech'
    || location.pathname === '/models';

  return (
    <div className="layout-shell">
      {/* 统一顶部 Header：移动端汉堡打开应用侧栏 */}
      <AppHeader layoutMode="console" />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sidebar overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? '' : 'hidden'}`} onClick={closeSidebar} />

      {/* Sidebar */}
      <aside className={`layout-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Nav：菜单项过多时仅侧栏内部滚动 */}
        <nav ref={sidebarNavRef} className="layout-sidebar-nav">

          {userMenuAntItems && userMenuAntItems.length > 0 ? (
            <Menu
              mode="inline"
              className="layout-sidebar-menu layout-sidebar-menu--flat"
              items={userMenuAntItems}
              selectedKeys={userSelectedKey ? [userSelectedKey] : []}
              onClick={handleSidebarMenuClick}
            />
          ) : null}

        </nav>

        <SidebarAccountDock />

      </aside>

      {/* Main Content：仅主区域纵向滚动；内容不足一屏时不出现滚动条 */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <main
          className={`layout-main${isFillMainRoute ? ' layout-main--chat-fill' : ''}`}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: isFillMainRoute ? 'hidden' : 'auto',
          }}
        >
          {/* <button
            className="hide-desktop"
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-primary)', fontSize: 20,
              padding: '8px 0', marginBottom: 8,
            }}
          >
            ☰
          </button> */}
          <Outlet />
        </main>
      </div>
      </div>
    </div>
  );
}
