import type { LynxSiteFooterConfig } from '../types';
import type { SiteAppearance } from '../types/siteAppearance';
import { normalizeCustomerServiceConfig } from '../config/defaultCustomerService';
import { normalizeFooterBrandConfig } from '../config/defaultFooterBrand';
import { normalizeLoginMediaConfig } from '../config/defaultLoginMedia';
import { readStoredSiteBrand } from './siteBrandStorage';
import { readStoredSiteAppearance } from './siteAppearanceStorage';
import { normalizeSiteAppearanceDocs } from './normalizeSiteAppearanceDocs';
import { normalizeSiteAppearanceLabels } from './normalizeSiteAppearanceLabels';
import {
  partnerBrandToCustomerService,
  resolvePartnerBrandNames,
  resolvePartnerFooter,
  type PartnerFooterOverrides,
} from './partnerBrand';
import type { PartnerSiteBrand } from '../hooks/usePartnerSiteBrand';

function sortBySort<T extends { sort: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort - b.sort);
}

/**
 * 合并 API / 页脚旧接口 / 伙伴后台 / localStorage / 默认值。
 *
 * 优先级从高到低：伙伴后台 → 平台 API → 页脚旧接口 → 本地缓存 → 默认值。
 *
 * 伙伴后台排最高，是因为它是「这个站点自己人」改的配置：分销商在伙伴后台
 * 填的品牌名，必须压过平台运营统一的站名，否则白标等于没生效。
 * 但它只接管 brand_name_* 和 customer_service_config 两处 —— 其余外观
 * （导航、页脚栏目、banner、登录页媒体）仍旧走下面的平台链路，
 * 避免伙伴后台把整站外观都覆盖掉。
 */
export function mergeSiteAppearance(
  defaults: SiteAppearance,
  sources: {
    api?: Partial<SiteAppearance> | null;
    footer?: LynxSiteFooterConfig | null;
    local?: SiteAppearance | null;
    partner?: PartnerSiteBrand | null;
  },
): SiteAppearance {
  const brand = readStoredSiteBrand();
  const local = sources.local ?? readStoredSiteAppearance();
  const api = sources.api ?? {};
  const footer = sources.footer ?? {};

  /*
   * 伙伴品牌先算出「它到底要覆盖哪些格」。
   *
   * 关键：伙伴没配的字段必须保持 null，不能退化成空串。
   * 空串会命中 ?? 运算符的「有值」分支，把平台侧好好的品牌名清成空白 ——
   * 表现就是「商户只在伙伴后台改了个 logo，站名却没了」。
   */
  const partnerNames = resolvePartnerBrandNames(sources.partner ?? null);

  /*
   * brand_names 必须一起改，只改 brand_name_zh 是无效的。
   *
   * 原因：mergeSiteAppearance 的返回值最后会过一遍
   * normalizeSiteAppearanceLabels，那个函数把 brand_names 当作主数据源，
   * 用它的 zh-CN / en 反过来重写 brand_name_zh / brand_name_en。
   * 平台 API 返回的 brand_names 里已经有 {zh-CN:"灵通云", en:"灵通云"}，
   * 于是刚设好的伙伴名会被它盖回去 —— 表现为「标题换了、主色换了，
   * 唯独站名还是平台的」。
   *
   * 所以伙伴名要同时写进 labels 结构，让两处保持一致。
   */
  const partnerBrandNames = {
    ...(api.brand_names ?? local?.brand_names ?? defaults.brand_names ?? {}),
    ...(partnerNames.zh ? { 'zh-CN': partnerNames.zh } : {}),
    ...(partnerNames.en ? { en: partnerNames.en } : {}),
  };

  const merged: SiteAppearance = {
    ...defaults,
    ...local,
    ...api,
    brand_names: partnerBrandNames,
    brand_name_zh:
      partnerNames.zh
      ?? api.brand_name_zh
      ?? local?.brand_name_zh
      ?? brand.brand_name_zh
      ?? defaults.brand_name_zh,
    brand_name_en:
      partnerNames.en
      ?? api.brand_name_en
      ?? local?.brand_name_en
      ?? brand.brand_name_en
      ?? defaults.brand_name_en,
    copyright_text: api.copyright_text ?? local?.copyright_text ?? footer.copyright_text ?? defaults.copyright_text,
    terms_label: api.terms_label ?? local?.terms_label ?? footer.terms_label ?? defaults.terms_label,
    privacy_label: api.privacy_label ?? local?.privacy_label ?? footer.privacy_label ?? defaults.privacy_label,
    beian_label: api.beian_label ?? local?.beian_label ?? footer.beian_label ?? defaults.beian_label,    layout_config: {
      ...defaults.layout_config,
      ...local?.layout_config,
      ...api.layout_config,
    },
    header_config: {
      enabled: api.header_config?.enabled
        ?? local?.header_config?.enabled
        ?? defaults.header_config.enabled,
      items: sortBySort(
        api.header_config?.items?.length
          ? api.header_config.items
          : local?.header_config?.items?.length
            ? local.header_config.items
            : defaults.header_config.items,
      ),
    },
    footer_copyright_config: {
      // footer 接口的 footer_copyright_enabled 与 DB 列一致；appearance 曾漏读该列会恒为 false
      enabled: typeof footer.footer_copyright_enabled === 'boolean'
        ? footer.footer_copyright_enabled
        : api.footer_copyright_config?.enabled
          ?? local?.footer_copyright_config?.enabled
          ?? defaults.footer_copyright_config.enabled,
    },
    footer_columns_config: {
      enabled: api.footer_columns_config?.enabled
        ?? local?.footer_columns_config?.enabled
        ?? defaults.footer_columns_config.enabled,
      columns: sortBySort(
        (api.footer_columns_config?.columns?.length
          ? api.footer_columns_config.columns
          : local?.footer_columns_config?.columns?.length
            ? local.footer_columns_config.columns
            : defaults.footer_columns_config.columns
        ).map((col) => ({
          ...col,
          links: sortBySort(col.links ?? []),
        })),
      ),
    },
    footer_brand_config: normalizeFooterBrandConfig({
      ...defaults.footer_brand_config,
      ...local?.footer_brand_config,
      ...api.footer_brand_config,
      xiaohongshu: {
        ...defaults.footer_brand_config.xiaohongshu,
        ...local?.footer_brand_config?.xiaohongshu,
        ...api.footer_brand_config?.xiaohongshu,
      },
      bilibili: {
        ...defaults.footer_brand_config.bilibili,
        ...local?.footer_brand_config?.bilibili,
        ...api.footer_brand_config?.bilibili,
      },
      official_qr: {
        ...defaults.footer_brand_config.official_qr,
        ...local?.footer_brand_config?.official_qr,
        ...api.footer_brand_config?.official_qr,
      },
      expert_qr: {
        ...defaults.footer_brand_config.expert_qr,
        ...local?.footer_brand_config?.expert_qr,
        ...api.footer_brand_config?.expert_qr,
      },
    }),
    customer_service_config: partnerBrandToCustomerService(
      sources.partner?.support,
      normalizeCustomerServiceConfig({
        ...defaults.customer_service_config,
        ...local?.customer_service_config,
        ...api.customer_service_config,
      }),
    ),
    login_media_config: normalizeLoginMediaConfig({
      ...defaults.login_media_config,
      ...local?.login_media_config,
      ...api.login_media_config,
    }),
  };

  /*
   * 页脚版权行：伙伴后台的值要压过平台侧，且必须在
   * normalizeSiteAppearanceLabels **之后**叠加。
   *
   * 原因：那个函数把 copyright_labels 当作主数据源，会用它的 zh-CN
   * 反过来重写 copyright_text。伙伴只给了 copyright_text、没有多语言，
   * 先在 merged 里塞进去的话会被空 labels 覆盖回平台文案。
   * 同样的坑在 brand_name 上踩过一次（见上面的长注释），这里按同样的
   * 思路处理：先规范化，再把伙伴值盖上去。
   */
  const normalized = normalizeSiteAppearanceLabels(normalizeSiteAppearanceDocs(merged));
  return applyPartnerFooter(normalized, resolvePartnerFooter(sources.partner ?? null));
}

/**
 * 把伙伴的页脚配置叠到已规范化的外观上。
 *
 * 三态语义在这里落地：
 *   · 键不在 overrides 里  → 没配过，保留平台 / 默认值
 *   · 值是空串             → 商户明确清空，把字段清空并登记到 footer_hidden_items
 *   · 值非空               → 用商户的，同时清掉「已隐藏」标记（从隐藏改回显示）
 *
 * copyright_labels 一并清空：规范化阶段它是主数据源，留着会被下一次
 * 合并再读回来覆盖 copyright_text，表现为「改了版权文字但不生效」。
 */
function applyPartnerFooter(
  appearance: SiteAppearance,
  overrides: PartnerFooterOverrides,
): SiteAppearance {
  const hidden = new Set(appearance.footer_hidden_items ?? []);
  const next: SiteAppearance = { ...appearance };

  const setText = (
    key: 'copyright_text' | 'terms_label' | 'privacy_label' | 'beian_label',
    marker: 'copyright' | 'terms' | 'privacy' | 'beian',
    value: string | undefined,
  ) => {
    if (value === undefined) return;
    if (value === '') {
      // 明确清空：字段置空 + 记下「这一项不要显示」
      next[key] = '';
      hidden.add(marker);
      return;
    }
    next[key] = value;
    hidden.delete(marker);
  };

  setText('copyright_text', 'copyright', overrides.copyright_text);
  setText('terms_label', 'terms', overrides.terms_label);
  setText('privacy_label', 'privacy', overrides.privacy_label);
  setText('beian_label', 'beian', overrides.beian_label);

  // 伙伴改过的项，labels 里对应的旧多语言必须丢掉，否则下一轮会被它盖回来
  if (overrides.copyright_text !== undefined) next.copyright_labels = undefined;
  if (overrides.terms_label !== undefined) next.terms_labels = undefined;
  if (overrides.privacy_label !== undefined) next.privacy_labels = undefined;

  next.footer_hidden_items = hidden.size > 0 ? [...hidden] : undefined;

  if (overrides.enabled !== undefined) {
    next.footer_copyright_config = { enabled: overrides.enabled };
  }

  return next;
}
