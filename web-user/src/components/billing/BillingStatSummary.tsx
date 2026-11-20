import type { ReactNode } from 'react';
import { Col, Row, theme } from 'antd';
import { AdminStatHighlightCard } from '../AdminStatHighlightCard';
import { BILLING_STAT_PLACEHOLDER_IMAGES } from './billingStatPlaceholders';

const STAT_IMAGE_SIZE = 100;

export interface BillingStatSummaryLabels {
  periodTitle: string;
  periodFooter: string;
  balanceTitle: string;
  balanceFooter: string;
  subscriptionTitle: string;
  subscriptionFooter: string;
}

export interface BillingStatSummaryProps {
  periodValue: ReactNode;
  balanceValue: ReactNode;
  subscriptionValue: ReactNode;
  labels: BillingStatSummaryLabels;
}

function StatPlaceholderImage({ src }: { src: string }) {
  const { token } = theme.useToken();
  return (
    <img
      src={src}
      alt=""
      width={STAT_IMAGE_SIZE}
      height={STAT_IMAGE_SIZE}
      style={{
        objectFit: 'contain',
        borderRadius: token.borderRadiusLG,
        opacity: 0.9,
        display: 'block',
      }}
    />
  );
}

/** 账单页顶部三张统计卡片（对齐令牌管理页布局） */
export function BillingStatSummary({
  periodValue,
  balanceValue,
  subscriptionValue,
  labels,
}: BillingStatSummaryProps) {
  const { token } = theme.useToken();

  return (
    <Row gutter={[token.marginMD, token.marginLG]} wrap>
      <Col xs={24} sm={24} md={8} flex="auto" style={{ display: 'flex', minWidth: 0 }}>
        <AdminStatHighlightCard
          variant="info"
          title={labels.periodTitle}
          value={periodValue}
          footer={labels.periodFooter}
          leading={<StatPlaceholderImage src={BILLING_STAT_PLACEHOLDER_IMAGES.periodConsume} />}
        />
      </Col>
      <Col xs={24} sm={24} md={8} flex="auto" style={{ display: 'flex', minWidth: 0 }}>
        <AdminStatHighlightCard
          variant="primary"
          title={labels.balanceTitle}
          value={balanceValue}
          footer={labels.balanceFooter}
          leading={<StatPlaceholderImage src={BILLING_STAT_PLACEHOLDER_IMAGES.balance} />}
        />
      </Col>
      <Col xs={24} sm={24} md={8} flex="auto" style={{ display: 'flex', minWidth: 0 }}>
        <AdminStatHighlightCard
          variant="success"
          title={labels.subscriptionTitle}
          value={subscriptionValue}
          footer={labels.subscriptionFooter}
          leading={<StatPlaceholderImage src={BILLING_STAT_PLACEHOLDER_IMAGES.subscription} />}
        />
      </Col>
    </Row>
  );
}
