import { getDocsHomeUrl } from '../config/docs';
import type {
  FooterColumnLinkConfig,
  HeaderNavItemConfig,
  SiteAppearance,
} from '../types/siteAppearance';

const DOCS_INTERNAL_PATH = getDocsHomeUrl();
const CONSOLE_INTERNAL_PATH = '/dashboard';

const DOCS_HEADER_NAV_ID = 'docs';
const CONSOLE_HEADER_NAV_ID = 'chat';

const DOCS_FOOTER_LINK_IDS = new Set(['prod-api', 'sup-docs']);
const CONSOLE_FOOTER_LINK_IDS = new Set(['prod-chat']);

function normalizeHeaderNavItem(item: HeaderNavItemConfig): HeaderNavItemConfig {
  if (item.id === DOCS_HEADER_NAV_ID) {
    return {
      ...item,
      type: 'internal',
      path: DOCS_INTERNAL_PATH,
      href: undefined,
    };
  }
  // 操作台：历史 path=/chat → 控制台 /dashboard
  if (item.id === CONSOLE_HEADER_NAV_ID) {
    return {
      ...item,
      type: 'internal',
      path: CONSOLE_INTERNAL_PATH,
      href: undefined,
    };
  }
  return item;
}

function normalizeFooterLink(link: FooterColumnLinkConfig): FooterColumnLinkConfig {
  if (DOCS_FOOTER_LINK_IDS.has(link.id)) {
    return {
      ...link,
      type: 'internal',
      path: DOCS_INTERNAL_PATH,
      href: undefined,
    };
  }
  if (CONSOLE_FOOTER_LINK_IDS.has(link.id)) {
    return {
      ...link,
      type: 'internal',
      path: CONSOLE_INTERNAL_PATH,
      href: undefined,
    };
  }
  return link;
}

/** 将站点外观中的文档入口统一为站内 /docs；操作台统一为 /dashboard（兼容 DB 中旧 /chat） */
export function normalizeSiteAppearanceDocs(appearance: SiteAppearance): SiteAppearance {
  return {
    ...appearance,
    header_config: {
      ...appearance.header_config,
      items: appearance.header_config.items.map((item) => normalizeHeaderNavItem(item)),
    },
    footer_columns_config: {
      ...appearance.footer_columns_config,
      columns: appearance.footer_columns_config.columns.map((column) => ({
        ...column,
        links: column.links.map((link) => normalizeFooterLink(link)),
      })),
    },
  };
}
