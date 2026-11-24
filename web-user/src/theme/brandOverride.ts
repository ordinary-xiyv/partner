/**
 * 伙伴主色覆盖 —— 一个极小的模块级 store。
 *
 * 为什么不用 React context 装这个值：
 *
 * 需要读它的有两处，分别在组件树的不同层：
 *   · ThemeProvider  → 写 body 上的 --theme-color-primary 等 CSS 变量
 *   · AntdAppProvider → 算 antd 的 colorPrimary
 *
 * 而「伙伴主色」的来源是 StatusContext，它挂在 AntdAppProvider *下面*。
 * 如果走 context，要么把 StatusProvider 提到最外层（那它就拿不到
 * AntdAppProvider 提供的 message 实例），要么把颜色一路 prop  drilling
 * 穿过 Router 和好几个 Provider —— 为了一个颜色值把树结构改乱，不划算。
 *
 * 模块级 store 在这里刚好够用：只有一个值、写的人只有一个（StatusContext）、
 * 读的人通过 useSyncExternalStore 订阅。谁先加载完都无所谓。
 */

let primaryColor: string | null = null;
const listeners = new Set<() => void>();

/** #RGB / #RRGGBB 之外的输入一律当作「没配」，避免把脏数据打进 CSS 变量 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * 主色的本地缓存 —— 解决刷新时的「先紫一下再变对色」闪烁。
 *
 * 闪烁的原因：伙伴主色来自 /api/partner/public/site-brand 这个网络请求，
 * 而 main.tsx 在首屏渲染时就要把 CSS 变量铺上去，那时请求还没回来，
 * 只能先用平台默认色（暗色 #8b73ff）画第一帧；等接口回来再改成商户色，
 * 于是就出现「紫 → 商户色」的跳变。
 *
 * 做法：把上一次成功拿到的商户主色存进 localStorage，模块初始化时就读出来，
 * 这样首帧直接用对的颜色。接口回来后照常覆写（值一样就什么都不做）。
 *
 * 安全性：主色只是个颜色，缓存错了最坏的结果是「这一个是旧色」，
 * 下一次接口回来就纠正 —— 不值得为它设过期时间或版本号。
 * 而且它是同源 localStorage：不同分销商域名各自一份，不会串。
 */
const CACHE_KEY = 'lynx_brand_primary_v1';

function readCachedPrimary(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return normalize(raw);
  } catch {
    return null;
  }
}

function writeCachedPrimary(value: string | null): void {
  try {
    if (value) localStorage.setItem(CACHE_KEY, value);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // 隐私模式 / 配额满：缓存写不进去不影响功能，只是会闪一下
  }
}

function normalize(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v || !HEX_COLOR.test(v)) return null;
  // 统一成小写 6 位，避免 #FFF 和 #ffffff 被当成两个不同的值触发多余重渲染
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }
  return v.toLowerCase();
}

/*
 * 模块加载即把缓存读进内存。
 *
 * 放在 normalize 之后声明 —— 函数声明会提升，但 CACHE_KEY 是 const，
 * 提前调用会撞上 TDZ。这里刻意写成「先定义函数、再赋值」的顺序。
 */
primaryColor = readCachedPrimary();

export function setBrandPrimaryColorOverride(value: string | null | undefined): void {
  const next = normalize(value);
  if (next === primaryColor) return;
  primaryColor = next;
  writeCachedPrimary(next);
  listeners.forEach((fn) => fn());
}

export function getBrandPrimaryColorOverride(): string | null {
  return primaryColor;
}

export function subscribeBrandPrimaryColorOverride(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/*
 * 页面标题覆盖。
 *
 * 单独一个值、和主色分开存，因为变更时机不同：主色变了要重刷一整套 CSS 变量，
 * 标题只是改一个字符串。放在一起会让「改标题」触发无意义的主题重算。
 *
 * 同样做成模块级而不是 context，理由见文件开头。标题的写入点有两处
 * （StatusContext 合并时、App.tsx 监听 i18n 变化时），都走 syncDocumentTitleFromBrand，
 * 所以覆盖值挂在这里，两处自动都能拿到。
 */
let pageTitle: string | null = null;

export function setBrandPageTitleOverride(value: string | null | undefined): void {
  const next = (value ?? '').trim() || null;
  pageTitle = next;
}

/**
 * 当前应当生效的页面标题。
 *
 * 返回 null 表示「伙伴没配自定义标题」，调用方走 i18n 的 `app.title`，
 * 那里已经用品牌名做了插值，不需要这里再拼一遍。
 */
export function getBrandPageTitleOverride(): string | null {
  return pageTitle;
}
