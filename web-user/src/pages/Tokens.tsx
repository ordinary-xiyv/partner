import {notifyApiError, notifyApiSuccess, notifyApiErrorFromErr} from '../lib/notifyApi';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Flex, Input, Modal, Pagination, Space, Typography, theme,
} from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { getTokens, getTokenKey, deleteToken, updateToken, getUserQuotaDates } from '../api';
import { copyToClipboard, renderAmount } from '../utils';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import type { Token } from '../types';
import { LayoutMainOutletSection } from '../ui/layoutMainContent';
import {
  DEFAULT_PAGE_SIZE_OPTIONS,
  DEFAULT_TABLE_PAGE_SIZE,
} from '../utils/tablePagination';
import { TokenStatSummary } from '../components/token/TokenStatSummary';
import { TokenListTable } from '../components/token/TokenListTable';
import { TokenDebugConfigPanel } from '../components/token/TokenDebugConfigPanel';
import { TokenFormDrawer } from '../components/token/TokenFormDrawer';
import { TokenAKSKModal } from '../components/token/TokenAKSKModal';
import { useUser } from '../contexts/UserContext';
import {
  TOKEN_STATUS_DISABLED,
  TOKEN_STATUS_ENABLED,
  computeTokenStats,
  filterTokensByStatus,
  isTokenStatusToggleable,
  type TokenStatusFilter,
} from '../components/token/tokenDisplay';
import dayjs from 'dayjs';
import './tokens.css';

const { Text } = Typography;

export default function Tokens() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const qpu = useQuotaPerUnit();
  const { user } = useUser();

  const [data, setData] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TokenStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [akskToken, setAKSKToken] = useState<Token | null>(null);

  const [createdKey, setCreatedKey] = useState('');
  const [createdAKSK, setCreatedAKSK] = useState<{ accessKey: string; secretKey: string; tokenKey: string } | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [spend7dQuota, setSpend7dQuota] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const all: Token[] = [];
      let p = 1;
      const ps = 100;
      for (let guard = 0; guard < 500; guard++) {
        const res = await getTokens({ p, page_size: ps });
        if (!res.data.success) break;
        const raw = res.data.data as { items?: Token[]; total?: number } | Token[] | undefined;
        const items: Token[] = Array.isArray(raw) ? raw : raw?.items ?? [];
        const explicitTotal = !Array.isArray(raw) && raw && typeof raw === 'object' ? raw.total : undefined;
        all.push(...items);
        const gotAll = typeof explicitTotal === 'number' && all.length >= explicitTotal;
        if (items.length === 0 || items.length < ps || gotAll) break;
        p += 1;
      }
      setData(all);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    (async () => {
      try {
        const today = dayjs().startOf('day');
        const end_timestamp = today.endOf('day').unix();
        const start_timestamp = today.subtract(6, 'day').unix();
        const res = await getUserQuotaDates({ start_timestamp, end_timestamp });
        if (!res.data.success || !Array.isArray(res.data.data)) {
          setSpend7dQuota(0);
          return;
        }
        type Row = { quota?: number; refund_quota?: number };
        let net = 0;
        for (const row of res.data.data as Row[]) {
          const gross = Number(row.quota ?? 0);
          const refund = Number(row.refund_quota ?? 0);
          net += Math.max(gross - refund, 0);
        }
        setSpend7dQuota(net);
      } catch {
        setSpend7dQuota(0);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = filterTokensByStatus(data, statusFilter);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (item) => item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q),
    );
  }, [data, search, statusFilter]);

  const stats = useMemo(() => computeTokenStats(data), [data]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const openDrawer = (tokenItem: Token | null) => {
    setEditingToken(tokenItem);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingToken(null);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await deleteToken(id);
      if (res.data.success) {
        notifyApiSuccess(t('deleteSuccess'));
        void fetchData();
      } else {
        notifyApiError(res.data.message);
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  };

  const patchTokenInList = useCallback((id: number, patch: Partial<Token>) => {
    setData((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const handleToggleStatus = async (item: Token, enabled: boolean) => {
    const newStatus = enabled ? TOKEN_STATUS_ENABLED : TOKEN_STATUS_DISABLED;
    if (!isTokenStatusToggleable(item.status) || item.status === newStatus) return;

    const rollback = { status: item.status, default: item.default };
    patchTokenInList(item.id, {
      status: newStatus,
      ...(newStatus !== TOKEN_STATUS_ENABLED ? { default: false } : {}),
    });
    setTogglingId(item.id);
    try {
      const res = await updateToken({ id: item.id, status: newStatus }, { statusOnly: true });
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        const updated = res.data.data as Token | undefined;
        if (updated) patchTokenInList(item.id, updated);
      } else {
        patchTokenInList(item.id, rollback);
        notifyApiError(res.data.message);
      }
    } catch (err) {
      patchTokenInList(item.id, rollback);
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setTogglingId(null);
  };

  const handleCopyKey = async (tokenId: number) => {
    try {
      const res = await getTokenKey(tokenId);
      if (res.data?.success) {
        const rawKey = res.data.data?.key || '';
        const fullKey = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`;
        await copyToClipboard(fullKey);
        notifyApiSuccess(t('copied'));
      } else {
        notifyApiError(res.data?.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  };

  const handleCopyCreatedKey = async () => {
    await copyToClipboard(createdKey);
    notifyApiSuccess(t('copied'));
  };

  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filtered.length);

  return (
    <LayoutMainOutletSection>
      <div className="tokens-page">
        <TokenDebugConfigPanel
          tokens={data}
          onCopyKey={(id) => void handleCopyKey(id)}
        />

        <TokenStatSummary
          totalCount={stats.total}
          enabledCount={stats.enabled}
          expiringSoonCount={stats.expiringSoon}
          spend7dDisplay={renderAmount(spend7dQuota, 2, qpu)}
          labels={{
            total: t('tokenStatTotal'),
            totalDesc: t('tokenStatTotalDesc'),
            enabled: t('tokenStatEnabled'),
            enabledDesc: t('tokenStatEnabledDesc'),
            expiringSoon: t('tokenStatExpiringSoon'),
            expiringSoonDesc: t('tokenStatExpiringSoonDesc'),
            spend7d: t('tokenStatSpend7d'),
            spend7dDesc: t('tokenStatSpend7dDesc'),
          }}
        />

        <TokenListTable
          tokens={paged}
          quotaPerUnit={qpu}
          loading={loading}
          searchInput={searchInput}
          onSearchInputChange={(value) => {
            setSearchInput(value);
          }}
          statusFilter={statusFilter}
          onStatusFilterChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          togglingId={togglingId}
          onCreate={() => openDrawer(null)}
          onEdit={openDrawer}
          onDelete={(id) => void handleDelete(id)}
          onCopyKey={(id) => void handleCopyKey(id)}
          onToggleStatus={(tokenItem, enabled) => void handleToggleStatus(tokenItem, enabled)}
          onAKSK={user?.aksk_enabled ? setAKSKToken : undefined}
          paginationSummary={
            !loading && filtered.length > 0
              ? t('tokenPaginationSummary', {
                  total: filtered.length,
                  start: rangeStart,
                  end: rangeEnd,
                })
              : undefined
          }
          pagination={
            !loading && filtered.length > 0 ? (
              <Pagination
                current={page}
                pageSize={pageSize}
                total={filtered.length}
                showSizeChanger
                pageSizeOptions={[...DEFAULT_PAGE_SIZE_OPTIONS]}
                onChange={(nextPage, nextSize) => {
                  setPage(nextPage);
                  if (nextSize && nextSize !== pageSize) {
                    setPageSize(nextSize);
                  }
                }}
              />
            ) : undefined
          }
        />
      </div>

      <TokenFormDrawer
        open={drawerOpen}
        editingToken={editingToken}
        onClose={closeDrawer}
        onSuccess={() => void fetchData()}
        onCreated={(fullKey) => {
          setCreatedKey(fullKey);
        }}
        akskAvailable={!!user?.aksk_enabled}
        onAKSKCreated={(accessKey, secretKey, tokenKey) => setCreatedAKSK({ accessKey, secretKey, tokenKey })}
      />
      <TokenAKSKModal token={akskToken} onClose={() => setAKSKToken(null)} />

      <Modal
        title={t('tokenCreated')}
        open={!!createdKey}
        onCancel={() => setCreatedKey('')}
        onOk={() => setCreatedKey('')}
        okText={t('confirm')}
        cancelButtonProps={{ style: { display: 'none' } }}
        maskClosable={false}
        width={480}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: token.marginMD }}>
          {t('tokenCreatedDesc')}
        </Text>
        <Space.Compact block style={{ minWidth: 0 }}>
          <Input
            readOnly
            value={createdKey}
            title={createdKey}
            styles={{
              input: {
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                fontFamily: token.fontFamilyCode,
                cursor: 'default',
              },
            }}
          />
          <Button
            icon={<CopyOutlined />}
            aria-label={t('copy')}
            title={t('copy')}
            onClick={() => void handleCopyCreatedKey()}
          />
        </Space.Compact>
      </Modal>
      <Modal title="AK/SK 已生成" open={!!createdAKSK} onCancel={() => setCreatedAKSK(null)}
        onOk={() => setCreatedAKSK(null)} cancelButtonProps={{ style: { display: 'none' } }} maskClosable={false}>
        <Text>请立即保存 Secret Key，关闭后无法再次查看。凭据默认关闭，可在 Token 列表中启用。</Text>
        <Input readOnly value={createdAKSK?.tokenKey ?? ''} addonBefore="API Key" style={{ marginTop: 12 }} />
        <Input readOnly value={createdAKSK?.accessKey ?? ''} addonBefore="AK" style={{ marginTop: 12 }} />
        <Input.Password readOnly value={createdAKSK?.secretKey ?? ''} addonBefore="SK" visibilityToggle style={{ marginTop: 8 }} />
      </Modal>
    </LayoutMainOutletSection>
  );
}
