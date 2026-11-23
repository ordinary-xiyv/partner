/**
 * 伙伴后台 API。
 *
 * 每个方法都写成「mock 分支 + 真实请求分支」：
 *  - `USE_MOCK=true` 时返回本地假数据，页面可直接开发调试；
 *  - 联调阶段把 .env 的 VITE_USE_MOCK 改成 false，请求就会打到 EP.dealer.* 定义的真实路径。
 *
 * 页面只依赖本文件导出的方法签名，不关心底层是 mock 还是真实接口。
 *
 * ---------------------------------------------------------------------------
 * 对齐原则（改这个文件前必读）
 *
 * 这个文件是「后端能力」与「页面需求」之间唯一的翻译层。凡后端没有的能力，
 * 必须在这里显式表现为「没有」，而不是用默认值糊过去：
 *
 *   · 端点为 null → request() 抛 ApiNotReadyError，用户看到「接口尚未实现」
 *   · 字段缺失 → 类型上就是可选（undefined），页面渲染成「—」
 *
 * 反面教材（本文件已修掉的几处）：
 *   · discount_rate 填 1、level 填 'diamond' → 页面显示「钻石代理」「无折扣」，
 *     看着像真实配置，实际是编的
 *   · fetchUsageSummary 走一个不存在的端点 → 用量页整页加载失败
 *   · 状态筛选传 status:'error' → 后端只认 type，参数被丢弃，筛选器形同虚设
 */

import { EP } from './endpoints';
import { fillPath, request, USE_MOCK, type ListResult } from './http';
import type { TenantBrand, TenantBrandUpdatePayload, TenantDomain } from '../types/tenant';
import type {
  Customer,
  CustomerCreatePayload,
  DealerProfile,
  OverviewStats,
  TrendPoint,
  UsageLog,
  UsageSummary,
} from '../types/dealer';
import {
  mockCreateCustomer,
  mockCustomers,
  mockDealerProfile,
  mockOverview,
  mockTrend,
  mockUsageLogs,
  mockUsageSummary,
} from './mock/seed';

/** mock 延迟，模拟真实网络，便于验证 loading 态 */
function delay<T>(data: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

/** 内存态：mock 模式下允许增删改，页面操作立刻生效 */
const memCustomers: Customer[] = [...mockCustomers];

// ── 认证 ─────────────────────────────────────────────────────
/**
 * 登录入参。
 *
 * 伙伴后台登录的是一张「商户」记录（lc_distribution_merchants），
 * 不是 users 表里的某个账号，所以后端要的是 `merchant_code`。
 *
 * 这里同时接受 `username` 是为了让页面代码不必跟着改；
 * 新代码请直接用 merchant_code。
 */
export interface LoginPayload {
  merchant_code?: string;
  username?: string;
  password: string;
}
export interface LoginResult {
  token: string;
  profile: DealerProfile;
}

/**
 * 伙伴后端 partnerInfo() 的原始返回 —— 与 DealerProfile 字段一一对应，
 * 所以不需要再做转换。之前多出来的那层 toDealerProfile() 就是为了把
 * 4 个真实字段「补」成 15 个假字段，现在补丁和它修补的问题一起消失了。
 */
interface PartnerMe {
  merchant_id: number;
  merchant_name: string;
  merchant_code: string;
  password_change_required: boolean;
}

function toDealerProfile(me: PartnerMe): DealerProfile {
  return {
    id: me.merchant_id,
    merchant_code: me.merchant_code,
    display_name: me.merchant_name || me.merchant_code,
    /*
     * 这个字段必须透传：为 true 时后端对 users/logs/daily-trend/billing
     * 全部返回 403「请先修改初始密码」。前端要靠它把人拦到改密页，
     * 否则商户首次登录后每个页面都是空的，还看不出原因。
     */
    password_change_required: Boolean(me.password_change_required),
  };
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  if (USE_MOCK) {
    await delay(null, 500);
    if (!payload.username && !payload.merchant_code) {
      throw new Error('请输入商户编码和密码');
    }
    if (!payload.password) throw new Error('请输入商户编码和密码');
    return { token: 'mock-dealer-token', profile: mockDealerProfile };
  }
  const merchantCode = (payload.merchant_code ?? payload.username ?? '').trim();
  if (!merchantCode || !payload.password) {
    throw new Error('请输入商户编码和密码');
  }
  const res = await request<PartnerMe>({
    url: EP.dealer.login,
    method: 'POST',
    data: { merchant_code: merchantCode, password: payload.password },
  });
  /*
   * 登录接口本身就是「凭证已生效」的证据：后端在响应里种了 session cookie。
   * 不需要再存 Bearer token，只留一个标记让 createAuthContext 知道要去拉 profile。
   */
  return { token: 'cookie-session', profile: toDealerProfile(res) };
}

export async function logout(): Promise<void> {
  if (USE_MOCK) return delay(undefined, 120);
  return request<void>({ url: EP.dealer.logout, method: 'POST' }, { silent: true });
}

export async function fetchProfile(): Promise<DealerProfile> {
  if (USE_MOCK) return delay(mockDealerProfile, 180);
  const me = await request<PartnerMe>({ url: EP.dealer.me });
  return toDealerProfile(me);
}

export async function changePassword(payload: {
  old_password: string;
  new_password: string;
}): Promise<void> {
  if (USE_MOCK) return delay(undefined, 420);
  /*
   * 字段名要转：后端要 current_password，页面传的是 old_password。
   * 方法也变了（PUT → POST）—— partner/backend 注册的是 POST /password。
   */
  return request<void>({
    url: EP.dealer.changePassword,
    method: 'POST',
    data: {
      current_password: payload.old_password,
      new_password: payload.new_password,
    },
  });
}

// ── 账单（后端唯一提供聚合数据的接口）──────────────────────────
/** GET /api/partner/billing/summary 的原始返回 */
interface PartnerBillingUser {
  user_id: number;
  username: string;
  deleted: boolean;
  request_count: number;
  quota: number;
  amount_usd: number;
  amount_cny: number;
}

interface PartnerBillingSummary {
  start_date: string;
  end_date: string;
  total_users: number;
  total_requests: number;
  total_quota: number;
  total_amount_usd: number;
  total_amount_cny: number;
  quota_per_unit: number;
  items: PartnerBillingUser[];
  page: number;
  page_size: number;
}

export interface BillingQuery {
  /** YYYY-MM-DD。不传则后端默认「本月 1 号 ~ 今天」 */
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

/**
 * 账单汇总。这是后端唯一能给出「汇总数字」的接口，三个页面都靠它。
 *
 * 计费口径与 logs 的裸 quota 求和不同：
 *   消费(2) + 预扣(7) + 补扣(8) − 退款(6)
 * 所以「本月消耗」必须用这个接口，不能拿日志页的 quota 相加。
 */
export async function fetchBilling(query: BillingQuery = {}): Promise<PartnerBillingSummary> {
  if (USE_MOCK) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const start = (page - 1) * pageSize;
    return delay({
      start_date: query.start_date ?? mockUsageSummary.start_date,
      end_date: query.end_date ?? mockUsageSummary.end_date,
      total_users: mockUsageSummary.total_users,
      total_requests: mockUsageSummary.total_requests,
      total_quota: mockUsageSummary.total_quota,
      total_amount_usd: Math.round((mockUsageSummary.total_amount_cny / 7.2) * 100) / 100,
      total_amount_cny: mockUsageSummary.total_amount_cny,
      quota_per_unit: mockUsageSummary.quota_per_unit,
      items: mockCustomers
        .slice()
        .sort((a, b) => (b.used_quota ?? 0) - (a.used_quota ?? 0))
        .slice(start, start + pageSize)
        .map((c) => ({
          user_id: c.id,
          username: c.username,
          deleted: c.status === 2,
          request_count: c.request_count ?? 0,
          quota: c.used_quota ?? 0,
          amount_usd: Math.round(((c.used_amount_cny ?? 0) / 7.2) * 100) / 100,
          amount_cny: c.used_amount_cny ?? 0,
        })),
      page,
      page_size: pageSize,
    });
  }
  return request<PartnerBillingSummary>({
    url: EP.dealer.billingSummary,
    params: {
      ...(query.page ? { page: query.page } : {}),
      ...(query.page_size ? { page_size: query.page_size } : {}),
      ...(query.start_date ? { start_date: query.start_date } : {}),
      ...(query.end_date ? { end_date: query.end_date } : {}),
    },
  });
}

/**
 * 本月区间（YYYY-MM-DD）。
 *
 * 自己算而不是依赖后端默认值：后端默认区间是「本月 1 号 ~ 今天」，
 * 让它自己算当然更省事，但页面要拿 start_date/end_date 在界面上标注
 * 「这个数字是哪段日期的」，得知道区间才能说清楚。
 */
export function currentMonthRange(): { start_date: string; end_date: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { start_date: `${y}-${m}-01`, end_date: `${y}-${m}-${d}` };
}

// ── 概览 ─────────────────────────────────────────────────────
/**
 * 概览指标。
 *
 * 后端没有 /overview 接口，这里用两个真接口拼：
 *   GET /users            → 客户总数（取 total，page_size=1 最省）
 *   GET /billing/summary  → 本月消耗、本月请求数、本月活跃客户数
 *
 * 为什么不再用 daily-trend 拼「本月消耗」：
 *   趋势只给 14 个已完成日，跨月时会把上个月的尾巴算进「本月」，
 *   而且不含今天。billing/summary 是账期口径，才和「本月」语义一致。
 */
export async function fetchOverview(): Promise<OverviewStats> {
  if (USE_MOCK) return delay(mockOverview);

  const range = currentMonthRange();
  const [users, billing] = await Promise.all([
    request<{ items: unknown[]; total: number }>({
      url: EP.dealer.customers,
      params: { page: 1, page_size: 1 },
    }),
    fetchBilling({ ...range, page: 1, page_size: 1 }),
  ]);

  return {
    customer_count: users?.total ?? 0,
    month_quota: billing?.total_quota ?? 0,
    month_amount_cny: billing?.total_amount_cny ?? 0,
    month_requests: billing?.total_requests ?? 0,
    month_active_users: billing?.total_users ?? 0,
    start_date: billing?.start_date ?? range.start_date,
    end_date: billing?.end_date ?? range.end_date,
  };
}

/**
 * 14 天消耗趋势。后端固定返回 14 个「已完成日」（不含今天），缺数据补 0。
 * 字段名要转：后端叫 request_count，图表要 requests。
 */
export async function fetchOverviewTrend(): Promise<TrendPoint[]> {
  if (USE_MOCK) return delay(mockTrend);
  const res = await request<{ items: TrendPoint[] }>({ url: EP.dealer.overviewTrend });
  return res?.items ?? [];
}

// ── 客户管理 ─────────────────────────────────────────────────
export interface CustomerQuery {
  page?: number;
  page_size?: number;
  /** 搜索：用户名 / 显示名 / 邮箱 / 手机 / ID */
  keyword?: string;
  /**
   * 状态筛选。
   *
   * 后端 PartnerUserFilter 没有 status 参数 —— 传了会被忽略。
   * 所以这个筛选在客户端做（见 fetchCustomers），不要发给后端假装它生效了。
   */
  status?: 0 | 1 | 2;
  /**
   * 是否顺带合并用量数据。
   *
   * 后端 /users 不带额度，「剩余额度 / 累计消耗 / 请求数」三列只能从
   * billing/summary 拿。合并要多发一个请求，列表页需要、详情页不需要，
   * 所以做成开关而不是无条件执行。
   */
  withUsage?: boolean;
}

/** GET /api/partner/users 的原始返回行 —— 只有这 7 个字段 */
interface PartnerUserRow {
  id: number;
  username: string;
  display_name: string;
  email: string;
  phone?: string;
  status: number;
  created_time?: string;
}

/**
 * 把后端用户行转成页面模型。
 *
 * 后端给的 created_time 是 RFC3339 字符串（time.Time 序列化结果），
 * 页面要秒级时间戳；解析失败一律置 0，让界面显示「—」而不是 Invalid Date。
 */
function toCustomer(u: PartnerUserRow): Customer {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name || u.username,
    email: u.email || '',
    phone: u.phone,
    /*
     * 状态语义刚好一致（后端 1 启用 / 2 禁用，页面也是 1/2），
     * 但仍要兜底非法值——直接透传会让页面按「未知状态」渲染。
     */
    status: u.status === 2 ? 2 : 1,
    created_at: u.created_time ? Math.floor(new Date(u.created_time).getTime() / 1000) || 0 : 0,
  };
}

export async function fetchCustomers(
  query: CustomerQuery = {},
): Promise<
  ListResult<Customer> & {
    start_date?: string;
    end_date?: string;
    /** 账单只返回了前 100 名活跃客户，超出的部分无法匹配 */
    usage_truncated?: boolean;
  }
> {
  if (USE_MOCK) {
    const { page = 1, page_size = 10, keyword = '', status = 0 } = query;
    const kw = keyword.trim().toLowerCase();
    let filtered = memCustomers;
    if (kw) {
      filtered = filtered.filter(
        (c) =>
          c.username.toLowerCase().includes(kw) ||
          c.display_name.toLowerCase().includes(kw) ||
          c.email.toLowerCase().includes(kw),
      );
    }
    // 与真实分支保持同一套语义：状态筛选在本地做
    if (status) filtered = filtered.filter((c) => c.status === status);
    const start = (page - 1) * page_size;
    return delay({ items: filtered.slice(start, start + page_size), total: filtered.length });
  }

  const res = await request<{ items: PartnerUserRow[]; total: number }>({
    url: EP.dealer.customers,
    params: {
      page: query.page ?? 1,
      page_size: query.page_size ?? 10,
      ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
    },
  });

  let items = (res?.items ?? []).map(toCustomer);
  const total = res?.total ?? 0;

  /*
   * 状态筛选在客户端做：后端不支持，只能在当前页内过滤。
   *
   * 这会导致「已禁用」分页上的数字不对 —— 后端返回的 total 是未过滤的总数。
   * 与其发一个后端会忽略的参数、让人以为服务端筛过了，不如诚实一点：
   * 页面会说明这个筛选是「当前页内筛选」。等后端加了 status 参数再改回服务端。
   */
  if (query.status) {
    items = items.filter((c) => c.status === query.status);
  }

  let startDate: string | undefined;
  let endDate: string | undefined;
  let usageTruncated = false;

  if (query.withUsage && items.length > 0) {
    /*
     * 用量合并。拉一页尽可能大的账单行（后端 page_size 上限 100），按 user_id 建索引。
     *
     * 为什么用 billing 而不是 logs 逐人查：
     *   logs 是明细，要给每人求和得翻完所有页；billing 本身就是按人聚合的。
     *
     * 注意两个真实约束（实测确认）：
     * 1. billing 只返回**区间内有消耗**的客户。实测某商户 107 个客户里只有 5 个
     *    本月有消耗，其余 102 人压根不在 items 里 —— 它们必须显示「—」，
     *    而不是 0（0 会被读成"这个月没花钱"，而真相是"这个月没有数据"）。
     * 2. 后端按 quota DESC 排序且只给前 100 条。活跃客户超过 100 个时，
     *    靠后的客户无法匹配，此时 usageTruncated 置 true，页面要说明这一点，
     *    否则用户会以为那些客户的消耗真的查不到。
     */
    const range = currentMonthRange();
    try {
      const billing = await fetchBilling({ ...range, page: 1, page_size: 100 });
      startDate = billing.start_date;
      endDate = billing.end_date;
      usageTruncated = billing.total_users > billing.items.length;
      const byUser = new Map(billing.items.map((b) => [b.user_id, b]));
      items = items.map((c) => {
        const b = byUser.get(c.id);
        return b
          ? {
              ...c,
              used_quota: b.quota,
              used_amount_cny: b.amount_cny,
              request_count: b.request_count,
            }
          : c;
      });
    } catch {
      /*
       * 账单拉不到不影响主列表：消耗列显示「—」即可。
       * 这里吞掉错误是刻意的 —— 不能因为一个附加数据源挂了就让「我的客户」整页空白。
       */
    }
  }

  return { items, total, start_date: startDate, end_date: endDate, usage_truncated: usageTruncated };
}

export async function createCustomer(payload: CustomerCreatePayload): Promise<Customer> {
  if (USE_MOCK) {
    const created = mockCreateCustomer(payload);
    memCustomers.unshift(created);
    return delay(created, 480);
  }
  /*
   * 后端只有 GET /users，没有 POST。customerCreate 在 endpoints 里是 null，
   * request() 会抛 ApiNotReadyError（提示「接口尚未实现」），
   * 而不是打到一个不存在的 URL 上拿 404。
   */
  return request<Customer>({ url: EP.dealer.customerCreate, method: 'POST', data: payload });
}

export async function updateCustomer(
  id: number,
  payload: Partial<Pick<Customer, 'display_name' | 'email' | 'phone'>>,
): Promise<void> {
  if (USE_MOCK) {
    const idx = memCustomers.findIndex((c) => c.id === id);
    if (idx >= 0) memCustomers[idx] = { ...memCustomers[idx], ...payload };
    return delay(undefined, 400);
  }
  return request<void>({
    url: fillPath(EP.dealer.customerDetail, { id }),
    method: 'PUT',
    data: payload,
  });
}

/** 调整客户额度：delta 正数增加、负数扣减；也可传 set 直接设定 */
export async function adjustCustomerQuota(
  id: number,
  payload: { delta?: number; set?: number; remark?: string },
): Promise<{ quota: number }> {
  if (USE_MOCK) {
    const idx = memCustomers.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error('客户不存在');
    const cur = memCustomers[idx];
    const next = payload.set ?? (cur.used_quota ?? 0) + (payload.delta || 0);
    memCustomers[idx] = { ...cur, used_quota: Math.max(0, next) };
    return delay({ quota: memCustomers[idx].used_quota ?? 0 }, 420);
  }
  return request<{ quota: number }>({
    url: fillPath(EP.dealer.customerQuota, { id }),
    method: 'POST',
    data: payload,
  });
}

export async function toggleCustomerStatus(id: number, status: 1 | 2): Promise<void> {
  if (USE_MOCK) {
    const idx = memCustomers.findIndex((c) => c.id === id);
    if (idx >= 0) memCustomers[idx] = { ...memCustomers[idx], status };
    return delay(undefined, 340);
  }
  return request<void>({
    url: fillPath(EP.dealer.customerStatus, { id }),
    method: 'PUT',
    data: { status },
  });
}

export async function resetCustomerPassword(
  id: number,
  newPassword: string,
): Promise<void> {
  if (USE_MOCK) return delay(undefined, 440);
  return request<void>({
    url: fillPath(EP.dealer.customerResetPassword, { id }),
    method: 'POST',
    data: { new_password: newPassword },
  });
}

// ── 用量 ─────────────────────────────────────────────────────
export interface UsageQuery {
  page?: number;
  page_size?: number;
  customer_id?: number;
  model_name?: string;
  /** 起止时间（秒级时间戳） */
  start_time?: number;
  end_time?: number;
  /**
   * 类型筛选。
   *
   * 后端没有 status，只有 type（2消费 5错误 6退款 7预扣 8补扣）。
   * 上一版把 'success'/'error' 当 status 传给后端，后端不认识直接丢掉，
   * 筛选器点了没反应。现在直接按后端的 5 种 type 筛，不做有损映射 ——
   * 「成功」并不等于「type=2」，预扣(7)也是成功调用，映射过去反而漏数据。
   */
  type?: number;
}

/** 后端 type 常量，与 internal/model/model.go 一致 */
const LOG_TYPE = {
  consume: 2,
  error: 5,
  refund: 6,
  pre: 7,
  adjust: 8,
} as const;

/**
 * type → 语义化状态。
 *
 * 上一版把「非 5」全当成功，于是退款(6)/预扣(7)/补扣(8) 也被算成成功调用，
 * 成功次数虚高。现在逐项映射，页面按 status 上色。
 */
function typeToStatus(t: number): UsageLog['status'] {
  switch (t) {
    case LOG_TYPE.error:
      return 'error';
    case LOG_TYPE.refund:
      return 'refund';
    case LOG_TYPE.pre:
      return 'pre';
    case LOG_TYPE.adjust:
      return 'adjust';
    default:
      return 'success';
  }
}

/** GET /api/partner/logs 的原始返回行 */
interface PartnerLogRow {
  id: number;
  created_at: number;
  user_id: number;
  username: string;
  type: number;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read: number;
  use_time: number;
  is_stream: boolean;
  quota: number;
  amount_cny: number;
  request_id: string;
}

function toUsageLog(r: PartnerLogRow): UsageLog {
  return {
    id: r.id,
    customer_id: r.user_id,
    customer_name: r.username || '',
    model_name: r.model_name,
    prompt_tokens: r.prompt_tokens || 0,
    completion_tokens: r.completion_tokens || 0,
    cache_read: r.cache_read || 0,
    quota: r.quota || 0,
    // 后端已经按 quota/500000 算好，直接用，避免两处各算一遍出现尾差
    amount_cny: r.amount_cny ?? 0,
    use_time: r.use_time || 0,
    stream: Boolean(r.is_stream),
    status: typeToStatus(r.type),
    type: r.type,
    created_at: r.created_at,
  };
}

export async function fetchUsageLogs(query: UsageQuery = {}): Promise<ListResult<UsageLog>> {
  if (USE_MOCK) {
    const {
      page = 1,
      page_size = 10,
      customer_id,
      model_name,
      start_time,
      end_time,
      type,
    } = query;
    let filtered = mockUsageLogs;
    if (customer_id) filtered = filtered.filter((l) => l.customer_id === customer_id);
    if (model_name) filtered = filtered.filter((l) => l.model_name === model_name);
    if (type) filtered = filtered.filter((l) => l.type === type);
    if (start_time) filtered = filtered.filter((l) => l.created_at >= start_time);
    if (end_time) filtered = filtered.filter((l) => l.created_at <= end_time);
    const start = (page - 1) * page_size;
    return delay({ items: filtered.slice(start, start + page_size), total: filtered.length });
  }

  /*
   * 参数名逐个对上后端（parsePartnerLogFilter）：
   *   customer_id → user_id
   *   start_time  → start_timestamp
   *   end_time    → end_timestamp
   *   type        → type（后端原生就有，直接透传）
   *
   * 特别注意：后端在「既没给时间范围、也没给 all_history=1」时会**默认只看今天**。
   * 页面的语义是「不带时间条件 = 看全部」，所以不传时间时显式带 all_history=1。
   * all_history 只接受空或 "1"，传 "0" 会 400（已实测确认）。
   */
  const hasTimeRange = Boolean(query.start_time || query.end_time);

  const res = await request<{ items: PartnerLogRow[]; total: number }>({
    url: EP.dealer.usage,
    params: {
      page: query.page ?? 1,
      page_size: query.page_size ?? 10,
      ...(query.customer_id ? { user_id: query.customer_id } : {}),
      ...(query.model_name ? { model_name: query.model_name } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.start_time ? { start_timestamp: query.start_time } : {}),
      ...(query.end_time ? { end_timestamp: query.end_time } : {}),
      ...(hasTimeRange ? {} : { all_history: 1 }),
    },
  });
  return {
    items: (res?.items ?? []).map(toUsageLog),
    total: res?.total ?? 0,
  };
}

/**
 * 筛选范围的汇总。
 *
 * 数据源是 billing/summary（账期口径），不是把当前页日志加起来 ——
 * 后者会得出「这一页花了多少钱」，而用户要的是「这个筛选范围总共花了多少」。
 *
 * 局限（必须让页面知道，别让它看起来像全量）：
 *   billing 只按 user_id 聚合，不支持 model_name / 按天拆分，
 *   所以「模型分布」和「每日趋势」这两块它给不出来。需要的话得后端加接口。
 */
export async function fetchUsageSummary(query: UsageQuery = {}): Promise<UsageSummary> {
  if (USE_MOCK) return delay(mockUsageSummary);

  /*
   * billing 只认 start_date/end_date（YYYY-MM-DD），不认时间戳也不认分页外的筛选。
   * 有模型筛选时账期汇总无法随之收窄 —— 这时仍然返回账期数字，
   * 由页面标注「汇总为账期口径，不随模型筛选变化」，而不是悄悄返回一个错数。
   */
  const range = query.start_time && query.end_time
    ? { start_date: toDateStr(query.start_time), end_date: toDateStr(query.end_time) }
    : currentMonthRange();

  const billing = await fetchBilling({ ...range, page: 1, page_size: 1 });
  return {
    start_date: billing.start_date,
    end_date: billing.end_date,
    total_users: billing.total_users,
    total_requests: billing.total_requests,
    total_quota: billing.total_quota,
    total_amount_cny: billing.total_amount_cny,
    quota_per_unit: billing.quota_per_unit,
  };
}

/** 秒级时间戳 → YYYY-MM-DD（本地时区，与后端 Asia/Shanghai 一致） */
function toDateStr(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 筛选器用的模型名列表（去重）。
 *
 * 后端没有独立的模型目录接口，只能从日志里取。取一页（上限 100）足够覆盖
 * 常用模型，且不必为了填一个下拉框去翻几十页。
 */
export async function fetchModelNames(): Promise<string[]> {
  if (USE_MOCK) return delay([...new Set(mockUsageLogs.map((l) => l.model_name))].sort(), 180);
  const res = await request<{ items: PartnerLogRow[]; total: number }>({
    url: EP.dealer.usage,
    params: { page: 1, page_size: 100, all_history: 1 },
  }, { silent: true });
  return [...new Set((res?.items ?? []).map((r) => r.model_name).filter(Boolean))].sort();
}

/**
 * 导出用量。
 *
 * 后端没有导出接口。这里不再返回一个假 CSV —— 假导出比没有导出更糟：
 * 用户会拿着这份「看起来对」的文件去对账。
 * 抛 ApiNotReadyError 让界面明确说「尚未实现」。
 */
export async function exportUsage(query: UsageQuery = {}): Promise<Blob> {
  if (USE_MOCK) {
    const header = '时间,客户,模型,输入tokens,输出tokens,消耗额度,耗时(ms),类型\n';
    const rows = mockUsageLogs
      .slice(0, 300)
      .map((l) =>
        [
          new Date(l.created_at * 1000).toLocaleString('zh-CN'),
          l.customer_name,
          l.model_name,
          l.prompt_tokens,
          l.completion_tokens,
          l.quota,
          l.use_time,
          l.status,
        ].join(','),
      )
      .join('\n');
    return delay(new Blob([`\uFEFF${header}${rows}`], { type: 'text/csv;charset=utf-8' }), 300);
  }
  return request<Blob>({
    url: EP.dealer.usageExport,
    params: query,
    responseType: 'blob',
  });
}

// ── 品牌白标 ─────────────────────────────────────────────────
/**
 * 伙伴后端 GET/PUT /api/partner/brand 的返回（见 backend/internal/partner/
 * partner_brand.go 的 MerchantBrand）。
 *
 * 数据落在 lc_distribution_merchants 的 10 个 brand_* 列上 —— 这张表同时被
 * lynxtonapi 的站点身份体系（siteauth，按 X-Site-ID/Host/Credential 校验）使用，
 * 所以这里写进去的值，就是客户站按站点身份读出来的那一份。两个平台共用一份
 * 数据，不各存一套。
 *
 * 空值兜底（品牌名回落商户名、首字标记取首字、主色给默认值）由后端统一做，
 * 前端不再兜一遍 —— 否则两边规则一旦分叉，会出现「后台显示 A、客户站显示 B」。
 */
interface PartnerBrandRes {
  name: string;
  short_name: string;
  logo_url: string;
  primary_color: string;
  page_title: string;
  favicon_url: string;
  tagline: string;
  api_base_url: string;
  support?: Record<string, unknown> | null;
  landing?: Record<string, unknown> | null;
  site_id?: string | null;
  site_domain?: string | null;
  merchant_id: number;
  merchant_name: string;
  merchant_code: string;
}

function toTenantBrand(b: PartnerBrandRes): TenantBrand {
  return {
    dealer_id: b.merchant_id,
    // 伙伴体系没有 slug 概念，用商户编码代替——它同样唯一且可读
    slug: b.merchant_code || '',
    name: b.name || b.merchant_name || '',
    short_name: b.short_name || undefined,
    logo_url: b.logo_url || undefined,
    // 后端列有 CHECK 约束保证是合法 #RGB/#RRGGBB，这里不用再兜
    primary_color: b.primary_color || '#6d51fe',
    page_title: b.page_title || b.name || b.merchant_name || '',
    favicon_url: b.favicon_url || undefined,
    tagline: b.tagline || undefined,
    api_base_url: b.api_base_url || undefined,
    // 后端未配置时给的是空对象，转成 undefined 让页面显示「未填写」而不是空对象
    support: hasKeys(b.support) ? (b.support as TenantBrand['support']) : undefined,
    landing: hasKeys(b.landing) ? (b.landing as TenantBrand['landing']) : undefined,
    /*
     * 域名：表上 site_domain 是唯一约束，一商户一域名。
     * 包装成一元数组，让页面的「域名列表」照旧能渲染。
     */
    domains: b.site_domain
      ? [{ host: b.site_domain, kind: 'primary' as const, status: 'active' as const }]
      : [],
  };
}

function hasKeys(v: Record<string, unknown> | null | undefined): boolean {
  return !!v && typeof v === 'object' && Object.keys(v).length > 0;
}

export async function fetchDealerBrand(): Promise<TenantBrand> {
  if (USE_MOCK) return delay({ ...mockBrand }, 200);
  const res = await request<PartnerBrandRes>({ url: EP.dealer.brand });
  return toTenantBrand(res);
}

/** mock 模式下的品牌内存态（真实模式下不用） */
let mockBrand: TenantBrand = {
  dealer_id: mockDealerProfile.id,
  slug: mockDealerProfile.merchant_code,
  name: mockDealerProfile.display_name,
  primary_color: '#6d51fe',
  page_title: mockDealerProfile.display_name,
  domains: [],
};

/**
 * 保存品牌配置。
 *
 * 只提交用户真正改过的字段：后端是「传了才写」的语义，把整份配置无脑回传
 * 会把这次请求没涉及的列也覆盖一遍，将来多人协作时容易出现「我只是改了标题，
 * logo 怎么被回滚成旧值」。
 */
export async function updateDealerBrand(payload: TenantBrandUpdatePayload): Promise<TenantBrand> {
  if (USE_MOCK) {
    /*
     * support / landing 单独处理：前者是嵌套对象，只传部分字段时不能把其余抹掉；
     * 后者是整体编辑的列表，必须整体替换（否则删掉的卖点会复活）。
     */
    mockBrand = {
      ...mockBrand,
      ...payload,
      support: payload.support ? { ...mockBrand.support, ...payload.support } : mockBrand.support,
      landing: payload.landing !== undefined ? payload.landing : mockBrand.landing,
    };
    if (payload.name && !payload.short_name) {
      mockBrand.short_name = payload.name.trim().slice(0, 1);
    }
    return delay(mockBrand, 420);
  }
  const res = await request<PartnerBrandRes>({
    url: EP.dealer.brand,
    method: 'PUT',
    data: payload,
  });
  return toTenantBrand(res);
}

/**
 * 我的域名（只读）。域名由平台绑定，伙伴端不提供增删。
 */
export async function fetchDealerDomains(): Promise<TenantDomain[]> {
  if (USE_MOCK) return delay(mockBrand.domains, 180);
  const res = await request<PartnerDomainRow[]>({ url: EP.dealer.brandDomains });
  return (res ?? []).map(toTenantDomain);
}

/** 后端 PartnerDomain 的原始返回 */
interface PartnerDomainRow {
  host: string;
  kind: string;
  status: string;
  verified_at?: number;
}

function toTenantDomain(d: PartnerDomainRow): TenantDomain {
  const kind: TenantDomain['kind'] = d.kind === 'alias' ? 'alias' : 'primary';
  const status: TenantDomain['status'] =
    d.status === 'active' ? 'active' : d.status === 'pending' ? 'pending' : 'error';
  return { host: d.host, kind, status, verified_at: d.verified_at };
}

/**
 * 重新检测某个域名的解析状态。
 *
 * 只在「域名已在主平台绑定」的前提下有意义——这里不能新增或删除域名。
 * 后端不做 DNS 解析：伙伴后端多半跑在内网，它解析出来的结果不代表用户
 * 浏览器的真实访问路径，拿它下结论反而会误报。这里校验的是「这个域名是不是
 * 当前商户绑定的那个」，生效与否看平台侧的站点访问记录。
 */
export async function recheckDealerDomain(host: string): Promise<TenantDomain> {
  if (USE_MOCK) {
    await delay(null, 900);
    const idx = mockBrand.domains.findIndex((d) => d.host === host);
    if (idx < 0) throw new Error('域名未绑定，请联系平台');
    const next: TenantDomain = {
      ...mockBrand.domains[idx],
      status: 'active',
      verified_at: Math.floor(Date.now() / 1000),
    };
    mockBrand.domains[idx] = next;
    return next;
  }
  const res = await request<PartnerDomainRow>({
    url: fillPath(EP.dealer.brandDomainCheck, { host }),
    method: 'POST',
  });
  return toTenantDomain(res);
}

// ── 品牌图片上传 ─────────────────────────────────────────────
/** 品牌图允许的类型与大小，必须与后端 partner_brand_upload.go 的规则一致 */
export const BRAND_IMAGE_MAX_BYTES = 512 * 1024;
export const BRAND_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;

/**
 * 上传落点。
 *
 * support_qr 是客服二维码：它不落独立列，而是写进 brand_support 这个 jsonb
 * 的 qr_code_url 键（见后端 partner_brand_upload.go 的 mergeSupportQR）。
 * 对前端来说上传行为完全一样，只是后端写的位置不同。
 */
export type BrandImageTarget = 'logo_url' | 'favicon_url' | 'support_qr';

export interface BrandImageUploadOptions {
  /** 上传进度回调（0-100） */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * 上传品牌图片并写回配置。
 *
 * 只有一次请求：把文件 multipart 提交给伙伴后端，后端写进对象存储后
 * 直接把地址落到 logo_url / favicon_url 并返回最新品牌。
 *
 * 为什么不是浏览器直传对象存储：那个 bucket 没开 CORS，跨域 PUT 会在预检
 * 阶段被拦（AccessDenied: CORS is not enabled for this bucket），
 * 前端没有任何办法绕过 —— 这是 bucket 侧配置，不是代码能解决的。
 * 中转的代价是图片流量过一遍后端，但品牌图上限 512KB、只在改 logo 时传一次，
 * 这个量级不构成压力。
 *
 * 上传进度走 axios 的 onUploadProgress（底层仍是 XHR 的 progress 事件）。
 * 不用 fetch 的原因就是它拿不到请求体上传进度，用户传图时看不到动静会反复点。
 */
export async function uploadBrandImage(
  file: File,
  target: BrandImageTarget,
  options: BrandImageUploadOptions = {},
): Promise<TenantBrand> {
  const contentType = normalizeBrandImageType(file);
  if (!contentType) {
    throw new Error('只支持 PNG、JPEG、WEBP 或 SVG 图片');
  }
  if (file.size > BRAND_IMAGE_MAX_BYTES) {
    throw new Error('图片超过 512KB，建议压缩后再上传');
  }

  if (USE_MOCK) {
    // mock 模式不真的上传，只更新内存态，让界面流程可以走通
    await delay(null, 600);
    const objectUrl = URL.createObjectURL(file);
    if (target === 'support_qr') {
      // 二维码在真实后端是写进 support 里的一个键，mock 要跟这个结构一致，
      // 否则界面读 previewBrand.support.qr_code_url 时拿不到值
      mockBrand = {
        ...mockBrand,
        support: { ...mockBrand.support, qr_code_url: objectUrl },
      };
    } else {
      mockBrand = { ...mockBrand, [target]: objectUrl };
    }
    return mockBrand;
  }

  const form = new FormData();
  form.append('target', target);
  form.append('file', file, file.name || 'logo.' + (contentType.split('/')[1] || 'png'));

  const res = await request<PartnerBrandRes>({
    url: EP.dealer.brandUpload,
    method: 'POST',
    data: form,
    /*
     * 必须显式删掉全局默认的 application/json。
     *
     * http 实例上设了 'Content-Type': 'application/json'，如果原样带上去，
     * 浏览器不会自动补 multipart 的 boundary，后端 FormFile 会解析失败并
     * 返回一个看不出原因的 400。设为 undefined 让 XHR 自己带 boundary。
     */
    headers: { 'Content-Type': undefined },
    ...(options.onProgress || options.signal
      ? {
          onUploadProgress: (event: { loaded: number; total?: number }) => {
            if (!options.onProgress) return;
            if (!event.total) return;
            options.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
          },
          signal: options.signal,
        }
      : {}),
  });
  return toTenantBrand(res);
}

/**
 * 定出文件的实际类型。
 *
 * 不能只看 file.type：部分系统（尤其是从压缩包解出来、或用脚本构造的 File）
 * 拿到的 type 是空串。这时按扩展名兜底，好过把一个合法 logo 直接判成非法。
 * 后端也做同样的兜底，两处判断保持一致，避免前后端各拒一半。
 */
function normalizeBrandImageType(file: File): string | null {
  const declared = (file.type || '').toLowerCase().split(';')[0].trim();
  if ((BRAND_IMAGE_TYPES as readonly string[]).includes(declared)) return declared;
  if (declared) return null;

  const ext = (file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return null;
  }
}
