import React from 'react';
import { useTranslation } from 'react-i18next';
import { renderAmount } from '../utils';
import { isQuotaOverdraft } from '../utils/quotaDisplay';

type QuotaAmountProps = {
  quotaUnits: number;
  qpu: number;
  digits?: number;
  showOverdraftLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

/** Renders a quota amount with overdraft styling when negative. */
export function QuotaAmount({
  quotaUnits,
  qpu,
  digits = 4,
  showOverdraftLabel = true,
  className,
  style,
}: QuotaAmountProps) {
  const { t } = useTranslation();
  const overdraft = isQuotaOverdraft(quotaUnits);
  const text = renderAmount(quotaUnits, digits, qpu);

  return (
    <span
      className={className}
      style={{
        color: overdraft ? 'var(--color-error, #f87171)' : undefined,
        ...style,
      }}
      title={overdraft ? t('org.overdraftHint') : undefined}
    >
      {text}
      {overdraft && showOverdraftLabel ? ` (${t('org.overdraft')})` : ''}
    </span>
  );
}
