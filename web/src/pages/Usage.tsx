import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import {
  AppEmpty,
  AppPageHeader,
  AsyncTableCard,
  BarChart,
  PageStack,
  StatCard,
  dealerApi,
  downloadBlob,
  formatDuration,
  formatMoney,
  formatMoneyAuto,
  formatNumber,
  formatQuotaAsMoney,
  formatTime,
  notifyApiError,
  notifyApiSuccess,
  quotaToCny,
} from '@lynx/shared';
import type { TrendPoint, UsageLog, UsageSummary } from '@lynx/shared';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/** type → 展示文案与颜色。后端 5 种类型逐项映射，不再把 6/7/8 混作成功 */
const TYPE_META: Record<number, { label: string; color: string }> = {
  2: { label: '消费', color: 'success' },
  5: { label: '错误', color: 'error' },
  6: { label: '退款', color: 'purple' },
  7: { label: '预扣', color: 'blue' },
  8: { label: '补扣', color: 'orange' },
};

export default function Usage() {
  const [rows, setRows] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 筛选
  const [modelFilter, setModelFilter] = useState<string>('');
  /*
   * 按后端原生 type 筛选（2/5/6/7/8），不再用语义化的 success/error。
   *
   * 「成功」并不等于「type=2」—— 预扣(7)、补扣(8) 也是成功发生的，
   * 只筛 type=2 会把它们漏掉；反之「失败」确实只有 type=5，但既然
   * 后端给了 5 种类型，直接按 5 种筛更准确，也省掉一层有损映射。
   */
  const [typeFilter, setTypeFilter] = useState<number | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const buildQuery = useCallback(
    () => ({
      page,
      page_size: pageSize,
      model_name: modelFilter || undefined,
      type: typeFilter,
      start_time: range ? range[0].startOf('day').unix() : undefined,
      end_time: range ? range[1].endOf('day').unix() : undefined,
    }),
    [page, pageSize, modelFilter, typeFilter, range],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /*
       * 明细和汇总并发拉，但**不能**让汇总失败拖垮明细。
       *
       * 上一版这里用 Promise.all，而 fetchUsageSummary 打的是一个不存在的端点，
       * 一抛错整个 Promise.all 就 reject —— 日志明明拉到了也不显示，
       * 页面只剩「用量加载失败」。改成 allSettled：明细是主数据，汇总只是加分项。
       */
      const [listRes, sumRes] = await Promise.allSettled([
        dealerApi.fetchUsageLogs(buildQuery()),
        dealerApi.fetchUsageSummary(buildQuery()),
      ]);

      if (listRes.status === 'fulfilled') {
        setRows(listRes.value.items);
        setTotal(listRes.value.total);
      } else {
        setRows([]);
        setTotal(0);
        notifyApiError(listRes.reason, '用量明细加载失败');
      }

      if (sumRes.status === 'fulfilled') {
        setSummary(sumRes.value);
      } else {
        setSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  // 趋势图独立拉一次：它固定 14 天，不随筛选变化
  useEffect(() => {
    dealerApi
      .fetchOverviewTrend()
      .then(setTrend)
      .catch(() => setTrend([]));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await dealerApi.exportUsage(buildQuery());
      downloadBlob(blob, `用量明细_${dayjs().format('YYYYMMDD_HHmm')}.csv`);
      notifyApiSuccess('导出成功');
    } catch (err) {
      notifyApiError(err, '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 模型下拉必须来自「全量模型列表」，不能从当前汇总结果里取：
  // 汇总会跟着筛选变，一旦筛了某个模型，下拉就只剩这一个选项，用户再也切不回去。
  const [allModels, setAllModels] = useState<string[]>([]);
  useEffect(() => {
    dealerApi
      .fetchModelNames()
      .then((list) => setAllModels(list))
      .catch(() => setAllModels([]));
  }, []);

  const modelOptions = allModels.map((m) => ({ label: m, value: m }));

  const columns: TableColumnsType<UsageLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 158,
      sorter: (a, b) => a.created_at - b.created_at,
      render: (ts: number) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatTime(ts)}</span>
      ),
    },
    {
      title: '客户',
      dataIndex: 'customer_name',
      width: 104,
      render: (n: string) => <span style={{ fontSize: 13, fontWeight: 500 }}>{n}</span>,
    },
    {
      title: '模型',
      dataIndex: 'model_name',
      width: 168,
      render: (m: string) => <Tag>{m}</Tag>,
    },
    {
      title: '输入',
      dataIndex: 'prompt_tokens',
      width: 92,
      align: 'right',
      sorter: (a, b) => a.prompt_tokens - b.prompt_tokens,
      render: (n: number) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(n)}
        </span>
      ),
    },
    {
      title: '输出',
      dataIndex: 'completion_tokens',
      width: 92,
      align: 'right',
      sorter: (a, b) => a.completion_tokens - b.completion_tokens,
      render: (n: number) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(n)}
        </span>
      ),
    },
    {
      title: '消耗',
      dataIndex: 'quota',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.quota - b.quota,
      render: (q: number, row) => (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            /*
             * 退款要标红并显示负号。
             *
             * 注意：库里的 logs.quota 对 type=6 是**正数**（实测确认，
             * 770 条退款记录全部 quota > 0），是后端在 billing 里用
             * `-logs.quota` 做冲销。所以这里不能靠 quota<0 判断，
             * 必须看 type，显示时取负号才是用户理解的「退回」。
             */
            color: row.type === 6 ? '#f87171' : undefined,
          }}
        >
          {row.type === 6 ? '−' : ''}
          {formatMoneyAuto(Math.abs(row.amount_cny ?? quotaToCny(q)))}
        </span>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'use_time',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.use_time - b.use_time,
      render: (t: number) => (
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatDuration(t)}</span>
      ),
    },
    {
      title: '流式',
      dataIndex: 'stream',
      width: 70,
      align: 'center',
      render: (s: boolean) => (
        <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{s ? '是' : '否'}</Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      align: 'center',
      render: (t: number) => {
        const meta = TYPE_META[t] ?? { label: `未知(${t})`, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
  ];

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title="用量明细"
        subtitle="按客户、模型、时间维度追踪每一次调用"
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
              刷新
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>
              导出 CSV
            </Button>
          </>
        }
      />

      {/*
       * 汇总口径必须说清：它来自 billing/summary（账期聚合），
       * 不随「模型筛选」变化，也不等于当前页日志相加。
       * 上一版让人以为四个卡片跟着筛选走，实际是另一套口径，对不上账。
       */}
      <Alert
        type="info"
        showIcon
        style={{ fontSize: 12 }}
        message={
          summary
            ? `汇总区间 ${summary.start_date} ~ ${summary.end_date}，账单口径（含退款冲销），不随下方模型/状态筛选变化`
            : '汇总数据暂不可用'
        }
        description="下方表格是逐条调用明细，可以按模型、状态、时间筛选；顶部四个数字是账期汇总，两者口径不同。"
      />

      {/* 汇总指标 */}
      <div className="lynx-stat-grid">
        <StatCard
          label="区间总消耗"
          value={formatQuotaAsMoney(summary?.total_quota ?? 0)}
          small
          hint={`共 ${formatNumber(summary?.total_requests ?? 0)} 次请求`}
        />
        <StatCard
          label="区间请求数"
          value={formatNumber(summary?.total_requests ?? 0)}
          small
          hint="消费 + 预扣"
        />
        <StatCard
          label="活跃客户"
          value={formatNumber(summary?.total_users ?? 0)}
          small
          hint="区间内有消耗"
        />
        <StatCard
          label="平均单次消耗"
          value={formatMoneyAuto(
            summary && summary.total_requests > 0
              ? summary.total_amount_cny / summary.total_requests
              : 0,
          )}
          small
          hint="总金额 / 请求数"
        />
      </div>

      {/* 图表：趋势来自 daily-trend，模型分布后端没有接口，已移除 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
        <BarChart
          title="近 14 天消耗趋势"
          subtitle="单位：元 · 截止昨天"
          data={trend.map((d) => ({
            label: d.summary_date.slice(5),
            value: Math.round((d.amount_cny ?? quotaToCny(d.quota)) * 100) / 100,
          }))}
          formatValue={(v) => formatMoney(v)}
        />
      </div>

      {/* 明细表 */}
      <AsyncTableCard<UsageLog>
        toolbar={
          <div className="lynx-toolbar">
            <Select
              allowClear
              placeholder="全部模型"
              style={{ width: 190 }}
              value={modelFilter || undefined}
              onChange={(v) => {
                setModelFilter(v || '');
                setPage(1);
              }}
              options={modelOptions}
              showSearch
              optionFilterProp="label"
            />
            <Select
              allowClear
              placeholder="全部类型"
              style={{ width: 130 }}
              value={typeFilter}
              onChange={(v) => {
                setTypeFilter(v as number | undefined);
                setPage(1);
              }}
              options={[
                { label: '消费', value: 2 },
                { label: '错误', value: 5 },
                { label: '退款', value: 6 },
                { label: '预扣', value: 7 },
                { label: '补扣', value: 8 },
              ]}
            />
            <RangePicker
              value={range}
              onChange={(v) => {
                setRange(v as [Dayjs, Dayjs] | null);
                setPage(1);
              }}
              placeholder={['开始日期', '结束日期']}
              allowClear
              style={{ width: 250 }}
            />
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => {
                setModelFilter('');
                setTypeFilter(undefined);
                setRange(null);
                setPage(1);
              }}
            >
              重置
            </Button>
            <div className="lynx-toolbar__spacer" />
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              共 {formatNumber(total)} 条记录
            </Text>
          </div>
        }
        tableProps={{
          rowKey: 'id',
          columns,
          dataSource: rows,
          loading,
          size: 'middle',
          // 列宽合计 = 158+104+168+92+92+110+90+70+80 = 964
          scroll: { x: 964 },
          locale: { emptyText: <AppEmpty icon="📈" message="当前筛选条件下没有调用记录" /> },
          pagination: {
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          },
        }}
      />
    </PageStack>
  );
}
