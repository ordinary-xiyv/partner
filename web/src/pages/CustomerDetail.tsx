import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Descriptions, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import {
  AppEmpty,
  AppPageHeader,
  AsyncTableCard,
  DescGrid,
  PagePanel,
  PageStack,
  StatCard,
  dealerApi,
  formatDuration,
  formatMoney,
  formatNumber,
  formatQuotaAsMoney,
  formatTime,
  quotaToCny,
  notifyApiError,
} from '@lynx/shared';
import type { Customer, UsageLog } from '@lynx/shared';

const { Text } = Typography;

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      try {
        // 用列表接口的 keyword 兜底取客户（真实接口应换成 customerDetail）
        const res = await dealerApi.fetchCustomers({ page: 1, page_size: 200 });
        const found = res.items.find((c) => String(c.id) === id) || null;
        setCustomer(found);
        const usage = await dealerApi.fetchUsageLogs({
          page,
          page_size: 10,
          customer_id: Number(id),
        });
        setLogs(usage.items);
        setTotal(usage.total);
      } catch (err) {
        notifyApiError(err, '加载失败');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, page]);

  const columns: TableColumnsType<UsageLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 165,
      render: (ts: number) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatTime(ts)}</span>
      ),
    },
    {
      title: '模型',
      dataIndex: 'model_name',
      width: 170,
      render: (m: string) => <Tag>{m}</Tag>,
    },
    {
      title: '输入 / 输出 tokens',
      width: 170,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(r.prompt_tokens)} / {formatNumber(r.completion_tokens)}
        </span>
      ),
    },
    {
      title: '消耗',
      dataIndex: 'quota',
      width: 100,
      align: 'right',
      render: (q: number) => (
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{formatQuotaAsMoney(q)}</span>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'use_time',
      width: 90,
      align: 'right',
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
      render: (s: string) => <Tag color={s === 'success' ? 'success' : 'error'}>{s === 'success' ? '成功' : '失败'}</Tag>,
    },
  ];

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title={customer?.display_name || '客户详情'}
        subtitle={customer ? `@${customer.username} · 开户于 ${formatTime(customer.created_at, 'YYYY-MM-DD')}` : '加载中…'}
        actions={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
            返回列表
          </Button>
        }
      />

      {customer ? (
        <>
          <div className="lynx-stat-grid">
            <StatCard label="剩余额度" value={formatQuotaAsMoney(customer.quota)} small hint={`${formatNumber(customer.quota)} 额度`} />
            {/* 提示别再重复上面那个金额（formatQuotaAsMoney 与 formatMoney(quotaToCny()) 同源，必然一模一样）。
                这里改成有信息量的「平均每次调用花费」。 */}
            <StatCard
              label="累计消耗"
              value={formatQuotaAsMoney(customer.used_quota)}
              small
              hint={
                customer.request_count > 0
                  ? `平均每次 ${formatMoney(quotaToCny(customer.used_quota) / customer.request_count, 3)}`
                  : '尚无调用'
              }
            />
            <StatCard label="请求总数" value={formatNumber(customer.request_count)} small hint="历史累计" />
            <StatCard
              label="专属折扣"
              value={`${(customer.discount_rate * 10).toFixed(1)} 折`}
              small
              hint={customer.discount_rate < 1 ? '低于标价' : '按标价计费'}
            />
          </div>

          <PagePanel padded>
            <div className="lynx-section-title">基本信息</div>
            <DescGrid
              items={[
                { label: '客户 ID', value: customer.id },
                { label: '登录账号', value: customer.username },
                { label: '客户名称', value: customer.display_name },
                { label: '邮箱', value: customer.email || '-' },
                { label: '手机号', value: customer.phone || '未绑定' },
                {
                  label: '账号状态',
                  value: <Tag color={customer.status === 1 ? 'success' : 'error'}>{customer.status === 1 ? '正常' : '已禁用'}</Tag>,
                },
                { label: '最近调用', value: customer.last_active_at ? formatTime(customer.last_active_at) : '从未调用' },
                { label: '备注', value: customer.remark || '-' },
              ]}
            />
          </PagePanel>

          <AsyncTableCard<UsageLog>
            toolbar={
              <div className="lynx-toolbar">
                <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>调用记录</Text>
                <div className="lynx-toolbar__spacer" />
                <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>共 {formatNumber(total)} 条</Text>
              </div>
            }
            tableProps={{
              rowKey: 'id',
              columns,
              dataSource: logs,
              loading,
              size: 'middle',
              scroll: { x: 860 },
              locale: { emptyText: <AppEmpty icon="📊" message="该客户还没有调用记录" /> },
              pagination: {
                current: page,
                pageSize: 10,
                total,
                showTotal: (t) => `共 ${t} 条`,
                onChange: setPage,
              },
            }}
          />
        </>
      ) : loading ? (
        <PagePanel padded>
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>加载中…</div>
        </PagePanel>
      ) : (
        <PagePanel padded>
          <AppEmpty icon="🔍" message="没有找到该客户" />
        </PagePanel>
      )}
    </PageStack>
  );
}
