import type { AppLocale } from '../i18n/config';
import type { FooterColumnConfig } from '../types/siteAppearance';
import { pickLocalizedLabel, type LegacyLabelFields } from './localeLabels';
import { resolveFooterColumnTitle, resolveFooterLinkLabel } from './siteNavLabels';
import { getDocsAppHref, isDocsAppPath } from '../config/docs';
export interface ResolvedFooterLink {
  id: string;
  label: string;
  to?: string;
  href?: string;
}

export interface ResolvedFooterColumn {
  id: string;
  title: string;
  links: ResolvedFooterLink[];
}

export function resolveFooterColumns(
  columns: FooterColumnConfig[],
  locale: AppLocale,
): ResolvedFooterColumn[] {
  return columns
    .filter((col) => col.visible)
    .sort((a, b) => a.sort - b.sort)
    .map((col) => ({
      id: col.id,
      title: resolveFooterColumnTitle(col.id, col, locale),
      links: (col.links ?? [])
        .filter((link) => link.visible)
        .sort((a, b) => a.sort - b.sort)
        .map((link) => {
          const path = link.type === 'internal'
            ? (link.id === 'prod-chat' ? '/dashboard' : link.path)
            : undefined;
          const docs = isDocsAppPath(path);
          return {
            id: link.id,
            label: resolveFooterLinkLabel(link.id, link, locale),
            to: link.type === 'internal' && !docs ? path : undefined,
            href: link.type === 'external'
              ? link.href
              : (docs && path ? getDocsAppHref(path) : undefined),
          };
        })
        .filter((link) => link.to || link.href),
    }))
    .filter((col) => col.links.length > 0);
}

export function resolveFooterLegalLabel(
  labels: LegacyLabelFields['labels'],
  legacy?: string,
  locale?: AppLocale,
  fallback?: string,
): string {
  const picked = pickLocalizedLabel(labels, locale ?? 'zh-CN');
  if (picked) return picked;
  if (legacy?.trim()) return legacy.trim();
  return fallback ?? '';
}
