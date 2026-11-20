const FAVICON_LINK_ID = 'lynxton-site-favicon';
const APPLE_TOUCH_LINK_ID = 'lynxton-site-apple-touch-icon';

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
}

/** 将浏览器标签页 / 收藏夹图标切换为 OSS 预签名地址；无 URL 时不显示任何图标 */
export function applySiteFavicon(url?: string | null, contentType?: string): void {
  const href = url?.trim();
  if (!href) {
    clearSiteFavicon();
    return;
  }
  const mime = guessFaviconMimeType(href, contentType);
  upsertLink(FAVICON_LINK_ID, 'icon', href, mime);
  upsertLink(APPLE_TOUCH_LINK_ID, 'apple-touch-icon', href);
}

export function resolveSiteFaviconUrl(
  favicons: Array<{ download_url?: string; content_type?: string }> | null | undefined,
): { url?: string; contentType?: string } {
  const row = favicons?.[0];
  const url = row?.download_url?.trim();
  if (!url) return {};
  return { url, contentType: row?.content_type?.trim() || undefined };
}
