import type { ReactNode } from 'react';
import {
  Button, DatePicker, Flex, Select, Spin, Table, Tabs, Typography, theme,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { PagePanel } from '../../ui/PagePanel';
import { BILLING_STAT_PLACEHOLDER_IMAGES } from './billingStatPlaceholders';
import './billing-page.css';

const { Text } = Typography;

/** 账单页可选时间范围：最多 31 个自然日（含首尾），且不能选未来日期。与后端上限保持一致。 */
const BILLING_RANGE_MAX_DAYS = 31;

function billingRangeToday() {
  return dayjs().endOf('day');
}

export type BillingDetailTabKey = 'consume' | 'topup' | 'subscription';

export interface BillingDetailPanelProps {
  title: string;
  description: string;
  dateRange: [Dayjs, Dayjs];
  onDateRangeChange: (start: string, end: string) => void;
  activeTab: BillingDetailTabKey;
  onTabChange: (key: BillingDetailTabKey) => void;
  tableLoading: boolean;
  consumeHint: string;
  topupHint: string;
  subscriptionHint: string;
  exportConsumeLabel: string;
  exportTopupLabel: string;
  exportSubscriptionLabel: string;
  onExportConsume: () => void;
  onExportTopup: () => void;
  onExportSubscription: () => void;
  modelFilter: string;
  modelOptions: string[];
  onModelChange: (model: string) => void;
  modelPlaceholder: string;
  consumeColumns: ColumnsType<unknown>;
  consumeData: unknown[];
  consumeRowKey: string;
  consumePagination: false | TablePaginationConfig;
  topupColumns: ColumnsType<unknown>;
  topupData: unknown[];
  topupRowKey: string;
  topupPagination: false | TablePaginationConfig;
  subscriptionColumns: ColumnsType<unknown>;
  subscriptionData: unknown[];
  subscriptionRowKey: string;
  consumeEmpty: ReactNode;
  topupEmpty: ReactNode;
  subscriptionEmpty: ReactNode;
  consumeSettingsControl?: ReactNode;
  topupSettingsControl?: ReactNode;
  subscriptionSettingsControl?: ReactNode;
}

export function BillingDetailPanel({
  title,
  description,
  dateRange,
  onDateRangeChange,
  activeTab,
  onTabChange,
  tableLoading,
  consumeHint,
  topupHint,
  subscriptionHint,
  exportConsumeLabel,
  exportTopupLabel,
  exportSubscriptionLabel,
  onExportConsume,
  onExportTopup,
  onExportSubscription,
  modelFilter,
  modelOptions,
  onModelChange,
  modelPlaceholder,
  consumeColumns,
  consumeData,
  consumeRowKey,
  consumePagination,
  topupColumns,
  topupData,
  topupRowKey,
  topupPagination,
  subscriptionColumns,
  subscriptionData,
  subscriptionRowKey,
  consumeEmpty,
  topupEmpty,
  subscriptionEmpty,
  consumeSettingsControl,
  topupSettingsControl,
  subscriptionSettingsControl,
}: BillingDetailPanelProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();

  const renderTable = (
    columns: ColumnsType<unknown>,
    data: unknown[],
    rowKey: string,
    pagination: false | TablePaginationConfig,
    empty: ReactNode,
  ) => {
    if (tableLoading) {
      return (
        <Flex justify="center" style={{ padding: token.paddingXL * 2 }}>
          <Spin size="large" />
        </Flex>
      );
    }
    if (data.length === 0) {
      return empty;
    }
    const scrollX = columns.reduce(
      (sum, col) => sum + (typeof col.width === 'number' ? col.width : 0),
      0,
    );
    return (
      <Table
        columns={columns}
        dataSource={data}
        rowKey={rowKey}
        scroll={{ x: `max(100%, ${scrollX}px)` }}
        pagination={pagination}
        size="middle"
      />
    );
  };

  const consumeToolbar = (
    <div className="billing-detail-toolbar">
      <Text type="secondary" style={{ fontSize: 13 }}>
        {consumeHint}
      </Text>
      <div className="billing-detail-toolbar__actions">
        {consumeSettingsControl}
        <Button type="primary" icon={<PlusOutlined />} onClick={onExportConsume}>
          {exportConsumeLabel}
        </Button>
        <Select
          placeholder={modelPlaceholder}
          value={modelFilter || undefined}
          onChange={(v) => onModelChange((v as string) || '')}
          allowClear
          style={{ width: 260 }}
          options={modelOptions.map((m) => ({ label: m, value: m }))}
        />
      </div>
    </div>
  );

  const topupToolbar = (
    <div className="billing-detail-toolbar">
      <Text type="secondary" style={{ fontSize: 13 }}>
        {topupHint}
      </Text>
      <div className="billing-detail-toolbar__actions">
        {topupSettingsControl}
        <Button type="primary" icon={<PlusOutlined />} onClick={onExportTopup}>
          {exportTopupLabel}
        </Button>
      </div>
    </div>
  );

  const subscriptionToolbar = (
    <div className="billing-detail-toolbar">
      <Text type="secondary" style={{ fontSize: 13 }}>
        {subscriptionHint}
      </Text>
      <div className="billing-detail-toolbar__actions">
        {subscriptionSettingsControl}
        <Button type="primary" icon={<PlusOutlined />} onClick={onExportSubscription}>
          {exportSubscriptionLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <PagePanel className="billing-detail-panel">
      <div className="billing-detail-panel__header">
        <div className="billing-detail-panel__header-decor-wrap" aria-hidden>
          <img
            className="billing-detail-panel__header-decor"
            src={BILLING_STAT_PLACEHOLDER_IMAGES.detailHeaderDecor}
            alt=""
          />
        </div>
        <div className="billing-detail-panel__header-main">
          <div className="billing-detail-panel__intro">
            <span className="billing-detail-panel__title-icon" aria-hidden>
              <img
                src={BILLING_STAT_PLACEHOLDER_IMAGES.detailIcon}
                alt=""
                width={56}
                height={56}
              />
            </span>
            <div className="billing-detail-panel__intro-text">
              <h3 className="billing-detail-panel__title">{title}</h3>
              <Text className="billing-detail-panel__desc">{description}</Text>
            </div>
          </div>
          <div className="billing-detail-panel__filters">
            <DatePicker.RangePicker
              allowClear={false}
              value={dateRange}
              format="YYYY/MM/DD"
              placeholder={[t('startDate'), t('endDate')]}
              maxDate={billingRangeToday()}
              disabledDate={(current, info) => {
                if (!current) return false;
                if (current.isAfter(billingRangeToday(), 'day')) return true;
                // 已有起点时限制跨度，正反两个方向选都能拦住超范围
                if (info?.from) {
                  const span =
                    Math.abs(current.startOf('day').diff(info.from.startOf('day'), 'day')) + 1;
                  if (span > BILLING_RANGE_MAX_DAYS) return true;
                }
                return false;
              }}
              onChange={(dates) => {
                if (!dates?.[0] || !dates?.[1]) return;
                onDateRangeChange(
                  dates[0].format('YYYY-MM-DD'),
                  dates[1].format('YYYY-MM-DD'),
                );
              }}
              aria-label={t('timeRange')}
              aria-required
            />
          </div>
        </div>
      </div>

      <div className="billing-detail-panel__body">
        <Tabs
          className="billing-detail-tabs"
          type="line"
          activeKey={activeTab}
          onChange={(key) => onTabChange(key as BillingDetailTabKey)}
          items={[
            {
              key: 'consume',
              label: t('consumeDetail'),
              children: (
                <>
                  {consumeToolbar}
                  {renderTable(
                    consumeColumns,
                    consumeData,
                    consumeRowKey,
                    consumePagination,
                    consumeEmpty,
                  )}
                </>
              ),
            },
            {
              key: 'topup',
              label: t('topupRecords'),
              children: (
                <>
                  {topupToolbar}
                  {renderTable(
                    topupColumns,
                    topupData,
                    topupRowKey,
                    topupPagination,
                    topupEmpty,
                  )}
                </>
              ),
            },
            {
              key: 'subscription',
              label: t('subscription'),
              children: (
                <>
                  {subscriptionToolbar}
                  {renderTable(
                    subscriptionColumns,
                    subscriptionData,
                    subscriptionRowKey,
                    false,
                    subscriptionEmpty,
                  )}
                </>
              ),
            },
          ]}
        />
      </div>
    </PagePanel>
  );
}
