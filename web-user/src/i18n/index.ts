import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import 'dayjs/locale/th';
import 'dayjs/locale/vi';
import 'dayjs/locale/ms';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import th from './locales/th.json';
import vi from './locales/vi.json';
import ms from './locales/ms.json';
import { APP_LOCALES } from './config';
import { getDayjsLocaleName } from './antdLocales';
import {
  migrateLegacyLocaleStorage,
  normalizeLocale,
} from './resolveLocale';
import { applySiteBrandInterpolation } from './siteBrandInterpolation';

migrateLegacyLocaleStorage();
applySiteBrandInterpolation();

function syncDayjsLocale(language: string): void {
  dayjs.locale(getDayjsLocaleName(normalizeLocale(language)));
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      en: { translation: en },
      th: { translation: th },
      vi: { translation: vi },
      ms: { translation: ms },
    },
    supportedLngs: [...APP_LOCALES, 'zh'],
    nonExplicitSupportedLngs: true,
    fallbackLng: {
      th: ['en', 'zh-CN'],
      vi: ['en', 'zh-CN'],
      ms: ['en', 'zh-CN'],
      default: ['en', 'zh-CN'],
    },
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      convertDetectedLanguage: (lng) => normalizeLocale(lng),
    },
  });

syncDayjsLocale(i18n.language);
i18n.on('languageChanged', syncDayjsLocale);

export default i18n;
