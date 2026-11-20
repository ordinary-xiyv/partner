/**
 * 经销商后台 API。
 *
 * 每个方法都写成「mock 分支 + 真实请求分支」：
 *  - `USE_MOCK=true` 时返回本地假数据，页面可直接开发调试；
 *  - 联调阶段把 .env 的 VITE_USE_MOCK 改成 false，请求就会打到 EP.dealer.* 定义的真实路径。
 *
 * 页面只依赖本文件导出的方法签名，不关心底层是 mock 还是真实接口。
 */

import { EP } from './endpoints';
import { fillPath, request, USE_MOCK, type ListResult } from './http';
import { QUOTA_PER_UNIT } from '../utils/format';
import type { TenantBrand, TenantBrandUpdatePayload, TenantDomain } from '../types/tenant';
import type {
  Customer,
  CustomerCreatePayload,
  DealerProfile,
  OverviewStats,
  UsageLog,
  UsageSummary,
} from '../types/dealer';
import {
  mockCreateCustomer,
  mockCustomers,
  mockDealerProfile,
  mockOverview,
  mockUsageLogs,
  mockUsageSummary,
} from './mock/seed';
import { mockTenants, persistMockTenant, updateMockTenant } from './mock/tenant';

/** mock 延迟，模拟真实网络，便于验证 loading 态 */
function delay<T>(data: T, ms = 260): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

/** 内存态：mock 模式下允许增删改，页面操作立刻生效 */
const memCustomers: Customer[] = [...mockCustomers];
/** 品牌配置的内存态：mock 下保存后立刻生效，刷新页面仍是新值（同一会话内） */
let memBrand: TenantBrand = { ...mockTenants[0] };

// ── 认证 ─────────────────────────────────────────────────────
/**
 * 登录入参。
 *
 * 注意字段名和原来不一样：partner/backend 要的是 `merchant_code`（商户编码），
 * 不是 `username`。这不是随便改名——伙伴后台登录的是一张「商户」记录
 * （lc_distribution_merchants），不是 users 表里的某个账号。
 *
 * 为了不让页面代码跟着改，这里同时接受两个名字：页面照旧传 username，
 * 由 login() 统一映射成 merchant_code。等页面迁到自己传 merchant_code 后
 * 可以把这个兼容去掉。
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
 * 伙伴后端 GET /api/partner/me 的原始返回。
 * 字段比 DealerProfile 少得多——只有身份，没有佣金/折扣这些业务数据。
 */
interface PartnerMe {
  merchant_id: number;
  merchant_name: string;
  merchant_code: string;
  password_change_required: boolean;
}

/**
 * 把伙伴身份转成页面期望的 DealerProfile。
 *
 * 为什么必须转换而不是直接返回：页面里到处在用 profile.display_name、
 * profile.level、profile.discount_rate 这些字段，而伙伴后端一个都不返回。
 * 直接返回会让页面显示空白，甚至因为 undefined 参与计算出现 NaN。
 *
 * 缺失字段的处理原则：能给出「安全的默认值」就给，给不出就明确置 0，
 * 不要在类型上假装有数据。特别是佣金类字段全填 0 —— 这些数字后端确实没有，
 * 显示 0 比编一个数出来诚实。
 */
function toDealerProfile(me: PartnerMe): DealerProfile {
  return {
    id: me.merchant_id,
    user_id: me.merchant_id,
    username: me.merchant_code,
    display_name: me.merchant_name || me.merchant_code,
    // 伙伴体系没有等级概念，按最高档展示避免界面出现「银牌」这种误导性标签
    level: 'diamond',
    // 1.0 = 无折扣。真实折扣在 lc_distribution_merchants 没有对应列，
    // 不能凭空编一个比例出来，否则经销商看到的折扣价和实际计费不一致。
    discount_rate: 1,
    commission_rate: 0,
    status: 1,
    total_commission: 0,
    pending_payout: 0,
    settled_payout: 0,
    balance: 0,
    sub_user_count: 0,
    created_at: 0,
  };
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  if (USE_MOCK) {
    await delay(null, 500);
    if (!payload.username || !payload.password) {
      throw new Error('请输入账号和密码');
    }
    return { token: 'mock-dealer-token', profile: mockDealerProfile };
  }
  const merchantCode = (payload.merchant_code ?? payload.username ?? '').trim();
  if (!merchantCode || !payload.password) {
    throw new Error('请输入商户编码和密码');
  }
  const me = await request<PartnerMe>({
    url: EP.dealer.login,
    method: 'POST',
    data: { merchant_code: merchantCode, password: payload.password },
  });
  /*
   * 登录接口本身就是「凭证已生效」的证据：后端在响应里种了 session cookie。
   * 这里不需要再像以前那样存 Bearer token，只要留一个标记，
   * 让 createAuthContext 知道「该去拉 profile 了」。
   */
  return { token: 'cookie-session', profile: toDealerProfile(me) };
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
   * 字段名也要转：后端要 current_password，页面传的是 old_password。
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

// ── 概览 ─────────────────────────────────────────────────────
/**
 * 概览汇总。
 *
 * 后端没有 /overview 这个接口，所以这里用三个真实接口自己拼：
 *   users        → 客户数
 *   daily-trend  → 今日/本月消耗与请求数
 *   billing      → 账单口径的消耗（备用）
 *
 * 佣金相关的两个字段后端没有来源，填 0。这不是偷懒：
 * lc_distribution_merchants 里没有佣金率字段，凭空算一个数字出来，
 * 经销商拿着它去对账只会更困惑。
 */
export async function fetchOverview(): Promise<OverviewStats> {
  if (USE_MOCK) return delay(mockOverview);

  const [users, trend] = await Promise.all([
    request<{ items: unknown[]; total: number }>({
      url: EP.dealer.customers,
      params: { page: 1, page_size: 1 },
    }),
    request<{ items: Array<{ summary_date: string; quota: number; request_count: number }> }>({
      url: EP.dealer.overviewTrend,
    }),
  ]);

  const days = trend?.items ?? [];
  // 趋势是「14 个已完成日」，最后一个就是昨天；今日数字要从日汇总里没有，
  // 所以今日口径留 0 并让页面显示为「—」，比显示一个假数字好。
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthDays = days.filter((d) => d.summary_date?.startsWith(monthPrefix));
  const monthQuota = monthDays.reduce((sum, d) => sum + (d.quota || 0), 0);
  const monthRequests = monthDays.reduce((sum, d) => sum + (d.request_count || 0), 0);

  return {
    customer_count: users?.total ?? 0,
    new_customer_count: 0,
    today_quota: 0,
    month_quota: monthQuota,
    month_commission: 0,
    pending_commission: 0,
    today_requests: 0,
  };
}

export async function fetchOverviewTrend(): Promise<UsageSummary['daily']> {
  if (USE_MOCK) return delay(mockUsageSummary.daily);
  /*
   * 后端返回 { items: [{ summary_date, quota, request_count, ... }] }，
   * 页面要的是 [{ date, quota, requests }]。字段名必须转，否则图表全是 undefined。
   */
  const res = await request<{
    items: Array<{ summary_date: string; quota: number; request_count: number }>;
  }>({ url: EP.dealer.overviewTrend });
  return (res?.items ?? []).map((d) => ({
    date: d.summary_date,
    quota: d.quota || 0,
    requests: d.request_count || 0,
  }));
}

// ── 客户管理 ─────────────────────────────────────────────────
export interface CustomerQuery {
  page?: number;
  page_size?: number;
  /** 搜索：用户名 / 显示名 / 邮箱 */
  keyword?: string;
  status?: 0 | 1 | 2;
}

/**
 * 伙伴后端 GET /api/partner/users 的原始返回行。
 *
 * 与页面的 Customer 差异很大：没有 quota / used_quota / request_count /
 * discount_rate 这些业务字段——后端这个接口只做「商户名下的用户清单」，
 * 不带用量。所以下面的映射只填真有的，其余置 0。
 */
interface PartnerUserRow {
  id: number;
  username: string;
  display_name: string;
  email: string;
  phone?: string;
  status: number;
  created_time?: string;
}

function toCustomer(u: PartnerUserRow): Customer {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name || u.username,
    email: u.email || '',
    phone: u.phone,
    /*
     * 状态语义不同：伙伴后端是 1 启用 / 2 禁用，页面 Customer 也是 1/2，
     * 这一项刚好一致，但仍要兜底非法值——直接透传会让页面按「未知状态」渲染。
     */
    status: u.status === 2 ? 2 : 1,
    // 下面四项后端 users 接口不返回，置 0 而不是编造。
    // 页面会显示「—」或 0，配合 UseMockNotice 外的空态提示可以解释清楚。
    quota: 0,
    used_quota: 0,
    request_count: 0,
    discount_rate: 1,
    last_active_at: 0,
    created_at: u.created_time ? Math.floor(new Date(u.created_time).getTime() / 1000) : 0,
  };
}

export async function fetchCustomers(query: CustomerQuery = {}): Promise<ListResult<Customer>> {
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
    if (status) filtered = filtered.filter((c) => c.status === status);
    const start = (page - 1) * page_size;
    return delay({ items: filtered.slice(start, start + page_size), total: filtered.length });
  }

  /*
   * 参数名要对上后端：它认 page / page_size / keyword。
   * 状态筛选后端不支持（PartnerUserFilter 没有 status 参数），
   * 所以这里不发 status，避免发过去被忽略却让人以为生效了。
   */
  const res = await request<{
    items: PartnerUserRow[];
    total: number;
  }>({
    url: EP.dealer.customers,
    params: {
      page: query.page ?? 1,
      page_size: query.page_size ?? 10,
      ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
    },
  });
  return {
    items: (res?.items ?? []).map(toCustomer),
    total: res?.total ?? 0,
  };
}

export async function createCustomer(payload: CustomerCreatePayload): Promise<Customer> {
  if (USE_MOCK) {
    const created = mockCreateCustomer(payload);
    memCustomers.unshift(created);
    return delay(created, 480);
  }
  return request<Customer>({ url: EP.dealer.customers, method: 'POST', data: payload });
}

export async function updateCustomer(
  id: number,
  payload: Partial<Pick<Customer, 'display_name' | 'email' | 'phone' | 'remark' | 'discount_rate'>>,
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
    const next = payload.set ?? cur.quota + (payload.delta || 0);
    memCustomers[idx] = { ...cur, quota: Math.max(0, next) };
    return delay({ quota: memCustomers[idx].quota }, 420);
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
  status?: '' | 'success' | 'error';
}

/**
 * 伙伴后端 GET /api/partner/logs 的原始返回行。
 * 注意它给的客户字段叫 user_id / username，页面 UsageLog 叫 customer_id / customer_name。
 */
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
}

function toUsageLog(r: PartnerLogRow): UsageLog {
  return {
    id: r.id,
    customer_id: r.user_id,
    customer_name: r.username || '',
    model_name: r.model_name,
    prompt_tokens: r.prompt_tokens || 0,
    completion_tokens: r.completion_tokens || 0,
    quota: r.quota || 0,
    use_time: r.use_time || 0,
    stream: Boolean(r.is_stream),
    /*
     * 后端没有独立的 status 字段，但 type 隐含成败：
     * 在 one-api 系的数据模型里 type=2 表示消费成功，type=5 是错误。
     * 这里只把 5 判成 error，其余都按 success —— 宁可把失败记成成功
     * 也不要把成功记成失败，后者会让经销商以为自己客户全在用不起来。
     */
    status: r.type === 5 ? 'error' : 'success',
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
      status,
    } = query;
    let filtered = mockUsageLogs;
    if (customer_id) filtered = filtered.filter((l) => l.customer_id === customer_id);
    if (model_name) filtered = filtered.filter((l) => l.model_name === model_name);
    if (status) filtered = filtered.filter((l) => l.status === status);
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
   *
   * 特别注意：后端在「既没给时间范围、也没给 all_history=1」时会**默认只看今天**。
   * 而页面的 Usage 页原本的语义是「不带时间条件 = 看全部」。
   * 不加 all_history=1 的话，用户清空时间筛选后会以为数据丢了。
   * 所以这里在没传时间时显式带 all_history=1。
   */
  const hasTimeRange = Boolean(query.start_time || query.end_time);
  const res = await request<{
    items: PartnerLogRow[];
    total: number;
  }>({
    url: EP.dealer.usage,
    params: {
      page: query.page ?? 1,
      page_size: query.page_size ?? 10,
      ...(query.customer_id ? { user_id: query.customer_id } : {}),
      ...(query.model_name ? { model_name: query.model_name } : {}),
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
 * 汇总必须跟着筛选条件走。
 * 之前这里直接 `return delay(mockUsageSummary)`，无论怎么筛都返回全量汇总，
 * 于是页面上会出现「筛选范围总消耗 ¥29」，而表格里只有 180 条抽样、
 * 图表却是整月数据 —— 三个数字三套口径，用户无法核对。
 *
 * 现在唯一数据源是 mockUsageLogs：明细先过滤，再据过滤后的明细聚合汇总。
 */
export async function fetchUsageSummary(query: UsageQuery = {}): Promise<UsageSummary> {
  if (USE_MOCK) {
    const { customer_id, model_name, start_time, end_time, status } = query;
    let filtered = mockUsageLogs;
    if (customer_id) filtered = filtered.filter((l) => l.customer_id === customer_id);
    if (model_name) filtered = filtered.filter((l) => l.model_name === model_name);
    if (status) filtered = filtered.filter((l) => l.status === status);
    if (start_time) filtered = filtered.filter((l) => l.created_at >= start_time);
    if (end_time) filtered = filtered.filter((l) => l.created_at <= end_time);

    const sumQuota = filtered.reduce((s, l) => s + l.quota, 0);

    // 按天聚合（图表）：从明细真实汇总，不另算魔数
    const byDay = new Map<string, { quota: number; requests: number }>();
    for (const l of filtered) {
      const key = new Date(l.created_at * 1000).toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { quota: 0, requests: 0 };
      cur.quota += l.quota;
      cur.requests += 1;
      byDay.set(key, cur);
    }
    const daily = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, quota: v.quota, requests: v.requests }));

    // 按模型聚合（占比图）
    const byModel = new Map<string, { quota: number; requests: number }>();
    for (const l of filtered) {
      const cur = byModel.get(l.model_name) ?? { quota: 0, requests: 0 };
      cur.quota += l.quota;
      cur.requests += 1;
      byModel.set(l.model_name, cur);
    }
    const by_model = [...byModel.entries()]
      .map(([model_name, v]) => ({ model_name, quota: v.quota, requests: v.requests }))
      .sort((a, b) => b.quota - a.quota);

    // 按客户聚合（TOP8）
    const byCust = new Map<number, { name: string; quota: number; requests: number }>();
    for (const l of filtered) {
      const cur = byCust.get(l.customer_id) ?? { name: l.customer_name, quota: 0, requests: 0 };
      cur.quota += l.quota;
      cur.requests += 1;
      byCust.set(l.customer_id, cur);
    }
    const by_customer = [...byCust.entries()]
      .map(([customer_id, v]) => ({
        customer_id,
        customer_name: v.name,
        quota: v.quota,
        requests: v.requests,
      }))
      .sort((a, b) => b.quota - a.quota)
      .slice(0, 8);

    return delay(
      {
        total_quota: sumQuota,
        total_requests: filtered.length,
        total_tokens: filtered.reduce((s, l) => s + l.prompt_tokens + l.completion_tokens, 0),
        daily,
        by_model,
        by_customer,
      },
      220,
    );
  }
  return request<UsageSummary>({ url: EP.dealer.usageSummary, params: query });
}

/**
 * 筛选器用的模型名列表（去重）。
 *
 * 原本取自定价接口，但定价页已下线、后端也没有独立的模型目录接口。
 * 现在改为从日志里取最近一批出现过的模型名——筛选器要的是
 * 「这个经销商实际用过哪些模型」，日志本来就是唯一权威来源。
 *
 * 只取一页（后端 page_size 上限 100）：足够覆盖常用模型，
 * 且不会为了填一个下拉框去翻几十页日志。
 */
export async function fetchModelNames(): Promise<string[]> {
  if (USE_MOCK) return delay([...new Set(mockUsageLogs.map((l) => l.model_name))].sort(), 180);
  const res = await request<{ items: PartnerLogRow[]; total: number }>({
    url: EP.dealer.usage,
    params: { page: 1, page_size: 100, all_history: 1 },
  }, { silent: true });
  return [...new Set((res?.items ?? []).map((r) => r.model_name).filter(Boolean))].sort();
}

/** 导出用量（返回 CSV 文本；真实接口改为拿文件流） */
export async function exportUsage(query: UsageQuery = {}): Promise<Blob> {
  if (USE_MOCK) {
    const header = '时间,客户,模型,输入tokens,输出tokens,消耗额度,耗时(ms),状态\n';
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
  const res = await request<Blob>({
    url: EP.dealer.usageExport,
    params: query,
    responseType: 'blob',
  });
  return res;
}

// ── 品牌白标 ─────────────────────────────────────────────────
/**
 * 经销商自己的品牌配置（logo / 品牌名 / 主色 / 页面标题 / favicon / 客服）。
 *
 * 注意域名不在可写范围内：域名绑定在主平台配置，这里只读。
 * 这里改的是「他的客户看到什么样」，改不了「谁能看到谁的数据」。
 */
/**
 * 伙伴后端 GET/PUT /api/partner/brand 的原始返回（见 internal-admin/
 * distributormerchant/partner_brand.go 的 PartnerBrand）。
 *
 * 与前端 TenantBrand 的差异：
 *  - 它没有 dealer_id / slug / domains 数组，而是给 site_id + site_domain 两个标量
 *  - 客服配置在 support 里，landing 是原样透传的 map
 * 所以下面必须做一次转换，否则页面读 brand.domains.length 会直接报错。
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
    support: (b.support as TenantBrand['support']) || undefined,
    landing: (b.landing as TenantBrand['landing']) || undefined,
    /*
     * 域名：后端只给一个 site_domain（表上唯一约束，一商户一域名）。
     * 包装成一元数组，让页面的「域名列表」照旧能渲染。
     * 没绑域名时给空数组，页面会显示「未绑定」而不是崩掉。
     */
    domains: b.site_domain
      ? [{ host: b.site_domain, kind: 'primary' as const, status: 'active' as const }]
      : [],
  };
}

export async function fetchDealerBrand(): Promise<TenantBrand> {
  if (USE_MOCK) return delay(memBrand, 200);
  const res = await request<PartnerBrandRes>({ url: EP.dealer.brand });
  return toTenantBrand(res);
}

export async function updateDealerBrand(payload: TenantBrandUpdatePayload): Promise<TenantBrand> {
  if (USE_MOCK) {
    /*
     * 顶层浅合并 + support / landing 显式覆盖。
     *
     * 为什么 support 和 landing 不跟着浅合并走：
     * 这两个是嵌套对象，浅合并的语义是「你传的整个对象替换掉旧的」，
     * 但调用方可能只传了 support.email（想只改邮箱），
     * 直接替换会把 phone / wechat 全抹掉。
     * 经销商在「品牌设置」里保存时是把整个 support 一起提交的，
     * 所以这里先展开旧的再叠新的，两种情况都不会丢字段。
     *
     * landing 则相反：卖点列表是整体编辑的，必须整体替换，
     * 否则「删掉第 4 条卖点」会在下次保存时复活。
     */
    memBrand = {
      ...memBrand,
      ...payload,
      support: payload.support ? { ...memBrand.support, ...payload.support } : memBrand.support,
      landing: payload.landing !== undefined ? payload.landing : memBrand.landing,
    };
    // 品牌名改了但没单独设 short_name，首字要跟着变，否则 logo 还留着旧首字
    if (payload.name && !payload.short_name) {
      memBrand.short_name = payload.name.trim().slice(0, 1);
    }
    /*
     * 写回 user 端解析用的那份数据，并持久化到 localStorage。
     *
     * 不做这一步的话，admin 保存成功、前台纹丝不动 ——
     * 两份内存（dealer.ts 的 memBrand / mock/tenant.ts 的 mockTenants）互不相干。
     * 真实环境两端打同一个后端，不存在这问题；
     * 这里只是让本地联调也能看到"改完就生效"。
     */
    updateMockTenant(memBrand);
    persistMockTenant();
    return delay(memBrand, 420);
  }
  /*
   * 后端 PUT 返回的是更新后的完整品牌对象，直接复用同一套转换。
   * 注意不能像以前那样把返回值直接赋给 memBrand —— memBrand 是 mock 内存态，
   * 真实模式下写它是无意义的，反而会让下次 mock 分支读到脏数据。
   */
  const res = await request<PartnerBrandRes>({
    url: EP.dealer.brand,
    method: 'PUT',
    data: payload,
  });
  return toTenantBrand(res);
}

/**
 * 我的域名（只读）。域名解析状态由主平台检测，经销商端只展示。
 *
 * 伙伴后端没有独立的 /brand/domains 接口，域名信息在 /brand 的
 * site_domain 字段里。所以这里复用 fetchDealerBrand 再取 domains，
 * 避免为了一个域名多起一个前端请求。
 */
export async function fetchDealerDomains(): Promise<TenantDomain[]> {
  if (USE_MOCK) return delay(memBrand.domains, 180);
  const brand = await fetchDealerBrand();
  return brand.domains;
}

/**
 * 重新检测某个域名的解析状态。
 * 只在「域名已在主平台绑定」的前提下有意义——这里不能新增或删除域名。
 */
export async function recheckDealerDomain(host: string): Promise<TenantDomain> {
  if (USE_MOCK) {
    await delay(null, 900);
    const idx = memBrand.domains.findIndex((d) => d.host === host);
    if (idx < 0) throw new Error('域名未绑定，请联系平台');
    // 演示：待解析的域名检测一次就变成已生效
    const next: TenantDomain = {
      ...memBrand.domains[idx],
      status: 'active',
      verified_at: Math.floor(Date.now() / 1000),
    };
    memBrand.domains[idx] = next;
    return next;
  }
  return request<TenantDomain>({
    url: fillPath(EP.dealer.brandDomainCheck, { host }),
    method: 'POST',
  });
}
