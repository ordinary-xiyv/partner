/**
 * 首页风格令牌 —— 主色派生。
 *
 * 这里解决的是整个白标体系里最容易被忽略的一个问题：
 *
 *   伙伴在后台只配一个 hex。它可能是明黄 #eab308、荧光绿 #22ff88、
 *   或者接近白的淡粉。而首页骨架里必然有「用主色写一行字」的地方
 *   （强调词、编号、指标）。把主色直接当文字色用，遇到浅色就是
 *   看不清 —— 这不是审美问题，是 WCAG 意义上的缺陷。
 *
 * 所以所有「主色当文字/前景」的场景都走派生：
 *   亮底不够对比 → 按色相往黑压，压到达标为止
 *   暗底不够对比 → 按色相往白提亮（暗底上压黑等于把颜色做没了）
 *
 * 与线上 theme/brandTokens.ts 的 deriveBrandPrimaryStates 是同一套思路，
 * 但职责不同：那边派生的是按钮的 hover/active 状态色，这边派生的是
 * 「可读的前景色」。两者不能合并——一个要保留主色本来的明度关系，
 * 一个必须牺牲明度换对比度。
 */

/** 首页两套骨架各自的底色，派生对比度时必须与 CSS 里的实际值一致 */
export type HomeSurface = 'editorial' | 'terminal';

/**
 * 风格 → CSS 变量前缀。
 *
 * 这个映射是必须的，不能直接拿 HomeSurface 当前缀。两套首页的样式表
 * 里全程写的是 `--ed-*`（editorial）和 `--tm-*`（terminal）—— 短前缀是
 * 当初手写这几百行 CSS 时就定下的。而 surface 的名字是完整单词，
 * 直接拼出来会变成 `--editorial-brand` / `--terminal-brand`，
 * 与样式表里的 `--ed-brand` / `--tm-brand` 完全对不上。
 *
 * 对不上的后果不是「颜色不好看」，而是**品牌色彻底失效**：
 * var(--tm-brand) 解析不到值，background 退化成 transparent，
 * 于是首屏那个本该是实心主色的「获取 API Key」渲染成了一个纯文字按钮，
 * 卡片上的主色描边、发光、标签底色也全部消失 —— 整页只剩下墨色的
 * 黑白灰。伙伴在后台配的主色，一个像素都没有出现。
 */
const SURFACE_VAR_PREFIX: Record<HomeSurface, string> = {
  editorial: 'ed',
  terminal: 'tm',
};

interface SurfaceTone {
  /** 亮色模式下的页面底色 */
  light: string;
  /** 暗色模式下的页面底色 */
  dark: string;
}

const SURFACE_BG: Record<HomeSurface, SurfaceTone> = {
  // 米白纸面：比纯白柔一点，长文阅读时不刺眼
  editorial: { light: '#f7f5f0', dark: '#131211' },
  // 近黑：不是纯黑，留一点层次给网格线和卡片
  terminal: { light: '#f4f5f7', dark: '#08090b' },
};

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function mixToward(hex: string, target: 'white' | 'black', ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = target === 'white' ? 255 : 0;
  return rgbToHex(r + (t - r) * ratio, g + (t - g) * ratio, b + (t - b) * ratio);
}

/** WCAG 相对亮度 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((n) => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度，返回 1~21 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 把主色压暗到「在指定底色上达到 minRatio 对比度」。
 *
 * 为什么逐步压而不是一步算到目标亮度：
 * 一步到位的做法会丢失色相（最终都是灰阶），而品牌色一旦变成灰
 * 就失去了「这是伙伴的品牌色」的意义。逐步混合能保住色相，
 * 只在必要范围内降低明度。
 *
 * 20 步 × 5% 的上限意味着最极端也只压到接近黑，不会死循环。
 */
export function readableOnLight(hex: string, bgHex: string, minRatio: number): string {
  if (contrastRatio(hex, bgHex) >= minRatio) return hex;
  for (let i = 1; i <= 20; i += 1) {
    const cur = mixToward(hex, 'black', i * 0.05);
    if (contrastRatio(cur, bgHex) >= minRatio) return cur;
  }
  return mixToward(hex, 'black', 0.8);
}

/** 暗底反方向：往白提亮。原因见文件头注释。 */
export function readableOnDark(hex: string, bgHex: string, minRatio: number): string {
  if (contrastRatio(hex, bgHex) >= minRatio) return hex;
  for (let i = 1; i <= 20; i += 1) {
    const cur = mixToward(hex, 'white', i * 0.05);
    if (contrastRatio(cur, bgHex) >= minRatio) return cur;
  }
  return mixToward(hex, 'white', 0.8);
}

/** 主色上的文字该黑还是白（阈值 0.6，与全站 readableTextOn 一致） */
export function inkOnPrimary(hex: string): string {
  return relativeLuminance(hex) > 0.6 ? '#18181b' : '#ffffff';
}

/**
 * 主色的 rgba 字符串。
 *
 * 直接拼 rgba 而不是用 hex8：#00000014 这种写法在老浏览器上支持不一致，
 * 而 rgba() 是 universally supported。首页要照顾的浏览器范围比后台宽。
 */
export function primaryRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface HomeStyleTokens {
  /** 主色原值，用于按钮填充、形状色块 */
  brand: string;
  /** 主色上的文字色 */
  brandInk: string;
  /** 主色 RGB 三元组，供 rgba(var(--x), .2) 复用 */
  brandRgb: string;
  /** 亮底上可读的主色（压暗过），用于大字号强调 */
  brandOnSurface: string;
  /** 同上但要求正文级对比度 4.5 */
  brandTextSafe: string;
  /** 暗底上可读的主色（提亮过） */
  brandLifted: string;
  /** 主色的大面积淡化版，用于光斑、高亮带 */
  brandGlow: string;
  /** 主色的极淡填充，用于标签背景 */
  brandPale: string;
}

/**
 * 由主色 + 风格 + 明暗模式算出整套首页令牌。
 *
 * 参数 mode 用 'light' | 'dark'（已落定的实际模式），不用 "system"：
 * system 是「怎么决定」而不是「结果是什么」，派生对比度必须知道真实底色。
 */
export function buildHomeStyleTokens(
  brandHex: string,
  surface: HomeSurface,
  mode: 'light' | 'dark',
): HomeStyleTokens {
  const bg = SURFACE_BG[surface][mode];
  const isDark = mode === 'dark';
  const [r, g, b] = hexToRgb(brandHex);

  // 大字（≥24px）AA 要求 3.0，正文要求 4.5
  const onSurface = isDark
    ? readableOnDark(brandHex, bg, 3.0)
    : readableOnLight(brandHex, bg, 3.0);
  const textSafe = isDark
    ? readableOnDark(brandHex, bg, 4.5)
    : readableOnLight(brandHex, bg, 4.5);

  return {
    brand: brandHex,
    brandInk: inkOnPrimary(brandHex),
    brandRgb: `${r},${g},${b}`,
    brandOnSurface: onSurface,
    brandTextSafe: textSafe,
    // 暗底上如果想用主色写字，即便已经达标也再提亮一档——
    // 深底上的饱和色视觉重量偏轻，不动会显得"陷进去"
    brandLifted: isDark ? mixToward(brandHex, 'white', 0.22) : onSurface,
    brandGlow: primaryRgba(brandHex, isDark ? 0.34 : 0.2),
    brandPale: primaryRgba(brandHex, isDark ? 0.14 : 0.09),
  };
}

/** 把令牌写成 CSS 变量名 → 值，供 style 对象直接铺到根节点 */
export function homeStyleTokenVars(
  tokens: HomeStyleTokens,
  surface: HomeSurface,
): Record<string, string> {
  const prefix = SURFACE_VAR_PREFIX[surface];
  return {
    [`--${prefix}-brand`]: tokens.brand,
    [`--${prefix}-brand-ink`]: tokens.brandInk,
    [`--${prefix}-brand-rgb`]: tokens.brandRgb,
    [`--${prefix}-brand-on-surface`]: tokens.brandOnSurface,
    [`--${prefix}-brand-text-safe`]: tokens.brandTextSafe,
    [`--${prefix}-brand-lifted`]: tokens.brandLifted,
    [`--${prefix}-brand-glow`]: tokens.brandGlow,
    [`--${prefix}-brand-pale`]: tokens.brandPale,
  };
}
