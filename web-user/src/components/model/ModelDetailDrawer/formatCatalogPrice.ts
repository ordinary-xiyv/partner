import { getCurrencySymbol } from '../../../utils';

type TranslateFn = (key: string) => string;

const PRICE_UNIT_SUFFIX_KEYS: Record<string, string> = {
  request: 'modelPlaza.priceUnitSuffix.request',
  second: 'modelPlaza.priceUnitSuffix.second',
  image: 'modelPlaza.priceUnitSuffix.image',
  tokens: 'modelPlaza.priceUnitSuffix.tokens',
  token: 'modelPlaza.priceUnitSuffix.tokens',
};

const PRICE_UNIT_SUFFIX_FALLBACKS: Record<string, string> = {
  request: 'request',
  second: 'second',
  image: 'image',
  tokens: 'tokens',
  token: 'tokens',
};

/** 将 billing unit / unit 字段转为价格后缀（次、秒、张、tokens） */
export function resolvePriceUnitSuffix(rawUnit: string | undefined, t?: TranslateFn): string {
  if (!rawUnit?.trim()) return '';
  const normalized = rawUnit.replace(/^1M[_\s]*/i, '').replace(/^_+/, '').trim().toLowerCase();
  const i18nKey = PRICE_UNIT_SUFFIX_KEYS[normalized];
  if (i18nKey && t) return t(i18nKey);
  return PRICE_UNIT_SUFFIX_FALLBACKS[normalized] ?? rawUnit.replace(/_/g, ' ');
}

export function formatPer1mUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return formatPer1mApiTokens(value);
}

/** 与接口 price_summary 一致：¥2 / 1M tokens */
export function formatPer1mApiTokens(value: number): string {
  const { amount, unit } = formatPer1mPriceParts(value);
  return `${getCurrencySymbol()}${amount} ${unit}`;
}

export function formatPer1mPriceParts(value: number): { amount: string; unit: string } {
  if (Number.isNaN(value)) return { amount: '—', unit: '' };
  const abs = Math.abs(value);
  let num: string;
  if (abs >= 1) {
    num = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  } else {
    num = value.toFixed(4).replace(/\.?0+$/, '');
  }
  return { amount: num, unit: '/ 1M tokens' };
}

export function formatUnitPriceParts(
  value: number | null | undefined,
  unit?: string,
  t?: TranslateFn,
): { amount: string; unit: string } {
  if (value == null || Number.isNaN(value)) return { amount: '—', unit: '' };
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : 4;
  let num = value.toFixed(digits).replace(/\.?0+$/, '');
  if (num.endsWith('.')) num = num.slice(0, -1);
  const suffix = resolvePriceUnitSuffix(unit, t);
  const unitText = suffix ? `/ ${suffix}` : '';
  return { amount: num, unit: unitText };
}

/** @deprecated 使用 formatPer1mApiTokens */
export function formatPer1mSummaryLine(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return formatPer1mApiTokens(value);
}

export function formatUnitPrice(
  value: number | null | undefined,
  unit?: string,
  t?: TranslateFn,
): string {
  if (value == null || Number.isNaN(value)) return '—';
  const suffix = resolvePriceUnitSuffix(unit, t);
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : 4;
  let amount = value.toFixed(digits).replace(/\.?0+$/, '');
  if (amount.endsWith('.')) amount = amount.slice(0, -1);
  return `${getCurrencySymbol()}${amount}${suffix ? ` / ${suffix}` : ''}`;
}

export function formatContextLength(n: number): string {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/** 模型信息：1000k / 2k 小写 k，与详情原型一致 */
export function formatModelSpecContextLength(n: number): string {
  if (!n || n <= 0) return '';
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
