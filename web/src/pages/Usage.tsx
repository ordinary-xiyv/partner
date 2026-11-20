import React, { useCallback, useEffect, useState } from 'react';
import { Button, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import {
  AppEmpty,
  AppPageHeader,
  AsyncTableCard,
  BarChart,
  PageStack,
  RankList,
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
import type { UsageLog, UsageSummary } from '@lynx/shared';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export default function Usage() {
  const [rows, setRows] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 筛选
  const [modelFilter, setModelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'success' | 'error'>('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const buildQuery = useCallback(
    () => ({
      page,
      page_size: pageSize,
      model_name: modelFilter || undefined,
      status: statusFilter || undefined,
      start_time: range ? range[0].startOf('day').unix() : undefined,
      end_time: range ? range[1].endOf('day').unix() : undefined,
    }),
    [page, pageSize, modelFilter, statusFilter, range],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        dealerApi.fetchUsageLogs(buildQuery()),
        dealerApi.fetchUsageSummary(buildQuery()),
      ]);
      setRows(list.items);
      setTotal(list.total);
      setSummary(sum);
    } catch (err) {
      notifyApiError(err, '用量加载失败');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

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
      render: (q: number) => (
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoneyAuto(quotaToCny(q))}
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
      title: '状态',
      dataIndex: 'status',
      width: 80,
      align: 'center',
      render: (s: string) => (
        <Tag color={s === 'success' ? 'success' : 'error'}>{s === 'success' ? '成功' : '失败'}</Tag>
      ),
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

      {/* 汇总指标 */}
      <div className="lynx-stat-grid">
        <StatCard
          label="筛选范围总消耗"
          value={formatQuotaAsMoney(summary?.total_quota ?? 0)}
          small
          hint={`共 ${formatNumber(summary?.total_requests ?? 0)} 次调用`}
        />
        <StatCard label="调用次数" value={formatNumber(summary?.total_requests ?? 0)} small hint="含成功与失败" />
        <StatCard label="Token 总量" value={formatNumber(summary?.total_tokens ?? 0)} small hint="输入 + 输出" />
        <StatCard
          label="平均单次消耗"
          value={formatMoneyAuto(
            summary && summary.total_requests > 0 ? quotaToCny(summary.total_quota) / summary.total_requests : 0,
          )}
          small
          hint="总消耗 / 调用次数"
        />
      </div>

      {/* 图表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16 }} className="lynx-usage-charts">
        <BarChart
          title="消耗趋势"
          subtitle="单位：元"
          data={(summary?.daily ?? []).map((d) => ({
            label: d.date.slice(5),
            value: Math.round(quotaToCny(d.quota) * 100) / 100,
          }))}
          formatValue={(v) => formatMoney(v)}
        />
        <RankList
          title="模型消耗占比"
          data={(summary?.by_model ?? []).slice(0, 8).map((m) => ({
            name: m.model_name,
            value: Math.round(quotaToCny(m.quota) * 100) / 100,
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
              placeholder="全部状态"
              style={{ width: 130 }}
              value={statusFilter || undefined}
              onChange={(v) => {
                setStatusFilter((v as '' | 'success' | 'error') || '');
                setPage(1);
              }}
              options={[
                { label: '成功', value: 'success' },
                { label: '失败', value: 'error' },
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
                setStatusFilter('');
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
          // 列宽合计 = 158+104+168+92+92+110+90+70+80 = 964 < 1102
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

      <style>{`
        @media (max-width: 1023px) {
          .lynx-usage-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </PageStack>
  );
}
