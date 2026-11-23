import i18n from '../i18n/index';
import type { AppLocale } from '../i18n/config';
import { pickLocalizedLabel, type LegacyLabelFields } from './localeLabels';

/** Header nav item id → i18n key (labels managed in locale files, not admin UI). */
export const HEADER_NAV_LABEL_KEYS: Record<string, string> = {
  models: 'header.navModels',
  'app-plaza': 'header.navAppPlaza',
  tts: 'header.navTtsApp',
  chat: 'header.navChat',
  docs: 'header.navDocs',
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

/** Admin UI preview — uses current i18n language. */
export function previewHeaderNavLabel(id: string, item: LegacyLabelFields): string {
  const key = HEADER_NAV_LABEL_KEYS[id];
  if (key) return i18n.t(key);
  return item.label_zh || item.label_en || id;
}
