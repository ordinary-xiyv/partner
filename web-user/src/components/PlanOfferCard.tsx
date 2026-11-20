import React from 'react';
import { Card, Typography } from 'antd';
import './PlanOfferCard.css';

const { Text } = Typography;

const buyNowButtonStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 16,
  padding: '12px 16px',
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--theme-color-primary)',
  color: 'var(--btn-primary-text, #fff)',
  fontSize: 14,
  fontWeight: 700,
  boxShadow: '0 12px 30px rgb(from var(--theme-color-primary) r g b / 0.18)',
};

export type PlanOfferCardVariant = 'card' | 'modal';

export interface PlanOfferCardProps {
  /** 展示形态：套餐列表卡片 / 确认弹窗内摘要块 */
  variant?: PlanOfferCardVariant;
  /** 套餐标题 */
  title: string;
  /** 简介（可空，由父组件决定是否回落文案） */
  description?: string;
  /** 已格式化的价格主文案，如 ¥10.01 */
  priceText: string;
  /** 价格旁说明，如「/ 30 天」 */
  pricePeriodHint?: string;
  /** 配额行：左侧标签 + 右侧已格式化值 */
  quotaLabel: string;
  quotaText: string;
  /** 有效天数行 */
  durationLabel: string;
  durationText: string;
  /** 生效时间 / 开通说明行 */
  effectiveTimeLabel: string;
  effectiveTimeText: string;
  /** 例如「推荐」标签（仅文案/角标，卡片高亮由 hover 统一提供） */
  recommendedTag?: React.ReactNode;
  /** 立即购买等主按钮 */
  buyLabel?: string;
  onBuy?: () => void;
  /** 按钮下方说明 */
  footerHint?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function DetailRowsCard(props: Pick<PlanOfferCardProps, 'quotaLabel' | 'quotaText' | 'durationLabel' | 'durationText' | 'effectiveTimeLabel' | 'effectiveTimeText'>) {
  const rows = [
    { label: props.quotaLabel, value: props.quotaText },
    { label: props.durationLabel, value: props.durationText },
    { label: props.effectiveTimeLabel, value: props.effectiveTimeText },
  ];
  return (
    <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
      {rows.map((item) => (
        <div
          key={item.label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{item.label}</span>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function DetailGridModal(props: Pick<PlanOfferCardProps, 'quotaLabel' | 'quotaText' | 'durationLabel' | 'durationText' | 'effectiveTimeLabel' | 'effectiveTimeText'>) {
  const cells = [
    { label: props.quotaLabel, value: props.quotaText },
    { label: props.durationLabel, value: props.durationText },
    { label: props.effectiveTimeLabel, value: props.effectiveTimeText },
  ];
  return (
    <div className="plan-offer-modal-details">
      {cells.map((item) => (
        <div
          key={item.label}
          style={{
            borderRadius: 12,
            padding: '12px 10px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * 可复用套餐展示：标题、简介、价格、配额、有效天数、生效说明；可选「推荐」角标与购买区。
 * 列表卡片统一 hover 高亮；业务与支付逻辑留在父组件。
 */
export function PlanOfferCard({
  variant = 'card',
  title,
  description,
  priceText,
  pricePeriodHint,
  quotaLabel,
  quotaText,
  durationLabel,
  durationText,
  effectiveTimeLabel,
  effectiveTimeText,
  recommendedTag,
  buyLabel,
  onBuy,
  footerHint,
  className,
  style,
}: PlanOfferCardProps) {
  const detailProps = {
    quotaLabel,
    quotaText,
    durationLabel,
    durationText,
    effectiveTimeLabel,
    effectiveTimeText,
  };

  const descBlock = (
    <Text style={{ color: 'var(--text-tertiary)', fontSize: 13, display: 'block', marginBottom: 16, minHeight: 40, lineHeight: 1.6 }}>
      {description}
    </Text>
  );

  const priceRow = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
      <div className="plan-offer-card__price-main">{priceText}</div>
      {pricePeriodHint ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{pricePeriodHint}</div>
      ) : null}
    </div>
  );

  const buyBlock =
    onBuy && buyLabel ? (
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
        <button type="button" style={buyNowButtonStyle} onClick={onBuy}>
          {buyLabel}
        </button>
        {footerHint ? (
          <Text style={{ color: 'var(--text-tertiary)', fontSize: 12, display: 'block', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            {footerHint}
          </Text>
        ) : null}
      </div>
    ) : null;

  if (variant === 'modal') {
    return (
      <div
        className={className}
        style={{
          borderRadius: 16,
          border: '1px solid rgb(from var(--theme-color-primary) r g b / 0.18)',
          background: 'linear-gradient(180deg, rgb(from var(--theme-color-primary) r g b / 0.06) 0%, var(--bg-card) 70%)',
          padding: 18,
          ...style,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{description}</div>
          </div>
          <div className="plan-offer-modal-price" style={{ fontWeight: 900, color: 'var(--theme-color-primary)', whiteSpace: 'nowrap' }}>{priceText}</div>
        </div>
        <DetailGridModal {...detailProps} />
      </div>
    );
  }

  const inner = (
    <div style={{ padding: 4, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', minWidth: 0, wordBreak: 'break-word' }}>{title}</div>
        {recommendedTag}
      </div>
      {descBlock}
      {priceRow}
      <DetailRowsCard {...detailProps} />
      {buyBlock}
    </div>
  );

  return (
    <Card
      className={['plan-offer-card', 'lynx-interactive-card', className].filter(Boolean).join(' ')}
      style={{
        borderRadius: 16,
        position: 'relative',
        ...style,
      }}
      styles={{ body: { height: '100%' } }}
    >
      {inner}
    </Card>
  );
}
