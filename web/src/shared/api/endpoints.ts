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
    /*
     * 新建客户。
     *
     * 必须和 customers 分开：backend/main.go 只在 ready 组里注册了
     * GET /users，没有 POST。如果 POST 也发到 '/api/partner/users'，
     * 拿到的是 NoRoute 的 404「接口不存在」——看起来像路径拼错，
     * 而真相是这个方法还没实现。写 null 才能得到 API_NOT_READY 的正确提示。
     */
    customerCreate: null,
    customerDetail: null,
    customerQuota: null,
    customerStatus: null,
    customerResetPassword: null,

    // 用量 —— 日志真实存在；汇总走 billing/summary；导出未实现
    usage: '/api/partner/logs',
    /*
     * 模型名清单。
     *
     * 专门开这个端点，是因为原来 fetchModelNames 用
     * `/logs?page_size=100&all_history=1` 去重来填下拉框 ——
     * 为了几十个选项把整段历史日志跑一遍分页查询（含 Count），
     * 和主列表抢同一张表，是首屏慢的主因之一。
     *
     * 后端只做 DISTINCT 取一列，不分页、不统计总数。
     */
    usageModels: '/api/partner/logs/models',

    /*
     * 用量汇总没有独立接口，由 dealer.ts 的 fetchUsageSummary() 走
     * billingSummary + 日期区间拼出来，所以这里保持 null。
     *
     * 上一版 fetchUsageSummary 直接请求这个 null 端点并抛错，
     * 而用量页用 Promise.all 同时拉日志和汇总 —— 一个抛错两个都拿不到，
     * 整页变成「加载失败」。现在汇总改走 billing，这条链路才通。
     */
    usageSummary: null,
    usageExport: null,

    /*
     * 品牌白标 —— 真实存在，见 backend/internal/partner/partner_brand.go。
     *
     * 数据落在 lc_distribution_merchants 的那 10 个 brand_* 列上。这张表同时被
     * lynxtonapi 的站点身份体系（siteauth）使用，所以伙伴后台在这里写的品牌，
     * 客户站按站点身份（site_id / site_domain）读出来就是同一份 —— 两个平台
     * 共用一份数据源，不各存一套。
     */
    brand: '/api/partner/brand',
    brandDomains: '/api/partner/brand/domains',
    brandDomainCheck: '/api/partner/brand/domains/:host/check',
    /*
     * 品牌图片上传：multipart 提交，图片经伙伴后端中转写入对象存储。
     *
     * 不走浏览器直传，是因为共用的那个 bucket 没开 CORS —— 跨域 PUT 会在
     * 预检阶段被拒（AccessDenied: CORS is not enabled for this bucket）。
     * 直传本来更省带宽，但它把「能不能传图」押在运维侧的云配置上，
     * 而中转只需要服务端能出网。
     *
     * 一次请求同时完成「传图」和「改配置」：后端写完对象就把地址落进
     * logo_url / favicon_url 并返回最新品牌。所以不存在「图传上去了但没保存」
     * 这种半成品状态。
     */
    brandUpload: '/api/partner/brand/upload',

    // 账单汇总 —— 真实存在
    billingSummary: '/api/partner/billing/summary',

    /*
     * 文档中心 —— 真实存在，见 backend/internal/partner/doc_api.go。
     *
     * 数据落在伙件自己的 lc_partner_doc_* 表，按 site_id 隔离：
     * 每个分销商站点管自己那份，改不到别人的。
     *
     * 特别注意「读取」有两条路：
     *   docsTree      管理侧，带登录态，返回全部分类+文章（含未发布、含正文）
     *   （公网页）      /api/partner/public/docs/tree，靠站点身份头，匿名可读
     * 后台只走管理侧这一条，公网那条是客户站用的，不在这里。
     */
    docsTree: '/api/partner/docs/tree',
    docsCategoryCreate: '/api/partner/docs/categories',
    docsCategoryReorder: '/api/partner/docs/categories/reorder',
    docsCategoryUpdate: '/api/partner/docs/categories/:id',
    docsCategoryDelete: '/api/partner/docs/categories/:id',
    docsArticleCreate: '/api/partner/docs/articles',
    docsArticleReorder: '/api/partner/docs/articles/reorder',
    docsArticleGet: '/api/partner/docs/articles/:id',
    docsArticleUpdate: '/api/partner/docs/articles/:id',
    docsArticleDelete: '/api/partner/docs/articles/:id',
    /*
     * 导入内置默认文档（入门 / 模型指南 / API 参考，45 篇）。
     *
     * 新站点文档表是空的，没有这一步只能从零手写分类和文章。
     * 幂等：默认 mode=skip 只补缺失，overwrite 才覆盖同 slug 的内容。
     */
    docsSeedImport: '/api/partner/docs/import/seed',
  },
} as const;
