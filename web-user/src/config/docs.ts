export type DocLang = 'zh' | 'en';

/** 站内文档中心首页 */
export function getDocsHomeUrl(_lang: DocLang = 'zh'): string {
  return '/docs';
}

export function getDocsArticleUrl(slug: string): string {
  return `/docs/${slug}`;
}

export { resolveDocLang } from '../i18n/resolveLocale';

/** 公开文档路径（不含后台「文档设置」/settings/docs） */
export function isDocsAppPath(path: string | undefined | null): boolean {
  if (!path) return false;
  let pathname = path.trim();
  try {
    if (/^https?:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    // keep
  }
  pathname = pathname.split('?')[0].split('#')[0];
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname === '/docs'
    || pathname.startsWith('/docs/')
    || pathname === '/admin/docs'
    || pathname.startsWith('/admin/docs/');
}

/** 带当前应用 base 的文档 URL，供新标签 <a> 使用 */
export function getDocsAppHref(path: string = getDocsHomeUrl()): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (prefix && (normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return normalized;
  }
  return `${prefix}${normalized}`;
}

export const DOCS_NEW_TAB_ANCHOR_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

export function openDocsInNewTab(_lang?: DocLang): void {
  window.open(getDocsAppHref(getDocsHomeUrl(_lang)), '_blank', 'noopener,noreferrer');
}
