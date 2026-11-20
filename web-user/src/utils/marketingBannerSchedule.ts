import type { MarketingBannerConfig } from '../types/siteAppearance';

export function shouldShowMarketingBanner(
  cfg: MarketingBannerConfig | undefined,
): boolean {
  if (!cfg?.enabled) return false;
  if (!cfg.background_image_file_id?.trim() && !cfg.background_image_url?.trim()) return false;
  // 静态广告只展示图片，不要求跳转链接；非静态广告才校验 link_url
  if (!cfg.static_ad && !cfg.link_url?.trim()) return false;
  return true;
}

/** http(s) 新标签打开，/ 开头站内当前页跳转 */
export function isExternalMarketingLink(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}
