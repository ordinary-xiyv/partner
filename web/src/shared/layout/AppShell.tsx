import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Grid, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useTheme } from '../theme/ThemeProvider';
import './shell.css';

export interface NavItem {
  /** 路由路径，同时作为 key */
  path: string;
  label: string;
  icon?: React.ReactNode;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export interface ShellProps {
  /** 品牌区：主标题（如「经销商中心」）+ 副标题 */
  brandName: string;
  brandSub?: string;
  brandMark?: string;
  /** 品牌标识节点（传 BrandLogo 即可支持白标 logo 图）；不传则用 brandMark 首字 */
  brandLogo?: React.ReactNode;
  /** 侧栏菜单分组 */
  navGroups: NavGroup[];
  /** 顶栏右侧自定义动作（可选） */
  headerActions?: React.ReactNode;
  /** 当前登录人展示信息 */
  account?: {
    displayName: string;
    subtitle?: string;
    menuItems?: MenuProps['items'];
    onMenuClick?: MenuProps['onClick'];
  };
  /** 移动端收起时是否显示汉堡按钮 */
  children?: React.ReactNode;
}

/**
 * 双端共用外壳：侧栏（贴边白/黑）+ 顶栏 + 灰底主内容区。
 * 视觉层次与 lynxtonapi 控制台一致：侧栏 --bg-base，主区 --bg-page，卡片 --bg-card。
 */
export function AppShell({
  brandName,
  brandSub,
  brandMark,
  brandLogo,
  navGroups,
  headerActions,
  account,
}: ShellProps) {
  const { resolved, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [mobileOpen, setMobileOpen] = useState(false);

  // 路由变化时收起移动端侧栏
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const mark = brandMark || brandName.slice(0, 1).toUpperCase();

  const activeTitle =
    navGroups
      .flatMap((g) => g.items)
      .find((i) => location.pathname === i.path || location.pathname.startsWith(`${i.path}/`))
      ?.label || brandName;

  return (
    <div className="lynx-shell">
      {isMobile && mobileOpen && (
        <div className="lynx-sidebar-mask" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={['lynx-sidebar', mobileOpen ? 'lynx-sidebar--open' : ''].filter(Boolean).join(' ')}>
        <div className="lynx-sidebar__brand">
          {brandLogo ?? <div className="lynx-sidebar__logo">{mark}</div>}
          <div className="lynx-sidebar__brand-text">
            <div className="lynx-sidebar__brand-name">{brandName}</div>
            {brandSub ? <div className="lynx-sidebar__brand-sub">{brandSub}</div> : null}
          </div>
        </div>

        <nav className="lynx-sidebar__nav">
          {navGroups.map((group, gi) => (
            <div className="lynx-sidebar__group" key={group.title || `g${gi}`}>
              {group.title ? <div className="lynx-sidebar__group-title">{group.title}</div> : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    ['lynx-sidebar__link', isActive ? 'lynx-sidebar__link--active' : '']
                      .filter(Boolean)
                      .join(' ')
                  }
                >
                  {item.icon ? <span className="lynx-sidebar__link-icon">{item.icon}</span> : null}
                  <span className="lynx-sidebar__link-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="lynx-sidebar__footer">
          <Tooltip title={resolved === 'dark' ? '切换到亮色' : '切换到暗色'} placement="right">
            <Button
              type="text"
              block
              icon={resolved === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggle}
              style={{ justifyContent: 'flex-start', color: 'var(--text-secondary)', height: 36 }}
            >
              {resolved === 'dark' ? '亮色模式' : '暗色模式'}
            </Button>
          </Tooltip>
        </div>
      </aside>

      <div className="lynx-main">
        <header className="lynx-topbar">
          {isMobile ? (
            <Button
              type="text"
              icon={mobileOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setMobileOpen((v) => !v)}
              style={{ color: 'var(--text-secondary)' }}
            />
          ) : null}
          <span className="lynx-topbar__title">{activeTitle}</span>
          <div className="lynx-topbar__spacer" />
          <div className="lynx-topbar__actions">
            {headerActions}
            {account ? (
              <Dropdown
                trigger={['click']}
                menu={{ items: account.menuItems, onClick: account.onMenuClick }}
                placement="bottomRight"
              >
                <Button type="text" style={{ height: 36, padding: '0 8px' }}>
                  <Avatar
                    size={24}
                    icon={<UserOutlined />}
                    style={{ background: 'var(--accent-primary)', verticalAlign: 'middle' }}
                  />
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                      verticalAlign: 'middle',
                    }}
                  >
                    {account.displayName}
                  </span>
                </Button>
              </Dropdown>
            ) : null}
          </div>
        </header>

        <main className="lynx-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** 账号下拉菜单的通用项 */
export function buildAccountMenu(opts: {
  onProfile?: () => void;
  onChangePassword?: () => void;
  onLogout: () => void;
}): MenuProps['items'] {
  const items: MenuProps['items'] = [];
  if (opts.onProfile) {
    items.push({ key: 'profile', icon: <UserOutlined />, label: '个人资料' });
  }
  if (opts.onChangePassword) {
    items.push({ key: 'password', label: '修改密码' });
  }
  if (items.length) items.push({ type: 'divider' });
  items.push({ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true });
  return items;
}

export { useNavigate };
