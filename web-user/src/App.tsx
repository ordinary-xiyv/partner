import React, { Suspense, useEffect } from 'react';
import { lazy } from './utils/lazyChunk';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { normalizeLocale } from './i18n/resolveLocale';
import { syncDocumentTitleFromBrand } from './i18n/siteBrandInterpolation';
import { useStatus } from './contexts/StatusContext';
import MainLayout from './layouts/MainLayout';
import { useUser } from './contexts/UserContext';
import { isPlatformWorker } from './utils/permission';
import { Spin, Button, Typography, Empty } from 'antd';
import SiteAppearanceRouteGuard from './components/SiteAppearanceRouteGuard';
import CustomerServiceFloat from './components/CustomerServiceFloat';
import { isModelsConsoleEmbed } from './utils/modelsConsoleEmbed';

const Home = lazy(() => import('./pages/HomePageGate'));
const Pricing = lazy(() => import('./pages/Pricing'));
const ModelPlazaPage = lazy(() => import('./pages/model-plaza/ModelPlazaPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tokens = lazy(() => import('./pages/Tokens'));
const Logs = lazy(() => import('./pages/Logs'));
const TopUp = lazy(() => import('./pages/TopUp'));
const Profile = lazy(() => import('./pages/Profile'));
const Organizations = lazy(() => import('./pages/Organizations'));
const OrgBills = lazy(() => import('./pages/OrgBills'));
const OrgDiscountRules = lazy(() => import('./pages/OrgDiscountRules'));
const OrgBankTransfer = lazy(() => import('./pages/OrgBankTransfer'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Billing = lazy(() => import('./pages/Billing'));
const ImageChat = lazy(() => import('./pages/ImageChat'));
const VideoGen = lazy(() => import('./pages/VideoGen'));
const SpeechGen = lazy(() => import('./pages/SpeechGen'));
const TextChat = lazy(() => import('./pages/TextChat'));
const DocsHomePage = lazy(() => import('./pages/docs/DocsPages'));
const DocsArticlePage = lazy(() => import('./pages/docs/DocsPages').then((m) => ({ default: m.DocsArticlePage })));
const DocsApiRedirect = lazy(() => import('./pages/DocsApiRedirect'));
const EnterpriseApply = lazy(() => import('./pages/EnterpriseApply'));
const AboutPage = lazy(() => import('./pages/static/About'));
const TrustPage = lazy(() => import('./pages/static/Trust'));
const LegalPage = lazy(() => import('./pages/static/Legal'));
const NewsPage = lazy(() => import('./pages/static/News'));
const ConsultingPage = lazy(() => import('./pages/static/Consulting'));
const AnnouncementsPage = lazy(() => import('./pages/static/Announcements'));
const SupportPlansPage = lazy(() => import('./pages/static/SupportPlans'));
const ServiceStatusPage = lazy(() => import('./pages/static/ServiceStatus'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
function Loading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Spin size="large" />
    </div>
  );
}

function PageLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      <Spin size="large" />
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <>
                <Typography.Title level={5} style={{ marginTop: 8 }}>
                  Page Load Error
                </Typography.Title>
                <Typography.Text type="secondary">
                  {this.state.error?.message || 'Something went wrong'}
                </Typography.Text>
              </>
            }
          >
            <Button
              type="primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Reload
            </Button>
          </Empty>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 登录守卫。
 *
 * 原本还承担权限/角色校验（管理页按 permission 分流）。裁剪掉管理侧页面后，
 * 剩下全是客户侧页面，没有一条需要角色判定，所以这里只保留「必须登录」。
 * 权限判断仍留在 utils/permission 里供侧边栏使用，不要在这里重新引入。
 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}

/** 企业侧页面：平台管理员不可访问 */
function EnterpriseRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isEnterprise } = useUser();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  if (isPlatformWorker(user)) return <Navigate to="/dashboard" />;
  if (!isEnterprise) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function TopUpRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isEnterprise, isOrgOwner } = useUser();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  // 平台管理员走个人「充值」页；企业子账号不应用个人充值，去对公或回首页
  if (isEnterprise && !isPlatformWorker(user)) {
    return <Navigate to={isOrgOwner ? '/org/bank-transfer' : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

/** 仅从操作台点进去时套侧栏；官网顶栏 /models 仍是独立页 */
function ConsoleIfAuthedLayout() {
  const { user, loading } = useUser();
  if (loading) return <Loading />;
  if (user && isModelsConsoleEmbed()) return <MainLayout />;
  return <Outlet />;
}

/** 用 Suspense + ErrorBoundary 包裹懒加载页面 */
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

/** 登录页专用：全屏不透明主题底 fallback。
 *  跳转登录页时 React 挂起期间旧首页只是隐藏而非卸载（html 上的首页背景类仍在），
 *  透明的 PageLoading 会露出旧首页的条纹背景一帧——这里用与登录页同底色
 *  （var(--bg-base)）的全屏遮罩兜住，过渡无缝。 */
function LazyPageFull({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-base)',
            }}
          >
            <Spin size="large" />
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { siteBrand } = useStatus();

  useEffect(() => {
    /*
     * 走 syncDocumentTitleFromBrand 而不是直接赋值：
     * 伙伴后台可能配了自定义 page_title，那个值存在 theme/brandOverride 里，
     * 统一由那个函数决定用哪个。直接写 t('app.title') 会把商户配的标题覆盖掉。
     */
    syncDocumentTitleFromBrand();
    document.documentElement.lang = normalizeLocale(i18n.language);
  }, [t, i18n.language, siteBrand.brand_name_zh, siteBrand.brand_name_en]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <SiteAppearanceRouteGuard>
        <Routes>
          <Route
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route path="/dashboard" element={<LazyPage><Dashboard /></LazyPage>} />
            <Route path="/tokens" element={<LazyPage><Tokens /></LazyPage>} />
            <Route path="/logs" element={<LazyPage><Logs /></LazyPage>} />
            <Route path="/topup" element={<TopUpRoute><LazyPage><TopUp /></LazyPage></TopUpRoute>} />
            <Route path="/organizations" element={<LazyPage><Organizations /></LazyPage>} />
            <Route path="/org-bills" element={<EnterpriseRoute><LazyPage><OrgBills /></LazyPage></EnterpriseRoute>} />
            <Route path="/org/discount-rules" element={<EnterpriseRoute><LazyPage><OrgDiscountRules /></LazyPage></EnterpriseRoute>} />
            <Route path="/org/bank-transfer" element={<EnterpriseRoute><LazyPage><OrgBankTransfer /></LazyPage></EnterpriseRoute>} />
            <Route path="/subscription" element={<LazyPage><Subscription /></LazyPage>} />
            <Route path="/profile" element={<LazyPage><Profile /></LazyPage>} />
            <Route path="/billing" element={<LazyPage><Billing /></LazyPage>} />
            <Route path="/chat" element={<LazyPage><TextChat /></LazyPage>} />
            <Route path="/image-chat" element={<LazyPage><ImageChat /></LazyPage>} />
            <Route path="/video" element={<LazyPage><VideoGen /></LazyPage>} />
            <Route path="/speech" element={<LazyPage><SpeechGen /></LazyPage>} />
            <Route path="/user-pricing" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="/" element={<LazyPage><Home /></LazyPage>} />
          <Route path="/pricing" element={<LazyPage><Pricing /></LazyPage>} />
          <Route element={<ConsoleIfAuthedLayout />}>
            <Route path="/models" element={<LazyPage><ModelPlazaPage /></LazyPage>} />
          </Route>
          <Route path="/docs/api" element={<LazyPage><DocsApiRedirect /></LazyPage>} />
          <Route path="/docs/:slug" element={<LazyPage><DocsArticlePage /></LazyPage>} />
          <Route path="/docs" element={<LazyPage><DocsHomePage /></LazyPage>} />
          <Route path="/enterprise/apply" element={<LazyPage><EnterpriseApply /></LazyPage>} />
          <Route path="/about" element={<LazyPage><AboutPage /></LazyPage>} />
          <Route path="/trust" element={<LazyPage><TrustPage /></LazyPage>} />
          <Route path="/legal" element={<LazyPage><LegalPage /></LazyPage>} />
          <Route path="/news" element={<LazyPage><NewsPage /></LazyPage>} />
          <Route path="/consulting" element={<LazyPage><ConsultingPage /></LazyPage>} />
          <Route path="/announcements" element={<LazyPage><AnnouncementsPage /></LazyPage>} />
          <Route path="/support-plans" element={<LazyPage><SupportPlansPage /></LazyPage>} />
          <Route path="/status-page" element={<LazyPage><ServiceStatusPage /></LazyPage>} />
          <Route path="/login" element={<LazyPageFull><LoginPage /></LazyPageFull>} />
          <Route path="/register" element={<Navigate to="/login?tab=register" replace />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <CustomerServiceFloat />
        </SiteAppearanceRouteGuard>
      </Suspense>
    </ErrorBoundary>
  );
}
