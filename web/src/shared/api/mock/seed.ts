/**
 * 假数据种子：只在 VITE_USE_MOCK=true 时使用。
 *
 * 生成原则（重要）：
 * 1. 数据按固定 seed 生成，非随机，保证每次刷新看到的内容一致，方便比对 UI。
 * 2. 所有金额先以「元」为口径设计，再按 QUOTA_PER_UNIT 折算成「额度」写入
 *    quota 类字段，避免单位混用导致的自相矛盾。
 * 3. 派生指标（概览、汇总）一律从明细数据 reduce 出来，不单独 hardcode 魔数。
 * 4. 只造后端真的会给的字段 —— mock 比真接口多出来的字段，
 *    会让人误以为联调通了，实际上一接线就整块空白。
 */

import { QUOTA_PER_UNIT } from '../../utils/format';

import type {
  Customer,
  CustomerCreatePayload,
  DealerProfile,
  OverviewStats,
  TrendPoint,
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

// ── 伙伴自身 ──────────────────────────────────────────────────
/**
 * 严格对齐后端 partnerInfo() 的 4 个字段。
 * 这里不再有 level / commission_rate / total_commission ——
 * 后端不返回这些，mock 里写出来只会掩盖「接上真接口就空白」的问题。
 */
export const mockDealerProfile: DealerProfile = {
  id: 1024,
  merchant_code: 'demo_partner',
  display_name: '示例伙伴商户',
  password_change_required: false,
};

// ── 客户列表 ──────────────────────────────────────────────────
const CUSTOMER_NAMES = [
  '张伟', '李娜', '王芳', '刘洋', '陈静', '杨帆', '赵磊', '周敏',
  '吴强', '徐丽', '孙浩', '马超', '朱琳', '胡军', '郭涛', '林雪',
  '何平', '高远', '罗盛', '梁晨', '宋佳', '唐斌', '许诺', '邓超',
  '曹阳', '彭丽', '曾毅', '萧然', '田甜', '董浩', '袁泉', '潘越',
  '蒋雯', '蔡明', '余乐', '杜鹏', '叶青',
];

/** 每客户本月净消耗（元），4000 ~ 80000 */
const CUSTOMER_SPEND_CNY: number[] = CUSTOMER_NAMES.map((_, i) => {
  const rnd = seeded(i * 977 + 13);
  return 4000 + rnd() * 76000;
});

const TOTAL_SPEND_CNY = CUSTOMER_SPEND_CNY.reduce((s, v) => s + v, 0);

/**
 * 客户行。
 *
 * 后端 /users 只给 7 个基础字段，额度与用量要靠 billing/summary 合并。
 * 这里两者都给，模拟「合并成功」的正常情况；
 * 页面必须能处理 used_quota 为 undefined 的分支（真实环境里停用客户就会缺）。
 */
export const mockCustomers: Customer[] = CUSTOMER_NAMES.map((name, i) => {
  const rnd = seeded(i * 977 + 13);
  const spentCny = CUSTOMER_SPEND_CNY[i];
  const status: 1 | 2 = i % 11 === 7 ? 2 : 1;
  const daysAgo = Math.floor(rnd() * 260) + 1;
  return {
    id: 20001 + i,
    username: `cust_${String(i + 1).padStart(3, '0')}`,
    display_name: name,
    email: `customer${i + 1}@example.com`,
    phone: i % 3 === 0 ? undefined : `138****${String(1000 + i * 7).slice(-4)}`,
    status,
    created_at: NOW - daysAgo * DAY,
    used_quota: q(spentCny),
    used_amount_cny: Math.round(spentCny * 100) / 100,
    request_count: Math.round(spentCny / 0.28),
  };
});

// ── 客户用量日志 ──────────────────────────────────────────────
/**
 * 最近 30 天的抽样。
 *
 * type 分布对齐后端语义：2=消费 5=错误 6=退款 7=预扣 8=补扣。
 * 真实库里 99% 是 2 和 5，少量退款/补扣用来验证前端不会把它们算成「成功调用」。
 */
export const mockUsageLogs: UsageLog[] = Array.from({ length: 180 }, (_, i) => {
  const rnd = seeded(i * 3121 + 7);
  const cust = mockCustomers[Math.floor(rnd() * mockCustomers.length)];
  const model = pick(MODEL_POOL, rnd());
  const prompt = Math.floor(rnd() * 4200) + 60;
  const completion = Math.floor(rnd() * 2600) + 20;
  const roll = rnd();
  const type = roll < 0.035 ? 5 : roll < 0.05 ? 6 : roll < 0.06 ? 8 : 2;
  const rawCny = costOf(model, prompt, completion);
  /*
   * 退款(6) 的 quota 在真实库里是**正数**（实测 770 条全部 > 0），
   * 冲销发生在后端 billing 的 `-logs.quota`。mock 必须照这个符号写，
   * 否则本地看到「退款是负的」、线上是正的，两种行为对不上。
   */
  const cny = type === 8 ? rawCny * 0.15 : rawCny;
  /* 显式收窄成 UsageLog['status']，否则 TS 会把字面量推断成 string 而报错 */
  const status: UsageLog['status'] =
    type === 5 ? 'error' : type === 6 ? 'refund' : type === 8 ? 'adjust' : 'success';
  return {
    id: 900000 + i,
    customer_id: cust.id,
    customer_name: cust.display_name,
    model_name: model,
    prompt_tokens: type === 2 || type === 5 ? prompt : 0,
    completion_tokens: type === 2 || type === 5 ? completion : 0,
    cache_read: type === 2 ? Math.floor(prompt * 0.25) : 0,
    quota: q(cny),
    amount_cny: Math.round(cny * 100000) / 100000,
    use_time: Math.floor(rnd() * 9000) + 240,
    stream: rnd() > 0.35,
    status,
    type,
    created_at: NOW - Math.floor(rnd() * 30) * DAY - Math.floor(rnd() * 86000),
  };
}).sort((a, b) => b.created_at - a.created_at);

/** 当前自然月 1 号（与后端 billing 默认区间一致） */
function monthStart(nowSec: number): Date {
  const d = new Date(nowSec * 1000);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const MONTH_START = monthStart(NOW);
const MONTH_START_STR = `${MONTH_START.getFullYear()}-${String(MONTH_START.getMonth() + 1).padStart(2, '0')}-01`;
const TODAY_STR = new Date(NOW * 1000).toISOString().slice(0, 10);

/**
 * 汇总 = billing/summary 的形态。
 *
 * 上一版这里有 by_model / by_customer / daily 三个拆分，
 * 但后端从来没有这些接口 —— 已删，避免页面画一张后端喂不出数据的图。
 */
export const mockUsageSummary: UsageSummary = {
  start_date: MONTH_START_STR,
  end_date: TODAY_STR,
  total_users: mockCustomers.filter((c) => (c.used_quota ?? 0) > 0).length,
  total_requests: mockUsageLogs.filter((l) => l.type === 2 || l.type === 7).length,
  total_quota: q(TOTAL_SPEND_CNY),
  total_amount_cny: Math.round(TOTAL_SPEND_CNY * 100) / 100,
  quota_per_unit: QUOTA_PER_UNIT,
};

// ── 概览 ──────────────────────────────────────────────────────
export const mockOverview: OverviewStats = {
  customer_count: mockCustomers.length,
  month_quota: mockUsageSummary.total_quota,
  month_amount_cny: mockUsageSummary.total_amount_cny,
  month_requests: mockUsageSummary.total_requests,
  month_active_users: mockUsageSummary.total_users,
  start_date: mockUsageSummary.start_date,
  end_date: mockUsageSummary.end_date,
};

/**
 * 14 天趋势 = daily-trend 的形态：固定 14 个「已完成日」（不含今天），
 * 缺数据的日子补 0，日期连续 —— 后端的实现就是这样。
 */
export const mockTrend: TrendPoint[] = (() => {
  const weights = Array.from({ length: 14 }, (_, i) => {
    const rnd = seeded(i * 613 + 3);
    return 0.55 + rnd() * 1.0;
  });
  const wsum = weights.reduce((a, b) => a + b, 0);
  const totalCny = TOTAL_SPEND_CNY * 0.45;
  return weights.map((w, i) => {
    const cny = Math.round((w / wsum) * totalCny * 100) / 100;
    const prompt = Math.round(cny * 120000);
    const completion = Math.round(cny * 40000);
    return {
      summary_date: new Date((NOW - (14 - i) * DAY) * 1000).toISOString().slice(0, 10),
      prompt_tokens: prompt,
      completion_tokens: completion,
      request_count: Math.round(cny / 0.28),
      quota: q(cny),
      amount_cny: cny,
    };
  });
})();

/** 客户创建的模拟返回（后端目前没有 POST /users，仅供 mock 界面演示） */
export function mockCreateCustomer(payload: CustomerCreatePayload): Customer {
  return {
    id: 20001 + mockCustomers.length + Math.floor(Math.random() * 1000),
    username: payload.username,
    display_name: payload.display_name,
    email: payload.email || '',
    phone: payload.phone,
    status: 1,
    created_at: Math.floor(Date.now() / 1000),
    used_quota: 0,
    used_amount_cny: 0,
    request_count: 0,
  };
}
