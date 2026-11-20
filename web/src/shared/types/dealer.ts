/** 经销商后台的领域模型。字段名对齐 lynxtonapi 的 lc_agents / lc_commission_records 等表。 */

export type AgentLevel = 'silver' | 'gold' | 'diamond';

export interface DealerProfile {
  id: number;
  user_id: number;
  username: string;
  display_name: string;
  level: AgentLevel;
  /** 折扣比例，1.0 = 无折扣；0.85 = 客户按 85% 计价 */
  discount_rate: number;
  /** 佣金比例 */
  commission_rate: number;
  status: 1 | 2;
  /** 累计佣金 */
  total_commission: number;
  /** 待结算 */
  pending_payout: number;
  /** 已结算 */
  settled_payout: number;
  /** 可划拨余额（本期占位，后端确认后启用） */
  balance: number;
  sub_user_count: number;
  created_at: number;
}

/** 经销商名下的终端客户 */
export interface Customer {
  id: number;
  username: string;
  display_name: string;
  email: string;
  phone?: string;
  /** 1 正常 / 2 禁用 */
  status: 1 | 2;
  /** 剩余额度 */
  quota: number;
  /** 已用额度 */
  used_quota: number;
  /** 请求次数 */
  request_count: number;
  /** 该客户的专属折扣（继承经销商折扣，可单独覆盖） */
  discount_rate: number;
  /** 最近一次调用时间（秒级时间戳，0 = 从未调用） */
  last_active_at: number;
  created_at: number;
  remark?: string;
}

export interface CustomerCreatePayload {
  username: string;
  display_name: string;
  password: string;
  email?: string;
  phone?: string;
  /** 初始额度，0 表示不赠送 */
  init_quota?: number;
  discount_rate?: number;
  remark?: string;
}

/** 用量日志（客户维度） */
export interface UsageLog {
  id: number;
  customer_id: number;
  customer_name: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  /** 本次消耗额度 */
  quota: number;
  /** 耗时毫秒 */
  use_time: number;
  /** 是否流式 */
  stream: boolean;
  /** 状态：success / error */
  status: 'success' | 'error';
  created_at: number;
}

export interface UsageSummary {
  total_quota: number;
  total_requests: number;
  total_tokens: number;
  /** 按天的消耗趋势 */
  daily: Array<{ date: string; quota: number; requests: number }>;
  /** 按模型的消耗分布 */
  by_model: Array<{ model_name: string; quota: number; requests: number }>;
  /** 按客户的消耗排行 */
  by_customer: Array<{ customer_id: number; customer_name: string; quota: number; requests: number }>;
}

export interface OverviewStats {
  /** 客户总数 */
  customer_count: number;
  /** 本月新增客户 */
  new_customer_count: number;
  /** 今日消耗额度 */
  today_quota: number;
  /** 本月消耗额度 */
  month_quota: number;
  /** 本月佣金 */
  month_commission: number;
  /** 待结算佣金 */
  pending_commission: number;
  /** 今日请求数 */
  today_requests: number;
}
