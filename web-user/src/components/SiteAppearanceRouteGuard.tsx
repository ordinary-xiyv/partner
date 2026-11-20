import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStatus } from '../contexts/StatusContext';
import { useUser } from '../contexts/UserContext';
import { isPathAllowedByAppearance } from '../utils/siteAppearanceRouteAccess';

export default function SiteAppearanceRouteGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { siteAppearance, loading } = useStatus();
  const { user, loading: userLoading } = useUser();

  // 外观守卫仅约束未登录访客的公开页入口；控制台侧栏路由不受 Header/Footer 显隐影响
  if (user || userLoading) {
    return <>{children}</>;
  }

  if (!loading && !isPathAllowedByAppearance(location.pathname, siteAppearance)) {
    return <Navigate to="/" replace state={{ appearanceBlocked: location.pathname }} />;
  }

  return <>{children}</>;
}
