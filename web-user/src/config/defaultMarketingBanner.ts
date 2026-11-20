import type { MarketingBannerConfig } from '../types/siteAppearance';

export function buildDefaultMarketingBannerConfig(): MarketingBannerConfig {
  return {
    enabled: false,
    static_ad: false,
    background_image_file_id: '',
    link_url: '',
    start_at: 0,
    end_at: 0,
  };
}

/** 兼容旧版 path/href/link_type 配置 */
export function normalizeMarketingBannerConfig(
  raw: Partial<MarketingBannerConfig> & {
    link_type?: string;
    path?: string;
    href?: string;
  } | undefined,
): MarketingBannerConfig {
  const base = buildDefaultMarketingBannerConfig();
  if (!raw) return base;

  let linkUrl = raw.link_url?.trim() || '';
  if (!linkUrl) {
    if (raw.link_type === 'internal' && raw.path?.trim()) {
      linkUrl = raw.path.trim();
    } else if (raw.link_type === 'external' && raw.href?.trim()) {
      linkUrl = raw.href.trim();
    }
  }

  return {
    enabled: raw.enabled ?? base.enabled,
    static_ad: raw.static_ad ?? base.static_ad,
    background_image_file_id: raw.background_image_file_id?.trim() || '',
    background_image_url: raw.background_image_url,
    link_url: linkUrl,
    start_at: 0,
    end_at: 0,
  };
}
