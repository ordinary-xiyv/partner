/**
 * ============================================================================
 *  接口端点常量表
 * ============================================================================
 *
 *  这套端点已对齐 partner/backend 的真实路由（Go 服务，默认 3004）。
 *
 *  背景：这个前端原本是 lynx-dealer/apps/dealer-admin，接口前缀是
 *  /api/dealer/*，而那 25 个路径后端一条都没实现（原文件头自己写着
 *  「按现有后端命名习惯拟定的占位路径，尚未与真实后端对齐」）。搬进 partner/
 *  时把能对上的真实接口全部指到 /api/partner/*，剩下的写 null 而不是留个假路径——
 *  这样调不通时抛出的是「这个接口还没实现」（API_NOT_READY），
 *  而不是打到一个不存在的 URL 上拿到 404，让人误以为是路径拼错了。
 *
 *  约定：
 *  1. 路径必须与 partner/backend/main.go 的注册完全一致。
 *  2. 后端还没实现的写 null，请求层抛 API_NOT_READY 并在控制台打印键名。
 *  3. 取值统一用 EP.dealer.xxx，禁止在页面里手写路径字符串。
 */

export const EP = {
  /** ---------------- 伙伴后台（partner/backend） ---------------- */
  dealer: {
    // 认证 —— 真实存在
    login: '/api/partner/login',
    logout: '/api/partner/logout',
    me: '/api/partner/me',
    changePassword: '/api/partner/password',

    /**
     * 概览汇总：后端没有这个接口。
     * 概览页要的数字由前端用 users + daily-trend + billing 三个真接口拼出来，
     * 见 dealer.ts 的 fetchOverview。
     */
    overview: null,
    overviewTrend: '/api/partner/daily-trend',

    // 客户管理 —— 列表真实存在；写操作后端未实现
    customers: '/api/partner/users',
    customerDetail: null,
    customerQuota: null,
    customerStatus: null,
    customerResetPassword: null,

    // 用量 —— 日志真实存在；导出未实现
    usage: '/api/partner/logs',
    usageSummary: null,
    usageExport: null,

    /*
     * 品牌白标 —— partner/backend 里一条 brand 接口都没有。
     *
     * 但这套能力在 internal-admin 是完整的（GET/PUT /api/partner/brand 与
     * POST /api/partner/brand/upload，见 internal-admin/platform/router/
     * register.go 第 29-34 行）。也就是说要在 partner/backend 里补齐；
     * 前端路径先按那边的既有约定写，补完后端即可直接连通，前端不用再改。
     */
    brand: '/api/partner/brand',
    brandDomains: '/api/partner/brand/domains',
    brandDomainCheck: '/api/partner/brand/domains/:host/check',

    // 账单汇总 —— 真实存在
    billingSummary: '/api/partner/billing/summary',
  },
} as const;
