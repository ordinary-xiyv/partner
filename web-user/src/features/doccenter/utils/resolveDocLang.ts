import type { DocLang } from '../../../types/doccenter';
import { normalizeLocale } from '../../../i18n/resolveLocale';
import { pickLocalizedLabel } from '../../../utils/localeLabels';

export function resolveDocLang(language?: string | null): DocLang {
  return normalizeLocale(language);
}

export function pickLocalizedField(
  lang: DocLang,
  labels: Partial<Record<DocLang, string>> | undefined,
  zh: string,
  en: string,
): string {
  const picked = pickLocalizedLabel(labels, lang);
  if (picked) return picked;
  return pickLocalizedLabel({ 'zh-CN': zh, en }, lang);
}

export function pickLocalizedContent(
  lang: DocLang,
  labels: Partial<Record<DocLang, string>> | undefined,
  zh: string,
  en: string,
): string {
  return pickLocalizedField(lang, labels, zh, en);
}
