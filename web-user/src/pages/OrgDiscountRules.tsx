import {notifyApiError, notifyApiErrorFromErr} from '../lib/notifyApi';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Table, Tag, Button, Select} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { getMyOrgDiscountRules } from '../api';
import { formatTime } from '../utils';
import { renderRuleStatusTag } from '../utils/discountRuleStatus';
import { controlledListPagination } from '../utils/tablePagination';
import { useUser } from '../contexts/UserContext';
import { useCurrency } from '../hooks/useCurrency';
import { AppPageHeader } from '../ui/appLayout';
import { PagePanel } from '../ui/PagePanel';
import { useTableColumnVisibility } from '../hooks/useTableColumnVisibility';
import type { ManagedColumnType } from '../utils/tableColumnVisibility';
import { DiscountRateListCell } from '../components/discount/DiscountRateListCell';

export interface BusinessDiscountRule {
  id: number;
  org_id: number;
  model_name: string;
  discount_rate: number;
  input_discount_rate?: number | null;
  output_discount_rate?: number | null;
  cache_discount_rate?: number | null;
  discount_prompt_price?: number;
  discount_completion_price?: number;
  discount_cache_price?: number;
  prompt_price_per_1k?: number;
  /** 0=按量，1=按次 */
  quota_type?: number;
  effective_from: number;
  effective_to: number;
  /** 0=未生效，1=生效中，2=已失效（服务端列表附带） */
  status?: number;
}

/** 企业成员：查看本企业模型折扣（只读），支持按规则状态筛选 */
export default function OrgDiscountRules() {
  const { t } = useTranslation();
  const cc = useCurrency();
  const { isEnterprise, loading: userLoading } = useUser();
  const [rules, setRules] = useState<BusinessDiscountRule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  /** -1: 全部, 0: 未生效, 1: 生效中, 2: 已失效 */
  const [statusFilter, setStatusFilter] = useState<-1 | 0 | 1 | 2>(1);

  const fetchRules = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          page: p - 1,
          per_page: pageSize,
          /** 始终传入，与后端 DefaultQuery 一致；`-1` 表示全部 */
          status: statusFilter,
        };
        const res = await getMyOrgDiscountRules(params);
        if (res.data.success) {
          setRules(res.data.data || []);
          setTotal(res.data.total ?? 0);
        } else {
          notifyApiError(res.data.message || t('operationFailed'));
        }
      } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    } finally {
        setLoading(false);
      }
    },
    [t, statusFilter, pageSize],
  );

  useEffect(() => {
    if (!userLoading && isEnterprise) {
      setPage(1);
      void fetchRules(1);
    }
  }, [userLoading, isEnterprise, fetchRules]);

  const formatDiscountPrice = useCallback(
    (base: number | undefined, quotaType: number | undefined) => {
      if (base == null || Number.isNaN(Number(base))) return '-';
      const n = Number(base);
      const shown = quotaType === 0 ? n * 1000 : n;
      const unit = quotaType === 0 ? t('discountRules.unitPer1m') : t('discountRules.unitPerRequest');
      return `${cc.symbol}${(shown * cc.rate).toFixed(4)} ${unit}`;
    },
    [cc.rate, cc.symbol, t],
  );

  const formatCacheHitPrice = useCallback(
    (row: BusinessDiscountRule) => {
      const cachePrice = Number(row.discount_cache_price);
      if (cachePrice > 0 && !Number.isNaN(cachePrice)) {
        return formatDiscountPrice(cachePrice, row.quota_type);
      }
      const prompt = Number(row.prompt_price_per_1k);
      if (!prompt || Number.isNaN(prompt)) return '-';
      const cacheRate =
        row.cache_discount_rate != null && row.cache_discount_rate > 0
          ? row.cache_discount_rate
          : row.discount_rate;
      return formatDiscountPrice(prompt * cacheRate, row.quota_type);
    },
    [formatDiscountPrice],
  );

  const allColumns = useMemo<ManagedColumnType<BusinessDiscountRule>[]>(() => [
    {
      title: t('modelName'),
      dataIndex: 'model_name',
      key: 'model_name',
      width: 180,
      render: (v: string) => <code style={{ fontSize: 13 }}>{v}</code>,
    },
    {
      title: t('discountRules.ruleStatusCol'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (_: unknown, row: BusinessDiscountRule) => renderRuleStatusTag(row.status, t),
    },
    {
      title: t('discountRules.discountRate'),
      dataIndex: 'discount_rate',
      key: 'discount_rate',
      width: 220,
      render: (_: number, row: BusinessDiscountRule) => <DiscountRateListCell row={row} />,
    },
    {
      title: t('discountRules.discountPromptPrice'),
      dataIndex: 'discount_prompt_price',
      key: 'discount_prompt_price',
      width: 170,
      render: (_: number, row: BusinessDiscountRule) =>
        formatDiscountPrice(row.discount_prompt_price, row.quota_type),
    },
    {
      title: t('discountRules.discountCompletionPrice'),
      dataIndex: 'discount_completion_price',
      key: 'discount_completion_price',
      width: 170,
      render: (_: number, row: BusinessDiscountRule) =>
        formatDiscountPrice(row.discount_completion_price, row.quota_type),
    },
    {
      title: t('modelPlaza.priceCacheRead'),
      key: 'cache_hit_price',
      width: 160,
      render: (_: unknown, row: BusinessDiscountRule) => formatCacheHitPrice(row),
    },
    {
      title: t('effectiveFrom'),
      dataIndex: 'effective_from',
      key: 'effective_from',
      width: 168,
      render: (v: number) => formatTime(v),
    },
    {
      title: t('effectiveTo'),
      dataIndex: 'effective_to',
      key: 'effective_to',
      width: 188,
      render: (v: number) => (v ? formatTime(v) : <Tag color="green">-</Tag>),
    },
  ], [formatCacheHitPrice, formatDiscountPrice, t]);

  const { columns, settingsControl } = useTableColumnVisibility({
    tableId: 'org-discount-rules',
    columns: allColumns,
  });

  if (!userLoading && !isEnterprise) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="org-discount-rules-page">
      <AppPageHeader
        title={t('sidebar.orgDiscountRules')}
        subtitle={t('discountRules.orgPageDesc')}
      />

      <PagePanel padded>
      <div
        className="lynx-list-toolbar lynx-list-toolbar--in-panel"
        style={{ width: '100%' }}
      >
        <Select
          value={String(statusFilter)}
          onChange={(v) => {
            const n = Number(v);
            if (n === -1 || n === 0 || n === 1 || n === 2) setStatusFilter(n);
            setPage(1);
          }}
          style={{ width: 160 }}
          options={[
            { label: t('adminBilling.all'), value: '-1' },
            { label: t('discountRules.statusPending'), value: '0' },
            { label: t('discountRules.statusActive'), value: '1' },
            { label: t('discountRules.statusExpired'), value: '2' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => fetchRules(page)} loading={loading}>
          {t('adminBilling.refreshBtn')}
        </Button>
        {settingsControl}
      </div>

      {loading || rules.length > 0 ? (
        <div className={`org-responsive-table-set${rules.length > 0 ? ' has-mobile-cards' : ''}`}>
          <div className="org-responsive-table" style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <Table
              columns={columns}
              dataSource={rules}
              rowKey="id"
              loading={loading}
              scroll={{ x: 'max(100%, 1366px)' }}
              pagination={controlledListPagination({
                current: page,
                pageSize,
                total,
                onChange: (p, nextSize) => {
                  if (nextSize && nextSize !== pageSize) {
                    setPageSize(nextSize);
                    setPage(1);
                    void fetchRules(1);
                  } else {
                    setPage(p);
                    void fetchRules(p);
                  }
                },
              })}
            />
          </div>
          <div className="org-discount-rule-cards">
            {rules.map((rule) => (
              <div key={rule.id} className="org-mobile-card">
                <div className="org-mobile-card-title">
                  <code>{rule.model_name}</code>
                  {renderRuleStatusTag(rule.status, t)}
                </div>
                <div className="org-mobile-card-grid">
                  <span>{t('discountRules.discountRate')}</span>
                  <strong><DiscountRateListCell row={rule} /></strong>
                  <span>{t('discountRules.discountPromptPrice')}</span>
                  <strong>{formatDiscountPrice(rule.discount_prompt_price, rule.quota_type)}</strong>
                  <span>{t('discountRules.discountCompletionPrice')}</span>
                  <strong>{formatDiscountPrice(rule.discount_completion_price, rule.quota_type)}</strong>
                  <span>{t('modelPlaza.priceCacheRead')}</span>
                  <strong>{formatCacheHitPrice(rule)}</strong>
                  <span>{t('effectiveFrom')}</span>
                  <strong>{formatTime(rule.effective_from)}</strong>
                  <span>{t('effectiveTo')}</span>
                  <strong>{rule.effective_to ? formatTime(rule.effective_to) : '-'}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="org-empty-state"
          style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}
        >
          {t('discountRules.orgEmpty')}
        </div>
      )}
      </PagePanel>
    </div>
  );
}
