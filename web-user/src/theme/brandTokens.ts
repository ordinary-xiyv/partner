export type ThemeModeResolved = 'light' | 'dark';

/**
 * 品牌主色（亮 / 暗）。修改此处后：
 * - `applyBrandCSSVariables` 会更新 `--accent-primary`、`--theme-color-primary*` 等；
 * - `--lynx-select-*` / `.lynx-selectable--active`：全站选中态（与模型广场一致），优先于 `--app-item-selected-*`；
 * - `--app-item-selected-*`：遗留变量，新代码请用 selectable-item.css；
 * - `buildAntdTheme` 的 `colorPrimary` 与 Table/Pagination 半透明色会与之对齐。
 * hover / active 需与主色色相协调，换主色时请一并调整。
 */
export const BRAND_PRIMARY_HEX: Record<ThemeModeResolved, string> = {
  /** 暗色界面略提亮，保证在深底上作为主色与描边足够醒目 */
  dark: '#8b73ff',
  light: '#6d51fe',
};

export const BRAND_PRIMARY_STATES: Record<ThemeModeResolved, { hover: string; active: string }> = {
  dark: { hover: '#a894ff', active: '#6f56e8' },
  light: { hover: '#5a3ae8', active: '#4a2fd4' },
};

export function hexRgbChannels(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) {
    return [0, 0, 0];
  }
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function primaryRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgbChannels(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 写入 `document.body` 的 CSS 变量名 → 值（与历史 `index.css` / `theme-dark.css` 命名一致并扩展 tint） */
export function brandCssVariableMap(mode: ThemeModeResolved): Record<string, string> {
  const hex = BRAND_PRIMARY_HEX[mode];
  const { hover, active } = BRAND_PRIMARY_STATES[mode];
  const isDark = mode === 'dark';
  return {
    '--accent-primary': hex,
    '--theme-color-primary': hex,
    '--theme-color-primary-hover': hover,
    '--theme-color-primary-active': active,
    '--theme-color-primary-light-default': primaryRgba(hex, 0.1),
    '--theme-color-primary-light-hover': primaryRgba(hex, 0.18),
    '--theme-color-primary-tint-08': primaryRgba(hex, 0.08),
    '--theme-color-primary-tint-20': primaryRgba(hex, 0.2),
    '--theme-color-primary-tint-22': primaryRgba(hex, 0.22),
    /** 全站选中态（浅紫底 + 主题描边 + 主题色字） */
    '--lynx-select-bg': primaryRgba(hex, isDark ? 0.12 : 0.1),
    '--lynx-select-border': primaryRgba(hex, isDark ? 0.35 : 0.28),
    '--lynx-select-text': hex,
    '--lynx-select-radius': '8px',
    '--lynx-nav-font-size': '15px',
    '--lynx-nav-font-size-sub': '13px',
    '--lynx-nav-icon-size': '16px',
    '--lynx-tab-font-size': '16px',
    '--lynx-pill-font-size': '13px',
    /** @deprecated 请迁移至 .lynx-selectable--active */
    '--app-item-selected-bg': primaryRgba(hex, isDark ? 0.12 : 0.1),
    '--app-item-selected-bg-hover': primaryRgba(hex, isDark ? 0.17 : 0.15),
    '--app-item-selected-ring': primaryRgba(hex, isDark ? 0.36 : 0.26),
    '--app-item-selected-glow': primaryRgba(hex, isDark ? 0.18 : 0.12),
  };
}
