export type ThemeModeResolved = 'light' | 'dark';

/**
 * 品牌主色（亮 / 暗）。修改此处后：
 * - `applyBrandCSSVariables` 会更新 `--accent-primary`、`--theme-color-primary*` 等；
 * - `--lynx-select-*` / `.lynx-selectable--active`：全站选中态（与模型广场一致），优先于 `--app-item-selected-*`；
 * - `--app-item-selected-*`：遗留变量，新代码请用 selectable-item.css；
 * - `buildAntdTheme` 的 `colorPrimary` 与 Table/Pagination 半透明色会与之对齐。
 * hover / active 需与主色色相协调，换主色时请一并调整。
 *
 * 这两个值是**默认品牌色**（平台自己的紫）。分销商在伙伴后台配了 primary_color
 * 之后，实际生效的颜色由 `brandOverride` 覆盖，这里的默认值就不再参与计算了。
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

function clampChannel(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => clampChannel(n).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 按比例把颜色往白（ratio>0）或黑（ratio<0）方向混。
 *
 * 导出给登录页用（AuthModal 的 buildAuthThemeVars）：它要按同一套方向感
 * 派生自己的几个档位。复制一份实现的话，将来这里调比例、那边不跟，
 * 同一个品牌色会在首页和登录页呈现出微妙的两种倾向。
 */
export function mixToward(base: string, target: 'white' | 'black', ratio: number): string {
  const [r, g, b] = hexRgbChannels(base);
  const t = target === 'white' ? 255 : 0;
  return toHex(
    r + (t - r) * ratio,
    g + (t - g) * ratio,
    b + (t - b) * ratio,
  );
}

/**
 * 由主色派生 hover / active。
 *
 * 派生规则刻意和原来手写的那两组值保持同一个方向：
 *   · 亮色界面：hover / active 都往黑压 —— 白底上按钮变深，按下感明确
 *   · 暗色界面：hover 往白提亮（深底上提亮才看得见），active 往黑压回去
 *
 * 如果只是机械地统一「变深 10%」，暗色界面里按钮 hover 会几乎看不出来 ——
 * 深色底上的深色按钮本来对比就低。这也是原来那两组手写值一深一浅的原因。
 */
export function deriveBrandPrimaryStates(
  hex: string,
  mode: ThemeModeResolved,
): { hover: string; active: string } {
  if (mode === 'dark') {
    return {
      hover: mixToward(hex, 'white', 0.18),
      active: mixToward(hex, 'black', 0.14),
    };
  }
  return {
    hover: mixToward(hex, 'black', 0.12),
    active: mixToward(hex, 'black', 0.24),
  };
}

/**
 * 主色上的文字该用白还是黑。
 *
 * 分销商可能配一个很浅的主色（比如 #ffe066），此时按钮上的白字直接糊成一片。
 * 用 sRGB 相对亮度判一下，浅底配黑字、深底配白字。
 * 阈值取 0.6 而不是教科书上的 0.5：品牌主色多为饱和色，0.5 左右那些
 * （比如 #00b96b）配白字的观感明显好于配黑字。
 */
export function readableTextOn(bgHex: string): string {
  const [r, g, b] = hexRgbChannels(bgHex).map((n) => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#18181b' : '#ffffff';
}

/** 解析某模式下实际生效的主色：有伙伴覆盖用伙伴的，否则用默认 */
export function resolveBrandPrimaryHex(mode: ThemeModeResolved, override?: string | null): string {
  return override && override.trim() ? override.trim() : BRAND_PRIMARY_HEX[mode];
}

/** 解析某模式下实际生效的 hover / active：跟着主色走，默认色则保留手写值 */
export function resolveBrandPrimaryStates(
  mode: ThemeModeResolved,
  override?: string | null,
): { hover: string; active: string } {
  return override && override.trim()
    ? deriveBrandPrimaryStates(override.trim(), mode)
    : BRAND_PRIMARY_STATES[mode];
}


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
export function brandCssVariableMap(
  mode: ThemeModeResolved,
  overridePrimaryHex?: string | null,
): Record<string, string> {
  const hex = resolveBrandPrimaryHex(mode, overridePrimaryHex);
  const { hover, active } = resolveBrandPrimaryStates(mode, overridePrimaryHex);
  const isDark = mode === 'dark';
  return {
    '--accent-primary': hex,
    '--theme-color-primary': hex,
    '--theme-color-primary-hover': hover,
    '--theme-color-primary-active': active,
    /*
     * 主色上的文字色。CSS 里多处写的是 `var(--btn-primary-text, #fff)` ——
     * 之前只有白字这一种可能，分销商配个浅色主色就糊了，所以这也要跟着主色走。
     */
    '--btn-primary-text': readableTextOn(hex),
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
