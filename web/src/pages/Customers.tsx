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
  Select,
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
  DeleteOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import {
  AppEmpty,
  AppPageHeader,
  AsyncTableCard,
  PageStack,
  dealerApi,
  formatNumber,
  formatQuotaAsMoney,
  formatRelative,
  formatTime,
  notifyApiError,
  notifyApiSuccess,
  quotaToCny,
} from '@lynx/shared';
import type { Customer, CustomerCreatePayload } from '@lynx/shared';

const { Text } = Typography;

/** 额度低于此值（元）时提示 */
const LOW_BALANCE_CNY = 10;

export default function Customers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<0 | 1 | 2>(0);

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
      const res = await dealerApi.fetchCustomers({ page, page_size: pageSize, keyword, status });
      setRows(res.items);
      setTotal(res.total);
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
              delta:
                (quotaMode === 'add' ? 1 : -1) * Math.round(quotaAmount * 500000),
            };
      const res = await dealerApi.adjustCustomerQuota(quotaTarget.id, payload);
      setRows((prev) =>
        prev.map((c) => (c.id === quotaTarget.id ? { ...c, quota: res.quota } : c)),
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
        title: '剩余额度',
        dataIndex: 'quota',
        width: 108,
        align: 'right',
        sorter: (a, b) => a.quota - b.quota,
        render: (q: number) => {
          const cny = quotaToCny(q);
          const low = cny < LOW_BALANCE_CNY;
          return (
            <Tooltip title={`${formatNumber(q)} 额度`}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  color: low ? '#f87171' : 'var(--text-primary)',
                }}
              >
                {formatQuotaAsMoney(q)}
              </span>
              {low ? (
                <Tag color="error" style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                  低
                </Tag>
              ) : null}
            </Tooltip>
          );
        },
      },
      {
        title: '累计消耗',
        dataIndex: 'used_quota',
        width: 106,
        align: 'right',
        sorter: (a, b) => a.used_quota - b.used_quota,
        render: (q: number) => (
          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
            {formatQuotaAsMoney(q)}
          </span>
        ),
      },
      {
        title: '请求数',
        dataIndex: 'request_count',
        width: 80,
        align: 'right',
        sorter: (a, b) => a.request_count - b.request_count,
        render: (n: number) => (
          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
            {formatNumber(n)}
          </span>
        ),
      },
      {
        title: '专属折扣',
        dataIndex: 'discount_rate',
        width: 88,
        align: 'center',
        render: (r: number) => (
          <Tag color={r < 1 ? 'purple' : 'default'}>{(r * 10).toFixed(1)} 折</Tag>
        ),
      },
      {
        title: '最近调用',
        dataIndex: 'last_active_at',
        width: 102,
        render: (ts: number) => (
          <Tooltip title={ts ? formatTime(ts) : '从未调用'}>
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatRelative(ts)}</Text>
          </Tooltip>
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
        subtitle="管理你名下的终端客户账号、额度与访问权限"
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

      <AsyncTableCard<Customer>
        toolbar={
          <div className="lynx-toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
              placeholder="搜索用户名 / 姓名 / 邮箱"
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
          // 列宽合计 = 168+172+108+106+80+88+102+78+200 = 1102，
          // 恰好等于 1440 屏下的容器宽度 → 不需要横向滚动，
          // 操作列不会压住「状态」列，也就不会露出半截字。
          scroll: { x: 1102 },
          locale: { emptyText: <AppEmpty icon="👥" message="还没有客户，点击右上角「新建客户」开始" /> },
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
          type="info"
          showIcon
          style={{ marginBottom: 20, fontSize: 12 }}
          message="创建后请把账号密码告知客户"
          description="客户首次登录后可自行修改密码。用户名创建后不可更改。"
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
          <Form.Item
            name="remark"
            label="备注"
            tooltip="仅你自己可见"
          >
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
        <div style={{ marginBottom: 18 }}>
          <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            当前剩余额度：
            <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>
              {formatQuotaAsMoney(quotaTarget?.quota ?? 0)}
            </strong>
          </Text>
        </div>
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
          <Alert
            type="warning"
            showIcon
            style={{ fontSize: 12 }}
            message={
              quotaMode === 'set'
                ? `调整后客户余额将变为 ${quotaAmount} 元`
                : quotaMode === 'add'
                  ? `客户余额将增加 ${quotaAmount} 元`
                  : `客户余额将扣减 ${quotaAmount} 元`
            }
          />
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
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          新密码（至少 8 位）
        </div>
        <Input.Password
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          placeholder="请输入新密码"
          autoComplete="new-password"
        />
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
          重置后该客户当前登录会话将失效，需要重新登录。
        </div>
      </Modal>
    </PageStack>
  );
}
