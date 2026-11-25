/**
 * 租户品牌假数据。
 *
 * 两个经销商用来验证「同一次构建、不同域名、不同皮肤」：
 *  - 云启智能：青绿色系，有 logo
 *  - 星瀚算力：琥珀色系，无 logo（走「主色方块 + 首字」回退路径）
 *
 * 第三个是平台默认租户：域名没绑定时兜底，避免 `localhost` 直接白屏。
 */

import type { TenantBrand } from '../../types/tenant';

/** dev 环境模拟域名：`http://localhost:5174/?tenant=yunqi` */
export const mockTenants: TenantBrand[] = [
  {
    dealer_id: 1024,
    slug: 'yunqi',
    name: '云启智能',
    short_name: '云',
    primary_color: '#0d9488',
    page_title: '云启智能 · API 控制台',
    api_base_url: 'https://api.yunqi-ai.com/v1',
    logo_url: '',
    support: {
      email: 'support@yunqi-ai.com',
      phone: '400-820-1234',
      wechat: 'yunqi-support',
      note: '工作日 9:00 - 21:00',
    },
    landing: {
      hero_title: '把主流大模型，变成你产品里的一个接口',
      hero_subtitle:
        '一个密钥接入 DeepSeek、OpenAI、Claude、Gemini 与通义千问。注册后即可创建令牌、在线充值，按调用量付费，无月费。',
      /* 结构化写法：标题短、说明一句话，卡片才有两级层级 */
      highlights: [
        { title: 'OpenAI 兼容', desc: '改一行 base_url 就能接入现有代码' },
        { title: '国内直连', desc: '流式输出稳定，无需额外网络配置' },
        { title: '调用留痕', desc: '每次调用的模型、token 与耗时都可查' },
        { title: '余额透明', desc: '消费流水实时可见，随时在线充值' },
      ],
      self_signup_enabled: true,
      signup_cta: '免费注册，立即开始',
      login_hint: '已有账号？直接登录',
      /* 显式写 editorial：不写也会落回这个值，但写出来能让对照更直观 */
      layout_style: 'editorial',
    },
    domains: [
      { host: 'console.yunqi-ai.com', kind: 'primary', status: 'active', verified_at: 1762300800 },
      { host: 'api.yunqi-ai.com', kind: 'alias', status: 'active', verified_at: 1762300800 },
    ],
  },
  {
    dealer_id: 1025,
    slug: 'xinghan',
    name: '星瀚算力',
    short_name: '星',
    primary_color: '#d97706',
    page_title: '星瀚算力 · 开发者控制台',
    api_base_url: 'https://api.xinghan-ai.cn/v1',
    logo_url: '',
    support: {
      email: 'hi@xinghan-ai.cn',
      wechat: 'xinghan_ai',
      note: '7×12 小时在线',
    },
    /**
     * 故意配成「关闭自助注册」：用来验证另一条分支——
     * 首页主按钮变成「联系客服开通」，不出现注册入口。
     * 也顺便验证 highlights 不配时能落回平台通用三条。
     *
     * 同时把它设成 brutal 版式：两个租户用 ?tenant=yunqi / ?tenant=xinghan
     * 切换就能直接对照两种排版骨架，不用改代码。
     */
    landing: {
      layout_style: 'brutal',
      hero_eyebrow: '算力 · 模型 · 推理服务',
      hero_title: '把算力变成你随时能调用的接口',
      hero_subtitle:
        '专注高性价比算力与大模型推理，按需开通，无最低消费。一个密钥调用全部模型，用多少算多少。',
      self_signup_enabled: false,
      login_hint: '已开通账号？点这里登录',
    },
    domains: [
      { host: 'console.xinghan-ai.cn', kind: 'primary', status: 'active', verified_at: 1762387200 },
      // 待解析：用来展示「域名还没生效」的状态，不该解析到品牌
      { host: 'api.xinghan-ai.cn', kind: 'alias', status: 'pending' },
    ],
  },
];

/** 域名未绑定时用的平台默认品牌（青色与平台紫区分开，提示这是平台直营） */
export const mockDefaultTenant: TenantBrand = {
  dealer_id: 0,
  slug: 'platform',
  name: 'Lynx 控制台',
  short_name: 'L',
  primary_color: '#6d51fe',
  page_title: 'API 控制台',
  logo_url: '',
  support: {
    email: 'support@lynx.example',
    note: '平台默认品牌',
  },
  domains: [],
};

/** 按 slug 精确匹配（dev 用） */
export function findTenantBySlug(slug?: string | null): TenantBrand | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  return mockTenants.find((t) => t.slug === key) ?? null;
}

/**
 * 按域名匹配：只看 status='active' 的域名。
 * 待解析 / 异常的域名不参与匹配——域名还没生效就套品牌，会给经销商错觉。
 */
export function findTenantByHost(host?: string | null): TenantBrand | null {
  if (!host) return null;
  const key = host.trim().toLowerCase().replace(/:\d+$/, '');
  return (
    mockTenants.find((t) =>
      t.domains.some((d) => d.host.toLowerCase() === key && d.status === 'active'),
    ) ?? null
  );
}

/**
 * 把品牌改动写回 mock 数据源，并返回写入后的对象。
 *
 * 为什么需要这个函数（这是本地联调必须打通的最后一环）：
 *
 *  admin 端的 updateDealerBrand 维护的是它自己的一份 memBrand，
 *  user 端的 resolveTenant 读的是上面这个 mockTenants 数组 ——
 *  两份内存互不相干。结果就是：经销商在后台改完首页、点保存、提示成功，
 *  切到前台一看纹丝不动，会以为功能坏了。
 *
 *  真实环境不存在这个问题：两端都打同一个后端、同一个库。
 *  所以这里只是把 mock 拉齐到真实语义，不是在给真链路打补丁。
 *
 *  按 dealer_id 定位而不是按数组下标：下标会随示例数据增删而变，
 *  用 id 更稳。
 */
export function updateMockTenant(next: TenantBrand): TenantBrand {
  const idx = mockTenants.findIndex((t) => t.dealer_id === next.dealer_id);
  if (idx >= 0) mockTenants[idx] = next;
  return next;
}

/**
 * 品牌改动的本地持久化 key。
 *
 * 为什么需要持久化：
 *  admin（5173）和 user（5175）是两个不同的端口，属于不同的源，
 *  localStorage 互不共享 —— 光改内存的话，切到前台刷新就丢了。
 *
 *  所以两边各自存一份：admin 保存时写，user 启动时读。
 *  这不是真正的数据同步（那要后端），
 *  但足够让本地联调看到「改完切过去就生效」的完整链路。
 */
const MOCK_BRAND_STORAGE_KEY = 'lynx-mock-brand-overrides';

type BrandOverrides = Record<string, TenantBrand>;

function readOverrides(): BrandOverrides {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MOCK_BRAND_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // 存的东西坏了就当没有，不能因为脏 localStorage 让整站起不来
    return {};
  }
}

/** 把当前所有被改过的租户写进 localStorage（admin 保存后调用） */
export function persistMockTenant(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MOCK_BRAND_STORAGE_KEY, JSON.stringify(mockTenants));
  } catch {
    // 隐私模式 / 配额满时静默失败：持久化失败不该让保存动作报错
  }
}

/**
 * 用持久化的改动覆盖静态示例数据。
 *
 * 必须在读 mockTenants 之前调用一次（user 端启动时）。
 * 只覆盖 dealer_id 匹配得上的，避免把别人留下的脏数据套到当前租户上。
 */
export function hydrateMockTenants(): void {
  const saved = readOverrides();
  Object.values(saved).forEach((brand) => {
    if (!brand || typeof brand !== 'object' || !brand.dealer_id) return;
    const idx = mockTenants.findIndex((t) => t.dealer_id === brand.dealer_id);
    if (idx >= 0) mockTenants[idx] = brand;
  });
}
