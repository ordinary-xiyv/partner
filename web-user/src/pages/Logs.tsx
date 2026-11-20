import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Button, DatePicker, Input, Select, Space, Typography, Tooltip,
} from 'antd';
import { ReloadOutlined, ToolOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import {
  exportLogs, exportMyOrgLogs, exportUserLogs, getChannels, getLogs, getMyOrgLogs, getMyOrgMembers, getUserLogs, searchUsers,
} from '../api';
import { useUser } from '../contexts/UserContext';
import { formatTime, renderAmount } from '../utils';
import { QuotaAmount } from '../components/QuotaAmount';
import { LogModelNameFilter, logSelectOverflowRender } from '../components/logs/LogModelNameFilter';
import { BillingBreakdownTooltip } from '../components/logs/BillingBreakdownTooltip';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useLogModelFilterOptions } from '../hooks/useLogModelFilterOptions';
import { hasPermission } from '../utils';
import { AsyncTableCard } from '../components/AsyncTableCard';
import { useTableColumnVisibility } from '../hooks/useTableColumnVisibility';
import { useServerTableQuery } from '../hooks/useServerTableQuery';
import type { ManagedColumnType } from '../utils/tableColumnVisibility';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import type { Channel, LogEntry } from '../types';
import { logTypeTag } from '../ui/logTypeTag';
import { AppPageHeader } from '../ui/appLayout';
import './Logs.css';

type LogUserSearchOption = { label: string; value: string; title: string };

function parseSearchUserItems(data: unknown): Array<{ id: number; username: string; display_name?: string }> {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) ? items : [];
  }
  return [];
}

function toLogUserSearchOption(u: { id: number; username: string; display_name?: string }): LogUserSearchOption {
  const name = (u.username || '').trim() || `UID:${u.id}`;
  const label = `${name} (#${u.id})`;
  return { label, value: name, title: label };
}

/** 表头与列 align 一致，避免 th 默认左对齐与右对齐数据列「错位」 */
function LogsColumnTitle({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <Typography.Text
      ellipsis
      style={{
        marginBottom: 0,
        display: 'block',
        width: '100%',
        textAlign: align,
      }}
    >
      {children}
    </Typography.Text>
  );
}

/** 数值列空值占位，与数字同右对齐 */
function LogsNumericPlaceholder({ className }: { className?: string }) {
  return (
    <Typography.Text
      type="secondary"
      className={className}
      style={{ display: 'block', width: '100%', marginBottom: 0, textAlign: 'right' }}
    >
      -
    </Typography.Text>
  );
}

/** 日志查询可选日历范围：含今天共 60 天 */
const LOGS_LOOKBACK_DAYS = 60;
const LOGS_RANGE_DISPLAY_FMT = 'YYYY/MM/DD HH:mm:ss';

function logsDateBounds() {
  const todayStart = dayjs().startOf('day');
  const todayEnd = dayjs().endOf('day');
  return {
    min: todayStart.subtract(LOGS_LOOKBACK_DAYS - 1, 'day'),
    max: todayEnd,
    todayStart,
    todayEnd,
  };
}

function defaultLogsDateRange(): { start: Dayjs; end: Dayjs } {
  const { todayStart, todayEnd } = logsDateBounds();
  return { start: todayStart, end: todayEnd };
}

function clampDateTime(value: Dayjs | null, fallback: Dayjs): Dayjs {
  const { min, max } = logsDateBounds();
  let v = value?.isValid() ? value : fallback;
  if (v.isBefore(min)) v = min;
  if (v.isAfter(max)) v = max;
  return v;
}

function getLogUseTime(log: LogEntry): number {
  return (log as LogEntry & { use_time?: number }).use_time ?? log.duration ?? 0;
}

function getLogCacheRead(log: LogEntry): number {
  return Number(log.cache_read) || 0;
}

// ─── Failed request heuristic ───
// A consume-type log with zero tokens and zero quota typically means the API call failed.
function isFailedLog(log: LogEntry): boolean {
  return log.type === 2 && log.quota === 0 && log.completion_tokens === 0 && log.prompt_tokens === 0;
}

// ─── Tool fee tooltip ───
interface ToolFeeRow {
  label: string;
  callCount?: number;
  amountText: string;
}

/** 工具调用收费明细：解析日志 content 中后端生成的工具收费文本，供额度列扳手图标悬浮展示 */
function buildToolFeeRows(
  log: LogEntry,
  t: (key: string, options?: Record<string, unknown>) => string,
): { rows: ToolFeeRow[]; total: string } | null {
  if (log.type !== 2) return null;
  if (!log.content) return null;
  const content = log.content;
  const rows: ToolFeeRow[] = [];
  // 渠道工具收费子项：{工具名} x{次数} {单价}元/千次，花费 {¥金额}
  const channelToolRe = /([A-Za-z0-9_.\-一-龥]+) x(\d+) [\d.]+元\/千次，花费 (¥[\d.]+)/g;
  for (const m of content.matchAll(channelToolRe)) {
    rows.push({
      label: m[1],
      callCount: Number(m[2]) || undefined,
      amountText: m[3],
    });
  }
  // 内置搜索调用：Web Search / Claude Web Search / File Search 调用 N 次，调用花费 ¥x
  const searchCallRe = /(Claude Web Search|Web Search|File Search) 调用 (\d+) 次，调用花费 (¥[\d.]+)/g;
  for (const m of content.matchAll(searchCallRe)) {
    const name = m[1];
    const label = name === 'Web Search'
      ? t('logs.quotaBreakdown.webSearch')
      : name === 'File Search'
        ? t('logs.quotaBreakdown.fileSearch')
        : name;
    rows.push({
      label,
      callCount: Number(m[2]) || undefined,
      amountText: m[3],
    });
  }
  // 图片生成调用：Image Generation Call 花费 ¥x
  const imageGenRe = /(Image Generation Call) 花费 (¥[\d.]+)/g;
  for (const m of content.matchAll(imageGenRe)) {
    rows.push({
      label: t('logs.quotaBreakdown.imageGeneration'),
      amountText: m[2],
    });
  }
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + (Number(r.amountText.replace('¥', '')) || 0), 0);
  return { rows, total: `¥${total.toFixed(4)}` };
}

// ─── Copy button ───
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
      {copied ? '✓' : '⎘'} {label}
    </button>
  );
}

// ─── Empty state ───
function LogsEmpty({ message }: { message: string }) {
  return (
    <div className="logs-empty">
      <div className="logs-empty-icon">📋</div>
      <div className="logs-empty-title">{message}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
export default function Logs() {
  const { t, i18n } = useTranslation();
  const { user, isEnterprise, isOrgOwner } = useUser();
  const qpu = useQuotaPerUnit();
  const { min: logsMinDate, max: logsMaxDate } = logsDateBounds();
  const [data, setData] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    page, setPage, pageSize, total, setTotal, controlledPagination,
  } = useServerTableQuery();
  const [modelFilter, setModelFilter] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState('');
  const [startAt, setStartAt] = useState<Dayjs>(() => defaultLogsDateRange().start);
  const [endAt, setEndAt] = useState<Dayjs>(() => defaultLogsDateRange().end);
  const [channelFilter, setChannelFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const debouncedUserSearchKeyword = useDebouncedValue(userSearchKeyword, 300);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSelectOpen, setUserSelectOpen] = useState(false);
  const [userSelectOptions, setUserSelectOptions] = useState<LogUserSearchOption[]>([]);
  const [selectedUserOption, setSelectedUserOption] = useState<LogUserSearchOption | null>(null);
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const debouncedRequestId = useDebouncedValue(requestIdFilter.trim(), 300);
  /** 当前用户是否为企业主账号（可拉取组织范围日志）；子账号仅有个人日志 */
  const enterpriseOrgOwner = Boolean(isOrgOwner && isEnterprise);
  /** 企业主账号下成员用户名列表（用于日志筛选下拉，避免手输错误） */
  const [orgMemberUsernames, setOrgMemberUsernames] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const hasInvalidDateRange = startAt.isAfter(endAt);
  const canReadAllLogs = hasPermission(user, 'log_read_all');
  const canPlatformAdmin = hasPermission(user, 'platform_admin');
  /** platform_admin 走 admin 目录接口取全量模型下拉；其他角色保持公开广场口径 */
  const { modelFilterOptions, modelOptionsLoading } = useLogModelFilterOptions(canPlatformAdmin);

  const showUsernameSearch = canReadAllLogs || enterpriseOrgOwner;
  const usernameSearchActive = canReadAllLogs || enterpriseOrgOwner;
  /** 平台侧全量日志读权限：下拉搜索用户后点选再筛；企业主账号用成员列表下拉 */
  const useOrgMemberUsernameSelect = enterpriseOrgOwner && !canReadAllLogs;

  useEffect(() => {
    if (!usernameSearchActive) setUsernameFilter('');
  }, [usernameSearchActive]);

  useEffect(() => {
    if (!useOrgMemberUsernameSelect) {
      setOrgMemberUsernames([]);
      return;
    }
    let cancelled = false;
    void getMyOrgMembers()
      .then((res) => {
        if (cancelled || !res.data?.success) return;
        const members = (res.data.data || []) as Array<{ username?: string }>;
        const names = Array.from(new Set(
          members.map((m) => (m.username || '').trim()).filter(Boolean),
        )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        setOrgMemberUsernames(names);
      })
      .catch(() => {
        if (!cancelled) setOrgMemberUsernames([]);
      });
    return () => { cancelled = true; };
  }, [useOrgMemberUsernameSelect]);

  const orgMemberUsernameOptions = useMemo(
    () => orgMemberUsernames.map((u) => ({ label: u, value: u, title: u })),
    [orgMemberUsernames],
  );

  const fetchUserSelectOptions = useCallback(async (keyword: string) => {
    setUserSearchLoading(true);
    try {
      const res = await searchUsers({ keyword, p: 1, page_size: 50 });
      if (res.data.success) {
        setUserSelectOptions(parseSearchUserItems(res.data.data).map(toLogUserSearchOption));
      } else {
        setUserSelectOptions([]);
      }
    } catch {
      setUserSelectOptions([]);
    } finally {
      setUserSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!usernameSearchActive || useOrgMemberUsernameSelect || !userSelectOpen) return;
    void fetchUserSelectOptions(debouncedUserSearchKeyword);
  }, [
    usernameSearchActive,
    useOrgMemberUsernameSelect,
    userSelectOpen,
    debouncedUserSearchKeyword,
    fetchUserSelectOptions,
  ]);

  const mergedUserSelectOptions = useMemo(() => {
    if (!selectedUserOption) return userSelectOptions;
    if (userSelectOptions.some((o) => o.value === selectedUserOption.value)) return userSelectOptions;
    return [selectedUserOption, ...userSelectOptions];
  }, [userSelectOptions, selectedUserOption]);

  const logTypeSelectOptions = useMemo(
    () => [
      { value: '1', label: t('logTypeTopup'), title: t('logTypeTopup') },
      { value: '2', label: t('logTypeConsume'), title: t('logTypeConsume') },
      { value: '3', label: t('logTypeManage'), title: t('logTypeManage') },
      { value: '4', label: t('logTypeSystem'), title: t('logTypeSystem') },
      { value: '5', label: t('logTypeError'), title: t('logTypeError') },
      { value: '6', label: t('logTypeRefund'), title: t('logTypeRefund') },
      { value: '7', label: t('logTypePreDeduct'), title: t('logTypePreDeduct') },
      { value: '8', label: t('logTypeSupplementaryDeduct'), title: t('logTypeSupplementaryDeduct') },
    ],
    [t],
  );

  const [allChannels, setAllChannels] = useState<Channel[]>([]);

  const channelOptions = useMemo(
    () =>
      [...allChannels].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
      ),
    [allChannels],
  );

  useEffect(() => {
    if (!canPlatformAdmin) {
      setAllChannels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const merged: Channel[] = [];
      const pageSize = 100; // new-api GetPageQuery caps page_size at 100
      try {
        for (let p = 1; ; p += 1) {
          const res = await getChannels({ p, page_size: pageSize });
          if (cancelled || !res.data.success) break;
          const pageData = res.data.data;
          const items = (pageData?.items || []) as Channel[];
          merged.push(...items);
          if (items.length < pageSize) break;
        }
        if (!cancelled) setAllChannels(merged);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [canPlatformAdmin]);

  const buildFilterParams = useCallback((): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    if (modelFilter) params.model_name = modelFilter;
    if (logTypeFilter) params.type = Number(logTypeFilter);
    // 与 new-api GetAllLogs 一致：查询参数名为 channel（不是 channel_id）；导出接口同时接受 channel / channel_id
    if (channelFilter) {
      const id = Number(channelFilter);
      if (!Number.isNaN(id) && id > 0) params.channel = id;
    }

    const s = clampDateTime(startAt, logsDateBounds().todayStart);
    const e = clampDateTime(endAt, logsDateBounds().todayEnd);
    params.start_timestamp = s.unix();
    params.end_timestamp = e.unix();
    if (usernameSearchActive) {
      const u = usernameFilter.trim();
      if (u) params.username = u;
    }
    const rid = debouncedRequestId;
    if (rid) params.request_id = rid;
    return params;
  }, [modelFilter, logTypeFilter, startAt, endAt, channelFilter, usernameFilter, debouncedRequestId, usernameSearchActive]);

  const fetchData = useCallback(async () => {
    if (hasInvalidDateRange) {
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const api = canReadAllLogs ? getLogs : enterpriseOrgOwner ? getMyOrgLogs : getUserLogs;
      const params: Record<string, unknown> = { p: page, page_size: pageSize, ...buildFilterParams() };
      const res = await api(params);
      if (res.data.success) {
        const pageData = res.data.data;
        setData(pageData?.items || []);
        setTotal(pageData?.total || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, pageSize, canReadAllLogs, enterpriseOrgOwner, buildFilterParams, hasInvalidDateRange]);

  const handleExport = useCallback(async () => {
    const filter = buildFilterParams();
    if (!filter.start_timestamp || !filter.end_timestamp) {
      notifyApiError(t('selectCompleteTimeRange'));
      return;
    }
    if (
      Number(filter.start_timestamp) > Number(filter.end_timestamp)
    ) {
      notifyApiError(t('invalidTimeRange'));
      return;
    }

    const params = { ...filter, lang: i18n.language };
    setExporting(true);
    try {
      const api = canReadAllLogs ? exportLogs : enterpriseOrgOwner ? exportMyOrgLogs : exportUserLogs;
      const response = await api(params);
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const startText = filter.start_timestamp
        ? dayjs.unix(Number(filter.start_timestamp)).format('YYYY-MM-DD')
        : 'all';
      const endText = filter.end_timestamp
        ? dayjs.unix(Number(filter.end_timestamp)).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');
      link.href = url;
      link.download = `logs-${startText}_to_${endText}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      notifyApiSuccess(t('logsExportStarted'));
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'logsExportFailed' });
    } finally {
      setExporting(false);
    }
  }, [canReadAllLogs, enterpriseOrgOwner, buildFilterParams, i18n.language, t]);

  useEffect(() => {
    setPage(1);
  }, [debouncedRequestId]);

  useEffect(() => {
    if (hasInvalidDateRange) {
      notifyApiError(t('invalidTimeRange'));
      return;
    }
    fetchData();
  }, [fetchData, hasInvalidDateRange, t]);

  const resetFilters = () => {
    setModelFilter('');
    setLogTypeFilter('');
    const next = defaultLogsDateRange();
    setStartAt(next.start);
    setEndAt(next.end);
    setChannelFilter('');
    if (usernameSearchActive) {
      setUsernameFilter('');
      setUserSearchKeyword('');
      setSelectedUserOption(null);
      setUserSelectOptions([]);
    }
    setRequestIdFilter('');
    setPage(1);
  };

  /** 消费(type=2) 计入 +quota，退款(type=6) 计入 -quota，其它类型不计入本合计 */
  const totalConsumed = useMemo(
    () =>
      data.reduce((sum, d) => {
        const q = d.quota || 0;
        if (d.type === 2) return sum + q;
        if (d.type === 6) return sum - q;
        return sum;
      }, 0),
    [data],
  );

  // ─── Table columns ───
  /** 含令牌名称、耗时、日志 content 详情；列宽合计与 scroll.x 对齐 */
  const allColumns = useMemo<ManagedColumnType<LogEntry>[]>(() => [
    ...((canReadAllLogs || enterpriseOrgOwner) ? [{
      title: <LogsColumnTitle align="left">{t('userName')}</LogsColumnTitle>,
      columnLabel: t('userName'),
      dataIndex: 'username',
      key: 'username',
      width: 92,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v: string) => {
        const raw = (v || '').trim();
        if (!raw) return <Typography.Text type="secondary" style={{ width: '100%', marginBottom: 0, display: 'block' }}>-</Typography.Text>;
        return (
          <Typography.Text
            ellipsis={{ tooltip: raw }}
            style={{ width: '100%', marginBottom: 0, color: 'var(--text-secondary)', fontSize: 13 }}
          >
            {raw}
          </Typography.Text>
        );
      },
    }] : []),
    {
      title: <LogsColumnTitle align="center">{t('logType')}</LogsColumnTitle>,
      columnLabel: t('logType'),
      dataIndex: 'type',
      key: 'type',
      width: 104,
      align: 'center' as const,
      render: (v: number) => (
        <div className="logs-cell-center">
          {logTypeTag(v, t)}
        </div>
      ),
    },
    {
      title: <LogsColumnTitle align="left">{t('modelName')}</LogsColumnTitle>,
      columnLabel: t('modelName'),
      dataIndex: 'model_name',
      key: 'model_name',
      width: 188,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v: string) => {
        const txt = v || '-';
        return (
          <Typography.Text
            ellipsis={{ tooltip: txt }}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {txt}
          </Typography.Text>
        );
      },
    },
    {
      title: <LogsColumnTitle align="left">{t('tokenName')}</LogsColumnTitle>,
      columnLabel: t('tokenName'),
      dataIndex: 'token_name',
      key: 'token_name',
      width: 120,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v: string) => {
        const s = (v || '').trim();
        if (!s) return <Typography.Text type="secondary" style={{ width: '100%', marginBottom: 0, display: 'block' }}>-</Typography.Text>;
        return (
          <Typography.Text
            ellipsis={{ tooltip: s }}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {s}
          </Typography.Text>
        );
      },
    },
    ...(canReadAllLogs ? [{
      title: <LogsColumnTitle align="left">{t('channelName')}</LogsColumnTitle>,
      columnLabel: t('channelName'),
      dataIndex: 'channel_name',
      key: 'channel_name',
      width: 140,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v: string) => {
        const s = (v || '').trim();
        if (!s) return <Typography.Text type="secondary" style={{ width: '100%', marginBottom: 0, display: 'block' }}>-</Typography.Text>;
        return (
          <Typography.Text
            ellipsis={{ tooltip: s }}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {s}
          </Typography.Text>
        );
      },
    }] : []),
    {
      title: <LogsColumnTitle align="right">{t('inputTokens')}</LogsColumnTitle>,
      columnLabel: t('inputTokens'),
      dataIndex: 'prompt_tokens',
      key: 'prompt_tokens',
      width: 108,
      align: 'right' as const,
      ellipsis: { showTitle: false },
      render: (v: number) => {
        const n = Number(v);
        const safe = Number.isFinite(n) ? n : 0;
        const txt = safe.toLocaleString();
        return (
          <Typography.Text ellipsis={{ tooltip: txt }} style={{ width: '100%', marginBottom: 0, display: 'block', textAlign: 'right' }}>
            {txt}
          </Typography.Text>
        );
      },
    },
    {
      title: <LogsColumnTitle align="right">{t('outputTokens')}</LogsColumnTitle>,
      columnLabel: t('outputTokens'),
      dataIndex: 'completion_tokens',
      key: 'completion_tokens',
      width: 108,
      align: 'right' as const,
      ellipsis: { showTitle: false },
      render: (v: number) => {
        const n = Number(v);
        const safe = Number.isFinite(n) ? n : 0;
        const txt = safe.toLocaleString();
        return (
          <Typography.Text ellipsis={{ tooltip: txt }} style={{ width: '100%', marginBottom: 0, display: 'block', textAlign: 'right' }}>
            {txt}
          </Typography.Text>
        );
      },
    },
    {
      title: <LogsColumnTitle align="right">{t('cacheRead')}</LogsColumnTitle>,
      columnLabel: t('cacheRead'),
      dataIndex: 'cache_read',
      key: 'cache_read',
      width: 88,
      align: 'right' as const,
      ellipsis: { showTitle: false },
      render: (_: unknown, record?: LogEntry) => {
        if (!record) return <LogsNumericPlaceholder />;
        const safe = getLogCacheRead(record);
        const txt = safe.toLocaleString();
        return (
          <Typography.Text ellipsis={{ tooltip: txt }} style={{ width: '100%', marginBottom: 0, display: 'block', textAlign: 'right' }}>
            {txt}
          </Typography.Text>
        );
      },
    },
    {
      title: <LogsColumnTitle align="right">{t('duration')}</LogsColumnTitle>,
      columnLabel: t('duration'),
      key: 'duration',
      width: 76,
      align: 'right' as const,
      ellipsis: { showTitle: false },
      render: (_: unknown, record?: LogEntry) => {
        if (!record) return <LogsNumericPlaceholder />;
        const ms = getLogUseTime(record);
        if (!Number.isFinite(ms) || ms < 0) return <LogsNumericPlaceholder />;
        if (ms === 0) {
          return (
            <Typography.Text style={{ width: '100%', marginBottom: 0, display: 'block', textAlign: 'right' }}>
              0.00s
            </Typography.Text>
          );
        }
        const txt = `${(ms).toFixed(2)}s`;
        return (
          <Typography.Text
            ellipsis={{ tooltip: txt }}
            style={{ width: '100%', marginBottom: 0, display: 'block', textAlign: 'right' }}
          >
            {txt}
          </Typography.Text>
        );
      },
    },
    {
      title: <LogsColumnTitle align="right">{t('quota')}</LogsColumnTitle>,
      columnLabel: t('quota'),
      dataIndex: 'quota',
      key: 'quota',
      width: 128,
      align: 'right' as const,
      ellipsis: { showTitle: false },
      render: (v: number, row: LogEntry) => {
        const amount = Number(row.display_quota ?? v) || 0;
        const txt = row.type === 3 && amount !== 0
          ? `${amount > 0 ? '+' : ''}${renderAmount(amount, 4, qpu)}`
          : renderAmount(amount, 4, qpu);
        const toolFees = buildToolFeeRows(row, t);
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            <BillingBreakdownTooltip raw={row.billing_breakdown} quota={amount} qpu={qpu} isConsume={row.type === 2}>
            <Typography.Text
              ellipsis={{ tooltip: row.type === 2 ? false : txt }}
              style={{
                flex: 1,
                minWidth: 0,
                marginBottom: 0,
                display: 'block',
                textAlign: 'right',
                color: row.type === 3 && amount !== 0
                  ? (amount > 0 ? 'var(--color-success, #52c41a)' : 'var(--color-danger, #ff4d4f)')
                  : undefined,
              }}
            >
              {txt}
            </Typography.Text>
            </BillingBreakdownTooltip>
            {!!row.is_stream && (
              <Tooltip placement="left" title={t('logs.streamRequest')}>
                <ThunderboltOutlined
                  style={{ color: 'var(--color-primary, #1677ff)', fontSize: 12, cursor: 'help', flexShrink: 0 }}
                />
              </Tooltip>
            )}
            {toolFees && (
              <Tooltip
                placement="left"
                title={(
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('logs.toolFee.title')}</div>
                    {toolFees.rows.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 16,
                        }}
                      >
                        <span>
                          {r.label}
                          {r.callCount ? (
                            <span style={{ opacity: 0.75, marginLeft: 4 }}>
                              × {t('logs.toolFee.calls', { count: r.callCount })}
                            </span>
                          ) : null}
                        </span>
                        <span>{r.amountText}</span>
                      </div>
                    ))}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        fontWeight: 600,
                        borderTop: '1px solid rgba(255,255,255,0.25)',
                        marginTop: 4,
                        paddingTop: 4,
                      }}
                    >
                      <span>{t('logs.quotaBreakdown.total')}</span>
                      <span>{toolFees.total}</span>
                    </div>
                  </div>
                )}
              >
                <ToolOutlined
                  style={{ color: 'var(--color-warning, #faad14)', fontSize: 12, cursor: 'help', flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <Tooltip title={t('logs.remainingQuotaHint')}>
          <span>
            <LogsColumnTitle align="right">{t('logs.remainingQuota')}</LogsColumnTitle>
          </span>
        </Tooltip>
      ),
      columnLabel: t('logs.remainingQuota'),
      dataIndex: 'balance',
      key: 'balance',
      width: 140,
      align: 'right' as const,
      ellipsis: { showTitle: false },
      render: (v?: number) => {
        if (!Number.isFinite(v)) return <LogsNumericPlaceholder />;
        return (
          <div style={{ textAlign: 'right' }}>
            <QuotaAmount quotaUnits={v || 0} qpu={qpu} digits={4} showOverdraftLabel={false} />
          </div>
        );
      },
    },
    {
      title: <LogsColumnTitle align="left">{t('createdAt')}</LogsColumnTitle>,
      columnLabel: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 176,
      className: 'logs-col-time',
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v: number) => {
        const txt = formatTime(v);
        return (
          <Typography.Text
            ellipsis={{ tooltip: txt }}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {txt}
          </Typography.Text>
        );
      },
    },
    {
      title: <LogsColumnTitle align="left">{t('logs.loginLocation')}</LogsColumnTitle>,
      columnLabel: t('logs.loginLocation'),
      dataIndex: 'ip',
      key: 'ip',
      width: 140,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v?: string) => {
        const s = (v || '').trim();
        if (!s) return <Typography.Text type="secondary" style={{ width: '100%', marginBottom: 0, display: 'block' }}>-</Typography.Text>;
        return (
          <Typography.Text
            ellipsis={{ tooltip: s }}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {s}
          </Typography.Text>
        );
      },
    },
    {
      title: <LogsColumnTitle align="left">{t('requestId')}</LogsColumnTitle>,
      columnLabel: t('requestId'),
      dataIndex: 'request_id',
      key: 'request_id',
      width: 160,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v?: string) => {
        const s = (v || '').trim();
        if (!s) return <Typography.Text type="secondary" style={{ width: '100%', marginBottom: 0, display: 'block' }}>-</Typography.Text>;
        return (
          <Typography.Text
            ellipsis={{ tooltip: s }}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {s}
          </Typography.Text>
        );
      },
    },
    ...(canReadAllLogs ? [{
      title: <LogsColumnTitle align="left">{t('upstreamRequestId')}</LogsColumnTitle>,
      columnLabel: t('upstreamRequestId'),
      dataIndex: 'upstream_request_id',
      key: 'upstream_request_id',
      width: 160,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (v?: string) => {
        const s = (v || '').trim();
        if (!s) return <Typography.Text type="secondary" style={{ width: '100%', marginBottom: 0, display: 'block' }}>-</Typography.Text>;
        return (
          <Typography.Text
            ellipsis={{ tooltip: s }}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {s}
          </Typography.Text>
        );
      },
    }] : []),
    {
      title: <LogsColumnTitle align="left">{t('logDetail')}</LogsColumnTitle>,
      columnLabel: t('logDetail'),
      key: 'manage_content',
      width: 148,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (_: unknown, record?: LogEntry) => {
        if (!record?.content?.trim()) {
          return (
            <Typography.Text type="secondary" style={{ display: 'block', width: '100%', marginBottom: 0 }}>
              -
            </Typography.Text>
          );
        }
        return (
          <div className="logs-manage-content-cell">
            <Typography.Text
              className="logs-manage-content-preview"
              ellipsis={{ tooltip: record.content }}
              style={{ flex: 1, minWidth: 0, marginBottom: 0 }}
            >
              {record.content}
            </Typography.Text>
            <CopyButton text={record.content} label={t('copy')} />
          </div>
        );
      },
    },
  ], [canReadAllLogs, enterpriseOrgOwner, qpu, t]);

  const { columns, settingsControl } = useTableColumnVisibility({
    tableId: 'logs-list',
    columns: allColumns,
  });

  const tableScrollX = useMemo(() => {
    // 与列宽合计对齐：基础列 + request_id + 登录地；admin 另含 channel_name / upstream_request_id；有用户名列再加 92
    let x = 1346 + 160 + 38 + 140;
    if (canReadAllLogs) x += 140 + 160;
    if (canReadAllLogs || enterpriseOrgOwner) x += 92;
    return x;
  }, [canReadAllLogs, enterpriseOrgOwner]);

  return (
    <div>
      <AppPageHeader title={t('logs')} />

      <AsyncTableCard<LogEntry>
        tableWrapClassName="logs-table-wrap"
        toolbar={(
          <Space wrap size={8} align="center">
              {showUsernameSearch && (useOrgMemberUsernameSelect ? (
                <Select
                  showSearch
                  allowClear
                  placeholder={t('logsUsernameMemberSelect')}
                  notFoundContent={t('logsUsernameSelectEmpty')}
                  value={usernameFilter || undefined}
                  options={orgMemberUsernameOptions}
                  disabled={!usernameSearchActive}
                  style={{ width: 140 }}
                  optionRender={logSelectOverflowRender.optionRender}
                  labelRender={logSelectOverflowRender.labelRender}
                  onChange={(v) => {
                    setUsernameFilter((v as string) || '');
                    setPage(1);
                  }}
                  aria-label={t('logsUsernameMemberSelect')}
                  optionFilterProp="label"
                />
              ) : (
                <Select
                  showSearch
                  allowClear
                  filterOption={false}
                  placeholder={t('gatewayTier.searchUser')}
                  value={usernameFilter || undefined}
                  loading={userSearchLoading}
                  options={mergedUserSelectOptions}
                  disabled={!usernameSearchActive}
                  title={usernameSearchActive ? undefined : t('logsUsernameSearchOwnerHint')}
                  style={{ width: 140 }}
                  searchValue={userSearchKeyword}
                  onSearch={setUserSearchKeyword}
                  onOpenChange={setUserSelectOpen}
                  optionRender={logSelectOverflowRender.optionRender}
                  labelRender={logSelectOverflowRender.labelRender}
                  onChange={(v, option) => {
                    setUsernameFilter((v as string) || '');
                    setSelectedUserOption((option as LogUserSearchOption | undefined) ?? null);
                    setUserSearchKeyword('');
                    setPage(1);
                  }}
                  aria-label={t('gatewayTier.searchUser')}
                />
              ))}

              <LogModelNameFilter
                value={modelFilter}
                options={modelFilterOptions}
                loading={modelOptionsLoading}
                style={{ minWidth: 190, width: 190 }}
                onChange={(v) => { setModelFilter(v); setPage(1); }}
              />

              {canPlatformAdmin && (
                <LogModelNameFilter
                  value={channelFilter}
                  options={channelOptions.map((c) => ({
                    label: (c.name || '').trim() || String(c.id),
                    value: String(c.id),
                  }))}
                  placeholder={t('channelFilter')}
                  aria-label={t('channelFilter')}
                  style={{ minWidth: 190, width: 190 }}
                  onChange={(v) => { setChannelFilter(v); setPage(1); }}
                />
              )}

              <Select
                allowClear
                placeholder={t('logType')}
                value={logTypeFilter || undefined}
                options={logTypeSelectOptions}
                onChange={(v) => { setLogTypeFilter((v as string) || ''); setPage(1); }}
                aria-label={t('logType')}
                optionRender={logSelectOverflowRender.optionRender}
                labelRender={logSelectOverflowRender.labelRender}
                style={{ width: 100 }}
              />

              <Input
                allowClear
                placeholder={t('requestId')}
                value={requestIdFilter}
                onChange={(e) => { setRequestIdFilter(e.target.value); }}
                aria-label={t('requestId')}
                style={{ width: 140 }}
              />

              <DatePicker.RangePicker
                allowClear={false}
                showTime={{
                  format: 'HH:mm:ss',
                  defaultValue: [dayjs('00:00:00', 'HH:mm:ss'), dayjs('23:59:59', 'HH:mm:ss')],
                }}
                showNow={false}
                status={hasInvalidDateRange ? 'error' : undefined}
                value={[startAt, endAt]}
                format={LOGS_RANGE_DISPLAY_FMT}
                placeholder={[t('startDate'), t('endDate')]}
                disabledDate={(current) => {
                  if (!current) return false;
                  return current.isBefore(logsMinDate, 'day') || current.isAfter(logsMaxDate, 'day');
                }}
                onChange={(dates) => {
                  if (!dates?.[0] || !dates?.[1]) return;
                  setStartAt(clampDateTime(dates[0], logsDateBounds().todayStart));
                  setEndAt(clampDateTime(dates[1], logsDateBounds().todayEnd));
                  setPage(1);
                }}
                style={{ width: 360 }}
                aria-label={t('timeRange')}
                title={t('logsDateRangeHint')}
              />

              <Button onClick={resetFilters}>{t('resetFilter')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => void fetchData()} loading={loading}>
                {t('refresh')}
              </Button>
              {settingsControl}
              <Button type="primary" onClick={handleExport} loading={exporting}>
                {exporting ? t('exportingLogs') : t('exportLogs')}
              </Button>
            </Space>
        )}
        statusBar={(
          <div
            className="logs-status-bar logs-status-bar--in-panel"
            style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-default)' }}
          >
            <span>
              {t('filterResults')}:{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{total}</strong>{' '}
              {t('records')}
            </span>
          </div>
        )}
        tableProps={{
          columns,
          dataSource: data,
          loading,
          rowKey: 'id',
          scroll: { x: `max(100%, ${tableScrollX}px)` },
          locale: { emptyText: !loading ? <LogsEmpty message={t('noData')} /> : <span /> },
          onRow: (record?: LogEntry) => ({
            className: record && isFailedLog(record) ? 'logs-row-error' : '',
          }),
          pagination: controlledPagination,
        }}
      />
    </div>
  );
}
