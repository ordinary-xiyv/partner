/** 未配置服务端品牌名时的默认展示（与后端 defaultFooter 一致） */
export const DEFAULT_SITE_BRAND_ZH =
  (import.meta.env.VITE_DEFAULT_BRAND_NAME_ZH as string | undefined)?.trim() || '';

export const DEFAULT_SITE_BRAND_EN =
  (import.meta.env.VITE_DEFAULT_BRAND_NAME_EN as string | undefined)?.trim() || '';

export function resolveSiteBrandZh(value?: string | null): string {
  const v = value?.trim();
  return v || DEFAULT_SITE_BRAND_ZH;
}

export function resolveSiteBrandEn(value?: string | null): string {
  const v = value?.trim();
  return v || DEFAULT_SITE_BRAND_EN;
}
