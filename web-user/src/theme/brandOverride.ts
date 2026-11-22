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

function normalize(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v || !HEX_COLOR.test(v)) return null;
  // 统一成小写 6 位，避免 #FFF 和 #ffffff 被当成两个不同的值触发多余重渲染
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }
  return v.toLowerCase();
}

export function setBrandPrimaryColorOverride(value: string | null | undefined): void {
  const next = normalize(value);
  if (next === primaryColor) return;
  primaryColor = next;
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
