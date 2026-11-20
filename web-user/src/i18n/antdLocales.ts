import enUS from 'antd/locale/en_US';
import msMY from 'antd/locale/ms_MY';
import thTH from 'antd/locale/th_TH';
import viVN from 'antd/locale/vi_VN';
import zhCN from 'antd/locale/zh_CN';
import type { Locale } from 'antd/es/locale';
import { LOCALE_META, type AppLocale } from './config';

export const ANT_DESIGN_LOCALES: Record<AppLocale, Locale> = {
  'zh-CN': zhCN,
  en: enUS,
  th: thTH,
  vi: viVN,
  ms: msMY,
};

export function getAntdLocale(locale: AppLocale): Locale {
  return ANT_DESIGN_LOCALES[locale] ?? ANT_DESIGN_LOCALES.en;
}

export function getDayjsLocaleName(locale: AppLocale): string {
  return LOCALE_META[locale].dayjsLocale;
}
