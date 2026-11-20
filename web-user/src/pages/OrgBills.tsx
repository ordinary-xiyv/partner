import type { TagProps } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { getMyOrgBills } from '../api';
import { notifyApiError, notifyApiErrorFromErr } from '../lib/notifyApi';
import { AsyncTableCard } from '../components/AsyncTableCard';
import { AppEmpty, AppPageHeader } from '../ui/appLayout';
import { PagePanel } from '../ui/PagePanel';
import { controlledListPagination } from '../utils/tablePagination';
import { useTableColumnVisibility } from '../hooks/useTableColumnVisibility';
import type { ManagedColumnType } from '../utils/tableColumnVisibility';
import { useCurrency } from '../hooks/useCurrency';
import type { CreditBill } from '../types';

const { Text } = Typography;
type AppTagColor = NonNullable<TagProps['color']>;

const statusColor: Record<string, AppTagColor> = {
  pending: 'default',
  confirmed: 'blue',
  paid: 'green',
  overdue: 'red',
};

type PagedResponse<T> = {
  page?: number;
  page_size?: number;
  items?: T[];
  total?: number;
};

type OrgBillRow = Partial<CreditBill> & {
  id: number;
  username?: string;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  amount?: string | number;
  created_at?: number;
};

function formatTimestamp(ts?: number) {
  if (!ts) return '-';
  return dayjs.unix(ts).format('YYYY-MM-DD HH:mm');
}

export default function OrgBills() {
  const { t } = useTranslation();
  const cc = useCurrency();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [bills, setBills] = useState<OrgBillRow[]>([]);
  const [pageSize, setPageSize] = useState(10);

  const fetchBills = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await getMyOrgBills({ p: nextPage, page_size: pageSize, skip_count: 1 });
      const raw = res.data as {
        success?: boolean;
        message?: string;
        data?: PagedResponse<OrgBillRow> | OrgBillRow[];
      } & PagedResponse<OrgBillRow>;

      let payload: PagedResponse<OrgBillRow> | OrgBillRow[] | null = null;
      if (typeof raw?.success === 'boolean') {
        if (!raw.success) {
          notifyApiError(raw.message, { fallbackKey: 'operationFailed' });
          return;
        }
        payload = raw.data || null;
      } else {
        payload = raw;
      }

      const items = Array.isArray(payload) ? payload : (payload?.items || []);
      setBills(items);
    } catch (error) {
      notifyApiErrorFromErr(error, { fallbackKey: 'orgBillsPermissionDenied' });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  const fetchTotal = useCallback(async () => {
    try {
      const res = await getMyOrgBills({ count_only: 1 });
      if (res.data?.success && Number.isFinite(res.data?.data?.total)) {
        setTotal(res.data.data.total);
      } else {
        notifyApiError(res.data?.message, { fallbackKey: 'operationFailed' });
      }
    } catch (error) {
      notifyApiErrorFromErr(error, { fallbackKey: 'operationFailed' });
    }
  }, []);

  useEffect(() => {
    void fetchBills(page);
  }, [fetchBills, page]);

  useEffect(() => {
    void fetchTotal();
  }, [fetchTotal]);

  const totalAmount = useMemo(
    () => bills.reduce((sum, bill) => {
      if (typeof bill.amount === 'string' || typeof bill.amount === 'number') {
        const num = Number(bill.amount);
        return sum + (Number.isFinite(num) ? num : 0);
      }
      return sum + (((bill.total_amount || 0) / 100) || 0);
    }, 0),
    [bills],
  );

  const allColumns = useMemo<ManagedColumnType<OrgBillRow>[]>(() => [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: t('userName'),
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: t('modelName'),
      dataIndex: 'model_name',
      key: 'model_name',
      width: 230,
      render: (value: string) => value || '-',
    },
    {
      title: t('promptTokens'),
      dataIndex: 'prompt_tokens',
      key: 'prompt_tokens',
      width: 110,
      render: (value: number) => (value ?? 0).toLocaleString(),
    },
    {
      title: t('completionTokens'),
      dataIndex: 'completion_tokens',
      key: 'completion_tokens',
      width: 130,
      render: (value: number) => (value ?? 0).toLocaleString(),
    },
    {
      title: t('orgBills.totalTokens'),
      dataIndex: 'total_tokens',
      key: 'total_tokens',
      width: 120,
      render: (value: number) => (value ?? 0).toLocaleString(),
    },
    {
      title: t('amount'),
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (value: string | number, record: OrgBillRow) => {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return `${cc.symbol}${(parsed * cc.rate).toFixed(4)}`;
        return `${cc.symbol}${((((record.total_amount || 0) / 100) || 0) * cc.rate).toFixed(4)}`;
      },
    },
    {
      title: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value: number) => formatTimestamp(value),
    },
  ], [t, cc]);

  const { columns, settingsControl } = useTableColumnVisibility({
    tableId: 'org-bills',
    columns: allColumns,
  });

  return (
    <div>
      <AppPageHeader
        title={t('orgBills')}
        subtitle={t('orgBillsPermissionDenied')}
        actions={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { void fetchBills(page); void fetchTotal(); }}>
              {t('refresh')}
            </Button>
          </Space>
        )}
      />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <PagePanel padded style={{ minWidth: 220 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('billCount')}</Text>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{(total || bills.length).toLocaleString()}</div>
        </PagePanel>
        <PagePanel padded style={{ minWidth: 220 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('currentPageConsumed')}</Text>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
            {cc.symbol}{(totalAmount * cc.rate).toFixed(4)}
          </div>
        </PagePanel>
      </div>

      <AsyncTableCard<OrgBillRow>
        toolbar={(
          <Space>{settingsControl}</Space>
        )}
        tableProps={{
          columns,
          dataSource: bills,
          loading,
          rowKey: 'id',
          scroll: { x: 'max(100%, 1080px)' },
          pagination: controlledListPagination({
            current: page,
            pageSize,
            total,
            onChange: (nextPage, nextSize) => {
              if (nextSize && nextSize !== pageSize) {
                setPageSize(nextSize);
                setPage(1);
              } else {
                setPage(nextPage);
              }
            },
          }),
          locale: {
            emptyText: <AppEmpty icon="🧾" message={t('noData')} />,
          },
        }}
      />
    </div>
  );
}
