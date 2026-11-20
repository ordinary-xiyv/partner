import type { LynxSiteFooterConfig } from '../types';
import type { SiteAppearance } from '../types/siteAppearance';
import { normalizeMarketingBannerConfig } from '../config/defaultMarketingBanner';
import { normalizeCustomerServiceConfig } from '../config/defaultCustomerService';
import { normalizeFooterBrandConfig } from '../config/defaultFooterBrand';
import { normalizeLoginMediaConfig } from '../config/defaultLoginMedia';
import { readStoredSiteBrand } from './siteBrandStorage';
import { readStoredSiteAppearance } from './siteAppearanceStorage';
import { normalizeSiteAppearanceDocs } from './normalizeSiteAppearanceDocs';
import { normalizeSiteAppearanceLabels } from './normalizeSiteAppearanceLabels';

function sortBySort<T extends { sort: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort - b.sort);
}

/** 合并 API / 页脚旧接口 / localStorage / 默认值 */
export function mergeSiteAppearance(
  defaults: SiteAppearance,
  sources: {
    api?: Partial<SiteAppearance> | null;
    footer?: LynxSiteFooterConfig | null;
    local?: SiteAppearance | null;
  },
): SiteAppearance {
  const brand = readStoredSiteBrand();
  const local = sources.local ?? readStoredSiteAppearance();
  const api = sources.api ?? {};
  const footer = sources.footer ?? {};

  const merged: SiteAppearance = {
    ...defaults,
    ...local,
    ...api,
    brand_name_zh: api.brand_name_zh ?? local?.brand_name_zh ?? brand.brand_name_zh ?? defaults.brand_name_zh,
    brand_name_en: api.brand_name_en ?? local?.brand_name_en ?? brand.brand_name_en ?? defaults.brand_name_en,
    copyright_text: api.copyright_text ?? local?.copyright_text ?? footer.copyright_text ?? defaults.copyright_text,
    terms_label: api.terms_label ?? local?.terms_label ?? footer.terms_label ?? defaults.terms_label,
    privacy_label: api.privacy_label ?? local?.privacy_label ?? footer.privacy_label ?? defaults.privacy_label,
    beian_label: api.beian_label ?? local?.beian_label ?? footer.beian_label ?? defaults.beian_label,
    layout_config: {
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
    marketing_banner_config: normalizeMarketingBannerConfig({
      ...defaults.marketing_banner_config,
      ...local?.marketing_banner_config,
      ...api.marketing_banner_config,
    }),
    customer_service_config: normalizeCustomerServiceConfig({
      ...defaults.customer_service_config,
      ...local?.customer_service_config,
      ...api.customer_service_config,
    }),
    login_media_config: normalizeLoginMediaConfig({
      ...defaults.login_media_config,
      ...local?.login_media_config,
      ...api.login_media_config,
    }),
  };

  return normalizeSiteAppearanceLabels(normalizeSiteAppearanceDocs(merged));
}
