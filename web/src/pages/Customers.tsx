import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Alert,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import {
  AppEmpty,
  AppPageHeader,
  AsyncTableCard,
  PageStack,
  dealerApi,
  formatMoneyAuto,
  formatNumber,
  formatQuotaAsMoney,
  formatTime,
  notifyApiError,
  notifyApiSuccess,
} from '@lynx/shared';
import type { Customer, CustomerCreatePayload } from '@lynx/shared';

const { Text } = Typography;

export default function Customers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<0 | 1 | 2>(0);
  /** 用量区间（后端 billing 返回的实际区间，用于表头说明） */
  const [usageRange, setUsageRange] = useState<{ start?: string; end?: string }>({});
  /** 账单只返回了前 100 名活跃客户，超出部分无法匹配 */
  const [usageTruncated, setUsageTruncated] = useState(false);

  // 新建客户
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<CustomerCreatePayload>();

  // 调整额度
  const [quotaTarget, setQuotaTarget] = useState<Customer | null>(null);
  const [quotaMode, setQuotaMode] = useState<'add' | 'sub' | 'set'>('add');
  const [quotaAmount, setQuotaAmount] = useState<number>(100);
  const [quotaSaving, setQuotaSaving] = useState(false);

  // 重置密码
  const [pwdTarget, setPwdTarget] = useState<Customer | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /*
       * withUsage: true —— 顺带拉 billing/summary 把「本月消耗/请求数」补上。
       * 后端 /users 本身不带这些字段，不合并的话这几列只能显示「—」。
       */
      const res = await dealerApi.fetchCustomers({
        page,
        page_size: pageSize,
        keyword,
        status,
        withUsage: true,
      });
      setRows(res.items);
      setTotal(res.total);
      setUsageRange({ start: res.start_date, end: res.end_date });
      setUsageTruncated(Boolean(res.usage_truncated));
    } catch (err) {
      notifyApiError(err, '客户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await dealerApi.createCustomer(values);
      notifyApiSuccess('客户创建成功');
      setCreateOpen(false);
      form.resetFields();
      setPage(1);
      void load();
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return; // 表单校验失败
      notifyApiError(err, '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleQuota = async () => {
    if (!quotaTarget) return;
    setQuotaSaving(true);
    try {
      const payload =
        quotaMode === 'set'
          ? { set: Math.round(quotaAmount * 500000) }
          : {
              delta: (quotaMode === 'add' ? 1 : -1) * Math.round(quotaAmount * 500000),
            };
      const res = await dealerApi.adjustCustomerQuota(quotaTarget.id, payload);
      setRows((prev) =>
        prev.map((c) => (c.id === quotaTarget.id ? { ...c, used_quota: res.quota } : c)),
      );
      notifyApiSuccess('额度已更新');
      setQuotaTarget(null);
    } catch (err) {
      notifyApiError(err, '额度调整失败');
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleToggle = async (row: Customer, next: boolean) => {
    const nextStatus: 1 | 2 = next ? 1 : 2;
    try {
      await dealerApi.toggleCustomerStatus(row.id, nextStatus);
      setRows((prev) => prev.map((c) => (c.id === row.id ? { ...c, status: nextStatus } : c)));
      notifyApiSuccess(next ? '已启用' : '已禁用');
    } catch (err) {
      notifyApiError(err, '操作失败');
    }
  };

  const handleResetPwd = async () => {
    if (!pwdTarget) return;
    if (newPwd.length < 8) {
      notifyApiError(null, '密码至少 8 位');
      return;
    }
    setPwdSaving(true);
    try {
      await dealerApi.resetCustomerPassword(pwdTarget.id, newPwd);
      notifyApiSuccess('密码已重置');
      setPwdTarget(null);
      setNewPwd('');
    } catch (err) {
      notifyApiError(err, '重置失败');
    } finally {
      setPwdSaving(false);
    }
  };

  const columns: TableColumnsType<Customer> = useMemo(
    () => [
      {
        title: '客户',
        dataIndex: 'display_name',
        width: 168,
        render: (_, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <a
              onClick={() => navigate(`/customers/${row.id}`)}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}
            >
              {row.display_name}
            </a>
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>@{row.username}</Text>
          </div>
        ),
      },
      {
        title: '联系方式',
        dataIndex: 'email',
        width: 172,
        render: (_, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.email || '-'}</Text>
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{row.phone || '未绑定手机'}</Text>
          </div>
        ),
      },
      {
        /*
         * 「本月消耗」取代了原来的「剩余额度」。
         *
         * 后端 users 表没有余额列，额度靠 billing 聚合出的是「消耗」不是「余额」。
         * 上一版把 quota 硬编码 0，于是每个客户都显示 ¥0.00 并被打上红色「低」标签——
         * 那是在指责客户欠费，而真相是我们不知道余额。
         * 现在展示真的有的数字：区间内净消耗。拿不到就显示「—」。
         */
        title: '本月消耗',
        dataIndex: 'used_quota',
        width: 116,
        align: 'right',
        sorter: (a, b) => (a.used_quota ?? 0) - (b.used_quota ?? 0),
        render: (q: number | undefined) =>
          q === undefined ? (
            <Tooltip title="账单接口未返回该客户数据">
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>—</span>
            </Tooltip>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {formatQuotaAsMoney(q)}
            </span>
          ),
      },
      {
        title: '请求数',
        dataIndex: 'request_count',
        width: 92,
        align: 'right',
        sorter: (a, b) => (a.request_count ?? 0) - (b.request_count ?? 0),
        render: (n: number | undefined) =>
          n === undefined ? (
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>—</span>
          ) : (
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
              {formatNumber(n)}
            </span>
          ),
      },
      {
        title: '本月金额',
        dataIndex: 'used_amount_cny',
        width: 104,
        align: 'right',
        render: (v: number | undefined) =>
          v === undefined ? (
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>—</span>
          ) : (
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
              {formatMoneyAuto(v)}
            </span>
          ),
      },
      {
        title: '开户时间',
        dataIndex: 'created_at',
        width: 108,
        render: (ts: number) =>
          ts ? (
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatTime(ts, 'YYYY-MM-DD')}</Text>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
          ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 78,
        align: 'center',
        render: (s: 1 | 2) => (
          <Tag color={s === 1 ? 'success' : 'error'}>{s === 1 ? '正常' : '已禁用'}</Tag>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 200,
        fixed: 'right',
        render: (_, row) => (
          <Space size={4} wrap>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setQuotaTarget(row)}>
              调额度
            </Button>
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              icon={<KeyOutlined />}
              onClick={() => {
                setPwdTarget(row);
                setNewPwd('');
              }}
            >
              重置密码
            </Button>
            <Switch
              size="small"
              checked={row.status === 1}
              onChange={(v) => void handleToggle(row, v)}
            />
          </Space>
        ),
      },
    ],
    [navigate],
  );

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title="我的客户"
        subtitle="管理你名下的终端客户账号与访问权限"
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建客户
            </Button>
          </>
        }
      />

      {/*
       * 说明「本月消耗」这一列的区间，避免被误读成余额。
       * 同时说清两件容易引起误会的事：
       *   1. 显示「—」不是 bug —— 该客户本月没有消耗，账单接口不返回他
       *   2. 状态筛选是本地筛选，分页总数不会跟着变
       */}
      <Alert
        type="info"
        showIcon
        style={{ fontSize: 12 }}
        message={
          usageRange.start
            ? `消耗数据区间 ${usageRange.start} ~ ${usageRange.end}，为净消耗（含退款冲销）`
            : '消耗数据来自账单接口，暂未取到'
        }
        description={
          <>
            「—」表示该客户在此区间内没有消耗记录，账单接口只返回有消耗的客户。
            「剩余额度」需要后端提供余额接口，当前未开放。
            {usageTruncated && ' 活跃客户超过 100 名，仅前 100 名能匹配到消耗数据。'}
          </>
        }
      />

      <AsyncTableCard<Customer>
        toolbar={
          <div className="lynx-toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
              placeholder="搜索用户名 / 姓名 / 邮箱 / 手机"
              style={{ width: 260 }}
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
            />
            <Segmented
              value={status}
              onChange={(v) => {
                setStatus(v as 0 | 1 | 2);
                setPage(1);
              }}
              options={[
                { label: '全部', value: 0 },
                { label: '正常', value: 1 },
                { label: '已禁用', value: 2 },
              ]}
            />
            <div className="lynx-toolbar__spacer" />
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              共 {formatNumber(total)} 个客户
            </Text>
          </div>
        }
        tableProps={{
          rowKey: 'id',
          columns,
          dataSource: rows,
          loading,
          size: 'middle',
          // 列宽合计 = 168+172+116+92+104+108+78+200 = 1038
          scroll: { x: 1038 },
          locale: { emptyText: <AppEmpty icon="👥" message="还没有客户" /> },
          pagination: {
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          },
        }}
      />

      {/* 新建客户抽屉 */}
      <Drawer
        title="新建客户"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        width={480}
        destroyOnHidden
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleCreate}>
              创建
            </Button>
          </div>
        }
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 20, fontSize: 12 }}
          message="该功能待后端支持"
          description="伙伴后端目前只有查询接口，新建客户需要 POST /api/partner/users。表单可正常填写，提交时会提示接口尚未实现。"
        />
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="username"
            label="登录账号"
            rules={[
              { required: true, message: '请输入登录账号' },
              { pattern: /^[a-zA-Z0-9_-]{4,20}$/, message: '4-20 位字母、数字、下划线或短横线' },
            ]}
          >
            <Input placeholder="如 cust_acme" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="display_name"
            label="客户名称"
            rules={[{ required: true, message: '请输入客户名称' }]}
          >
            <Input placeholder="如 某某科技有限公司" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 8, message: '密码至少 8 位' },
            ]}
          >
            <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="选填" autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="选填" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="init_quota"
            label="初始赠送额度（元）"
            tooltip="创建时直接划给客户的额度，0 表示不赠送"
          >
            <InputNumber min={0} step={10} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          <Form.Item name="remark" label="备注" tooltip="仅你自己可见">
            <Input.TextArea rows={2} placeholder="如：某某项目对接人，需月度对账" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* 调整额度 */}
      <Modal
        title={`调整额度 · ${quotaTarget?.display_name ?? ''}`}
        open={Boolean(quotaTarget)}
        onCancel={() => setQuotaTarget(null)}
        onOk={handleQuota}
        confirmLoading={quotaSaving}
        okText="确认调整"
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, fontSize: 12 }}
          message="该功能待后端支持"
          description="额度调整需要后端提供写接口，当前提交会提示接口尚未实现。"
        />
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Segmented
            block
            value={quotaMode}
            onChange={(v) => setQuotaMode(v as 'add' | 'sub' | 'set')}
            options={[
              { label: '增加', value: 'add' },
              { label: '扣减', value: 'sub' },
              { label: '设为', value: 'set' },
            ]}
          />
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              金额（元）
            </div>
            <InputNumber
              min={0}
              step={10}
              style={{ width: '100%' }}
              value={quotaAmount}
              onChange={(v) => setQuotaAmount(v ?? 0)}
              addonAfter="元"
            />
          </div>
        </Space>
      </Modal>

      {/* 重置密码 */}
      <Modal
        title={`重置密码 · ${pwdTarget?.display_name ?? ''}`}
        open={Boolean(pwdTarget)}
        onCancel={() => {
          setPwdTarget(null);
          setNewPwd('');
        }}
        onOk={handleResetPwd}
        confirmLoading={pwdSaving}
        okText="重置"
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, fontSize: 12 }}
          message="该功能待后端支持"
          description="重置客户密码需要后端提供写接口，当前提交会提示接口尚未实现。"
        />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          新密码（至少 8 位）
        </div>
        <Input.Password
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          placeholder="请输入新密码"
          autoComplete="new-password"
        />
      </Modal>
    </PageStack>
  );
}
