import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Tag, Space, Input, Select, InputNumber, Switch, Flex,
} from 'antd';
import { SearchOutlined, PlusOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { getRedemptions, addRedemption, deleteRedemption } from '../../api';
import { formatTime, copyToClipboard, toQuota, renderAmount, getCurrencySymbol } from '../../utils';
import { controlledListPagination } from '../../utils/tablePagination';
import { useTableColumnVisibility } from '../../hooks/useTableColumnVisibility';
import type { ManagedColumnType } from '../../utils/tableColumnVisibility';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { Redemption } from '../../types';
import { borderedRowBtnProps } from '../../ui/tableRowActionButtons';
import { TableRowActions } from '../TableRowActions';
import { AsyncTableCard } from '../AsyncTableCard';
import { Field, TextInput } from '../Dialog';
import { FormDrawer } from '../../ui/FormDrawer';

const QUOTA_PRECISION = 4;
const QUOTA_STEP = 0.01;

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

export interface RedemptionListPanelProps {
  hideToolbarActions?: boolean;
  onRegisterActions?: (actions: { refresh: () => void; openCreate: () => void }) => void;
}

export function RedemptionListPanel({
  hideToolbarActions = false,
  onRegisterActions,
}: RedemptionListPanelProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [data, setData] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState('');
  const [formQuota, setFormQuota] = useState(0.2);
  const [formCount, setFormCount] = useState(1);
  const [formExpirationDays, setFormExpirationDays] = useState(30);
  const [formPermanent, setFormPermanent] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'used' | 'expired'>('all');
  const [pageSize, setPageSize] = useState(10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRedemptions({ p: page, page_size: pageSize });
      if (res.data.success) {
        const pageData = res.data.data;
        setData(pageData?.items || []);
        setTotal(pageData?.total || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, pageSize]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const openModal = useCallback(() => {
    setFormName('');
    setFormQuota(0.2);
    setFormCount(1);
    setFormExpirationDays(30);
    setFormPermanent(false);
    setModalVisible(true);
  }, []);

  useEffect(() => {
    onRegisterActions?.({ refresh: () => void fetchData(), openCreate: openModal });
  }, [fetchData, openModal, onRegisterActions]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      const res = await deleteRedemption(id);
      if (res.data.success) {
        notifyApiSuccess(t('deleteSuccess'));
        void fetchData();
      } else { notifyApiError(res.data.message); }
    } catch (err) { notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' }); }
  }, [fetchData, t]);

  const handleSubmit = async () => {
    let expiredTime = 0;
    if (!formPermanent) {
      if (!Number.isInteger(formExpirationDays) || formExpirationDays < 1) {
        notifyApiError(t('redemptionExpirationPositive'));
        return;
      }
      expiredTime = Math.floor(Date.now() / 1000) + formExpirationDays * 86400;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName,
        quota: toQuota(formQuota, qpu),
        count: formCount,
        expired_time: expiredTime,
      };
      const res = await addRedemption(payload);
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        setModalVisible(false);
        void fetchData();
      } else { notifyApiError(res.data.message); }
    } catch (err) { notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' }); }
    setSubmitting(false);
  };

  const getRedemptionState = (record: Redemption): 'unused' | 'used' | 'expired' | 'unknown' => {
    const now = Math.floor(Date.now() / 1000);
    const expired = Number(record.expired_time || 0) > 0 && Number(record.expired_time) <= now;
    if (record.status === 3) return 'used';
    if (record.status === 1) {
      if (expired) return 'expired';
      return 'unused';
    }
    return 'unknown';
  };

  const statusTag = (record: Redemption) => {
    const state = getRedemptionState(record);
    if (state === 'used') return <Tag color="grey">{t('usedQuota')}</Tag>;
    if (state === 'expired') return <Tag color="red">{t('expired')}</Tag>;
    if (state === 'unused') return <Tag color="green">{t('unused')}</Tag>;
    return <Tag>{record.status}</Tag>;
  };

  const filteredData = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return data.filter((item) => {
      if (kw) {
        const hay = `${item.name || ''} ${item.key || ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (statusFilter !== 'all') {
        const state = getRedemptionState(item);
        if (state !== statusFilter) return false;
      }
      return true;
    });
  }, [data, keyword, statusFilter]);

  const allColumns = useMemo<ManagedColumnType<Redemption>[]>(() => [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: t('name'), dataIndex: 'name', key: 'name', width: 160, ellipsis: true },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      columnLabel: 'Key',
      width: 380,
      render: (v: string) => (
        <Space size={6}>
          <span>{v}</span>
          <Button
            {...borderedRowBtnProps}
            icon={<CopyOutlined />}
            onClick={async () => {
              try {
                await copyToClipboard(v);
                notifyApiSuccess(t('copied'));
              } catch {
                notifyApiError(t('operationFailed'));
              }
            }}
          >
            {t('copy')}
          </Button>
        </Space>
      ),
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 96,
      render: (_: number, record: Redemption) => statusTag(record),
    },
    {
      title: t('expiryTime'),
      dataIndex: 'expired_time',
      key: 'expired_time',
      width: 180,
      render: (v: number) => {
        if (v === 0 || v === -1) return t('noExpiration');
        if (v > 0) return formatTime(v);
        return '-';
      },
    },
    { title: t('quota'), dataIndex: 'quota', key: 'quota', width: 100, render: (v: number) => renderAmount(v, 4, qpu) },
    {
      title: t('createdAt'),
      dataIndex: 'created_time',
      key: 'created_time',
      width: 180,
      render: (_: number, record: Redemption) => formatTime(record.created_time ?? record.created_at),
    },
    {
      title: t('actions'),
      key: 'actions',
      width: 150,
      columnSettingsLocked: true,
      render: (_: unknown, record: Redemption) => (
        <TableRowActions
          items={[
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
  ], [handleDelete, qpu, t]);

  const { columns } = useTableColumnVisibility({
    tableId: 'redemptions-list',
    columns: allColumns,
  });

  return (
    <>
      <AsyncTableCard<Redemption>
        bare
        toolbarBordered={false}
        toolbar={(
          <Flex align="center" gap={12} wrap="wrap" className="lynx-list-toolbar lynx-list-toolbar--in-panel">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('redemptionSearchPlaceholder')}
              style={{ minWidth: 220, maxWidth: 320 }}
            />
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter((v as 'all' | 'unused' | 'used' | 'expired') || 'all')}
              style={{ minWidth: 140 }}
              options={[
                { label: t('all'), value: 'all' },
                { label: t('unused'), value: 'unused' },
                { label: t('usedQuota'), value: 'used' },
                { label: t('expired'), value: 'expired' },
              ]}
            />
            {!hideToolbarActions && (
              <Space style={{ marginLeft: 'auto' }}>
                <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>{t('refresh')}</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>{t('create')}</Button>
              </Space>
            )}
          </Flex>
        )}
        tableProps={{
          columns,
          dataSource: filteredData,
          loading,
          rowKey: 'id',
          scroll: { x: 'max(100%, 1306px)' },
          pagination: controlledListPagination({
            current: page,
            pageSize,
            total: (keyword.trim() || statusFilter !== 'all') ? filteredData.length : total,
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

      <FormDrawer
        title={`${t('create')} ${t('redemptionCode')}`}
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={() => void handleSubmit()}
        loading={submitting}
        width={400}
      >
        <Field label={t('name')} required>
          <TextInput
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
        </Field>
        <Field label={t('requestCount')}>
          <InputNumber
            style={{ width: '100%' }}
            min={1}
            precision={0}
            step={1}
            value={formCount}
            onChange={(v) => setFormCount(Number(v) || 1)}
          />
        </Field>
        <Field label={`${t('quota')} (${getCurrencySymbol()})`} required>
          <InputNumber
            style={numberInputStyle}
            min={0}
            precision={QUOTA_PRECISION}
            step={QUOTA_STEP}
            value={formQuota}
            onChange={(v) => setFormQuota(Number(v) || 0)}
          />
        </Field>
        <Field label={`${t('expiration')} (${t('day')})`}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Switch
              checked={formPermanent}
              onChange={setFormPermanent}
              checkedChildren={t('gatewayTier.permanent')}
              unCheckedChildren={t('gatewayTier.limited')}
            />
            {!formPermanent && (
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                precision={0}
                step={1}
                value={formExpirationDays}
                onChange={(v) => setFormExpirationDays(Number(v) || 1)}
              />
            )}
          </Space>
        </Field>
      </FormDrawer>
    </>
  );
}
