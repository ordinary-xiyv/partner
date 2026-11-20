export const APP_LOCALES = ['zh-CN', 'en', 'th', 'vi', 'ms'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'zh-CN';

export interface LocaleMeta {
  code: AppLocale;
  nativeLabel: string;
  shortLabel: string;
  dayjsLocale: string;
}

export const LOCALE_META: Record<AppLocale, LocaleMeta> = {
  'zh-CN': {
    code: 'zh-CN',
    nativeLabel: '简体中文',
    shortLabel: '中',
    dayjsLocale: 'zh-cn',
  },
  en: {
    code: 'en',
    nativeLabel: 'English',
    shortLabel: 'EN',
    dayjsLocale: 'en',
  },
  th: {
    code: 'th',
    nativeLabel: 'ไทย',
    shortLabel: 'TH',
    dayjsLocale: 'th',
  },
  vi: {
    code: 'vi',
    nativeLabel: 'Tiếng Việt',
    shortLabel: 'VI',
    dayjsLocale: 'vi',
  },
  ms: {
    code: 'ms',
    nativeLabel: 'Bahasa Melayu',
    shortLabel: 'MS',
    dayjsLocale: 'ms',
  },
};

export const SUPPORTED_LOCALES = APP_LOCALES.map((code) => LOCALE_META[code]);
