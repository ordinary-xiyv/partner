import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type AppLocale } from '../config';
import {
  getConfigContentLang,
  getLocaleMeta,
  normalizeLocale,
} from '../resolveLocale';

export function useLocale() {
  const { i18n } = useTranslation();
  const locale = useMemo(() => normalizeLocale(i18n.language), [i18n.language]);
  const meta = useMemo(() => getLocaleMeta(locale), [locale]);
  const configContentLang = useMemo(() => getConfigContentLang(locale), [locale]);

  const changeLocale = useCallback(
    (next: AppLocale) => {
      void i18n.changeLanguage(next);
    },
    [i18n],
  );

  return {
    locale,
    meta,
    configContentLang,
    supportedLocales: SUPPORTED_LOCALES,
    changeLocale,
  };
}
