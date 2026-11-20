import type { AppLocale } from '../i18n/config';
import type { HeaderNavItemConfig } from '../types/siteAppearance';
import { resolveHeaderNavLabel } from './siteNavLabels';
import { getDocsAppHref, isDocsAppPath } from '../config/docs';

export type ResolvedHeaderNavLink = {
  kind: 'link';
  to?: string;
  href?: string;
  label: string;
  external?: boolean;
};

export type ResolvedHeaderNavDropdown = {
  kind: 'dropdown';
  label: string;
  items: { href: string; label: string; external?: boolean }[];
};

export type ResolvedHeaderNavItem = ResolvedHeaderNavLink | ResolvedHeaderNavDropdown;

export function resolveHeaderNavItems(
  items: HeaderNavItemConfig[],
  locale: AppLocale,
): ResolvedHeaderNavItem[] {
  return items
    .filter((item) => item.visible)
    .sort((a, b) => a.sort - b.sort)
    .map((item): ResolvedHeaderNavItem | null => {
      if (item.type === 'dropdown') {
        const children = (item.dropdown_items ?? [])
          .filter((c) => c.visible)
          .sort((a, b) => a.sort - b.sort)
          .map((c) => ({
            href: c.href,
            label: resolveHeaderNavLabel(c.id, c, locale),
            external: true,
          }));
        if (children.length === 0) return null;
        return { kind: 'dropdown', label: resolveHeaderNavLabel(item.id, item, locale), items: children };
      }
      if (item.type === 'external' && item.href) {
        return { kind: 'link', href: item.href, label: resolveHeaderNavLabel(item.id, item, locale), external: true };
      }
      if (item.type === 'internal' && item.path) {
        // 顶栏「操作台」(id=chat)：始终进控制台，避免线上配置仍指向 /chat 造成先闪文本对话再重定向
        const path = item.id === 'chat' ? '/dashboard' : item.path;
        if (isDocsAppPath(path)) {
          return {
            kind: 'link',
            href: getDocsAppHref(path),
            label: resolveHeaderNavLabel(item.id, item, locale),
            external: true,
          };
        }
        return { kind: 'link', to: path, label: resolveHeaderNavLabel(item.id, item, locale) };
      }
      return null;
    })
    .filter((item): item is ResolvedHeaderNavItem => item !== null);
}
