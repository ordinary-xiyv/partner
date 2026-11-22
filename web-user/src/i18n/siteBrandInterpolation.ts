import i18n from 'i18next';
import { resolveSiteBrandEn, resolveSiteBrandZh } from '../config/siteBrand';
import { getBrandPageTitleOverride } from '../theme/brandOverride';

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

/**
 * 同步浏览器标签页标题。
 *
 * 优先用伙伴后台配的 page_title：分销商可能希望标签页写「XX 智能云」
 * 而不是「XX API」，i18n 的 app.title 模板表达不了这种差异。
 * 没配就退回 i18n 的模板（那里已经插入了品牌名）。
 *
 * 两处调用方（StatusContext 合并后、App.tsx 监听 i18n 变化时）都走这里，
 * 所以覆盖值只需要挂在一个地方，两边自动一致。
 */
export function syncDocumentTitleFromBrand(): void {
  const override = getBrandPageTitleOverride();
  document.title = override ?? i18n.t('app.title');
}
