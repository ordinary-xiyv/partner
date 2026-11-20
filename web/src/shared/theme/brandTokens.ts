export type ThemeModeResolved = 'light' | 'dark';

/**
 * ============================================================================
 *  品牌色令牌
 * ============================================================================
 *
 *  平台有两套品牌，同一套令牌层要同时服务：
 *
 *  1. 平台主题（dealer-admin）——固定紫色，任何经销商看到的后台都长一样。
 *  2. 租户主题（dealer-user）——按域名解析出经销商自己的品牌色，运行时注入。
 *
 *  因此这里的主色**不能是常量**。`BRAND_PRIMARY_HEX` 仅作为平台默认值保留，
 *  真正生效的颜色由 ThemeProvider 传入的 `primaryHex` 决定。
 *
 *  hover / active 不写死，而是从主色推导：
 *  hover 往黑（亮色模式）或往白（暗色模式）混合，active 混合更多。
 *  这样无论经销商选什么颜色，状态色都与其同色系，不会出现「紫色按钮 + 蓝色 hover」。
 */

/** 平台默认主色（亮 / 暗）。与 lynxtonapi 保持同一色系，暗色略提亮以保证深底对比。 */
export const BRAND_PRIMARY_HEX: Record<ThemeModeResolved, string> = {
  dark: '#8b73ff',
  light: '#6d51fe',
};

/** 平台默认 hover / active。仅用于常量场景，实际渲染由 deriveBrandPalette 推导。 */
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

/** 校验并归一化传入的主色；非法值回退到平台默认，避免脏配置把整站刷成黑色。 */
export function normalizeHex(input: string | undefined | null, fallback: string): string {
  if (!input) return fallback;
  const raw = String(input).trim();
  if (!/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return fallback;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (withHash.length === 4) {
    const [r, g, b] = withHash.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return withHash.toLowerCase();
}

/** 线性 RGB 混合：ratio=0 返回 a，ratio=1 返回 b。比 HSL 调亮度更可预测，不会偏色相。 */
function mixHex(a: string, b: string, ratio: number): string {
  const [ar, ag, ab] = hexRgbChannels(a);
  const [br, bg, bb] = hexRgbChannels(b);
  const t = Math.min(1, Math.max(0, ratio));
  const to = (x: number, y: number) => Math.round(x + (y - x) * t);
  const hex2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex2(to(ar, br))}${hex2(to(ag, bg))}${hex2(to(ab, bb))}`;
}

/**
 * WCAG 相对亮度。用于判断「主色底上该配白字还是黑字」。
 * 经销商如果选了青绿（#0d9488）或琥珀（#d97706），白字对比度只有 3.2~3.8，
 * 黑字反而有 5.6~6.6 —— 必须能自适应，否则深色主色上全是糊的。
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexRgbChannels(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 对比度：(亮 + 0.05) / (暗 + 0.05)，范围 1~21 */
function contrastRatio(lumA: number, lumB: number): number {
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

/**
 * 主色实心按钮上的文字色。
 *
 * 不能用「亮度 > 某个阈值」来判断：那个分界点其实是 0.179（黑白对比度相等的点），
 * 但用 0.55 这种拍脑袋的阈值，会把 #0d9488 / #d97706 这类中亮度色判成「需要白字」，
 * 结果对比度只有 3.2~3.8，正文根本读不清。
 * 这里直接算两种配色的对比度取大者，任何颜色都不会选错。
 */
export function readableOnPrimary(hex: string): string {
  const lum = relativeLuminance(hex);
  const withWhite = contrastRatio(lum, 1);
  const withBlack = contrastRatio(lum, 0.0173); // #18181b 的亮度
  return withBlack >= withWhite ? '#18181b' : '#ffffff';
}

export interface BrandPalette {
  primary: string;
  hover: string;
  active: string;
  /** 主色实心区域上的文字色 */
  onPrimary: string;
  /** 当文字色用时的主色（已按 AA 4.5 调过明度） */
  text: string;
}

/**
 * 从主色推导一整套状态色。
 * - 亮色模式：hover / active 逐步加深（白底上越深越有「按下」的手感）
 * - 暗色模式：hover 提亮（深底上加深会看不见），active 略微回落
 */
export function deriveBrandPalette(mode: ThemeModeResolved, primaryInput?: string): BrandPalette {
  const fallback = BRAND_PRIMARY_HEX[mode];
  const primary = normalizeHex(primaryInput, fallback);

  if (mode === 'dark') {
    return {
      primary,
      hover: mixHex(primary, '#ffffff', 0.16),
      active: mixHex(primary, '#000000', 0.12),
      onPrimary: readableOnPrimary(primary),
      text: readableAccentText(mode, primary),
    };
  }
  return {
    primary,
    hover: mixHex(primary, '#000000', 0.14),
    active: mixHex(primary, '#000000', 0.26),
    onPrimary: readableOnPrimary(primary),
    text: readableAccentText(mode, primary),
  };
}

/**
 * 把品牌色调整到「可以安全当文字色用」的版本。
 *
 * 为什么必须区分「背景色」和「文字色」：
 *
 * 同一个主色不可能同时满足两件互相矛盾的事——
 *   当背景：要够浅（配黑字）或够深（配白字），对比度才够；
 *   当文字：要跟页面底色拉开足够的亮度差。
 *
 * 实测（暗底 #18181b，亮底 #ffffff）：
 *   #d97706 琥珀   当文字：亮底 3.19 ✗   当背景配黑字 5.56 ✓
 *   #8b73ff 紫     当文字：亮底 3.50 ✗
 *   #6d51fe 紫     当文字：暗底 3.59 ✗
 * 也就是说无论怎么选，只要一个变量两用，总有一个模式是读不清的。
 *
 * 所以另开一个 `--accent-text`：保持品牌色相，只沿明度方向做最小幅度调整，
 * 直到对比度达标（AA 4.5）。品牌色仍然是品牌色，只是深/浅一档。
 */
export function readableAccentText(
  mode: ThemeModeResolved,
  primaryInput?: string,
): string {
  const primary = normalizeHex(primaryInput, BRAND_PRIMARY_HEX[mode]);
  // 页面卡片底色：暗色 #18181b / 亮色 #ffffff（与 antd colorBgContainer 一致）
  const bgLum = mode === 'dark' ? relativeLuminance('#18181b') : 1;
  if (contrastRatio(relativeLuminance(primary), bgLum) >= 4.5) return primary;

  // 暗底往白调、亮底往黑调；每步 2.5%，最多 40 步（≈100%），保证一定能收敛
  const towards = mode === 'dark' ? '#ffffff' : '#000000';
  for (let i = 1; i <= 40; i += 1) {
    const candidate = mixHex(primary, towards, i * 0.025);
    if (contrastRatio(relativeLuminance(candidate), bgLum) >= 4.5) return candidate;
  }
  return towards;
}

/** 写入 body 的 CSS 变量映射，与 index.css 命名保持一致 */
export function brandCssVariableMap(
  mode: ThemeModeResolved,
  primaryInput?: string,
): Record<string, string> {
  const { primary, hover, active, onPrimary, text } = deriveBrandPalette(mode, primaryInput);
  return {
    '--accent-primary': primary,
    /*
     * 当文字色用的主色。
     *
     * 不要用 --accent-primary 去设 color：
     * 主色要同时当背景（按钮）和文字（链接、强调数字），
     * 这两个角色对明度的要求是相反的，一个值满足不了两边。
     * 实测 #d97706 当文字在白底上只有 3.19，#6d51fe 在暗底上只有 3.59，
     * 都读不清。凡是 color: 都用这一条。
     */
    '--accent-text': text,
    '--theme-color-primary': primary,
    '--theme-color-primary-hover': hover,
    '--theme-color-primary-active': active,
    '--theme-color-primary-bg': primaryRgba(primary, mode === 'dark' ? 0.14 : 0.08),
    '--theme-color-primary-border': primaryRgba(primary, mode === 'dark' ? 0.4 : 0.28),
    '--accent-primary-rgba-08': primaryRgba(primary, 0.08),
    '--accent-primary-rgba-12': primaryRgba(primary, 0.12),
    '--accent-primary-rgba-20': primaryRgba(primary, 0.2),
    // 主色实心块（按钮 / logo 方块 / 选中态）上的文字色
    '--btn-primary-text': onPrimary,
  };
}

/** 把品牌变量注入 body（主题或租户品牌变化时调用） */
export function applyBrandCssVariables(mode: ThemeModeResolved, primaryInput?: string): void {
  const map = brandCssVariableMap(mode, primaryInput);
  const body = document.body;
  Object.entries(map).forEach(([key, value]) => body.style.setProperty(key, value));
}
