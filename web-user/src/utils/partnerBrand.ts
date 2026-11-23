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

/** 主色兜底。与 partner/backend 的 toMerchantBrand 保持一致，避免两处渲染出不同颜色 */
const FALLBACK_PRIMARY = '#6d51fe';

/** 主色合法值：#RGB 或 #RRGGBB。后端已校验过一次，这里再判是为了防止历史上写坏的脏数据把样式打崩 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolvePartnerPrimaryColor(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  return HEX_COLOR.test(value) ? value : FALLBACK_PRIMARY;
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
 * 接管的字段：enabled / show_contact / qr_code_url，其余保留平台侧原值。
 *
 * qr_code_url 从 support.qr_code_url 搬过来 —— 伙伴后台上传的二维码存在
 * brand_support 这个 jsonb 里（见 partner_brand_upload.go 的 brandTargetSupportQR），
 * 而浮窗读的是 siteAppearance 上的同名字段，所以要在这里做一次桥接。
 * 商户没传二维码时保持 base 的值不动，让平台侧配过的二维码仍然可用。
 */
export function partnerBrandToCustomerService(
  support: Record<string, unknown> | undefined,
  base: CustomerServiceConfig,
): CustomerServiceConfig {
  if (!support) return base;
  // 二维码也算「有内容」：只传了二维码、没填文字联系方式的商户，
  // 同样应该看到浮窗
  const qrCode = readText(support.qr_code_url);
  const hasAny = ['email', 'phone', 'wechat', 'note'].some((key) => {
    const value = support[key];
    return typeof value === 'string' && value.trim() !== '';
  }) || qrCode !== '';
  if (!hasAny) return base;
  return {
    ...base,
    enabled: true,
    show_contact: true,
    ...(qrCode ? { qr_code_url: qrCode } : {}),
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
