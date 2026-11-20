/**
 * 假数据种子：只在 VITE_USE_MOCK=true 时使用。
 *
 * 生成原则（重要）：
 * 1. 数据按固定 seed 生成，非随机，保证每次刷新看到的内容一致，方便比对 UI。
 * 2. 所有金额先以「元」为口径设计，再按 QUOTA_PER_UNIT 折算成「额度」写入
 *    quota 类字段，避免单位混用导致的自相矛盾。
 * 3. 派生指标（概览、汇总）一律从明细数据 reduce 出来，不单独 hardcode 魔数。
 *
 * 规模设定（对齐一个运营约 9 个月的经销商）：
 *   累计客户消费 ≈ 155 万元 → 佣金率 12% → 累计佣金 ≈ 18.6 万元
 *   37 个客户，人均累计消费 ≈ 4.2 万元；月消耗 ≈ 15.3 万元
 */

import { QUOTA_PER_UNIT } from '../../utils/format';

/*
 * 类型来自 types/dealer —— 这份 seed 只服务伙伴后台保留下来的页面：
 * 概览、我的客户、用量明细、品牌设置、账号设置。
 */
import type {
  Customer,
  CustomerCreatePayload,
  DealerProfile,
  OverviewStats,
  UsageLog,
  UsageSummary,
} from '../../types/dealer';

const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);

/** 元 → 额度 */
const q = (cny: number): number => Math.round(cny * QUOTA_PER_UNIT);

/**
 * 稳定的伪随机：同一 seed 永远同一结果。
 * 用 mulberry32（32 位混洗）而不是线性同余：LCG 在小种子下首次输出会贴近 0，
 * 导致整列数据挤在区间下限（柱状图几乎等高）。
 */
function seeded(seed: number): () => number {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

// ── 模型目录（元 / 1M tokens，平台成本价）───────────────────────
// 日志消耗与模型分布共用这份单价，
// 保证「某次调用花多少钱」能按 token 数复算出来。
const MODEL_META: Record<
  string,
  { name: string; vendor: string; tags: string[]; in: number; out: number; ctx: number }
> = {
  'deepseek-v4-flash': { name: 'DeepSeek V4 Flash', vendor: 'DeepSeek', tags: ['文本', '高性价比'], in: 0.5, out: 2, ctx: 128000 },
  'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', vendor: 'DeepSeek', tags: ['文本', '推理'], in: 4, out: 16, ctx: 128000 },
  'gpt-4o': { name: 'GPT-4o', vendor: 'OpenAI', tags: ['文本', '视觉'], in: 18, out: 72, ctx: 128000 },
  'gpt-4o-mini': { name: 'GPT-4o mini', vendor: 'OpenAI', tags: ['文本', '轻量'], in: 1.1, out: 4.4, ctx: 128000 },
  'claude-sonnet-4.5': { name: 'Claude Sonnet 4.5', vendor: 'Anthropic', tags: ['文本', '长上下文'], in: 21, out: 105, ctx: 200000 },
  'claude-opus-4.1': { name: 'Claude Opus 4.1', vendor: 'Anthropic', tags: ['文本', '旗舰'], in: 108, out: 540, ctx: 200000 },
  'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', vendor: 'Google', tags: ['文本', '视觉'], in: 9, out: 36, ctx: 1000000 },
  'qwen3-max': { name: 'Qwen3 Max', vendor: '阿里云', tags: ['文本', '中文优化'], in: 6, out: 24, ctx: 128000 },
};

const MODEL_POOL = Object.keys(MODEL_META);

/** 按 token 用量与模型单价算出本次调用的实际花费（元） */
function costOf(model: string, promptTokens: number, completionTokens: number): number {
  const meta = MODEL_META[model] ?? MODEL_META['deepseek-v4-flash'];
  return (promptTokens / 1_000_000) * meta.in + (completionTokens / 1_000_000) * meta.out;
}

// ── 经销商自身 ────────────────────────────────────────────────
export const mockDealerProfile: DealerProfile = {
  id: 1024,
  user_id: 8801,
  username: 'dealer_demo',
  display_name: '示例经销商',
  level: 'gold',
  discount_rate: 0.82,
  commission_rate: 0.12,
  status: 1,
  total_commission: 186420.5,
  pending_payout: 0, // 占位，文件末尾按月消耗回填
  settled_payout: 0,
  balance: 52000,
  sub_user_count: 37,
  created_at: NOW - DAY * 286,
};

// ── 客户列表 ──────────────────────────────────────────────────
const CUSTOMER_NAMES = [
  '张伟', '李娜', '王芳', '刘洋', '陈静', '杨帆', '赵磊', '周敏',
  '吴强', '徐丽', '孙浩', '马超', '朱琳', '胡军', '郭涛', '林雪',
  '何平', '高远', '罗盛', '梁晨', '宋佳', '唐斌', '许诺', '邓超',
  '曹阳', '彭丽', '曾毅', '萧然', '田甜', '董浩', '袁泉', '潘越',
  '蒋雯', '蔡明', '余乐', '杜鹏', '叶青',
];

/**
 * 每客户累计消费（元）：4000 + rnd*76000 → 37 人合计约 155 万元，
 * 与「累计佣金 18.6 万 ÷ 12%」对得上。
 */
const CUSTOMER_SPEND_CNY: number[] = CUSTOMER_NAMES.map((_, i) => {
  const rnd = seeded(i * 977 + 13);
  return 4000 + rnd() * 76000;
});

// ── 时间与口径基准 ────────────────────────────────────────────
/**
 * 全站只保留一个时间维度：自然月。
 * 月消耗、月佣金都挂在同一个「当月订单额」上，
 * 否则会出现「月消耗 14 万、月佣金 1.98 万」（反算佣金率 14% 而非 12%）这类矛盾。
 */
const TOTAL_CUSTOMER_SPEND_CNY = CUSTOMER_SPEND_CNY.reduce((s, v) => s + v, 0);
const COMMISSION_MONTHS = 9; // 覆盖最近 9 个自然月
const COMMISSION_RATE = 0.12;

/**
 * 当月订单额要按「已过天数」折算 —— 月还没走完，不可能已经发生整月的消费。
 *
 * 各月权重归一化后分摊累计消费，当月权重按已过天数同比例缩小。
 * 只取当月那一份：历史月份的账单口径已经不在保留的页面里了。
 */
const MONTH_ELAPSED_RATIO = (() => {
  const now = new Date(NOW * 1000);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return now.getUTCDate() / daysInMonth;
})();

const monthWeights = Array.from({ length: COMMISSION_MONTHS }, (_, m) => {
  const rnd = seeded(m * 1471 + 53);
  const base = 0.85 + rnd() * 0.3;
  return m === 0 ? base * MONTH_ELAPSED_RATIO : base;
});
const monthWeightSum = monthWeights.reduce((a, b) => a + b, 0);

/** 当月（未走完）已发生的客户订单额，全站「本月消费」口径即此值 */
const MONTH_ORDER_CNY =
  Math.round((monthWeights[0] / monthWeightSum) * TOTAL_CUSTOMER_SPEND_CNY * 100) / 100;

export const mockCustomers: Customer[] = CUSTOMER_NAMES.map((name, i) => {
  const rnd = seeded(i * 977 + 13);
  const spentCny = CUSTOMER_SPEND_CNY[i];
  const status: 1 | 2 = i % 11 === 7 ? 2 : 1;
  const daysAgo = Math.floor(rnd() * 260) + 1;
  const balanceCny = 200 + rnd() * 5800; // 当前余额 200~6000 元
  return {
    id: 20001 + i,
    username: `cust_${String(i + 1).padStart(3, '0')}`,
    display_name: name,
    email: `customer${i + 1}@example.com`,
    phone: i % 3 === 0 ? undefined : `138${String(10000000 + i * 137).slice(0, 8)}`,
    status,
    quota: q(balanceCny),
    used_quota: q(spentCny),
    // 平均每次调用约 0.28 元
    request_count: Math.round(spentCny / 0.28),
    discount_rate: i % 5 === 0 ? 0.8 : 0.82,
    last_active_at: i % 9 === 3 ? 0 : NOW - Math.floor(rnd() * 6) * DAY - 3600,
    created_at: NOW - daysAgo * DAY,
    remark: i % 7 === 0 ? '重点客户，需要月度对账' : undefined,
  };
});

// ── 客户用量日志（最近 30 天的抽样，非全量）────────────────────
export const mockUsageLogs: UsageLog[] = Array.from({ length: 180 }, (_, i) => {
  const rnd = seeded(i * 3121 + 7);
  const cust = mockCustomers[Math.floor(rnd() * mockCustomers.length)];
  const model = pick(MODEL_POOL, rnd());
  const prompt = Math.floor(rnd() * 4200) + 60;
  const completion = Math.floor(rnd() * 2600) + 20;
  const failed = rnd() < 0.035;
  return {
    id: 900000 + i,
    customer_id: cust.id,
    customer_name: cust.display_name,
    model_name: model,
    prompt_tokens: prompt,
    completion_tokens: completion,
    // 按模型真实单价算，单次调用 ¥0.001~¥3 之间，符合实际体感
    quota: q(costOf(model, prompt, completion)),
    use_time: Math.floor(rnd() * 9000) + 240,
    stream: rnd() > 0.35,
    status: (failed ? 'error' : 'success') as 'error' | 'success',
    created_at: NOW - Math.floor(rnd() * 30) * DAY - Math.floor(rnd() * 86000),
  };
}).sort((a, b) => b.created_at - a.created_at);

// ── 用量汇总 ──────────────────────────────────────────────────
/**
 * 最近 14 天的每日客户消费，合计严格等于「当月订单额」口径下的 14 天份额。
 * 月消耗不另算 —— 直接取 MONTH_ORDER_CNY（当月订单额），
 * 这样「本月消耗 × 佣金率 = 本月佣金」在页面上能反算得回去。
 */
const DAILY_CNY = (() => {
  const weights = Array.from({ length: 14 }, (_, i) => {
    const rnd = seeded(i * 613 + 3);
    return 0.55 + rnd() * 1.0; // 区间拉开，柱子高低差才看得出来
  });
  const wsum = weights.reduce((a, b) => a + b, 0);
  const total = MONTH_ORDER_CNY * (14 / 30); // 14 天应占当月的一部分
  return weights.map((w) => Math.round((w / wsum) * total * 100) / 100);
})();

const MONTH_SPEND_CNY = MONTH_ORDER_CNY;

export const mockUsageSummary: UsageSummary = {
  // 筛选范围总量 = 表格里这 180 条明细的真实合计
  total_quota: mockUsageLogs.reduce((s, l) => s + l.quota, 0),
  total_requests: mockUsageLogs.length,
  total_tokens: mockUsageLogs.reduce((s, l) => s + l.prompt_tokens + l.completion_tokens, 0),
  daily: DAILY_CNY.map((cny, i) => {
    const rnd = seeded(i * 613 + 31);
    return {
      date: new Date((NOW - (13 - i) * DAY) * 1000).toISOString().slice(0, 10),
      quota: q(cny),
      requests: Math.round(cny / 0.28),
    };
  }),
  // 月消耗按模型拆分：旗舰模型单价高、调用少，轻量模型相反
  by_model: MODEL_POOL.map((m, i) => {
    const share = [0.06, 0.09, 0.21, 0.26, 0.15, 0.04, 0.11, 0.08][i] ?? 0.1;
    const rnd = seeded(i * 431 + 11);
    const cny = MONTH_SPEND_CNY * share * (0.9 + rnd() * 0.2);
    const avgCost = (MODEL_META[m].in * 3 + MODEL_META[m].out * 1.5) / 1000;
    return {
      model_name: m,
      quota: q(cny),
      requests: Math.round(cny / Math.max(0.01, avgCost)),
    };
  }).sort((a, b) => b.quota - a.quota),
  // 客户 TOP8：按各自累计消费占比分摊月消耗
  by_customer: mockCustomers
    .map((c, i) => ({ c, spend: CUSTOMER_SPEND_CNY[i] }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8)
    .map(({ c, spend }) => {
      const cny = MONTH_SPEND_CNY * (spend / TOTAL_CUSTOMER_SPEND_CNY);
      return {
        customer_id: c.id,
        customer_name: c.display_name,
        quota: q(cny),
        requests: Math.round(cny / 0.28),
      };
    })
    .sort((a, b) => b.quota - a.quota),
};

// ── 概览 ──────────────────────────────────────────────────────
/**
 * 本月佣金由「当月订单额 × 佣金率」得出，不是再估一个数。
 * 待结算/已结算在保留的页面里只出现在概览的身份条上，
 * 按一个持续经营 9 个月、当月账期未结束的经销商配置：
 * 历史 8 个月已结算，当月计提中算待结算。
 */
const MONTH_COMMISSION_CNY = Math.round(MONTH_SPEND_CNY * COMMISSION_RATE * 100) / 100;
{
  const total = MONTH_ORDER_CNY * COMMISSION_MONTHS * COMMISSION_RATE;
  mockDealerProfile.total_commission = Math.round(total * 100) / 100;
  mockDealerProfile.pending_payout = MONTH_COMMISSION_CNY;
  mockDealerProfile.settled_payout = Math.round((total - MONTH_COMMISSION_CNY) * 100) / 100;
  mockDealerProfile.commission_rate = COMMISSION_RATE;
}

export const mockOverview: OverviewStats = {
  customer_count: mockCustomers.length,
  new_customer_count: mockCustomers.filter((c) => c.created_at > NOW - 30 * DAY).length,
  today_quota: mockUsageSummary.daily[mockUsageSummary.daily.length - 1].quota,
  month_quota: q(MONTH_SPEND_CNY),
  month_commission: MONTH_COMMISSION_CNY,
  pending_commission: mockDealerProfile.pending_payout,
  today_requests: mockUsageSummary.daily[mockUsageSummary.daily.length - 1].requests,
};

/** 客户创建的模拟返回 */
export function mockCreateCustomer(payload: CustomerCreatePayload): Customer {
  return {
    id: 20001 + mockCustomers.length + Math.floor(Math.random() * 1000),
    username: payload.username,
    display_name: payload.display_name,
    email: payload.email || '',
    phone: payload.phone,
    status: 1,
    quota: payload.init_quota || 0,
    used_quota: 0,
    request_count: 0,
    discount_rate: payload.discount_rate ?? mockDealerProfile.discount_rate,
    last_active_at: 0,
    created_at: Math.floor(Date.now() / 1000),
    remark: payload.remark,
  };
}
