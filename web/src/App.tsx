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
const Settings = lazy(() => import('./pages/Settings'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authed, loading } = useDealerAuth();
  const location = useLocation();

  if (loading) return <FullPageLoading />;
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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
          <Route path="/settings" element={<Page><Settings /></Page>} />
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </DealerAuthProvider>
  );
}
