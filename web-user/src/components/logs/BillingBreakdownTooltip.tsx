import React from 'react';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { renderAmount } from '../../utils';
import './billing-breakdown-tooltip.css';

type BillingLine = {
  kind: string;
  name?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_rate: number;
  amount_quota: number;
};

type TierPriceChange = {
  kind: string;
  original_unit_price: number;
  tier_unit_price: number;
};

type BillingBreakdown = {
  version: number;
  pricing_mode: string;
  group_ratio?: number;
  tier_matched: boolean;
  tier_rule_id?: number;
  tier_rule_type?: string;
  tier_index?: number;
  tier_price_changes?: TierPriceChange[];
  lines: BillingLine[];
  final_quota: number;
};

function parseBreakdown(raw?: string): BillingBreakdown | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as BillingBreakdown;
    if (value.version !== 1 || !Array.isArray(value.lines) || !Number.isFinite(value.final_quota)) return null;
    return value;
  } catch {
    return null;
  }
}

export function BillingBreakdownTooltip({ raw, quota, qpu, isConsume, children }: {
  raw?: string;
  quota: number;
  qpu: number;
  isConsume: boolean;
  children: React.ReactElement;
}) {
  const { t } = useTranslation();
  if (!isConsume) return children;
  const breakdown = parseBreakdown(raw);
  if (!breakdown || breakdown.final_quota !== quota) {
    return <Tooltip placement="left" title={t('logs.billing.unavailable')}>{children}</Tooltip>;
  }
  const label = (line: BillingLine) => line.kind === 'tool'
    ? `${t('logs.billing.tool')}: ${line.name || t('logs.billing.other')}`
    : t(`logs.billing.${line.kind}`, { defaultValue: line.kind });
  const unit = (line: BillingLine) => t(`logs.billing.unit.${line.unit}`, { defaultValue: line.unit });
  const totalLines = breakdown.lines.reduce((sum, line) => sum + line.amount_quota, 0);
  const rounding = breakdown.final_quota - totalLines;
  const groupRatio = breakdown.group_ratio && breakdown.group_ratio > 0 ? breakdown.group_ratio : null;
  // The snapshot stores discounted line amounts. Display the amount before
  // business discounts while preserving the actual settled final amount.
  const originalLineQuota = (line: BillingLine) => {
    const unitSize = line.unit === 'million_tokens' ? 1000000 : line.unit === 'thousand_calls' ? 1000 : 1;
    return line.discount_rate > 0
      ? line.amount_quota / line.discount_rate
      : line.quantity * line.unit_price * qpu / unitSize;
  };
  const originalQuota = breakdown.lines.reduce((sum, line) => sum + originalLineQuota(line), 0);
  const detailLines = breakdown.lines.filter((line) => line.kind !== 'tool');
  const toolLines = breakdown.lines.filter((line) => line.kind === 'tool');
  const toolOriginalQuota = toolLines.reduce((sum, line) => sum + originalLineQuota(line), 0);
  const discountRate = originalQuota > 0 ? totalLines / originalQuota : 1;
  const mixedDiscount = breakdown.lines.some((line) => Math.abs(line.discount_rate - discountRate) > 0.000001);
  const percent = (rate: number, digits = 2) => `${(rate * 100).toFixed(digits).replace(/\.?0+$/, '')}%`;
  const tierLabel = breakdown.tier_rule_type === 'time_based'
    ? t('logs.billing.timeTier')
    : t('logs.billing.inputTier', { index: (breakdown.tier_index ?? 0) + 1 });
  const tierPriceChanges = (breakdown.tier_price_changes || []).filter((change) =>
    Number.isFinite(change.original_unit_price) && Number.isFinite(change.tier_unit_price));
  return (
    <Tooltip placement="left" arrow={false} overlayStyle={{ maxWidth: 'min(480px, calc(100vw - 24px))' }} overlayInnerStyle={{ padding: 0, background: 'transparent', boxShadow: 'none' }} title={(
      <div className="billing-breakdown-tooltip">
        <div className="billing-breakdown-tooltip__title">{t('logs.billing.title')}</div>
        <div className="billing-breakdown-tooltip__strategy">
          {breakdown.tier_matched
            ? <>
                <div>{t('logs.billing.tierMatched')}{tierPriceChanges.length === 0 && ` · ${tierLabel} · #${breakdown.tier_rule_id}`}</div>
                {tierPriceChanges.length > 0 && (
                  <div className="billing-breakdown-tooltip__tier-change">
                    {tierPriceChanges.map((change) => (
                      <div className="billing-breakdown-tooltip__tier-change-row" key={change.kind}>
                        <span>{t(`logs.billing.${change.kind}`, { defaultValue: change.kind })}</span>
                        <strong>{renderAmount(change.original_unit_price * qpu, 4, qpu)} → {renderAmount(change.tier_unit_price * qpu, 4, qpu)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </>
            : breakdown.pricing_mode === 'fixed' ? t('logs.billing.fixedPrice') : t('logs.billing.regularPrice')}
        </div>
        <div className="billing-breakdown-tooltip__multipliers">
          {t('logs.billing.groupRatio')}: {groupRatio ? percent(groupRatio) : '—'} · {t(mixedDiscount ? 'logs.billing.combinedBusinessDiscount' : 'logs.billing.businessDiscount')}: {percent(discountRate, mixedDiscount ? 4 : 2)}
        </div>
        <div className="billing-breakdown-tooltip__lines">
          {detailLines.map((line, index) => (
            <div className="billing-breakdown-tooltip__line" key={`${line.kind}-${line.name ?? ''}-${index}`}>
              <div className="billing-breakdown-tooltip__line-top">
                <span className="billing-breakdown-tooltip__line-label">{label(line)}</span>
                <strong className="billing-breakdown-tooltip__line-amount">{renderAmount(originalLineQuota(line), 4, qpu)}</strong>
              </div>
              <div className="billing-breakdown-tooltip__line-formula">
                {line.quantity.toLocaleString()} × {renderAmount(line.unit_price * qpu / (groupRatio || 1), 4, qpu)} / {unit(line)}
                {groupRatio && <> × {percent(groupRatio)}</>}
              </div>
            </div>
          ))}
          {toolLines.length > 0 && (
            <div className="billing-breakdown-tooltip__line">
              <div className="billing-breakdown-tooltip__line-top">
                <span className="billing-breakdown-tooltip__line-label">{t('logs.billing.toolTotal')}</span>
                <strong className="billing-breakdown-tooltip__line-amount">{renderAmount(toolOriginalQuota, 4, qpu)}</strong>
              </div>
              <div className="billing-breakdown-tooltip__line-formula">
                {toolLines.map((line, index) => (
                  <React.Fragment key={`${line.name ?? ''}-${index}`}>
                    {index > 0 && ' + '}{renderAmount(originalLineQuota(line), 4, qpu)}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
        {Math.abs(rounding) > 0.000001 && renderAmount(Math.abs(rounding), 4, qpu) !== renderAmount(0, 4, qpu) && (
          <div className="billing-breakdown-tooltip__rounding">
            <span>{t('logs.billing.rounding')}</span><span>{renderAmount(rounding, 4, qpu)}</span>
          </div>
        )}
        <div className="billing-breakdown-tooltip__total">
          <span className="billing-breakdown-tooltip__total-label">{t('logs.billing.total')}</span>
          <strong className="billing-breakdown-tooltip__total-formula">{renderAmount(originalQuota, 4, qpu)} * {percent(discountRate, mixedDiscount ? 4 : 2)} = {renderAmount(breakdown.final_quota, 4, qpu)}</strong>
        </div>
      </div>
    )}>
      {children}
    </Tooltip>
  );
}
