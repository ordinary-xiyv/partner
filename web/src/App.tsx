import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { FullPageLoading } from '@lynx/shared';
import { DealerAuthProvider, useDealerAuth } from './auth';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';

const Overview = lazy(() => import('./pages/Overview'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Usage = lazy(() => import('./pages/Usage'));
const Brand = lazy(() => import('./pages/Brand'));
const Docs = lazy(() => import('./pages/Docs'));
const Settings = lazy(() => import('./pages/Settings'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authed, loading, profile } = useDealerAuth();
  const location = useLocation();

  if (loading) return <FullPageLoading />;
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  /*
   * 初始密码未改时，后端 PartnerReady() 会对 users / logs / daily-trend /
   * billing 全部返回 403「请先修改初始密码」。
   *
   * 不在这里拦的话：商户用平台发的初始密码登录 → 看着像登录成功 →
   * 每个页面都是「加载失败」→ 完全看不出原因是密码没改。
   * 唯一的放行路径是 /settings（改密在那里）。
   */
  const mustChangePassword = profile?.password_change_required;
  if (mustChangePassword && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />;
  }

  return <>{children}</>;
}

function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullPageLoading text="页面加载中…" />}>{children}</Suspense>;
}

export default function App() {
  return (
    <DealerAuthProvider fetchProfile={() => import('@lynx/shared/api/dealer').then((m) => m.fetchProfile())}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Page><Overview /></Page>} />
          <Route path="/customers" element={<Page><Customers /></Page>} />
          <Route path="/customers/:id" element={<Page><CustomerDetail /></Page>} />
          <Route path="/usage" element={<Page><Usage /></Page>} />
          <Route path="/brand" element={<Page><Brand /></Page>} />
          <Route path="/docs" element={<Page><Docs /></Page>} />
          <Route path="/settings" element={<Page><Settings /></Page>} />
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </DealerAuthProvider>
  );
}
