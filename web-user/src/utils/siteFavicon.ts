import {
  getBrandPrimaryColorOverride,
} from '../theme/brandOverride';
import {
  readableTextOn,
  resolveBrandPrimaryHex,
  type ThemeModeResolved,
} from '../theme/brandTokens';

const FAVICON_LINK_ID = 'lynxton-site-favicon';
const APPLE_TOUCH_LINK_ID = 'lynxton-site-apple-touch-icon';

/**
 * 上一次真正写进 <link> 的图标标识。
 *
 * applyFaviconDecision 会被 fetchAll（每 8 分钟）、伙伴品牌到达、本地外观
 * 变更等多处调用。每次都重画一遍 canvas（首字图标）或重设一遍 link.href
 * 是纯粹的浪费 —— 后者还会让浏览器重新解码这张图。
 *
 * 图片图标的键是 `url:<href>`，首字图标的键是 `initial:<首字>|<底色>|<字色>`。
 * 加前缀是为了避免一个恰好叫 `initial:...` 的 URL 和生产出来的键撞上。
 *
 * ★ 这个值必须在「切到别种图标」时被重置，否则会出现：
 *   首字图标 → 商户传了 favicon（切到 url:）→ 商户又删掉 favicon
 *   → 键变回同一个 initial:... → 命中缓存直接 return，
 *   图标停在 url: 那张上不动，看起来像「删了没生效」。
 */
let lastAppliedKey: string | null = null;

/**
 * 缓存键命中，且页头里那个 <link> 还在。
 *
 * 只比键是不够的：万一有别的代码（或某个浏览器扩展）把 head 里的 link 删了，
 * lastAppliedKey 仍是旧值，于是这里一路 return，标签图标就永远回不来 ——
 * 而这种「图标莫名消失」在业务侧几乎没法查。多判一次 getElementById 很便宜。
 */
function isAlreadyApplied(key: string): boolean {
  return key === lastAppliedKey && document.getElementById(FAVICON_LINK_ID) !== null;
}

function guessFaviconMimeType(url: string, contentType?: string): string {
  const ct = contentType?.trim();
  if (ct) return ct;
  const lower = url.toLowerCase();
  if (lower.endsWith('.svg') || lower.includes('.svg?')) return 'image/svg+xml';
  if (lower.endsWith('.webp') || lower.includes('.webp?')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.includes('.jpeg?')) return 'image/jpeg';
  if (lower.endsWith('.ico') || lower.includes('.ico?')) return 'image/x-icon';
  return 'image/png';
}

function upsertLink(id: string, rel: string, href: string, type?: string): void {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    document.head.appendChild(link);
  }
  link.rel = rel;
  link.href = href;
  if (type) {
    link.type = type;
  } else {
    link.removeAttribute('type');
  }
}

/** 移除所有 favicon / apple-touch-icon，标签页不显示默认站点图标 */
export function clearSiteFavicon(): void {
  for (const id of [FAVICON_LINK_ID, APPLE_TOUCH_LINK_ID]) {
    document.getElementById(id)?.remove();
  }
  document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((el) => {
    el.remove();
  });
  lastAppliedKey = null;
}

/** 将浏览器标签页 / 收藏夹图标切换为 OSS 预签名地址；无 URL 时不显示任何图标 */
export function applySiteFavicon(url?: string | null, contentType?: string): void {
  const href = url?.trim();
  if (!href) {
    clearSiteFavicon();
    return;
  }
  /*
   * 同一张图重复应用就跳过。重设 link.href（哪怕是同一个值）会让浏览器
   * 重新解码这张图，而本函数每次主题切换、每次 8 分钟轮询都会被调到。
   * 跳过之后行为完全一致，只是少了无意义的解码。
   */
  const key = `url:${href}`;
  if (isAlreadyApplied(key)) return;
  const mime = guessFaviconMimeType(href, contentType);
  upsertLink(FAVICON_LINK_ID, 'icon', href, mime);
  upsertLink(APPLE_TOUCH_LINK_ID, 'apple-touch-icon', href);
  lastAppliedKey = key;
}


/* ────────────────────────────────────────────────────────────────
 * 首字图标：没上传 favicon 时用品牌首字画一个标签图标
 *
 * 需求来源：商户在伙伴后台上传了品牌名却没上传标签图标，浏览器标签页
 * 就是一片空白（或者一张平台旧图）。而页头明明已经画了「品牌色方块 +
 * 首字」，两处应该长得一样。
 *
 * 为什么用 canvas 画成 PNG data URL，而不是直接塞一个 SVG：
 *   · SVG favicon 在 Safari 上支持得很差（15 之前完全不认，之后也只在
 *     部分场景生效），商户里 macOS + Safari 的比例不低；
 *   · PNG data URL 是所有浏览器都稳的选择，且不产生任何网络请求，
 *     标签图标不会因为「图还没下载完」而闪一下空白。
 * ──────────────────────────────────────────────────────────────── */

/** 64×64 足够覆盖标签页 / 收藏夹 / 高分屏，再大只是白占内存 */
const INITIAL_ICON_SIZE = 64;
/** 圆角比例：页头方块是 32px 里的 8px，对齐成 1/4 */
const INITIAL_ICON_RADIUS_RATIO = 0.25;
/** 字号比例：页头是 32px 里的 17px，标签图标缩到 64 后略放大一点更清晰 */
const INITIAL_ICON_FONT_RATIO = 0.56;

/**
 * 取「方块底色 + 字色」这一对。
 *
 * ★ 为什么不读 body 上的 CSS 变量（`getComputedStyle`）：
 *   有个隐蔽的时序陷阱。StatusContext 里写主色的顺序是
 *     setBrandPrimaryColorOverride(伙伴主色)   ← 只写模块 store
 *     applyFaviconDecision()                   ← 同一帧里紧接着执行
 *   而 CSS 变量要等 ThemeProvider 重渲染 + 跑完 effect 才会落到 body 上。
 *   所以在 applyFaviconDecision 里读 CSS 变量，拿到的**必然是上一个颜色**
 *   （首次进站就是平台默认紫）。图标会一直慢一拍，且看不出原因。
 *
 *   改成直接调用主题层那两个纯函数算，输入和 ThemeProvider 用的是同一份
 *   （模块 store 里的主色 + 由调用方传入的明暗模式），结果一致且同步可用。
 *
 * ★ 明暗模式为什么要调用方传：React 的 effect 是子先父后执行的。
 *   StatusProvider 在 ThemeProvider 的子树里，它的 effect 跑在 ThemeProvider
 *   之前 —— 此时 documentElement 上的 theme-mode 属性还是**上一轮**的值。
 *   所以读 DOM 属性在切主题这一刻必然读到旧的，只能由调用方把最新值传进来。
 *   没传时（其他调用方）才退回读 DOM 属性。
 */
function resolveMarkColors(mode?: ThemeModeResolved): { bg: string; fg: string } {
  let resolvedMode: ThemeModeResolved = mode ?? 'dark';
  if (!mode) {
    try {
      const attr = document.documentElement.getAttribute('theme-mode');
      if (attr === 'light' || attr === 'dark') {
        resolvedMode = attr;
      } else {
        resolvedMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {
      /* 极端环境下拿不到 matchMedia，用 dark 兜底（与 index.html 默认一致） */
    }
  }
  const bg = resolveBrandPrimaryHex(resolvedMode, getBrandPrimaryColorOverride());
  return { bg, fg: readableTextOn(bg) };
}

/** 画圆角矩形。roundRect 是较新的 API，老 Safari 没有，得自己补一条路径 */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  size: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, size / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, size, size, r);
    return;
  }
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.arcTo(size, 0, size, r, r);
  ctx.lineTo(size, size - r);
  ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size);
  ctx.arcTo(0, size, 0, size - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
}

/**
 * 生成「品牌色圆角方块 + 一个首字」的 PNG data URL。
 *
 * 返回 null 表示环境不支持（拿不到 canvas 2d 上下文、或者 toDataURL 抛错，
 * 例如某些隐私模式）。调用方据此退回「不显示图标」，绝不能因此把
 * 已有的平台图标也弄丢 —— 那属于「一个小功能无效，顺手弄坏了旧的」。
 */
function buildInitialFaviconDataUrl(initial: string, bg: string, fg: string): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = INITIAL_ICON_SIZE;
    canvas.height = INITIAL_ICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const size = INITIAL_ICON_SIZE;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = bg;
    roundedRectPath(ctx, size, size * INITIAL_ICON_RADIUS_RATIO);
    ctx.fill();

    ctx.fillStyle = fg;
    ctx.font = `800 ${Math.round(size * INITIAL_ICON_FONT_RATIO)}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    /*
     * 视觉居中：textBaseline='middle' 对齐的是字形的 em 框中线，
     * 而汉字和拉丁字母的视觉重心都略偏上，直接画会在方块里显得下沉。
     * 上移 4% 是肉眼调平的经验值，和页头方块里 CSS 的居中观感一致。
     */
    ctx.fillText(initial, size / 2, size / 2 - size * 0.04);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * 用品牌首字当标签图标。
 *
 * 调用时机由 StatusContext 的 applyFaviconDecision 决定 —— 只在
 * 「伙伴有品牌但没有 favicon」时走到这里。首字为空串时等同「没东西可画」，
 * 直接清空图标（经销商站点的既定行为：不继承平台那张图）。
 *
 * mode 传当前明暗模式，理由见 resolveMarkColors 的注释。
 */
export function applySiteInitialFavicon(
  initial: string,
  mode?: ThemeModeResolved,
): void {
  const mark = Array.from(initial.trim())[0] ?? '';
  if (!mark) {
    clearSiteFavicon();
    return;
  }

  const { bg, fg } = resolveMarkColors(mode);
  const key = `initial:${mark}|${bg}|${fg}`;
  if (isAlreadyApplied(key)) return;

  const dataUrl = buildInitialFaviconDataUrl(mark, bg, fg);
  if (!dataUrl) {
    /*
     * 画不出来。这里刻意**不清空**已有图标：
     * canvas 失败是很局部的环境问题，而 clearing 会把当前正在显示的
     * 图标（可能是平台那张）一起弄没，代价比「首字图标没生效」大得多。
     * 保持原样，下一次决策还会再试一次。
     */
    return;
  }
  upsertLink(FAVICON_LINK_ID, 'icon', dataUrl, 'image/png');
  upsertLink(APPLE_TOUCH_LINK_ID, 'apple-touch-icon', dataUrl);
  lastAppliedKey = key;
}


export function resolveSiteFaviconUrl(
  favicons: Array<{ download_url?: string; content_type?: string }> | null | undefined,
): { url?: string; contentType?: string } {
  const row = favicons?.[0];
  const url = row?.download_url?.trim();
  if (!url) return {};
  return { url, contentType: row?.content_type?.trim() || undefined };
}
