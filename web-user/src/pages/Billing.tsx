import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';
import type { TagProps } from 'antd';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Flex, Spin, Tag, Typography, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  exportConsumeBill,
  exportSubscriptionBill,
  exportTopupBill,
  getBillingSummary,
  getUserLogs,
  getMySubscriptions,
  getUserQuotaDates,
  getUserTopUps,
} from '../api';
import { formatTime, renderAmount, formatMinorMoney, formatMoneyMajorUnits } from '../utils';
import { getUserDisplayQuota, getUserPoolRemaining } from '../utils/quotaDisplay';
import { QuotaAmount } from '../components/QuotaAmount';
import { controlledListPagination, DEFAULT_TABLE_PAGE_SIZE } from '../utils/tablePagination';
import { logTypeTag } from '../ui/logTypeTag';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import { useUser } from '../contexts/UserContext';
import { useCurrency } from '../hooks/useCurrency';
import { useLocale } from '../i18n/hooks/useLocale';
import { useTableColumnVisibility } from '../hooks/useTableColumnVisibility';
import type { ManagedColumnType } from '../utils/tableColumnVisibility';
import type { LogEntry, Subscription } from '../types';
import { AppEmpty, AppPageHeader } from '../ui/appLayout';
import { LayoutMainOutletSection } from '../ui/layoutMainContent';
import { downloadExcelBlob } from '../utils/downloadExcelBlob';
import { BillingStatSummary } from '../components/billing/BillingStatSummary';
import { BillingDetailPanel, type BillingDetailTabKey } from '../components/billing/BillingDetailPanel';

const { Text } = Typography;
type AppTagColor = NonNullable<TagProps['color']>;

/** 账单消费明细：消耗(2)、退款(6)、预扣(7)、补扣(8) */
const BILLING_CONSUME_LOG_TYPES = '2,6,7,8';
/** 请求数兜底：与 logsummary 一致，计消耗(2)+预扣(7)，不含补扣(8) */
const BILLING_REQUEST_COUNT_LOG_TYPES = '2,7';

function buildBillingExportFilename(label: string, enSlug: string, isZh: boolean, stamp: string) {
  return isZh ? `账单-${label}-${stamp}.xlsx` : `${enSlug}-${stamp}.xlsx`;
}

function parseLogPagePayload(data: unknown): { items: LogEntry[]; total: number } {
  if (data == null || data === '') {
    return { items: [], total: 0 };
  }
  if (Array.isArray(data)) {
    return { items: data as LogEntry[], total: data.length };
  }
  if (typeof data === 'object') {
    const page = data as { items?: LogEntry[]; total?: number };
    const items = Array.isArray(page.items) ? page.items : [];
    const total = typeof page.total === 'number' ? page.total : items.length;
    return { items, total };
  }
  return { items: [], total: 0 };
}

interface QuotaDay {
  date?: string;
  quota?: number;
  count?: number;
}

function parseQuotaDatesPayload(data: unknown): { days: QuotaDay[]; valid: boolean } {
  if (data == null || data === '') {
    return { days: [], valid: false };
  }
  if (Array.isArray(data)) {
    return { days: data as QuotaDay[], valid: true };
  }
  if (typeof data === 'object') {
    const wrapped = data as { items?: QuotaDay[] };
    if (Array.isArray(wrapped.items)) {
      return { days: wrapped.items, valid: true };
    }
  }
  return { days: [], valid: false };
}

function sumQuotaDayCounts(days: QuotaDay[]): number {
  return days.reduce((s0, d) => s0 + (Number(d.count) || 0), 0);
}

async function getConsumeLogTotalInRange(startSec: number, endSec: number): Promise<number> {
  const res = await getUserLogs({
    p: 1,
    page_size: 1,
    start_timestamp: startSec,
    end_timestamp: endSec,
    type: BILLING_REQUEST_COUNT_LOG_TYPES,
  } as Record<string, unknown>);
  if (!res.data.success) return 0;
  const { total } = parseLogPagePayload(res.data.data);
  return total;
}

async function fetchRequestCountInRange(startSec: number, endSec: number): Promise<number> {
  const logTotal = await getConsumeLogTotalInRange(startSec, endSec);
  try {
    const res = await getUserQuotaDates({ start_timestamp: startSec, end_timestamp: endSec });
    if (!res.data.success) {
      // 后端拒绝（超范围 / 参数非法）时不再静默退回 logs 口径，否则页面数字会悄悄变化
      notifyApiError((res.data as { message?: string }).message);
      return logTotal;
    }
    const { days, valid } = parseQuotaDatesPayload(res.data.data);
    if (!valid || days.length === 0) return logTotal;
    const daySum = sumQuotaDayCounts(days);
    return daySum > 0 ? daySum : logTotal;
  } catch {
    return logTotal;
  }
}

/** 净消费：消耗/预扣/补扣(2/7/8) 加 quota，退款(6) 减 quota。由后端一次聚合返回，不再前端累加。 */
async function sumSignedQuotaInRange(startSec: number, endSec: number): Promise<number> {
  const res = await getBillingSummary({
    start_timestamp: startSec,
    end_timestamp: endSec,
    type: BILLING_CONSUME_LOG_TYPES,
  } as Record<string, unknown>);
  if (!res.data.success) return 0;
  return (res.data.data as { quota?: number })?.quota ?? 0;
}

async function fetchAllSubscriptions(): Promise<Subscription[]> {
  const all: Subscription[] = [];
  let page = 1;
  const perPage = 100;
  for (let guard = 0; guard < 500; guard++) {
    const res = await getMySubscriptions({ p: page, per_page: perPage } as Record<string, unknown>);
    if (!res.data.success) break;
    const raw = res.data.data as Subscription[] | { items?: Subscription[] } | undefined;
    const items: Subscription[] = Array.isArray(raw) ? raw : raw?.items ?? [];
    const total = (res.data as { total?: number }).total ?? 0;
    all.push(...items);
    if (all.length >= total || items.length === 0) break;
    page += 1;
  }
  return all;
}

function subscriptionOverlapsRange(sub: Subscription, startSec: number, endSec: number): boolean {
  const a = sub.start_at ?? 0;
  const b = sub.expire_at ?? 0;
  return a <= endSec && b >= startSec;
}

const statusColor: Record<string, AppTagColor> = {
  active: 'green',
  expired: 'default',
  cancelled: 'red',
};

interface TopUpRecord {
  id: number;
  amount: number;
  money: number;
  trade_no: string;
  status: string;
  pay_type?: string;
  payment_method?: string;
  created_at?: number;
  create_time?: number;
  complete_time?: number;
  user_id?: number;
}

async function fetchAllTopUpsRecords(): Promise<TopUpRecord[]> {
  const all: TopUpRecord[] = [];
  let page = 1;
  const pageSize = 100;
  for (let guard = 0; guard < 500; guard++) {
    const res = await getUserTopUps({ p: page, page_size: pageSize });
    if (!res.data.success) break;
    const d = res.data.data as { items?: TopUpRecord[]; total?: number } | TopUpRecord[] | undefined;
    const items: TopUpRecord[] = Array.isArray(d) ? d : d?.items ?? [];
    all.push(...items);
    const total = !Array.isArray(d) && d && typeof d === 'object' ? d.total ?? 0 : items.length;
    if (page * pageSize >= total || items.length === 0) break;
    page += 1;
  }
  return all;
}

export default function BillingPage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const qpu = useQuotaPerUnit();
  const { user } = useUser();
  const displayQuota = getUserDisplayQuota(user);
  const poolRemaining = getUserPoolRemaining(user);
  const cc = useCurrency();
  const { configContentLang } = useLocale();

  const [tableLoading, setTableLoading] = useState(true);
  const [listsReady, setListsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<BillingDetailTabKey>('consume');

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZE);
  const [logTotal, setLogTotal] = useState(0);
  const [modelFilter, setModelFilter] = useState<string>('');
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const [subsAll, setSubsAll] = useState<Subscription[]>([]);
  const [topupsAll, setTopupsAll] = useState<TopUpRecord[]>([]);
  const [topupPage, setTopupPage] = useState(1);
  const [topupPageSize, setTopupPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZE);

  const today = dayjs().format('YYYY-MM-DD');
  const [monthQuota, setMonthQuota] = useState(0);
  const [monthRequests, setMonthRequests] = useState(0);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const billingRange = useMemo(() => {
    let s = dayjs(startDate).startOf('day').unix();
    let e = dayjs(endDate).endOf('day').unix();
    if (s > e) {
      const tmp = s;
      s = e;
      e = tmp;
    }
    return { start_timestamp: s, end_timestamp: e };
  }, [startDate, endDate]);

  const dateRange = useMemo(
    () => [dayjs(startDate), dayjs(endDate)] as [dayjs.Dayjs, dayjs.Dayjs],
    [startDate, endDate],
  );

  const fetchSummary = useCallback(async () => {
    try {
      const { start_timestamp: start, end_timestamp: end } = billingRange;
      const [requestTotal, netQuota] = await Promise.all([
        fetchRequestCountInRange(start, end),
        sumSignedQuotaInRange(start, end),
      ]);
      setMonthRequests(requestTotal);
      setMonthQuota(netQuota);
    } catch {
      /* ignore */
    }
  }, [billingRange]);

  const fetchLogs = useCallback(async (page: number, model?: string, pageSizeOverride?: number) => {
    try {
      const pageSize = pageSizeOverride ?? logPageSize;
      const params: Record<string, unknown> = {
        p: page,
        page_size: pageSize,
        start_timestamp: billingRange.start_timestamp,
        end_timestamp: billingRange.end_timestamp,
        type: BILLING_CONSUME_LOG_TYPES,
      };
      if (model) params.model_name = model;
      const res = await getUserLogs(params);
      if (res.data.success) {
        const { items, total } = parseLogPagePayload(res.data.data);
        setLogs(items);
        setLogTotal(total);
        const allModels = items.map((l: LogEntry) => l.model_name).filter(Boolean);
        setModelOptions((prev) => Array.from(new Set([...prev, ...allModels])).sort());
      }
    } catch {
      /* ignore */
    }
  }, [billingRange, logPageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, tp] = await Promise.all([fetchAllSubscriptions(), fetchAllTopUpsRecords()]);
        if (!cancelled) {
          setSubsAll(s);
          setTopupsAll(tp);
        }
      } finally {
        if (!cancelled) setListsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!listsReady) return;
    let cancelled = false;
    (async () => {
      setTableLoading(true);
      try {
        await fetchSummary();
        await fetchLogs(1, modelFilter);
        if (!cancelled) setLogPage(1);
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listsReady, billingRange, modelFilter, fetchSummary, fetchLogs]);

  const topupTs = (row: TopUpRecord) => row.created_at ?? row.create_time ?? 0;

  const topupsInRange = useMemo(() => {
    const { start_timestamp: s, end_timestamp: e } = billingRange;
    return topupsAll.filter((row) => {
      const ts = row.created_at ?? row.create_time ?? 0;
      return ts >= s && ts <= e;
    });
  }, [topupsAll, billingRange]);

  const subsInRange = useMemo(
    () =>
      subsAll.filter((sub) =>
        subscriptionOverlapsRange(sub, billingRange.start_timestamp, billingRange.end_timestamp),
      ),
    [subsAll, billingRange],
  );

  const topupsPageData = useMemo(() => {
    const startIdx = (topupPage - 1) * topupPageSize;
    return topupsInRange.slice(startIdx, startIdx + topupPageSize);
  }, [topupsInRange, topupPage, topupPageSize]);

  const handleLogPageChange = (page: number) => {
    setLogPage(page);
    setTableLoading(true);
    void fetchLogs(page, modelFilter).finally(() => setTableLoading(false));
  };

  const handleTopupPageChange = (page: number) => {
    setTopupPage(page);
  };

  const handleLogPageSizeChange = (newSize: number) => {
    setLogPageSize(newSize);
    setLogPage(1);
    setTableLoading(true);
    void fetchLogs(1, modelFilter, newSize).finally(() => setTableLoading(false));
  };

  const handleTopupPageSizeChange = (newSize: number) => {
    setTopupPageSize(newSize);
    setTopupPage(1);
  };

  const handleModelChange = (val: string) => {
    setModelFilter(val);
    setLogPage(1);
    setTableLoading(true);
    void fetchLogs(1, val).finally(() => setTableLoading(false));
  };

  const handleDateRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const successfulTopups = useMemo(
    () => topupsAll.filter((item) => item.status === 'success').length,
    [topupsAll],
  );
  const activeSubscriptions = useMemo(
    () => subsAll.filter((item) => item.status === 'active').length,
    [subsAll],
  );

  useEffect(() => {
    setTopupPage(1);
  }, [billingRange]);

  const exportConsumeExcel = useCallback(async () => {
    const params = {
      start_timestamp: dayjs(startDate).startOf('day').unix(),
      end_timestamp: dayjs(endDate).endOf('day').unix(),
      model_name: modelFilter,
      lang: configContentLang,
    };
    try {
      const res = await exportConsumeBill(params);
      const stamp = dayjs().format('YYYYMMDD-HHmmss');
      const isZh = configContentLang === 'zh';
      downloadExcelBlob(
        res.data,
        buildBillingExportFilename(t('consumeDetail'), 'billing-consume', isZh, stamp),
      );
      notifyApiSuccess(t('billingExportStarted'));
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  }, [configContentLang, endDate, modelFilter, startDate, t]);

  const exportTopupsExcel = useCallback(async () => {
    const params = {
      start_timestamp: dayjs(startDate).startOf('day').unix(),
      end_timestamp: dayjs(endDate).endOf('day').unix(),
      lang: configContentLang,
    };
    try {
      const res = await exportTopupBill(params);
      const stamp = dayjs().format('YYYYMMDD-HHmmss');
      const isZh = configContentLang === 'zh';
      downloadExcelBlob(
        res.data,
        buildBillingExportFilename(t('topupRecords'), 'billing-topups', isZh, stamp),
      );
      notifyApiSuccess(t('billingExportStarted'));
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  }, [configContentLang, endDate, startDate, t]);

  const exportSubscriptionsExcel = useCallback(async () => {
    const params = {
      start_timestamp: dayjs(startDate).startOf('day').unix(),
      end_timestamp: dayjs(endDate).endOf('day').unix(),
      lang: configContentLang,
    };
    try {
      const res = await exportSubscriptionBill(params);
      const stamp = dayjs().format('YYYYMMDD-HHmmss');
      const isZh = configContentLang === 'zh';
      downloadExcelBlob(
        res.data,
        buildBillingExportFilename(t('subscriptionRecords'), 'billing-subscriptions', isZh, stamp),
      );
      notifyApiSuccess(t('billingExportStarted'));
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  }, [configContentLang, endDate, startDate, t]);

  const allConsumeColumns = useMemo<ManagedColumnType<LogEntry>[]>(() => [
    {
      title: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: number) => formatTime(v),
    },
    {
      title: t('logType'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (v: number) => logTypeTag(v, t),
    },
    { title: t('modelName'), dataIndex: 'model_name', key: 'model_name', width: 220, ellipsis: true },
    {
      title: t('tokenName'),
      dataIndex: 'token_name',
      key: 'token_name',
      width: 120,
      align: 'left',
      ellipsis: { showTitle: false },
      render: (v: string) => {
        const s = (v || '').trim();
        if (!s) {
          return (
            <Text type="secondary" style={{ display: 'block', width: '100%', marginBottom: 0 }}>
              -
            </Text>
          );
        }
        return (
          <Text ellipsis={{ tooltip: s }} style={{ width: '100%', marginBottom: 0 }}>
            {s}
          </Text>
        );
      },
    },
    {
      title: t('inputTokens'),
      dataIndex: 'prompt_tokens',
      key: 'prompt_tokens',
      width: 130,
      align: 'right',
      render: (v: number) => (Number.isFinite(Number(v)) ? Number(v) : 0).toLocaleString(),
    },
    {
      title: t('outputTokens'),
      dataIndex: 'completion_tokens',
      key: 'completion_tokens',
      width: 130,
      align: 'right',
      render: (v: number) => (Number.isFinite(Number(v)) ? Number(v) : 0).toLocaleString(),
    },
    {
      title: t('cacheRead'),
      dataIndex: 'cache_read',
      key: 'cache_read',
      width: 88,
      align: 'right',
      ellipsis: { showTitle: false },
      render: (_: unknown, row: LogEntry) => {
        const txt = (Number(row?.cache_read) || 0).toLocaleString();
        return (
          <Text
            ellipsis={{ tooltip: txt }}
            style={{ width: '100%', marginBottom: 0, display: 'block', textAlign: 'right' }}
          >
            {txt}
          </Text>
        );
      },
    },
    {
      title: t('consumed'),
      dataIndex: 'quota',
      key: 'quota',
      width: 120,
      align: 'right',
      render: (v: number) => renderAmount(v, 4, qpu),
    },
  ], [qpu, t]);

  const allSubscriptionColumns = useMemo<ManagedColumnType<Subscription>[]>(() => [
    { title: t('planName'), dataIndex: 'plan_name', key: 'plan_name', width: 160, ellipsis: true },
    {
      title: t('planQuota'),
      dataIndex: 'quota',
      key: 'quota',
      width: 120,
      render: (v: number) => renderAmount(v, 4, qpu),
    },
    { title: t('startAt'), dataIndex: 'start_at', key: 'start_at', width: 170, render: (v: number) => formatTime(v) },
    { title: t('expireAt'), dataIndex: 'expire_at', key: 'expire_at', width: 170, render: (v: number) => formatTime(v) },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => <Tag color={statusColor[s] || 'default'}>{s}</Tag>,
    },
    { title: t('orderNo'), dataIndex: 'order_no', key: 'order_no', width: 180, ellipsis: true },
    {
      title: t('payAmount'),
      dataIndex: 'pay_amount',
      key: 'pay_amount',
      width: 120,
      render: (v: number) => formatMinorMoney(v, cc.rate, cc.symbol),
    },
    { title: t('payMethod'), dataIndex: 'pay_method', key: 'pay_method', width: 120 },
  ], [cc.rate, cc.symbol, qpu, t]);

  const allTopupColumns = useMemo<ManagedColumnType<TopUpRecord>[]>(() => [
    {
      title: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (_: unknown, row: TopUpRecord) => formatTime(topupTs(row)),
    },
    {
      title: t('orderNo'),
      dataIndex: 'trade_no',
      key: 'trade_no',
      width: 180,
      ellipsis: true,
      render: (v: string) => (
        <Text code style={{ fontSize: 12 }}>
          {v ? `${v.slice(0, 24)}${v.length > 24 ? '…' : ''}` : '-'}
        </Text>
      ),
    },
    {
      title: t('payMethod'),
      dataIndex: 'pay_type',
      key: 'pay_type',
      width: 120,
      render: (_: unknown, row: TopUpRecord) => row.pay_type || row.payment_method || '-',
    },
    {
      title: t('rechargeAmount'),
      key: 'amount',
      width: 140,
      align: 'right',
      render: (_: unknown, row: TopUpRecord) => {
        if (row.money && row.money > 0) return `${cc.symbol}${formatMoneyMajorUnits(row.money)}`;
        if (row.amount && row.amount > 0) return formatMinorMoney(row.amount, 1, cc.symbol);
        return '-';
      },
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => {
        const map: Record<string, { label: string; color: string }> = {
          success: { label: t('success'), color: 'green' },
          pending: { label: t('billingPending'), color: 'orange' },
          failed: { label: t('failed'), color: 'red' },
        };
        const { label, color } = map[s] || { label: s, color: 'default' };
        return <Tag color={color as AppTagColor}>{label}</Tag>;
      },
    },
  ], [cc.symbol, t]);

  const { columns: consumeColumns, settingsControl: consumeSettingsControl } = useTableColumnVisibility({
    tableId: 'billing-consume',
    columns: allConsumeColumns,
  });
  const { columns: topupColumns, settingsControl: topupSettingsControl } = useTableColumnVisibility({
    tableId: 'billing-topup',
    columns: allTopupColumns,
  });
  const { columns: subscriptionColumns, settingsControl: subscriptionSettingsControl } = useTableColumnVisibility({
    tableId: 'billing-subscription',
    columns: allSubscriptionColumns,
  });

  if (!listsReady) {
    return (
      <LayoutMainOutletSection>
        <Flex justify="center" style={{ padding: token.paddingXL * 3 }}>
          <Spin size="large" />
        </Flex>
      </LayoutMainOutletSection>
    );
  }

  return (
    <LayoutMainOutletSection>
      <AppPageHeader
        title={t('billing')}
        subtitle={t('billingPageSubtitle')}
        marginBottom={12}
      />

      <Flex vertical gap={token.marginSM}>
        <BillingStatSummary
          periodValue={renderAmount(monthQuota, 4, qpu)}
          balanceValue={<QuotaAmount quotaUnits={displayQuota} qpu={qpu} digits={4} showOverdraftLabel />}
          subscriptionValue={activeSubscriptions}
          labels={{
            periodTitle: t('billingPeriodSummary'),
            periodFooter: t('billingPeriodConsumeHint', { count: monthRequests }),
            balanceTitle: t('balance'),
            balanceFooter: poolRemaining != null
              ? `${t('org.poolRemaining')}: ${renderAmount(poolRemaining, 4, qpu)}`
              : t('billingBalanceHint'),
            subscriptionTitle: t('subscription'),
            subscriptionFooter: t('billingSubscriptionStats', {
              active: activeSubscriptions,
              paid: successfulTopups,
            }),
          }}
        />

        <BillingDetailPanel
          title={t('billingDetailSectionTitle')}
          description={t('billingDetailSectionDesc')}
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tableLoading={tableLoading}
          consumeHint={t('billingConsumeTabHint')}
          topupHint={t('billingTopupTabHint')}
          subscriptionHint={t('billingSubscriptionTabHint')}
          exportConsumeLabel={t('exportConsumeBill')}
          exportTopupLabel={t('exportTopupBill')}
          exportSubscriptionLabel={t('exportSubscriptionBill')}
          onExportConsume={() => void exportConsumeExcel()}
          onExportTopup={() => void exportTopupsExcel()}
          onExportSubscription={() => void exportSubscriptionsExcel()}
          modelFilter={modelFilter}
          modelOptions={modelOptions}
          onModelChange={handleModelChange}
          modelPlaceholder={t('model')}
          consumeColumns={consumeColumns as ColumnsType<unknown>}
          consumeSettingsControl={consumeSettingsControl}
          consumeData={logs}
          consumeRowKey="id"
          consumePagination={controlledListPagination({
            current: logPage,
            pageSize: logPageSize,
            total: logTotal,
            onChange: (page, size) => {
              if (size && size !== logPageSize) handleLogPageSizeChange(size);
              else handleLogPageChange(page);
            },
          })}
          topupColumns={topupColumns as ColumnsType<unknown>}
          topupSettingsControl={topupSettingsControl}
          topupData={topupsPageData}
          topupRowKey="id"
          topupPagination={controlledListPagination({
            current: topupPage,
            pageSize: topupPageSize,
            total: topupsInRange.length,
            onChange: (page, size) => {
              if (size && size !== topupPageSize) handleTopupPageSizeChange(size);
              else handleTopupPageChange(page);
            },
          })}
          subscriptionColumns={subscriptionColumns as ColumnsType<unknown>}
          subscriptionSettingsControl={subscriptionSettingsControl}
          subscriptionData={subsInRange}
          subscriptionRowKey="id"
          consumeEmpty={<AppEmpty icon="🧾" message={t('billingEmptyConsume')} />}
          topupEmpty={<AppEmpty icon="💳" message={t('billingEmptyTopup')} />}
          subscriptionEmpty={<AppEmpty icon="📦" message={t('billingEmptySubscription')} />}
        />
      </Flex>
    </LayoutMainOutletSection>
  );
}
