import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Tag, Typography } from 'antd';
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
  formatMoneyAuto,
  formatNumber,
  formatQuotaAsMoney,
  formatTime,
  notifyApiError,
  quotaToCny,
} from '@lynx/shared';
import type { Customer, UsageLog } from '@lynx/shared';

const { Text } = Typography;

/** type → 展示文案，与用量页保持一致 */
const TYPE_META: Record<number, { label: string; color: string }> = {
  2: { label: '消费', color: 'success' },
  5: { label: '错误', color: 'error' },
  6: { label: '退款', color: 'purple' },
  7: { label: '预扣', color: 'blue' },
  8: { label: '补扣', color: 'orange' },
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setNotFound(false);
      try {
        /*
         * 后端没有 GET /users/:id，只能从列表里找。
         *
         * 关键：page_size 上限是 100（见 partner_users.go：
         * `if pageSize < 1 || pageSize > 100 { pageSize = 20 }`）。
         * 上一版传 200，后端判定非法直接回退成 20 —— 客户只要不在前 20 个，
         * 详情页就一律显示「没有找到该客户」。
         *
         * 现在用 keyword 按 ID 精确搜（后端支持 `id = ?`），拿到的就是这一条。
         */
        const res = await dealerApi.fetchCustomers({
          page: 1,
          page_size: 20,
          keyword: id,
          withUsage: true,
        });
        // keyword 是模糊匹配，可能带出别的行，这里再按 id 精确筛一次
        const found = res.items.find((c) => String(c.id) === id) || null;
        setCustomer(found);
        setNotFound(!found);

        if (found) {
          const usage = await dealerApi.fetchUsageLogs({
            page,
            page_size: 10,
            customer_id: Number(id),
          });
          setLogs(usage.items);
          setTotal(usage.total);
        }
      } catch (err) {
        notifyApiError(err, '加载失败');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, page]);

  // 翻页只重拉日志，不必再查一次客户
  useEffect(() => {
    if (!id || page === 1) return;
    dealerApi
      .fetchUsageLogs({ page, page_size: 10, customer_id: Number(id) })
      .then((usage) => {
        setLogs(usage.items);
        setTotal(usage.total);
      })
      .catch(() => undefined);
  }, [id, page]);

  const columns: TableColumnsType<UsageLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 158,
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
      width: 104,
      align: 'right',
      render: (q: number, row) => (
        <span
          style={{
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
            // 退款：库里 quota 是正数，靠 type 判断并显示负号，见 Usage.tsx 的说明
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
        title={customer?.display_name || '客户详情'}
        subtitle={
          customer
            ? `@${customer.username}${customer.created_at ? ` · 开户于 ${formatTime(customer.created_at, 'YYYY-MM-DD')}` : ''}`
            : '加载中…'
        }
        actions={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
            返回列表
          </Button>
        }
      />

      {customer ? (
        <>
          {/*
           * 三个统计卡改为「本月」口径，全部来自 billing/summary。
           * 上一版这里显示「剩余额度」，而后端压根没有余额字段，
           * 值永远是 0 —— 等于告诉伙伴「这个客户余额 0 元」。
           */}
          <div className="lynx-stat-grid">
            <StatCard
              label="本月消耗"
              value={formatQuotaAsMoney(customer.used_quota ?? 0)}
              small
              hint={`${formatNumber(customer.used_quota ?? 0)} 额度`}
            />
            <StatCard
              label="本月消费金额"
              value={formatMoneyAuto(customer.used_amount_cny ?? 0)}
              small
              hint={
                customer.request_count
                  ? `平均每次 ${formatMoneyAuto((customer.used_amount_cny ?? 0) / customer.request_count)}`
                  : '尚无调用'
              }
            />
            <StatCard
              label="本月请求数"
              value={formatNumber(customer.request_count ?? 0)}
              small
              hint="账单口径：消费 + 预扣"
            />
            <StatCard
              label="账号状态"
              value={customer.status === 1 ? '正常' : '已禁用'}
              small
              hint={customer.status === 1 ? '可正常调用' : '已停止访问'}
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
                  value: (
                    <Tag color={customer.status === 1 ? 'success' : 'error'}>
                      {customer.status === 1 ? '正常' : '已禁用'}
                    </Tag>
                  ),
                },
                {
                  label: '开户时间',
                  value: customer.created_at ? formatTime(customer.created_at) : '-',
                },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <Alert
                type="info"
                showIcon
                style={{ fontSize: 12 }}
                message="备注与最近调用时间暂未开放"
                description="后端 users 表未返回 remark / last_active_at，需要先新增字段或接口。"
              />
            </div>
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
              scroll: { x: 850 },
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
          <AppEmpty
            icon="🔍"
            message={notFound ? '没有找到该客户，可能不属于你名下' : '加载失败'}
          />
        </PagePanel>
      )}
    </PageStack>
  );
}
