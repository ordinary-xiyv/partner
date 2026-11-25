import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Segmented,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  AppEmpty,
  AppPageHeader,
  AsyncTableCard,
  PageStack,
  dealerApi,
  formatMoneyFixed,
  formatNumber,
  formatQuotaAsMoney,
  formatTime,
  notifyApiError,
} from '@lynx/shared';
import type { Customer } from '@lynx/shared';

const { Text } = Typography;

export default function Customers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  /*
   * 状态筛选：0=全部，1=启用，2=禁用。
   *
   * 服务端筛选（后端 GET /users 现在接受 status）。曾经的 bug 是前端发不出
   * 这个参数，只能在本页 10 条里过滤，而 total 是全量 —— 表格 2 条、
   * 标题写「共 137 个」，两个数字互相矛盾。现在 Where 加在 Count 之前，
   * 两边的数字天然一致。
   */
  const [status, setStatus] = useState<0 | 1 | 2>(0);
  /*
   * usageRange / usageTruncated 已随页面顶部那条说明 Alert 一起移除。
   *
   * 它们只服务于那段说明文案（「消耗数据区间 X ~ Y，为净消耗」以及
   * 「活跃客户超过 100 名，仅前 100 名能匹配到消耗数据」），文案删掉后
   * 两个 state 就没有消费方了，留着只是每次 load 白 setState 一次。
   *
   * 需要注意的是：usage_truncated 原本是**唯一**告知「部分客户匹配不到
   * 消耗数据」的地方。现在表格里那些「—」只靠单元格 Tooltip
   * （「账单接口未返回该客户数据」）解释，用户无法区分「这个客户真没消耗」
   * 和「他被 100 名截断挤掉了」。若以后要恢复提示，数据源还在
   * fetchCustomers 返回的 res.start_date / res.end_date / res.usage_truncated。
   */

  /*
   * 新建客户 / 调额度 / 重置密码 / 启停 —— 四组状态与处理函数已整体移除。
   *
   * 后端这四个写接口一个都没有（endpoints.ts 里 customerCreate /
   * customerQuota / customerResetPassword / customerStatus 全是 null）。
   * 留着状态和 handler 会变成没人调用的死代码，反而让人误以为功能还在。
   *
   * 后端补上接口后需要恢复的东西（都在 git 历史里）：
   *   · 状态：createOpen/creating/form、quotaTarget/quotaMode/quotaAmount/
   *     quotaSaving、pwdTarget/newPwd/pwdSaving
   *   · handler：handleCreate / handleQuota / handleResetPwd / handleToggle
   *   · JSX：「操作」列、新建客户 Drawer、调额度 Modal、重置密码 Modal
   */

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
      // 不要在这里重新加 setUsageRange / setUsageTruncated，对应的 ui 已移除，原因见文件上方注释
    } catch (err) {
      notifyApiError(err, '客户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status]);

  useEffect(() => {
    void load();
  }, [load]);

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
         *
         * 位数与右边「本月金额」统一为 4 位：两列都是钱，位数不同会让
         * 右对齐的列看起来错位。2 位还会把小额消耗全显示成 ¥0.00。
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
              {formatQuotaAsMoney(q, 4)}
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
        /*
         * 「本月金额」固定 4 位小数。
         *
         * 原来用 formatMoneyAuto（按量级自动 2~5 位），但它是给卡片/概览
         * 单个展示设计的 —— 同一列里每行位数不同，右对齐也对不齐，
         * 扫视时没法比较量级。表格必须用 formatMoneyFixed：
         * 不够补 0、不 trim 尾零，这样 ¥0.5000 和 ¥0.5001 才对得上位。
         *
         * 4 位的理由是这个接口的实际分布：绝大多数客户的本月金额落在
         * 小数点后 3~4 位，2 位会把小额全显示成 ¥0.00，看着像没花钱。
         */
        title: '本月金额',
        dataIndex: 'used_amount_cny',
        width: 116,
        align: 'right',
        sorter: (a, b) => (a.used_amount_cny ?? 0) - (b.used_amount_cny ?? 0),
        render: (v: number | undefined) =>
          v === undefined ? (
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>—</span>
          ) : (
            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
              {formatMoneyFixed(v)}
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
      /*
       * 「操作」列暂时移除。
       *
       * 原来这里有三个入口 —— 调额度、重置密码、启停开关 —— 后端一个写接口
       * 都没实现（见 endpoints.ts 里 customerQuota / customerResetPassword /
       * customerStatus 全是 null）。原来的做法是留着入口、点下去弹「接口尚未
       * 实现」，等于把未完成的按钮摆在用户面前让他反复碰壁。
       *
       * 状态本身仍在上面的「状态」列里展示，丢掉的是「改」的能力。
       * 后端补上写接口后，把这一列连同 setQuotaTarget / setPwdTarget /
       * handleToggle 一起恢复即可 —— 相关处理函数我保留着，没有删。
       */
    ],
    [navigate],
  );

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title="我的客户"
        subtitle="管理你名下的终端客户账号与访问权限"
        actions={
          /*
           * 只剩「刷新」。「新建客户」按钮已撤 —— 后端没有 POST /users
           * （endpoints.ts 里 customerCreate 是 null），留着只能点出一个
           * 「接口尚未实现」的提示。抽屉代码保留，接上接口即可恢复。
           */
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
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
          // 列宽合计 = 168+172+116+92+116+108+78 = 850（操作列已随写接口一并移除）
          scroll: { x: 850 },
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

      {/*
       * 新建客户抽屉、调额度弹窗、重置密码弹窗 —— 三块全部移除。
       *
       * 后端对这些写操作一个接口都没实现（endpoints.ts 里 customerCreate /
       * customerQuota / customerResetPassword / customerStatus 均为 null）。
       * 原来的做法是保留完整表单、在里面放一条「该功能待后端支持」的黄色警告，
       * 提交时才抛「接口尚未实现」—— 让用户先把表单填完再告诉他不能用，
       * 这是最差的一种「未实现」。
       *
       * 处理函数（handleCreate / handleQuota / handleResetPwd）和状态
       * （createOpen / quotaTarget / pwdTarget 等）都还在，后端补上接口后
       * 把这三块 JSX 贴回来即可，不用重写逻辑。
       */}
    </PageStack>
  );
}
