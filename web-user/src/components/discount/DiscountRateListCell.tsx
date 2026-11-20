import React from 'react';
import { useTranslation } from 'react-i18next';
import OverallIcon from '../../assets/icons/svg/discount/overall.svg?react';
import InputIcon from '../../assets/icons/svg/discount/input.svg?react';
import OutputIcon from '../../assets/icons/svg/discount/output.svg?react';
import CacheIcon from '../../assets/icons/svg/discount/cache.svg?react';
import './discount-rate-list-cell.css';

export type DiscountRateParts = {
  discount_rate: number;
  input_discount_rate?: number | null;
  output_discount_rate?: number | null;
  cache_discount_rate?: number | null;
};

function formatRatePct(rate: number): string {
  const pct = rate * 100;
  if (Number.isInteger(pct)) return `${pct}%`;
  return `${pct.toFixed(1)}%`;
}

function hasSegmentRates(row: DiscountRateParts): boolean {
  const input = Number(row.input_discount_rate ?? 0);
  const output = Number(row.output_discount_rate ?? 0);
  const cache = Number(row.cache_discount_rate ?? 0);
  return input > 0 && output > 0 && cache > 0;
}

/**
 * 列表折扣率展示：
 * - 三分段均有值：输入 / 输出 / 缓存命中
 * - 否则：整体折扣
 */
export function DiscountRateListCell({ row }: { row: DiscountRateParts }) {
  const { t } = useTranslation();

  if (hasSegmentRates(row)) {
    return (
      <div className="discount-rate-list-cell discount-rate-list-cell--segments">
        <span className="discount-rate-list-cell__item" title={t('discountRules.inputDiscountRate')}>
          <InputIcon aria-hidden className="discount-rate-list-cell__icon" />
          <span className="discount-rate-list-cell__text">{formatRatePct(Number(row.input_discount_rate))}</span>
        </span>
        <span className="discount-rate-list-cell__item" title={t('discountRules.outputDiscountRate')}>
          <OutputIcon aria-hidden className="discount-rate-list-cell__icon" />
          <span className="discount-rate-list-cell__text">{formatRatePct(Number(row.output_discount_rate))}</span>
        </span>
        <span className="discount-rate-list-cell__item" title={t('discountRules.cacheDiscountRate')}>
          <CacheIcon aria-hidden className="discount-rate-list-cell__icon" />
          <span className="discount-rate-list-cell__text">{formatRatePct(Number(row.cache_discount_rate))}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="discount-rate-list-cell" title={t('discountRules.discountRate')}>
      <span className="discount-rate-list-cell__item">
        <OverallIcon aria-hidden className="discount-rate-list-cell__icon" />
        <span className="discount-rate-list-cell__text">{formatRatePct(Number(row.discount_rate || 0))}</span>
      </span>
    </div>
  );
}
