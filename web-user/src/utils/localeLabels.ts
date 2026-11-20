import type { AppLocale } from '../i18n/config';
import { normalizeLocale } from '../i18n/resolveLocale';

export type LocaleLabels = Partial<Record<AppLocale, string>>;

export interface LegacyLabelFields {
  labels?: LocaleLabels;
  label_zh?: string;
  label_en?: string;
}

export interface LegacyTitleFields extends LegacyLabelFields {
  title_labels?: LocaleLabels;
  title_zh?: string;
  title_en?: string;
}

const FALLBACK_CHAIN: AppLocale[] = ['zh-CN', 'en', 'th', 'vi', 'ms'];

export function pickLocalizedLabel(
  labels: LocaleLabels | undefined,
  locale: AppLocale | string,
): string {
  const normalized = normalizeLocale(locale);
  const merged = mergeLegacyIntoLabels(labels, undefined, undefined);
  const direct = merged[normalized]?.trim();
  if (direct) return direct;

  const chain: AppLocale[] = [normalized, 'en', 'zh-CN'];
  const seen = new Set<AppLocale>();
  for (const code of chain) {
    if (seen.has(code)) continue;
    seen.add(code);
    const value = merged[code]?.trim();
    if (value) return value;
  }
  for (const code of FALLBACK_CHAIN) {
    const value = merged[code]?.trim();
    if (value) return value;
  }
  return '';
}

export function mergeLegacyIntoLabels(
  labels: LocaleLabels | undefined,
  legacyZh?: string,
  legacyEn?: string,
): LocaleLabels {
  const out: LocaleLabels = { ...(labels ?? {}) };
  if (legacyZh?.trim() && !out['zh-CN']?.trim()) {
    out['zh-CN'] = legacyZh.trim();
  }
  if (legacyEn?.trim() && !out.en?.trim()) {
    out.en = legacyEn.trim();
  }
  return out;
}

export function syncLegacyFromLabels(labels: LocaleLabels | undefined): {
  label_zh: string;
  label_en: string;
} {
  const merged = labels ?? {};
  return {
    label_zh: merged['zh-CN']?.trim() ?? '',
    label_en: merged.en?.trim() ?? '',
  };
}

export function normalizeNavItemLabels<T extends LegacyLabelFields>(item: T): T {
  const labels = mergeLegacyIntoLabels(item.labels, item.label_zh, item.label_en);
  const legacy = syncLegacyFromLabels(labels);
  return {
    ...item,
    labels,
    label_zh: legacy.label_zh,
    label_en: legacy.label_en,
  };
}

export function normalizeFooterColumnLabels<T extends LegacyTitleFields>(column: T): T {
  const titleLabels = mergeLegacyIntoLabels(
    column.title_labels ?? column.labels,
    column.title_zh,
    column.title_en,
  );
  const legacy = syncLegacyFromLabels(titleLabels);
  return {
    ...column,
    title_labels: titleLabels,
    title_zh: legacy.label_zh,
    title_en: legacy.label_en,
  };
}

export function getEditorLabel(labels: LocaleLabels | undefined, locale: AppLocale): string {
  return labels?.[locale]?.trim() ?? '';
}

export function setEditorLabel(
  labels: LocaleLabels | undefined,
  locale: AppLocale,
  value: string,
): LocaleLabels {
  const next: LocaleLabels = { ...(labels ?? {}) };
  const trimmed = value.trim();
  if (trimmed) {
    next[locale] = trimmed;
  } else {
    delete next[locale];
  }
  return next;
}

export function patchNavItemLabels<T extends LegacyLabelFields>(
  item: T,
  locale: AppLocale,
  value: string,
): T {
  const labels = setEditorLabel(
    mergeLegacyIntoLabels(item.labels, item.label_zh, item.label_en),
    locale,
    value,
  );
  const legacy = syncLegacyFromLabels(labels);
  return {
    ...item,
    labels,
    label_zh: legacy.label_zh,
    label_en: legacy.label_en,
  };
}

export function patchTitleLabels<T extends LegacyTitleFields>(
  item: T,
  locale: AppLocale,
  value: string,
): T {
  const titleLabels = setEditorLabel(
    mergeLegacyIntoLabels(item.title_labels, item.title_zh, item.title_en),
    locale,
    value,
  );
  const legacy = syncLegacyFromLabels(titleLabels);
  return {
    ...item,
    title_labels: titleLabels,
    title_zh: legacy.label_zh,
    title_en: legacy.label_en,
  };
}

export function hasOptionalEnglishGap(labels: LocaleLabels | undefined): boolean {
  const merged = labels ?? {};
  return Boolean(merged['zh-CN']?.trim()) && !merged.en?.trim();
}
