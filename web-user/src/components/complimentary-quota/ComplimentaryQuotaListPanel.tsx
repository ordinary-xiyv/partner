import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Select, Space, Tag, Flex } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  deleteComplimentaryQuota,
  getComplimentaryQuotas,
} from '../../api/complimentaryQuota';
import { useUserName } from '../../hooks/useNameCache';
import { useTableColumnVisibility } from '../../hooks/useTableColumnVisibility';
import type { ManagedColumnType } from '../../utils/tableColumnVisibility';
import { controlledListPagination } from '../../utils/tablePagination';
import { renderAmount } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { ComplimentaryQuota } from '../../types';
import { TableRowActions } from '../TableRowActions';
import { AsyncTableCard } from '../AsyncTableCard';
import { GrantComplimentaryQuotaDrawer } from './GrantComplimentaryQuotaDrawer';
import {
  COMPLIMENTARY_STATUS_ACTIVE,
  COMPLIMENTARY_STATUS_EXPIRED,
  COMPLIMENTARY_STATUS_USED_UP,
  complimentarySourceLabel,
  complimentaryStatusLabelKey,
  complimentaryStatusTagColor,
  formatComplimentaryExpiredAt,
  formatComplimentaryTime,
  type ComplimentaryStatusFilter,
} from './complimentaryDisplay';

function ComplimentaryUserCell({ userId }: { userId: number }) {
  const name = useUserName(userId);
  return <>{name}</>;
}

export interface ComplimentaryQuotaListPanelProps {
  /** 由父级 Tabs 的 tabBarExtraContent 注入时设为 true，隐藏面板内工具按钮 */
  hideToolbarActions?: boolean;
  onRegisterActions?: (actions: { refresh: () => void; openCreate: () => void }) => void;
}

export function ComplimentaryQuotaListPanel({
  hideToolbarActions = false,
  onRegisterActions,
}: ComplimentaryQuotaListPanelProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [data, setData] = useState<ComplimentaryQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ComplimentaryStatusFilter>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ComplimentaryQuota | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getComplimentaryQuotas({
        p: page,
        page_size: pageSize,
        status: statusFilter === 'all' ? -1 : statusFilter,
      });
      if (res.data.success) {
        const list = Array.isArray(res.data.data) ? res.data.data : [];
        setData(list);
        setTotal(res.data.total ?? list.length);
      } else {
        notifyApiError(res.data.message);
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setLoading(false);
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setDrawerOpen(true);
  }, []);

  useEffect(() => {
    onRegisterActions?.({ refresh: () => void fetchData(), openCreate });
  }, [fetchData, openCreate, onRegisterActions]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      const res = await deleteComplimentaryQuota(id);
      if (res.data.success) {
        notifyApiSuccess(res.data.message || t('deleteSuccess'));
        void fetchData();
      } else {
        notifyApiError(res.data.message);
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  }, [fetchData, t]);

  const openEdit = useCallback((record: ComplimentaryQuota) => {
    setEditing(record);
    setDrawerOpen(true);
  }, []);

  const allColumns = useMemo<ManagedColumnType<ComplimentaryQuota>[]>(() => [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 72 },
    {
      title: t('username'),
      dataIndex: 'user_id',
      key: 'user_id',
      width: 160,
      render: (uid: number) => <ComplimentaryUserCell userId={uid} />,
    },
    {
      title: t('complimentaryQuota.giftCredit'),
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (v: number) => renderAmount(v, 4, qpu),
    },
    {
      title: t('complimentaryQuota.remain'),
      dataIndex: 'remain',
      key: 'remain',
      width: 120,
      render: (v: number) => renderAmount(v, 4, qpu),
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number) => (
        <Tag color={complimentaryStatusTagColor(status)}>
          {t(complimentaryStatusLabelKey(status))}
        </Tag>
      ),
    },
    {
      title: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: ComplimentaryQuota['created_at']) => formatComplimentaryTime(v),
    },
    {
      title: t('complimentaryQuota.endTime'),
      dataIndex: 'expired_at',
      key: 'expired_at',
      width: 180,
      render: (v: number | null | undefined) => formatComplimentaryExpiredAt(v, t('noExpiration')),
    },
    {
      title: t('complimentaryQuota.reason'),
      dataIndex: 'source',
      key: 'source',
      width: 140,
      ellipsis: true,
      render: (v: string) => complimentarySourceLabel(v, t),
    },
    {
      title: t('notes'),
      dataIndex: 'remark',
      key: 'remark',
      width: 160,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: t('actions'),
      key: 'actions',
      width: 180,
      columnSettingsLocked: true,
      render: (_: unknown, record: ComplimentaryQuota) => (
        <TableRowActions
          items={[
            {
              key: 'edit',
              label: t('edit'),
              onClick: () => openEdit(record),
            },
            {
              key: 'delete',
              label: t('delete'),
              danger: true,
              confirmTitle: t('deleteConfirm'),
              onConfirm: () => void handleDelete(record.id),
            },
          ]}
        />
      ),
    },
  ], [handleDelete, openEdit, qpu, t]);

  const { columns } = useTableColumnVisibility({
    tableId: 'complimentary-quotas-list',
    columns: allColumns,
  });

  return (
    <>
      <AsyncTableCard<ComplimentaryQuota>
        bare
        toolbarBordered={false}
        toolbar={(
          <Flex align="center" gap={12} wrap="wrap" className="lynx-list-toolbar lynx-list-toolbar--in-panel">
            <Select
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as ComplimentaryStatusFilter);
                setPage(1);
              }}
              style={{ minWidth: 140 }}
              options={[
                { label: t('all'), value: 'all' },
                { label: t('topupGiftStatusActive'), value: COMPLIMENTARY_STATUS_ACTIVE },
                { label: t('topupGiftStatusExhausted'), value: COMPLIMENTARY_STATUS_USED_UP },
                { label: t('topupGiftStatusExpired'), value: COMPLIMENTARY_STATUS_EXPIRED },
              ]}
            />
            {!hideToolbarActions && (
              <Space style={{ marginLeft: 'auto' }}>
                <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>{t('refresh')}</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  {t('complimentaryQuota.create')}
                </Button>
              </Space>
            )}
          </Flex>
        )}
        tableProps={{
          columns,
          dataSource: data,
          loading,
          rowKey: 'id',
          scroll: { x: 'max(100%, 1412px)' },
          pagination: controlledListPagination({
            current: page,
            pageSize,
            total,
            onChange: (p, nextSize) => {
              if (nextSize && nextSize !== pageSize) {
                setPageSize(nextSize);
                setPage(1);
              } else {
                setPage(p);
              }
            },
          }),
        }}
      />

      <GrantComplimentaryQuotaDrawer
        open={drawerOpen}
        editing={editing}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        onSuccess={() => void fetchData()}
      />
    </>
  );
}
