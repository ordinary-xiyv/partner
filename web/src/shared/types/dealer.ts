/**
 * 伙伴后台的领域模型 —— 严格对齐 partner/backend 的真实返回。
 *
 * 设计原则（重要，改这个文件前先读）：
 *   后端没有的字段，类型里就不要有。
 *   上一版这里留着 level / commission_rate / total_commission / balance 等字段，
 *   后端 /me 一个都不返回，于是 dealer.ts 只能把它们硬编码成 'diamond' / 0
 *   才能让 TypeScript 通过 —— 结果页面显示「钻石代理」「累计佣金 ¥0.00」，
 *   每个看到的人都会以为这是真实经营数据。宁可界面上少一块，也不要显示假数字。
 *
 * 真实来源见 backend/main.go 与 backend/internal/partner/*.go。
 */

/**
 * GET /api/partner/me 与 POST /api/partner/login 的 data。
 * 后端 partnerInfo() 只返回 4 个字段，这里不多不少。
 */
export interface DealerProfile {
  /** merchant_id */
  id: number;
  /** merchant_code —— 伙伴登录用的商户编码，不是 users 表的 username */
  merchant_code: string;
  /** merchant_name */
  display_name: string;
  /**
   * 初始密码未改时为 true。
   * 此时 /users /logs /daily-trend /billing/summary 全部返回 403，
   * 前端必须先把人拦到改密页，否则登录后每个页面都是空的。
   */
  password_change_required: boolean;
}

/**
 * 客户行。
 *
 * 基础字段来自 GET /api/partner/users。
 *
 * used_quota / request_count / used_amount_cny 三个是可选字段，来源有两代：
 *   · 新后端：/users 直接用 LEFT JOIN 聚合 logs 一起返回（partner_users.go）
 *   · 老后端：只能由「我的客户」页额外拉 billing/summary 再合并
 *
 * 为什么做成可选而不是必填 0：
 *   必填 0 会让表格把「后端没给」渲染成「这个客户消耗了 0 元」，
 *   两者在业务上完全不同。可选 + 「—」才能说清「这个数字我们不知道」。
 */
export interface Customer {
  id: number;
  username: string;
  display_name: string;
  email: string;
  /** 后端已脱敏：138****8888 */
  phone?: string;
  /** 1 正常 / 2 禁用 */
  status: 1 | 2;
  /** 秒级时间戳，0 表示后端没给 */
  created_at: number;

  /** ↓ 本月用量，由后端 JOIN logs 聚合；没有数据时是整个键缺失，不是 0 */
  /** 净消耗额度 = 消费 + 预扣 + 补扣 − 退款 */
  used_quota?: number;
  used_amount_cny?: number;
  request_count?: number;
}

/**
 * 「我的客户」可排的列。
 *
 * 键名与后端 partnerUserSortColumns 白名单一一对应，改名必须两边一起改 ——
 * 后端白名单是全库排序的唯一入口，键名对不上会静默回落成按 id 排序。
 *
 * 为什么必须有这个类型而不是随便传 string：
 *   排序列是拼进 ORDER BY 的，后端只能靠白名单校验。前端这一侧同样约束住，
 *   才能在改列名时让编译器报错，而不是等上线后发现排序悄悄失效。
 */
export type CustomerSortKey =
  | 'id'
  | 'created_at'
  | 'used_quota'
  | 'used_amount_cny'
  | 'request_count';

/**
 * 新建客户入参。
 *
 * 注意：partner/backend 目前只有 GET /users，没有 POST /users。
 * 这个类型先留着是为了「等后端补上就能直接连通」，不是因为它现在能用。
 */
export interface CustomerCreatePayload {
  username: string;
  display_name: string;
  password: string;
  email?: string;
  phone?: string;
  init_quota?: number;
  remark?: string;
}

/**
 * 用量日志（客户维度）。
 *
 * 字段严格对应后端 PartnerLog：后端没有 status 字段，只有 type；
 * 下面这个 status 是 type 的语义化结果，见 dealer.ts 的 toUsageLog()。
 */
export interface UsageLog {
  id: number;
  customer_id: number;
  customer_name: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  /** 缓存命中 token（后端给，之前前端漏了） */
  cache_read: number;
  /**
   * 本次额度变动，直接透传后端 logs.quota。
   *
   * 注意：退款(type=6) 在库里也是**正数**，冲销由后端 billing 用
   * `-logs.quota` 完成。要展示「退回」语义须看 type，不能靠 quota 的正负判断。
   */
  quota: number;
  /** 后端算好的金额，和 quota/500000 同源，直接用不必再算 */
  amount_cny: number;
  /** 耗时毫秒 */
  use_time: number;
  stream: boolean;
  /**
   * 语义化后的结果：
   *   success —— type 2 消费（正常调用）
   *   error   —— type 5 错误
   *   refund  —— type 6 退款
   *   pre     —— type 7 预扣
   *   adjust  —— type 8 补扣
   * 上一版把 6/7/8 全并进 success，会让「成功请求数」虚高。
   */
  status: 'success' | 'error' | 'refund' | 'pre' | 'adjust';
  /** 后端原始 type 值，需要精确判断时用它 */
  type: number;
  created_at: number;
}

/**
 * 统计汇总。
 *
 * 全部来自 GET /api/partner/billing/summary（默认本月 1 号到今天）：
 *   total_users / total_requests / total_quota / total_amount_cny
 *
 * 上一版的 by_model / by_customer / daily 三个拆分后端没有任何接口提供，
 * 是前端自己编的聚合口径，已删除。要恢复「模型分布」必须先让后端加接口。
 */
export interface UsageSummary {
  start_date: string;
  end_date: string;
  /** 区间内有消耗的客户数 */
  total_users: number;
  total_requests: number;
  /** 净消耗额度 */
  total_quota: number;
  total_amount_cny: number;
  quota_per_unit: number;
}

/** 趋势图的一个点，来自 GET /api/partner/daily-trend（固定 14 个已完成日，不含今天） */
export interface TrendPoint {
  summary_date: string;
  prompt_tokens: number;
  completion_tokens: number;
  request_count: number;
  quota: number;
  amount_cny: number;
}

/**
 * 概览页指标。
 *
 * 只有四个来源都是真的，才能放进这个类型：
 *   customer_count        ← GET /users 的 total
 *   month_*               ← GET /billing/summary 的本月合计
 * 今日消耗、今日请求、佣金、本月新增客户这些后端都不提供，已从类型中移除。
 */
export interface OverviewStats {
  customer_count: number;
  /** 本月净消耗额度 */
  month_quota: number;
  /** 本月净消耗金额（元） */
  month_amount_cny: number;
  /** 本月请求数 */
  month_requests: number;
  /** 本月有消耗的客户数 */
  month_active_users: number;
  /** 账单统计区间，用于在界面上标明「这个数字是哪段日期的」 */
  start_date: string;
  end_date: string;
}
