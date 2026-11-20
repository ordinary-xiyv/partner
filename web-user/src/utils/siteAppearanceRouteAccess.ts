import type { SiteAppearance } from '../types/siteAppearance';
import { normalizeSortPath } from './siteAppearanceSort';

const ALWAYS_ALLOWED_PREFIXES = [
  '/settings',
  '/profile',
  '/login',
  '/setup',
  '/admin',
] as const;

/** 收集站点外观配置中出现过的站内 path → 是否至少有一处入口为可见 */
export function buildInternalPathAccessMap(appearance: SiteAppearance): Map<string, boolean> {
  const map = new Map<string, boolean>();

  const mark = (rawPath: string | undefined, visible: boolean) => {
    if (!rawPath?.trim()) return;
    const path = normalizeSortPath(rawPath);
    if (visible) {
      map.set(path, true);
      return;
    }
    if (!map.has(path)) {
      map.set(path, false);
    }
  };

  for (const item of appearance.header_config.items) {
    if (item.type === 'internal') {
      const visible = appearance.header_config.enabled && item.visible;
      mark(item.path, visible);
    }
  }

  for (const column of appearance.footer_columns_config.columns) {
    for (const link of column.links) {
      if (link.type !== 'internal') continue;
      const visible = appearance.footer_columns_config.enabled
        && column.visible
        && link.visible;
      mark(link.path, visible);
    }
  }

  return map;
}

export function isAppearancePathExempt(pathname: string): boolean {
  const current = normalizeSortPath(pathname);
  return ALWAYS_ALLOWED_PREFIXES.some(
    (prefix) => current === prefix || current.startsWith(`${prefix}/`),
  );
}

export function isPathAllowedByAppearance(pathname: string, appearance: SiteAppearance): boolean {
  if (isAppearancePathExempt(pathname)) return true;

  const current = normalizeSortPath(pathname);
  const accessMap = buildInternalPathAccessMap(appearance);

  for (const [path, allowed] of accessMap) {
    if (current === path || current.startsWith(`${path}/`)) {
      return allowed;
    }
  }

  return true;
}
