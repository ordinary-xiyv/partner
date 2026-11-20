import type { ThemeModeResolved } from './brandTokens';
import { brandCssVariableMap } from './brandTokens';

/** 将品牌主色同步到 `body` 上的 CSS 变量（Ant 以外、纯 CSS / inline 样式依赖 `--theme-*`、`--app-item-selected-*` 等） */
export function applyBrandCSSVariables(mode: ThemeModeResolved): void {
  const map = brandCssVariableMap(mode);
  for (const [key, value] of Object.entries(map)) {
    document.body.style.setProperty(key, value);
  }
}
