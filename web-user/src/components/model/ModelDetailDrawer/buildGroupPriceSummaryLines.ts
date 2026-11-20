import type { GroupPricingDTO } from '../../../types/catalog';
import { getCurrencySymbol } from '../../../utils';
import { formatPer1mPriceParts, formatUnitPriceParts } from './formatCatalogPrice';
import { buildAllScenariosPriceSummaryLines } from './specDisplayHelpers';

type TranslateFn = (key: string) => string;

export interface PriceSummaryLineItem {
  key: string;
  label: string;
  /** 无 amount/unit 时整段展示（兜底） */
  value?: string;
  amount?: string;
  unit?: string;
}

function toAmountUnit(
  parts: { amount: string; unit: string },
  withSymbol = true,
): Pick<PriceSummaryLineItem, 'amount' | 'unit'> {
  const sym = getCurrencySymbol();
  const prefix = withSymbol && parts.amount !== '—' ? sym : '';
  return {
    amount: `${prefix}${parts.amount}`,
    unit: parts.unit,
  };
}

function splitPriceSummaryText(summary: string): string[] {
  return summary
    .split(/[,，]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 将「输入 ¥2 / 1M tokens」拆成 label + amount + unit */
function parseSummaryFragment(text: string): PriceSummaryLineItem {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.+?)\s+([¥$][\d.]+)\s+(\/.+)$/);
  if (match) {
    return {
      key: trimmed,
      label: match[1].trim(),
      amount: match[2].trim(),
      unit: match[3].trim(),
    };
  }
  const loose = trimmed.match(/^(.+?)\s+([¥$].+)$/);
  if (loose) {
    return { key: trimmed, label: loose[1].trim(), value: loose[2].trim() };
  }
  return { key: trimmed, label: '', value: trimmed };
}

/** 右侧价格摘要：标签 #FAAD14 + 金额灰色 */
export function buildGroupPriceSummaryLines(
  group: GroupPricingDTO,
  t: TranslateFn,
): PriceSummaryLineItem[] {
  const scenarioLines = buildAllScenariosPriceSummaryLines(group, t);
  if (scenarioLines.length > 0) {
    return scenarioLines;
  }

  const { prices } = group;

  if (group.pricing_type === 'token') {
    const lines: PriceSummaryLineItem[] = [];
    if (prices.input_per_1m != null) {
      lines.push({
        key: 'input',
        label: t('modelPlaza.priceInputFull'),
        ...toAmountUnit(formatPer1mPriceParts(prices.input_per_1m)),
      });
    }
    if (prices.output_per_1m != null) {
      lines.push({
        key: 'output',
        label: t('modelPlaza.priceOutputFull'),
        ...toAmountUnit(formatPer1mPriceParts(prices.output_per_1m)),
      });
    }
    if (prices.cache_read_per_1m != null) {
      lines.push({
        key: 'cache_read',
        label: t('modelPlaza.priceCacheReadFull'),
        ...toAmountUnit(formatPer1mPriceParts(prices.cache_read_per_1m)),
      });
    }
    if (prices.cache_write_per_1m != null) {
      lines.push({
        key: 'cache_write',
        label: t('modelPlaza.priceCacheWriteFull'),
        ...toAmountUnit(formatPer1mPriceParts(prices.cache_write_per_1m)),
      });
    }
    if (lines.length > 0) return lines;
  }

  if (group.pricing_type !== 'token' && group.price_summary?.trim()) {
    return [{ key: 'summary', label: '', value: group.price_summary.trim() }];
  }

  if (prices.unit_price != null) {
    const parts = formatUnitPriceParts(prices.unit_price, group.unit, t);
    return [
      {
        key: 'unit',
        label: t('modelPlaza.priceUnit'),
        ...toAmountUnit(parts),
      },
    ];
  }

  if (group.price_summary?.trim()) {
    return splitPriceSummaryText(group.price_summary).map(parseSummaryFragment);
  }

  return [];
}
