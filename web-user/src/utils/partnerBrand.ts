import type { CustomerServiceConfig } from '../types/siteAppearance';
import type { PartnerSiteBrand } from '../hooks/usePartnerSiteBrand';

/**
 * 伙伴品牌 → web-user 内部结构的桥接。
 *
 * 为什么需要这一层：伙伴后台和客户站对「品牌」的建模粒度不同。
 *
 *   伙伴后台（lc_distribution_merchants.brand_*）
 *     品牌名、简称、logo、主色、页面标题、favicon、标语、客服联系方式
 *     —— 平铺的 8 个字段 + 一个 support 对象
 *
 *   客户站（SiteAppearance）
 *     品牌名（分语种）、页头导航、页脚栏目、banner、登录页媒体、客服浮窗开关
 *     —— 结构化的整站外观
 *
 * 这一层负责「用伙伴的值覆盖客户站那几处对应的位置」，其余一概不动。
 * 把覆盖范围收敛在 8 个字段 + 客服，是刻意的：客户站的外观配置面很大，
 * 全部交给伙伴后台会变成两套系统互相打架；只接管品牌相关的那几格，
 * 其余继续由平台运营统一维护。
 */

/**
 * 主色合法值：#RGB 或 #RRGGBB。后端已校验过一次，这里再判是为了防止
 * 历史上写坏的脏数据把样式打崩。
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * 主色兜底。
 *
 * ★ 这里返回 null 表示「伙伴没配 / 配的不合法」，交给主题层回落到平台默认色。
 *
 * 早先这里返回的是硬编码的 '#6d51fe'，看着是「兜底」，实际是**覆盖**：
 * 主题层只有在 override 为 null 时才会用平台那套按明暗模式区分的主色
 * （暗色 #8b73ff / 亮色 #6d51fe，见 theme/brandTokens.ts）。一旦这里永远
 * 返回一个具体色值，暗色模式下商户没配色也会被强行刷成亮色版的那个紫，
 * 平台运营调过的主题色等于被这行代码吃掉。
 *
 * 「没配」和「配了个坏值」在展示上是同一件事 —— 都用平台默认，
 * 所以统一返回 null，不再编造一个颜色出来。
 */
export function resolvePartnerPrimaryColor(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  return HEX_COLOR.test(value) ? value : null;
}

/**
 * 品牌名。
 *
 * 伙伴后台只有一个 name（不分语种），要填进客户站 brand_name_zh / brand_name_en 两个槽。
 * 处理策略：
 *   · brand_name_zh 直接用它 —— 这是主要展示位
 *   · brand_name_en 只在伙伴名全是 ASCII 时才填（那大概率本来就是英文名），
 *     否则留空让 i18n 走自己的兜底。把中文名塞进英文槽会让英文界面出现中文。
 */
export function resolvePartnerBrandNames(brand: PartnerSiteBrand | null): {
  zh: string | null;
  en: string | null;
} {
  const name = brand?.name?.trim() ?? '';
  if (!name) return { zh: null, en: null };
  const allAscii = /^[\x20-\x7e]+$/.test(name);
  return { zh: name, en: allAscii ? name : null };
}

/**
 * 伙伴客服联系方式 → 客户站客服浮窗配置。
 *
 * 这里有个语义差：伙伴的 support 是「联系我们」的信息（邮箱/电话/微信/备注/二维码），
 * 客户站的 CustomerServiceConfig 是「浮窗要不要显示、显示什么」。
 * 前者有内容就说明商户希望客户能找到人，所以：
 *   · support 有任何一项（含二维码）→ 开启浮窗并显示联系 tab
 *   · support 全空 → 不开启，保持平台默认（避免出现一个空白浮窗）
 *
 * ★ 二维码的归属规则按站点性质分流，这是「经销商配置不和主站互相影响」的核心：
 *
 * 平台侧（lc_site_footer.customer_service_config）**自己就存着一张二维码**，
 * 而且那张表没有 merchant_id / site_id —— 是全站单例，所有站点共用。
 *
 *   · 自营站点（isSelfOperated = true）
 *       它就是平台自己。品牌设置里没传二维码时，沿用平台那张是**正确**的：
 *       那是它自己的内容。所以这里保持「没传就继承 base」的老行为。
 *
 *   · 经销商站点（isSelfOperated = false）
 *       它的二维码只能来自自己（brand_support.qr_code_url）。
 *       没传就是没有 —— 不能回填平台那张，否则经销商在伙伴后台点「移除」后，
 *       客户站刷新又冒出平台的二维码，等于平台内容渗进了经销商的站点。
 *       那张图扫过去会加到平台那边，对经销商是实打实的伤害。
 *
 *   · isSelfOperated = undefined（旧版伙伴后端没下发这个键）
 *       **沿用老行为**（继承 base）。
 *
 *       这里选「放行」而不是「收紧」，是权衡后的结果，不是偷懒：
 *       前端和伙伴后端是两个独立部署物。如果缺省就按经销商收紧，那么
 *       「只发了前端、后端还没发」这个窗口里，**平台自营站点会立刻丢掉**
 *       版权行、备案号、二维码 file_id —— 用户看到的是主站页脚突然空了，
 *       比经销商多继承一张图严重得多。实测过这个组合，三项全丢。
 *
 *       所以隔离只在后端**明确说「这是经销商」**时才生效。代价是：只要
 *       后端没升级，隔离就是关着的（经销商仍会继承平台值）。因此后端
 *       必须和前端一起发版，见 PartnerSiteBrand.is_self_operated 的注释。
 */
export function partnerBrandToCustomerService(
  support: Record<string, unknown> | undefined,
  base: CustomerServiceConfig,
  isSelfOperated?: boolean,
): CustomerServiceConfig {
  /*
   * 经销商的「什么都不继承」：把平台单例里带平台身份的东西全摘掉。
   *
   * ★ 早先这里只清了 qr_code_file_id，保留了 qr_code_url —— 那是个真漏洞。
   *   原来的理由写的是「平台那张库里只有 file_id、没有 url，所以图片暂时
   *   不会显示」，但线上实测 /api/lynx/branding/site 返回的是：
   *     { qr_code_file_id: "cd67e772-...",
   *       qr_code_url: "https://<对象存储>/...last-frame.jpg?X-Tos-..." }
   *   url 是有的，而且渲染层（CustomerServiceFloat）只读 url。
   *   于是「经销商什么都没配」时浮窗照样弹出平台那张图 —— 就是那张
   *   卡通人物头像被当成客服二维码显示出来。
   *
   * 所以现在：file_id 和 url 一起清。经销商看到的二维码只能来自
   * brand_support.qr_code_url（它自己在伙伴后台上传的那张）。
   *
   * ★ enabled 也一并置 false。
   *   平台 base 里 enabled 是 true（平台自己开着浮窗），经销商继承了它就会
   *   出现「浮窗开着、里面什么都没有」的空壳 —— 只有一个联系人图标，
   *   点开一片空白。经销商没配联系方式时，浮窗根本不该出现。
   *   show_contact 保持 base 的值（它是「面板里显示不显示联系 tab」的开关，
   *   不是身份信息，且 enabled=false 时整块都不渲染，留着无害）。
   */
  const stripPlatformService = (cfg: CustomerServiceConfig): CustomerServiceConfig => ({
    ...cfg,
    enabled: false,
    qr_code_file_id: '',
    qr_code_url: undefined,
  });

  /** true = 自营；false = 经销商；undefined = 后端没下发，按老行为放行 */
  const inheritsPlatform = isSelfOperated !== false;

  const fallback = () => (inheritsPlatform ? base : stripPlatformService(base));

  if (!support) return fallback();
  // 二维码也算「有内容」：只传了二维码、没填文字联系方式的商户，
  // 同样应该看到浮窗
  const qrCode = readText(support.qr_code_url);
  const hasAny = ['email', 'phone', 'wechat', 'note'].some((key) => {
    const value = support[key];
    return typeof value === 'string' && value.trim() !== '';
  }) || qrCode !== '';
  if (!hasAny) return fallback();

  /*
   * 自营站点 / 后端未下发：沿用老行为，没传就继承平台那张。
   * 经销商店点：二维码严格只认自己的，显式写 undefined 覆盖掉 base 里
   * 继承来的平台值（条件展开在这里不够用 —— 不写字段等于保留 base 的值）。
   */
  if (inheritsPlatform) {
    return {
      ...base,
      enabled: true,
      show_contact: true,
      ...(qrCode ? { qr_code_url: qrCode } : {}),
    };
  }
  /*
   * 经销商分支：**以平台值为底，但只保留无归属的开关，有身份的字段全部覆盖。**
   *
   * 显式写每一个字段（而不是靠条件展开省略）是因为「省略」在对象展开里
   * 等于「保留 base 的值」—— 漏写一个字段就是把平台的数据放过去了。
   * 上面就栽在这里：只清了 file_id，url 从 base 带了过来。
   *
   * enabled / show_contact 置 true 是对的：能走到这里说明商户确实填了
   * 联系方式或自己的二维码（见上面的 hasAny），浮窗本来就该开。
   * 真正需要防的是「什么都没填」那条路径，它在上面走 fallback()，
   * 那里的 stripPlatformService 会把 enabled 置 false。
   */
  return {
    ...base,
    enabled: true,
    show_contact: true,
    qr_code_url: qrCode || undefined,
    /*
     * file_id 一律清空，不管有没有自己的二维码。
     *
     * 原因：base 里的 qr_code_file_id 是**平台**的（lc_site_footer 是单例），
     * 留在经销商身上就等于「经销商站点记着平台的 file_id」。哪怕当前没有
     * 渲染方读它，将来任何一处「按 file_id 换签名 URL」的代码都会把平台
     * 那张图当成经销商自己的。
     *
     * 经销商自己的二维码地址就在 qr_code_url 里，够用了；file_id 是平台侧
     * 那套机制的产物，不适用于经销商的自有 URL。
     *
     * 自营分支不能这样清 —— 平台自己的 file_id 必须原样保留，
     * 否则平台侧下次读配置会以为二维码被删了。
     */
    qr_code_file_id: '',
  };
}

/**
 * 把伙伴的客服信息摊平成展示用的文案行。
 *
 * 客户站原本的联系 tab 只显示二维码图。伙伴后台给的是文本联系方式，
 * 没有二维码，所以这里生成一组「标签 + 值」的文本行直接渲染，
 * 比强行要求商户再传一张二维码现实得多。
 */
export interface PartnerSupportLine {
  label: string;
  value: string;
}

/**
 * 这一组里哪些字段可以点击复制。
 *
 * 为什么不生成 href（mailto: / tel:）：
 * 点击邮箱会弹出系统的邮件客户端，点击电话会唤起拨号或 FaceTime ——
 * 对「只是想抄一下客服邮箱」的人来说，这两个行为都是打断，而且
 * 在桌面浏览器上大概率唤起一个没配置好的空客户端。用户明确要求改成点击复制。
 *
 * 展示层判断哪些行可点，就是看 label 在不在这个集合里。
 */
export const PARTNER_SUPPORT_COPYABLE_LABELS = ['邮箱', '电话', '微信'] as const;

export function buildPartnerSupportLines(
  support: Record<string, unknown> | undefined,
): PartnerSupportLine[] {
  if (!support) return [];
  const lines: PartnerSupportLine[] = [];
  const email = readText(support.email);
  if (email) lines.push({ label: '邮箱', value: email });
  const phone = readText(support.phone);
  if (phone) lines.push({ label: '电话', value: phone });
  const wechat = readText(support.wechat);
  if (wechat) lines.push({ label: '微信', value: wechat });
  const note = readText(support.note);
  if (note) lines.push({ label: '服务时间', value: note });
  return lines;
}

function readText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * 品牌 logo。
 *
 * 只做「有 URL 就返回 URL」这一件事，返回 null 交给调用方决定怎么办。
 *
 * 这里曾经写着一句「不拿名称首字生成文字 logo —— 长得很像占位图」，
 * 那条约束已经在 Header 里作废了：伙伴后台的预览面板（web/src/shared/ui/BrandLogo.tsx）
 * 一直是拿首字画品牌色方块的，客户站却只留一片空白，商户会以为上传失败。
 * 现在的分工是：
 *   · 没 logo        → Header 画「品牌色方块 + 首字」
 *   · logo 太方      → Header 在图右侧并排品牌名补足横向分量
 * 两处都发生在渲染层，本函数仍然只管「有没有 URL」。
 */
export function resolvePartnerLogo(brand: PartnerSiteBrand | null): string | null {
  const url = brand?.logo_url?.trim() ?? '';
  return url || null;
}

/** favicon 同理，没配就是没有 */
export function resolvePartnerFavicon(brand: PartnerSiteBrand | null): string | null {
  const url = brand?.favicon_url?.trim() ?? '';
  return url || null;
}

/**
 * 品牌首字 —— 没有 logo / favicon 时用来画「品牌色方块 + 一个字」。
 *
 * 取值顺序刻意和后端、伙伴后台预览（web/src/shared/ui/BrandLogo.tsx）保持一致：
 * short_name 是商户专门为「方形小标」准备的缩写（一个字/一个字母），
 * name 是完整名称，从中取首字通常还能看但不一定是想要的字。所以 short_name 优先。
 *
 * ★ 为什么抽成函数而不是各处自己 slice：这个首字现在有**两个消费方** ——
 *   页头的方块（Header.tsx）和浏览器标签图标（StatusContext 的 favicon 兜底）。
 *   两处各写一遍「short || full 取第一个字」，只要有一处改动（比如加个
 *   「英文名转大写」），页头方块和标签图标就会显示不同的字，而这种不一致
 *   极难被发现（一个在页面上、一个在标签栏上）。收敛到这一处。
 *
 * ★ 用 Array.from 而不是 slice(0, 1)：slice 按 UTF-16 码元切，
 *   遇到 emoji（🙂）或扩展区汉字会把代理对切成半个字符，渲染出方块乱码。
 *   Array.from 按码点切，一个字符就是一个字符。
 */
export function resolvePartnerMarkInitial(brand: PartnerSiteBrand | null): string {
  if (!brand) return '';
  const short = (brand.short_name ?? '').trim();
  const full = (brand.name ?? '').trim();
  return Array.from(short || full)[0] ?? '';
}

/**
 * 伙伴页脚版权 → 客户站 SiteAppearance 上的四个槽位。
 *
 * 三态语义（见 PartnerSiteFooter 的注释）在这一层落实：
 *   · 键缺失 / null  → 返回 undefined，调用方用 ?? 回落到平台值
 *   · 空串           → 返回空串，调用方保留空串，渲染层据此隐藏该项
 *   · 非空串         → 返回 trim 后的值
 *
 * 不做 trim 后判空是刻意的：商户在后台把一个填好的版权文字全删掉，
 * 就是想不显示，这时候不能因为「trim 完是空的」就当没配过。
 */
export interface PartnerFooterOverrides {
  copyright_text?: string;
  terms_label?: string;
  privacy_label?: string;
  beian_label?: string;
  enabled?: boolean;
}

function readTriState(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.trim();
}

export function resolvePartnerFooter(
  brand: PartnerSiteBrand | null,
): PartnerFooterOverrides {
  const footer = brand?.footer;
  if (!footer) return {};

  const overrides: PartnerFooterOverrides = {};
  const copyright = readTriState(footer.copyright_text);
  if (copyright !== undefined) overrides.copyright_text = copyright;
  const terms = readTriState(footer.terms_label);
  if (terms !== undefined) overrides.terms_label = terms;
  const privacy = readTriState(footer.privacy_label);
  if (privacy !== undefined) overrides.privacy_label = privacy;
  const beian = readTriState(footer.beian_label);
  if (beian !== undefined) overrides.beian_label = beian;
  if (typeof footer.enabled === 'boolean') overrides.enabled = footer.enabled;

  return overrides;
}

/**
 * 页面标题（浏览器标签页）。
 *
 * 伙伴的 page_title 后端已有兜底（空则用品牌名），所以直接用。
 * 这里保留「可能为空」的可能：万一伙伴后端版本较旧没做兜底，
 * 调用方仍能用品牌名顶上。
 */
export function resolvePartnerPageTitle(brand: PartnerSiteBrand | null): string | null {
  const title = brand?.page_title?.trim() ?? '';
  if (title) return title;
  const name = brand?.name?.trim() ?? '';
  return name || null;
}
