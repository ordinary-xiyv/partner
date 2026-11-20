import React from 'react';
import { Typography } from 'antd';
import { formatPer1mDisplayAmount } from '../utils';

const { Text } = Typography;

/** 每百万 input/output token 展示价：主色金额 + 次要色后缀（如 ` / 1M tokens`） */
export function Per1mTokenPrice({
  symbol,
  displayAmount,
  suffix,
  emptyDisplay = '-',
}: {
  symbol: string;
  /** 已换算为展示货币的单价（每 1M tokens） */
  displayAmount: number | null | undefined;
  suffix: string;
  emptyDisplay?: string;
}) {
  if (displayAmount === null || displayAmount === undefined || !Number.isFinite(displayAmount)) {
    return <Text type="secondary">{emptyDisplay}</Text>;
  }
  return (
    <span>
      <Text style={{ color: 'var(--text-primary)' }}>{symbol}{formatPer1mDisplayAmount(displayAmount)}</Text>
      <Text type="secondary" style={{ fontSize: 12, marginLeft: 2 }}>{suffix}</Text>
    </span>
  );
}
