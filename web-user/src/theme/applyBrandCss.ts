import type { ThemeModeResolved } from './brandTokens';
import { brandCssVariableMap } from './brandTokens';

/**
 * 将品牌主色同步到 `body` 上的 CSS 变量（Ant 以外、纯 CSS / inline 样式依赖 `--theme-*`、`--app-item-selected-*` 等）
 *
 * `overridePrimaryHex` 是伙伴后台下发的主色。传了就覆盖平台默认品牌色 ——
 * 这是「分销商自定义样式」在 CSS 变量这一层的落点。
 */
export function applyBrandCSSVariables(
  mode: ThemeModeResolved,
  overridePrimaryHex?: string | null,
): void {
  const map = brandCssVariableMap(mode, overridePrimaryHex);
  for (const [key, value] of Object.entries(map)) {
    document.body.style.setProperty(key, value);
  }
}
