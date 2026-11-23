import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/** 登录/注册成功后不回到原页、统一进控制台的路径（公开页、认证页等） */
const POST_AUTH_DASHBOARD_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/about',
  '/trust',
  '/legal',
  '/news',
  '/consulting',
  '/announcements',
  '/support-plans',
  '/status-page',
  '/setup',
]);

function shouldRedirectToDashboard(path: string): boolean {
  const base = path.split('?')[0];
  if (POST_AUTH_DASHBOARD_PATHS.has(base)) return true;
  if (base.startsWith('/docs')) return true;
  return false;
}

function normalizeRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/dashboard';
  if (shouldRedirectToDashboard(path)) return '/dashboard';
  return path;
}

/** 登录/注册成功后跳转：优先 state.from，其次 ?redirect= */
export function usePostAuthNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  return useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from;
    const redirect = searchParams.get('redirect');
    navigate(normalizeRedirect(from ?? redirect ?? undefined), { replace: true });
  }, [navigate, location.state, searchParams]);
}

export function getPostAuthPath(
  state: unknown,
  redirectParam: string | null,
): string {
  const from = (state as { from?: string } | null)?.from;
  return normalizeRedirect(from ?? redirectParam ?? undefined);
}
