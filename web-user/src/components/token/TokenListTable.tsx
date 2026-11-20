import { useMemo, type ReactNode } from 'react';
import {
  Button, Flex, Input, Segmented, Space, Table, Typography, theme,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Token } from '../../types';
import { useTableColumnVisibility } from '../../hooks/useTableColumnVisibility';
import type { ManagedColumnType } from '../../utils/tableColumnVisibility';
import { formatTime, renderAmount } from '../../utils';
import { TableRowActions } from '../TableRowActions';
import { parseChannelGroups } from '../channel/channelGroup';
import {
  TOKEN_STATUS_ENABLED,
  getTokenQuotaUsagePercent,
  getTokenStatusMeta,
  isTokenExpiringSoon,
  isTokenStatusToggleable,
  maskTokenKey,
  type TokenStatusFilter,
} from './tokenDisplay';

const { Text } = Typography;

export interface TokenListTableProps {
  tokens: Token[];
  quotaPerUnit: number;
  loading?: boolean;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  statusFilter: TokenStatusFilter;
  onStatusFilterChange: (value: TokenStatusFilter) => void;
  togglingId: number | null;
  onCreate: () => void;
  onEdit: (token: Token) => void;
  onDelete: (id: number) => void;
  onCopyKey: (id: number) => void;
  onToggleStatus: (token: Token, enabled: boolean) => void;
  onAKSK?: (token: Token) => void;
  pagination?: ReactNode;
  paginationSummary?: string;
}

function TokenStatusPill({ status }: { status: number }) {
  const { t } = useTranslation();
  const meta = getTokenStatusMeta(status, t);
  const toneClass =
    meta.tone === 'enabled'
      ? 'tokens-status--on'
      : meta.tone === 'expired'
        ? 'tokens-status--expired'
        : meta.tone === 'disabled'
          ? 'tokens-status--disabled'
          : meta.tone === 'exhausted'
            ? 'tokens-status--exhausted'
            : 'tokens-status--unknown';

  return (
    <span className={`tokens-status ${toneClass}`}>
      <i className="tokens-status__dot" />
      {meta.label}
    </span>
  );
}

function formatGroup(token: Token): string {
  const groups = parseChannelGroups(token.group);
  if (groups.length === 0) return '—';
  return groups.join(' / ');
}

/** 令牌列表表格（对齐设计稿） */
export function TokenListTable({
  tokens,
  quotaPerUnit,
  loading = false,
  searchInput,
  onSearchInputChange,
  statusFilter,
  onStatusFilterChange,
  togglingId,
  onCreate,
  onEdit,
  onDelete,
  onCopyKey,
  onToggleStatus,
  onAKSK,
  pagination,
  paginationSummary,
}: TokenListTableProps) {
  const { t } = useTranslation();
  const { token: themeToken } = theme.useToken();

  const statusOptions = useMemo(
    () => [
      { label: t('all'), value: 'all' as const },
      { label: t('tokenStatEnabled'), value: 'enabled' as const },
      { label: t('tokenStatusExpired'), value: 'expired' as const },
    ],
    [t],
  );

  const allColumns: ManagedColumnType<Token>[] = useMemo(
    () => [
      {
        title: t('name'),
        key: 'name',
        width: 260,
        render: (_: unknown, record) => {
          const metaBits: string[] = [];
          if (record.group) {
            const groups = parseChannelGroups(record.group);
            if (groups[0]) metaBits.push(groups[0]);
          }
          if (record.default) metaBits.push(t('tokenDefaultUse'));
          const expiringSoon = isTokenExpiringSoon(record);
          return (
            <div className="tokens-key-name">
              <div style={{ minWidth: 0 }}>
                <div className="tokens-key-name__title">
                  <b title={record.name}>{record.name}</b>
                  {expiringSoon ? (
                    <span className="tokens-expiring-tag">{t('tokenStatExpiringSoon')}</span>
                  ) : null}
                </div>
                <span className="tokens-key-name__meta">
                  {metaBits.length > 0 ? metaBits.join(' · ') : '—'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        title: t('apiKey'),
        key: 'key',
        width: 248,
        render: (_: unknown, record) => (
          <Space size={8} wrap={false}>
            <span className="tokens-mono">{maskTokenKey(record.key)}</span>
            <button type="button" className="tokens-link" onClick={() => onCopyKey(record.id)}>
              {t('copy')}
            </button>
          </Space>
        ),
      },
      {
        title: t('status'),
        key: 'status',
        width: 110,
        render: (_: unknown, record) => <TokenStatusPill status={record.status} />,
      },
      {
        title: t('group'),
        key: 'group',
        width: 140,
        ellipsis: true,
        render: (_: unknown, record) => formatGroup(record),
      },
      {
        title: t('tokenQuotaUsage'),
        key: 'quota',
        width: 160,
        render: (_: unknown, record) => {
          const used = renderAmount(record.used_quota, 4, quotaPerUnit);
          const limit = record.unlimited_quota
            ? t('unlimited')
            : renderAmount(record.used_quota + record.remain_quota, 4, quotaPerUnit);
          const pct = getTokenQuotaUsagePercent(record);
          return (
            <div className="tokens-usage">
              <b>{used} / {limit}</b>
              <div className="tokens-mini-meter">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        },
      },
      {
        title: t('expiredTime'),
        key: 'expired_time',
        width: 160,
        render: (_: unknown, record) =>
          record.expired_time === -1 ? t('noExpiration') : formatTime(record.expired_time),
      },
      {
        title: t('tokenLastUsed'),
        key: 'accessed_time',
        width: 150,
        render: (_: unknown, record) => {
          const ts = record.accessed_time ?? 0;
          return ts > 0 ? formatTime(ts) : '—';
        },
      },
      {
        title: t('actions'),
        key: 'actions',
        width: 170,
        align: 'right',
        columnSettingsLocked: true,
        render: (_: unknown, record) => {
          const toggleable = isTokenStatusToggleable(record.status);
          const isEnabled = record.status === TOKEN_STATUS_ENABLED;
          const toggling = togglingId === record.id;
          const toggleLabel = isEnabled ? t('disable') : t('enable');

          return (
            <TableRowActions
              items={[
                {
                  key: 'toggle',
                  label: toggleLabel,
                  disabled: !toggleable || toggling,
                  onClick: () => onToggleStatus(record, !isEnabled),
                },
                {
                  key: 'edit',
                  label: t('edit'),
                  onClick: () => onEdit(record),
                },
                ...(onAKSK ? [{ key: 'aksk', label: 'AK/SK', onClick: () => onAKSK(record) }] : []),
                {
                  key: 'delete',
                  label: t('delete'),
                  danger: true,
                  confirmTitle: t('deleteConfirm'),
                  onConfirm: () => onDelete(record.id),
                },
              ]}
            />
          );
        },
      },
    ],
    [t, quotaPerUnit, togglingId, onCopyKey, onDelete, onEdit, onToggleStatus, onAKSK],
  );

  const { columns } = useTableColumnVisibility({
    tableId: 'tokens-list',
    columns: allColumns,
  });

  return (
    <section className="tokens-panel tokens-table-panel">
      <div className="tokens-table-toolbar">
        <div className="tokens-panel-title">
          <div>
            <h2>{t('tokenListTitle')}</h2>
            <p>{t('tokenListDesc')}</p>
          </div>
        </div>
        <div className="tokens-filters">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('tokenSearchPlaceholder')}
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            style={{ width: 240 }}
          />
          <Segmented
            options={statusOptions}
            value={statusFilter}
            onChange={(v) => onStatusFilterChange(v as TokenStatusFilter)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            {t('createToken')}
          </Button>
        </div>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={tokens}
        pagination={false}
        scroll={{ x: 'max(100%, 1398px)' }}
        size="middle"
        locale={{
          emptyText: (
            <Flex justify="center" style={{ padding: themeToken.paddingXL }}>
              <Text type="secondary">{t('noData')}</Text>
            </Flex>
          ),
        }}
      />

      {pagination ? (
        <div className="tokens-pagination">
          <span>{paginationSummary}</span>
          {pagination}
        </div>
      ) : null}
    </section>
  );
}
