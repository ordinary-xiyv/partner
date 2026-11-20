import { Card, Col, Row, theme } from 'antd';
import { AdminStatHighlightCard } from './AdminStatHighlightCard';

export interface SubscriptionStatSummaryLabels {
  planManagement: string;
  subscriptionRecords: string;
  onSale: string;
}

export interface SubscriptionStatSummaryProps {
  planCount: number;
  subscriptionRecordCount: number;
  onSalePlanCount: number;
  labels: SubscriptionStatSummaryLabels;
}

/**
 * 订阅管理页顶部三张统计卡片（套餐数 / 订阅记录数 / 上架套餐数）。
 */
export function SubscriptionStatSummary({
  planCount,
  subscriptionRecordCount,
  onSalePlanCount,
  labels,
}: SubscriptionStatSummaryProps) {
  const { token } = theme.useToken();

  return (
    <Card styles={{ body: { padding: `${token.paddingMD}px ${token.paddingLG}px` } }}>
      <Row gutter={[token.marginMD, token.marginLG]} wrap>
        <Col xs={24} sm={24} md={8} flex="auto" style={{ display: 'flex', minWidth: 0 }}>
          <AdminStatHighlightCard variant="primary" title={labels.planManagement} value={planCount} />
        </Col>
        <Col xs={24} sm={24} md={8} flex="auto" style={{ display: 'flex', minWidth: 0 }}>
          <AdminStatHighlightCard variant="info" title={labels.subscriptionRecords} value={subscriptionRecordCount} />
        </Col>
        <Col xs={24} sm={24} md={8} flex="auto" style={{ display: 'flex', minWidth: 0 }}>
          <AdminStatHighlightCard variant="success" title={labels.onSale} value={onSalePlanCount} />
        </Col>
      </Row>
    </Card>
  );
}
