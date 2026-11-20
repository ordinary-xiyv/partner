import i18n from '../i18n/index';
import type { AppLocale } from '../i18n/config';
import { pickLocalizedLabel, type LegacyLabelFields, type LegacyTitleFields } from './localeLabels';

/** Header nav item id → i18n key (labels managed in locale files, not admin UI). */
export const HEADER_NAV_LABEL_KEYS: Record<string, string> = {
  models: 'header.navModels',
  'app-plaza': 'header.navAppPlaza',
  tts: 'header.navTtsApp',
  chat: 'header.navChat',
  enterprise: 'header.navEnterprise',
  pricing: 'header.navPricing',
  docs: 'header.navDocs',
};

/** Footer column id → title i18n key. */
export const FOOTER_COLUMN_TITLE_KEYS: Record<string, string> = {
  about: 'footer.aboutTitle',
  products: 'footer.productsTitle',
  support: 'footer.supportTitle',
  billing: 'footer.billingTitle',
  links: 'footer.linksTitle',
};

/** Footer link id → label i18n key (external brand links omitted). */
export const FOOTER_LINK_LABEL_KEYS: Record<string, string> = {
  'about-co': 'footer.aboutCompany',
  'about-ent': 'footer.aboutEnterprise',
  'about-trust': 'footer.aboutTrust',
  'about-legal': 'footer.aboutLegal',
  'about-news': 'footer.aboutNews',
  'prod-api': 'footer.productsApi',
  'prod-models': 'footer.productsModels',
  'prod-chat': 'footer.productsChat',
  'sup-docs': 'footer.supportDocs',
  'sup-consult': 'footer.supportConsulting',
  'sup-ann': 'footer.supportAnnouncements',
  'sup-plans': 'footer.supportPlans',
  'sup-status': 'footer.supportStatus',
  'bill-topup': 'footer.billingTopup',
  'bill-rec': 'footer.billingRecords',
  'bill-sub': 'footer.billingSubscription',
  'bill-acct': 'footer.billingAccount',
};

function tForLocale(key: string, locale: AppLocale): string {
  return i18n.t(key, { lng: locale });
}

export function resolveHeaderNavLabel(
  id: string,
  item: LegacyLabelFields,
  locale: AppLocale,
): string {
  const key = HEADER_NAV_LABEL_KEYS[id];
  if (key) return tForLocale(key, locale);
  return pickLocalizedLabel(item.labels, locale)
    || pickLocalizedLabel({ 'zh-CN': item.label_zh, en: item.label_en }, locale)
    || id;
}

export function resolveFooterColumnTitle(
  id: string,
  col: LegacyTitleFields,
  locale: AppLocale,
): string {
  const key = FOOTER_COLUMN_TITLE_KEYS[id];
  if (key) return tForLocale(key, locale);
  return pickLocalizedLabel(col.title_labels, locale)
    || pickLocalizedLabel({ 'zh-CN': col.title_zh, en: col.title_en }, locale)
    || id;
}

export function resolveFooterLinkLabel(
  id: string,
  link: LegacyLabelFields,
  locale: AppLocale,
): string {
  const key = FOOTER_LINK_LABEL_KEYS[id];
  if (key) return tForLocale(key, locale);
  return pickLocalizedLabel(link.labels, locale)
    || pickLocalizedLabel({ 'zh-CN': link.label_zh, en: link.label_en }, locale)
    || id;
}

/** Admin UI preview — uses current i18n language. */
export function previewHeaderNavLabel(id: string, item: LegacyLabelFields): string {
  const key = HEADER_NAV_LABEL_KEYS[id];
  if (key) return i18n.t(key);
  return item.label_zh || item.label_en || id;
}

export function previewFooterColumnTitle(id: string, col: LegacyTitleFields): string {
  const key = FOOTER_COLUMN_TITLE_KEYS[id];
  if (key) return i18n.t(key);
  return col.title_zh || col.title_en || id;
}

export function previewFooterLinkLabel(id: string, link: LegacyLabelFields): string {
  const key = FOOTER_LINK_LABEL_KEYS[id];
  if (key) return i18n.t(key);
  return link.label_zh || link.label_en || id;
}
