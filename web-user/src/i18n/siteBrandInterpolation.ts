import i18n from 'i18next';
import { resolveSiteBrandEn, resolveSiteBrandZh } from '../config/siteBrand';

export interface SiteBrandInterpolationVars {
  brandName: string;
  brandNameEn: string;
}

export function buildSiteBrandInterpolationVars(
  brandNameZh?: string | null,
  brandNameEn?: string | null,
): SiteBrandInterpolationVars {
  const brandName = resolveSiteBrandZh(brandNameZh);
  const resolvedBrandNameEn = resolveSiteBrandEn(brandNameEn);
  return { brandName, brandNameEn: resolvedBrandNameEn };
}

/** 注入 i18n 全局 {{brandName}} / {{brandNameEn}} 默认值 */
export function applySiteBrandInterpolation(
  brandNameZh?: string | null,
  brandNameEn?: string | null,
): SiteBrandInterpolationVars {
  const vars = buildSiteBrandInterpolationVars(brandNameZh, brandNameEn);
  const interpolation = i18n.options.interpolation ?? {};
  i18n.options.interpolation = {
    ...interpolation,
    defaultVariables: {
      ...(interpolation.defaultVariables as Record<string, string> | undefined),
      ...vars,
    },
  };
  return vars;
}

export function syncDocumentTitleFromBrand(): void {
  document.title = i18n.t('app.title');
}
