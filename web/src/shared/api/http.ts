import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { notify } from '../lib/notify';

/**
 * ============================================================================
 *  请求层
 * ============================================================================
 *
 *  · baseURL 由各端 .env 的 VITE_API_BASE_URL 控制（独立域名部署时指向后端域名）
 *  · 鉴权：partner/backend 用的是 **cookie session**（HttpOnly，
 *    Path=/api/partner，见 backend/internal/partner/partner_auth.go 的
 *    PartnerSession），不是 Bearer token。
 *  · 401：清本地登录标记 + 跳登录（路由由各端注入，避免 shared 依赖具体路由）
 *  · Mock：VITE_USE_MOCK=true 时全部请求走本地假数据（见 api/mock/）
 *
 *  ---------------------------------------------------------------------------
 *  为什么还要在 localStorage 留一个标记：
 *
 *  cookie 是 HttpOnly，JS 读不到。但登录态需要参与「首屏要不要跳登录页」的
 *  判断，也需要在 createAuthContext 里决定是否去拉 profile。所以这里只在
 *  localStorage 存一个布尔标记表示「用户认为自己登录过」，真正的凭证仍然
 *  只有 cookie。标记被伪造也没用——后端每个请求都会重新校验 session
 *  （PartnerAuth 每次都从 lc_distribution_merchants 重读登录状态和会话版本），
 *  伪造标记只会换来一个 401 然后被踢回登录页。
 *
 *  这和「把 token 放 localStorage」是两件事：后者是凭证泄漏即身份失窃，
 *  前者泄漏的只是一个已经登录的事实。
 */

const TOKEN_KEY = 'lynx_dealer_token';

/**
 * cookie 会话模式下的本地标记值。
 *
 * 只是一个「我登录过」的布尔位，不是凭证——真正认人靠 HttpOnly cookie。
 * 用固定字符串而不是随机 token，是为了让人一眼看出它不是 Bearer token：
 * 拦截器看到这个值就不发 Authorization 头，免得后端收到一个假的 Bearer
 * 反而覆盖掉 cookie 认证。
 */
const SESSION_MARKER = 'cookie-session';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** 未登录 / 401 时的跳转钩子，由各端 main.tsx 注入 */
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000,
  /*
   * 关键：带 cookie。
   *
   * 伙伴后端靠 cookie session 认人，axios 默认 withCredentials=false，
   * 跨源时不带 cookie，登录接口会「成功」但下一个请求就 401——
   * 表现为「输对密码了还被踢回登录页」，极难排查。
   *
   * 同源部署（Vite 代理 /api/partner）时本就带 cookie，设成 true 无副作用；
   * 前后端分域名部署时，这一项是必须的。
   */
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token && token !== SESSION_MARKER) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // GET 加时间戳，避免浏览器/网关缓存旧数据
  if ((config.method || 'get').toLowerCase() === 'get') {
    config.headers['Cache-Control'] = 'no-cache';
    config.headers.Pragma = 'no-cache';
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      clearToken();
      if (unauthorizedHandler) unauthorizedHandler();
    }
    return Promise.reject(error);
  },
);

/** 后端统一响应包：{ success, message, data, total } */
export interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
  total?: number;
}

/** 分页响应 */
export interface ListResult<T> {
  items: T[];
  total: number;
}

/**
 * 请求配置。
 *
 * 与 AxiosRequestConfig 的唯一区别：url 允许为 null。
 * endpoints.ts 里后端未实现的接口写 null，这样「缺哪些接口」在端点表里
 * 一目了然，而不是靠在这里现编一个不存在的路径。
 */
export interface RequestConfig extends Omit<AxiosRequestConfig, 'url'> {
  url: string | null;
}

/**
 * 端点值为 null 时抛出的错误：后端还没实现这个接口。
 *
 * 为什么单独一个错误类型：概览汇总、用量汇总、用量导出、客户写操作这几组接口
 * partner/backend 都还没有。如果放任它们打到不存在的 URL 上，拿到的是
 * 404，页面上会显示「Not Found」——看起来像路径拼错了或者服务没起，
 * 排查方向完全跑偏。抛这个错误至少能让人一眼看出是「功能还没做」。
 */
export class ApiNotReadyError extends Error {
  constructor(public readonly endpoint: string) {
    super(`接口尚未实现：${endpoint}`);
    this.name = 'ApiNotReadyError';
  }
}

/**
 * 统一请求入口。返回裸 data（解包 envelope），失败时抛出可读错误。
 * 页面里只调 api/ 下的方法，不要直接用 http。
 */
export async function request<T>(
  config: RequestConfig,
  options?: { silent?: boolean },
): Promise<T> {
  /*
   * 端点为 null：直接抛「未实现」，不发出请求。
   * 放在这里而不是各个调用方判断，是为了让「后端缺哪些接口」
   * 只需要在 endpoints.ts 里表达一次。
   */
  if (config.url == null) {
    const err = new ApiNotReadyError(String(config.method || 'GET').toUpperCase() + ' ' + (config.url ?? '?'));
    if (!options?.silent) notify.error(err.message);
    throw err;
  }
  try {
    const res = await http.request<ApiEnvelope<T> | T>({ ...config, url: config.url });
    const body = res.data as ApiEnvelope<T>;

    // 有些后端直接返回数组/对象，不套 envelope
    if (body && typeof body === 'object' && 'success' in body && body.success === false) {
      const msg = body.message || '请求失败';
      if (!options?.silent) notify.error(msg);
      throw new Error(msg);
    }
    if (body && typeof body === 'object' && 'data' in body) {
      return (body.data ?? null) as T;
    }
    return body as T;
  } catch (err) {
    // 自己抛的未实现错误已经提示过，不要再走一遍网络错误文案
    if (err instanceof ApiNotReadyError) throw err;
    if (!options?.silent) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        '网络异常，请稍后重试';
      // 401 已由拦截器处理，不重复弹
      if ((err as { response?: { status?: number } })?.response?.status !== 401) {
        notify.error(msg);
      }
    }
    throw err;
  }
}

/**
 * 拼接路径参数：fillPath('/a/:id', { id: 1 }) => '/a/1'
 *
 * 允许传 null：端点表里未实现的接口是 null，调用方不必先判空再调用。
 * 传 null 时原样返回 null，交给 request() 抛 ApiNotReadyError——
 * 这样「未实现」只有一处判断，不会散落到每个调用点。
 */
export function fillPath(
  template: string | null,
  params: Record<string, string | number> = {},
): string | null {
  if (template == null) return null;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`:${key}`, encodeURIComponent(String(value))),
    template,
  );
}
