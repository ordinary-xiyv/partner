/**
 * ============================================================================
 *  租户品牌（白标）领域模型
 * ============================================================================
 *
 *  背景：
 *   - 经销商**共用同一个 admin 端**（dealer-admin），后台看到的是平台统一形象。
 *   - 每个经销商可以有**自己的域名**，挂在该域名下的是他的 user 端（dealer-user）。
 *   - 客户访问某个域名时，该域名决定「看到哪个经销商的品牌」，但**不决定能看到谁的数据**——
 *     身份永远由登录态 token 决定。域名只影响皮肤，不影响权限。
 *
 *  这个区分是硬约束：
 *   域名 → 品牌（可猜测、可枚举、公开信息）
 *   token → 身份（不可伪造、服务端校验）
 *  若把经销商身份交给域名判断，任何人改 hosts 就能看别人的收入。
 */

/** 域名角色：主域名 / 备用别名 */
export type TenantDomainKind = 'primary' | 'alias';

/** 域名生效状态：已生效 / 待解析 / 异常 */
export type TenantDomainStatus = 'active' | 'pending' | 'error';

export interface TenantDomain {
  /** 完整域名，如 console.yunqi-ai.com */
  host: string;
  kind: TenantDomainKind;
  status: TenantDomainStatus;
  /** 最近一次校验时间（秒级时间戳，0 = 未校验） */
  verified_at?: number;
}

/** 客服联系方式：白标范围要求经销商能换成自己的 */
export interface TenantSupport {
  email?: string;
  phone?: string;
  /** 微信号 / 企业微信客服 */
  wechat?: string;
  /** 补充说明，如服务时间 */
  note?: string;
  /**
   * 客服二维码图片地址。
   *
   * 它跟上面四个一样存在 brand_support 这个 jsonb 里，但写入途径不同：
   * 上传接口（partner_brand_upload.go 的 mergeSupportQR）会直接把地址写进
   * 这个键，再返回最新品牌对象 —— 不需要用户点保存。
   *
   * 客户站那边读的是 siteAppearance.customer_service_config.qr_code_url，
   * 由 web-user/src/utils/partnerBrand.ts 做桥接。
   */
  qr_code_url?: string;
}

/**
 * 一个域名解析出的完整品牌配置。
 * user 端启动时按 hostname 拿到这个对象，用它渲染 logo / 品牌名 / 主色 / 标题 / favicon / 客服。
 */
export interface TenantBrand {
  /** 经销商 ID（仅展示与埋点，**不参与鉴权**） */
  dealer_id: number;
  /** 短标识，dev 环境用 ?tenant=slug 模拟 */
  slug: string;
  /** 品牌名：侧栏、登录页、浏览器标题都用它 */
  name: string;
  /** 无 logo 时的首字标记，缺省取 name 首字 */
  short_name?: string;
  /** logo 图 URL（或 data URL）；空则回退到「主色方块 + 首字」 */
  logo_url?: string;
  /** 品牌主色 #RRGGBB */
  primary_color: string;
  /** 浏览器标题 */
  page_title: string;
  /** favicon URL；空则用主色 + 首字动态生成 SVG */
  favicon_url?: string;
  /**
   * 一句话介绍。
   *
   * 2026-11-25 起后台表单已移除这一格 —— 客户站（web-user）里没有任何
   * 一处渲染它，商户填了也永远不会出现在页面上。字段保留在类型里是因为
   * 后端 lc_distribution_merchants 还有 brand_tagline 列、接口也照旧下发，
   * 前端只是不再提供编辑入口，历史数据读到也不该报错。
   */
  tagline?: string;
  /** 该租户的接口基地址（接入文档展示用）。空则用平台默认域名 */
  api_base_url?: string;
  support?: TenantSupport;
  /**
   * 首页（落地页）配置。
   *
   * 访客打开经销商域名时先看到这个页面，而不是登录框——
   * 它承担「证明这家服务商靠谱 + 引导注册」的职责。
   * 全部字段可选：不配则用平台按 tagline 拼出的通用文案，不会留白。
   */
  landing?: TenantLanding;
  /** 绑定的域名列表（由主平台配置，本项目只读） */
  domains: TenantDomain[];
}

/**
 * 首页（落地页）的版式风格。
 *
 * 两套风格共用同一份业务内容（模型清单、能力、CTA），只换视觉骨架：
 *  - editorial：纸感编辑。米白纸面 + 衬线大标题 + 细分割线，主色占比极低（默认）
 *  - terminal：终端网格。细网格 + 等宽标签 + 光标，主色作辉光
 *
 * 之所以做成「内容与版式分离」，而不是让经销商各写一套 HTML：
 * 经销商不该有能力改页面结构——那等于把 XSS 和样式失控一起交出去。
 * 他们只能选「用哪个骨架」+ 填「骨架里的字」。
 *
 * 'brutal' 是早期版本留下的取值，当前已无对应实现。保留它只是为了
 * 让历史数据仍能通过类型检查；解析时会被归一到 editorial（见
 * parseHomeStyle 的注释）。
 */
export type TenantLandingLayout = 'editorial' | 'terminal' | 'brutal';

/**
 * 首页（落地页）的可配置内容。
 *
 * 注意：这里**没有价格相关字段**，因为产品决定首页不展示价格。
 * 模型清单只暴露「有哪些模型、什么能力」，价格是登录后才有的事。
 */
export interface TenantLanding {
  /**
   * 版式风格。缺省 editorial——老租户没配过这个字段，
   * 必须落回原来的样貌，不能因为新增字段就让人家首页突然变样。
   */
  layout_style?: TenantLandingLayout;
  /** 主标语，覆盖默认文案。例：「企业级大模型接入服务」 */
  hero_title?: string;
  /** 副标语，补充说明 */
  hero_subtitle?: string;
  /**
   * Hero 顶部小徽标文案（brutal 版式下的角色行）。
   * 不配则用「大模型 API 服务」。
   */
  hero_eyebrow?: string;
  /**
   * 卖点列表，缺省用平台通用四条。
   *
   * 两种写法都支持，给经销商按需选择：
   *  - 传字符串：`'统一接口，改 base_url 即可接入'` —— 简单，一行写完
   *  - 传对象：`{ title: '统一接口', desc: '改 base_url 即可接入' }` —— 有标题层级，更好看
   *
   * 之所以允许字符串，是因为早期只用字符串；保留它避免已配好的租户数据失效。
   * 但如果经销商想要「标题 + 说明」的两级排版，**必须用对象写法**——
   * 尝试过按逗号自动拆分字符串，遇到「模型、token 与耗时」这类顿号就会切错。
   */
  highlights?: Array<string | TenantLandingHighlight>;
  /** 是否开放自助注册。false 时首页只显示「联系我们开通」 */
  self_signup_enabled?: boolean;
  /** 注册按钮文案，缺省「免费注册」 */
  signup_cta?: string;
  /** 已有账号时的登录引导文案 */
  login_hint?: string;
  /**
   * 页脚版权行。
   *
   * 存进 brand_landing.footer，不新增数据库列 —— lc_distribution_merchants
   * 是主平台表，伙伴后端只读不建，加列要动主平台的迁移。
   *
   * 为什么挂在 landing 下而不是独立一列：landing 本来就是「这个商户
   * 想让站点长什么样」的容器，页脚版权属于同一类诉求。语义上有点偏
   * （landing 原意是首页），但换一张新表或新列的代价明显更大。
   */
  footer?: TenantLandingFooter;
}

/**
 * 页脚版权行的可配内容。
 *
 * 全部字段可选，null / 缺省 = 没配过，客户站回落平台值；
 * 空串 = 商户明确清空，客户站不显示这一项。
 * 这个三态区别必须保留到协议层，否则「商户主动隐藏备案号」就无法表达。
 */
export interface TenantLandingFooter {
  /** 版权整句，如「© 2026 某某公司 版权所有」 */
  copyright_text?: string | null;
  /** 「网站条款」这几个字 */
  terms_label?: string | null;
  /** 「隐私政策声明」这几个字 */
  privacy_label?: string | null;
  /** ICP 备案号 */
  beian_label?: string | null;
  /** 页脚整块显隐。null / 缺省 = 沿用平台侧开关 */
  enabled?: boolean | null;
}

/** 卖点的结构化写法：标题 + 说明 */
export interface TenantLandingHighlight {
  /** 短标题，4-8 字最佳 */
  title: string;
  /** 补充说明，一句话 */
  desc?: string;
}

/** 经销商可自行修改的品牌字段（域名不在此列——域名在主平台配置） */
export interface TenantBrandUpdatePayload {
  name?: string;
  short_name?: string;
  logo_url?: string;
  primary_color?: string;
  page_title?: string;
  favicon_url?: string;
  api_base_url?: string;
  support?: TenantSupport;
  /**
   * 首页内容与版式。
   *
   * 之前这个字段不在 payload 里，导致 admin 端就算做了配置界面，
   * 保存时也会被后端整个丢掉——首页只能读、不能写。
   *
   * 整体覆盖而非深合并：经销商的「卖点列表」是从头编辑的，
   * 深合并会让「删掉第 4 条」这种操作在某次保存后悄悄复活。
   * 语义上这里提交的是「首页的完整意图」，交给服务端整体替换更可预期。
   */
  landing?: TenantLanding;
}

/** 解析结果：成功 / 域名未绑定 */
export type TenantResolveStatus = 'loading' | 'ready' | 'unbound';
