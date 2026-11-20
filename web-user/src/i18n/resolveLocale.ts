import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_META,
  type AppLocale,
} from './config';

const LOCALE_SET = new Set<string>(APP_LOCALES);

/** Normalize browser / legacy i18next codes to a supported app locale. */
export function normalizeLocale(language?: string | null): AppLocale {
  const raw = (language ?? '').trim().toLowerCase();
  if (!raw) return DEFAULT_LOCALE;

  if (raw === 'zh' || raw === 'zh-cn' || raw.startsWith('zh-hans')) return 'zh-CN';
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  if (raw === 'th' || raw.startsWith('th-')) return 'th';
  if (raw === 'vi' || raw.startsWith('vi-')) return 'vi';
  if (raw === 'ms' || raw.startsWith('ms-')) return 'ms';

  const base = raw.split('-')[0];
  if (base === 'zh') return 'zh-CN';
  if (LOCALE_SET.has(base)) return base as AppLocale;

  return DEFAULT_LOCALE;
}

export function isSupportedLocale(language?: string | null): language is AppLocale {
  return LOCALE_SET.has(normalizeLocale(language));
}

export function isChineseLocale(language?: string | null): boolean {
  return normalizeLocale(language) === 'zh-CN';
}

/** API/export params that only support zh | en. */
export function getConfigContentLang(language?: string | null): 'zh' | 'en' {
  return isChineseLocale(language) ? 'zh' : 'en';
}

/** Document center uses full app locale with en/zh-CN fallback. */
export function resolveDocLang(language?: string | null): AppLocale {
  return normalizeLocale(language);
}

/** Backend/API params that accept zh | en. */
export function getApiContentLang(language?: string | null): 'zh' | 'en' {
  return getConfigContentLang(language);
}

export function getLocaleMeta(language?: string | null): (typeof LOCALE_META)[AppLocale] {
  return LOCALE_META[normalizeLocale(language)];
}

export function getDayjsLocale(language?: string | null): string {
  return getLocaleMeta(language).dayjsLocale;
}

export function migrateLegacyLocaleStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const key = 'i18nextLng';
  const stored = localStorage.getItem(key);
  if (stored === 'zh') {
    localStorage.setItem(key, 'zh-CN');
  }
}
