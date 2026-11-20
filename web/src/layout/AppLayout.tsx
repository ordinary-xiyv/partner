import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppShell,
  buildAccountMenu,
  type NavGroup,
} from '@lynx/shared';
import {
  DashboardOutlined,
  TeamOutlined,
  BarChartOutlined,
  BgColorsOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useDealerAuth } from '../auth';
import { logout } from '@lynx/shared/api/dealer';

const navGroups: NavGroup[] = [
  {
    title: '经营概览',
    items: [{ path: '/overview', label: '数据概览', icon: <DashboardOutlined /> }],
  },
  {
    title: '客户管理',
    items: [
      { path: '/customers', label: '我的客户', icon: <TeamOutlined /> },
      { path: '/usage', label: '用量明细', icon: <BarChartOutlined /> },
    ],
  },
  {
    title: '运营',
    items: [{ path: '/brand', label: '品牌设置', icon: <BgColorsOutlined /> }],
  },
  {
    title: '账户',
    items: [{ path: '/settings', label: '账号设置', icon: <SettingOutlined /> }],
  },
];

export default function AppLayout() {
  const { profile, signOut } = useDealerAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      /* 忽略登出接口失败，本地照常清态 */
    }
    signOut();
    navigate('/login', { replace: true });
  };

  const menuItems = buildAccountMenu({
    onProfile: () => navigate('/settings'),
    onChangePassword: () => navigate('/settings?tab=password'),
    onLogout: handleLogout,
  });

  return (
    <AppShell
      brandName="伙伴后台"
      brandSub={profile?.display_name || 'Partner Console'}
      brandMark="P"
      navGroups={navGroups}
      account={{
        displayName: profile?.display_name || profile?.username || '伙伴',
        menuItems,
        onMenuClick: ({ key }) => {
          if (key === 'logout') void handleLogout();
          if (key === 'profile' || key === 'password') navigate('/settings');
        },
      }}
    />
  );
}
