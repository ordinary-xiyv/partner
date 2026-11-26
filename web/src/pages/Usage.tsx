import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, DatePicker, Select, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import {
  AppEmpty,
  AppPageHeader,
  AsyncTableCard,
  BarChart,
  PageStack,
  StatCard,
  dealerApi,
  formatDuration,
  formatMoney,
  formatMoneyAuto,
  formatMoneyFixed,
  formatNumber,
  formatQuotaAsMoney,
  formatTime,
  notifyApiError,
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

/**
 * 默认时间范围：近 7 天（今天往前数 6 天，到今天结束）。
 *
 * 为什么必须有默认值，而不能留空：
 *
 * dealer.ts 的 fetchUsageLogs 里有一条约定 —— 「不带时间范围」会被翻译成
 * `all_history=1`（因为页面语义是「不筛时间 = 看全部」）。这本身没错，
 * 但**进页面时 range 是 null**，于是首屏就按全部历史查：扫描范围覆盖
 * logs 的全部分区（线上 106 个），叠加 Count 全量统计，这是「加载很慢、
 * 等久报错」最直接的原因。
 *
 * 改成默认近 7 天后，首屏只扫最近 7 天的数据；需要看更早的记录，
 * 用日期选择器自己选区间即可（清空选择会回到这个默认 7 天，不是全部历史 ——
 * 见下面 resetRange / onChange 的处理）。
 */
const DEFAULT_RANGE_DAYS = 7;

/**
 * 用户可手动选择的最大跨度（含首尾）。
 *
 * 为什么卡在 31 天：logs 是按天分区的表（线上 100+ 个分区），
 * 时间跨度直接决定要扫多少个分区。不设上限时，一次「选个大范围」
 * 就能把单次查询拖到几十秒，表现就是「点了筛选一直转圈」。
 *
 * 与后端上限的关系：billing/summary 允许最多 93 天（且是 >= 93 就拒，
 * 实际最大 92 天），所以 31 天不会触发后端 400。
 * 如果以后要放宽，别超过 92，否则汇总那块会整个变成 400。
 */
const MAX_RANGE_DAYS = 31;

function buildDefaultRange(): [Dayjs, Dayjs] {
  return [dayjs().subtract(DEFAULT_RANGE_DAYS - 1, 'day').startOf('day'), dayjs().endOf('day')];
}

export default function Usage() {
  const [rows, setRows] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
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
  /*
   * 注意类型是 [Dayjs, Dayjs] 而非 `| null`：默认值一定有，
   * RangePicker 清空时我们回落到默认区间（见 onChange），不会真的变成空。
   */
  const [range, setRange] = useState<[Dayjs, Dayjs]>(buildDefaultRange);

  const buildQuery = useCallback(
    () => ({
      page,
      page_size: pageSize,
      model_name: modelFilter || undefined,
      /*
       * 类型筛选。
       *
       * 这里曾经漏过 —— useCallback 的依赖数组里明明有 typeFilter，
       * 返回的对象里却没有 type 字段，于是「全部类型」下拉选了也不生效：
       * onChange 触发重渲染、useCallback 重建、请求也发了，但发出去的参数
       * 和选之前一模一样，列表自然纹丝不动。因为依赖数组是对的，lint 看不出来。
       */
      type: typeFilter,
      /*
       * range 现在一定有值（默认近 7 天），但仍然逐项判空：
       *
       * RangePicker 在「只选了开始日期、还没选结束日期」时会回调 [Dayjs, null]。
       * onChange 里虽然已经把这种半选状态回落到默认区间，但 buildQuery 是
       * 独立函数，不该依赖调用方的保证 —— 一旦哪天有人把 setRange 直接接到
       * RangePicker 上，[x, null] 就会让 range[1].endOf() 抛
       * TypeError: Cannot read properties of null (reading 'endOf')。
       * 那个异常在 try 块里同步抛出，外面只有 finally 没有 catch，
       * 表现就是「筛选点了没反应，数据不更新」—— 历史上踩过这个坑。
       */
      start_time: range?.[0] ? range[0].startOf('day').unix() : undefined,
      end_time: range?.[1] ? range[1].endOf('day').unix() : undefined,
    }),
    [page, pageSize, modelFilter, typeFilter, range],
  );

  /*
   * 请求序号 —— 用来丢弃「迟到的旧响应」。
   *
   * 没有这个守卫时会出现经典竞态：用户快速翻页 / 连续改筛选，
   * 多个请求同时在飞，**最后返回的那个**会覆盖 state，
   * 而它未必是最后一次操作对应的请求。表现就是「点了第 2 页，
   * 数据显示的还是第 1 页」或者「筛选没生效」。
   * 本地后端几十毫秒就回来，几乎复现不出；线上有网络延迟时很常见。
   */
  const reqSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    try {
      /*
       * 明细和汇总并发拉，但**不能**让汇总失败拖垮明细。
       *
       * 上一版这里用 Promise.all，而 fetchUsageSummary 打的是一个不存在的端点，
       * 一抛错整个 Promise.all 就 reject —— 日志明明拉到了也不显示，
       * 页面只剩「用量加载失败」。改成 allSettled：明细是主数据，汇总只是加分项。
       */
      const query = buildQuery();
      const [listRes, sumRes] = await Promise.allSettled([
        dealerApi.fetchUsageLogs(query),
        dealerApi.fetchUsageSummary(query),
      ]);

      // 已经有更新的请求发出去了，这次的响应作废（否则会把新数据盖回旧的）
      if (seq !== reqSeqRef.current) return;

      if (listRes.status === 'fulfilled') {
        setRows(listRes.value.items);
        setTotal(listRes.value.total);
        /*
         * 兜住「当前页码超出总页数」的情况。
         *
         * 场景：在第 5 页改筛选，筛完只剩 2 页。筛选的 onChange 里虽然
         * 都会 setPage(1)，但如果是「总条数因为别的原因变少」或者翻页
         * 后数据被删，页码就可能停在空页上 —— 表格一片空白，
         * 用户以为是筛选坏了。
         */
        const maxPage = Math.max(1, Math.ceil(listRes.value.total / pageSize));
        if (page > maxPage) setPage(maxPage);
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
    } catch (err) {
      /*
       * 原来只有 finally 没有 catch。
       *
       * 后果是：buildQuery 里任何同步异常（见上面 range 判空的注释）、
       * 或者 notifyApiError 自身抛错，都会变成一个没人处理的
       * unhandled rejection —— loading 复位了，数据却没变，
       * 界面看起来就是「点了没反应」，连报错都没有。
       * 这里显式捕获并复位，至少让用户看到发生了什么。
       */
      if (seq === reqSeqRef.current) {
        setRows([]);
        setTotal(0);
        notifyApiError(err, '用量明细加载失败');
      }
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }, [buildQuery, page, pageSize]);

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

  /*
   * 导出功能已撤（后端没有接口，endpoints.ts 里 usageExport 是 null）。
   * 原来的 handleExport + 导出按钮一起移除 —— 留着它必然弹「接口尚未实现」，
   * 而且还会先显示一个「正在导出」的加载态，比不显示这个按钮更糟。
   * 后端补上导出接口后，从 git 历史恢复这段和按钮即可。
   */

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
      render: (n: number) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(n)}
        </span>
      ),
    },
    {
      /*
       * 缓存命中的 token 数。
       *
       * 数据本来就在日志表里（logs.cache_read，后端也已经 select 出来了），
       * 只是这一列之前没渲染，于是「省了多少」完全看不见 —— 而缓存命中率
       * 是判断成本是否合理的关键指标之一（实测该库 38529 条消费记录里
       * 有 9573 条命中过缓存，不是可有可无的边缘数据）。
       *
       * 命中为 0 时显示灰色的「—」而不是「0」：
       * 绝大多数请求就是没命中，满屏的 0 会让这一列变成噪声，
       * 反而看不出哪些是真正省钱的调用。
       */
      title: '缓存',
      dataIndex: 'cache_read',
      width: 92,
      align: 'right',
      render: (n: number) => (
        <span
          style={{
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            color: n > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
          }}
        >
          {n > 0 ? formatNumber(n) : '—'}
        </span>
      ),
    },
    {
      title: '输出',
      dataIndex: 'completion_tokens',
      width: 92,
      align: 'right',
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
          {/*
           * 固定 4 位小数，不用 formatMoneyAuto。
           *
           * 之前用的自适应位数（>=1 元 2 位、>=0.01 元 3 位、以下 4~5 位），
           * 同一列里每行长度都不一样：¥0.5 和 ¥0.5001 并排，右对齐也看不出
           * 谁大谁小，扫视比较时特别费劲。
           *
           * 现在统一 4 位、末位补 0 不裁：库里最小的一笔是 ¥0.000002，
           * 4 位仍会显示成 ¥0.0000 —— 那是这个维度下的真实精度极限，
           * 再往下加位数对「看用量明细」没有意义，反而把列撑宽。
           */}
          {formatMoneyFixed(Math.abs(row.amount_cny ?? quotaToCny(q)))}
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
        title="用量明细"
        subtitle="按客户、模型、时间维度追踪每一次调用"
        actions={
          /*
           * 只剩「刷新」。「导出 CSV」按钮已撤 —— 后端没有导出接口
           * （endpoints.ts 里 usageExport 是 null）。原来点下去必然弹
           * 「接口尚未实现」，还额外给用户一个「正在进行」的加载态，
           * 比不显示这个按钮更糟。handleExport 保留，接上接口即可恢复。
           */
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
        }
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
                /*
                 * 只有「两个日期都选好」才当成有效区间，否则回落到默认近 7 天。
                 *
                 * RangePicker 在交互过程中会多次回调：
                 *   · 只点了一个日期 → [Dayjs, null]
                 *   · 清空           → null
                 * 原写法直接把 v 塞进 state，[Dayjs, null] 随后会让
                 * buildQuery 里的 range[1].endOf() 抛异常，整次加载静默失败 ——
                 * 表现就是「日期筛选点了没反应，列表还是老数据」。
                 *
                 * 现在把「半选 / 清空」都当成「回到默认 7 天」：
                 * 用户清空日期时看到的是近 7 天，而不是「全部历史」——
                 * 后者会把首屏那次的慢查询重新引回来。
                 */
                const start = v?.[0];
                const end = v?.[1];
                if (!start || !end) {
                  setRange(buildDefaultRange());
                  setPage(1);
                  return;
                }
                /*
                 * 跨度兜底。
                 *
                 * disabledDate 已经在 UI 上挡住超过 31 天的选择，但它挡不全 ——
                 * 本次选择的第一下点击时 info.from 是空的（还没定下任何一端），
                 * 所以「首屏已有近 7 天区间，用户直接把开始日拖到 300 天前」
                 * 这条路径能绕过 disabledDate，必须在这里兜。
                 *
                 * 夹的方向：保留用户刚选的**开始日**，把结束日收到 start+30。
                 * 反过来（保结束日、把开始日往后挪）出现过一版，实际体验是
                 * 「我明明点了 1 月 1 日，它自己跳走了」—— 和用户意图相反。
                 *
                 * maxEnd 再和「今天」取小：开始日选得很近时（比如今天），
                 * start+30 会落到未来，而库里没有未来日志，没必要发出去。
                 */
                const rawMaxEnd = start.add(MAX_RANGE_DAYS - 1, 'day').endOf('day');
                const today = dayjs();
                const maxEnd = rawMaxEnd.isAfter(today) ? today : rawMaxEnd;
                if (end.diff(start, 'day') > MAX_RANGE_DAYS - 1) {
                  setRange([start.startOf('day'), maxEnd]);
                } else {
                  setRange([start, end]);
                }
                setPage(1);
              }}
              placeholder={['开始日期', '结束日期']}
              /*
               * 限制可选跨度最多 31 天。
               *
               * 为什么要有这个限制：logs 是按天分区的表（线上 100+ 个分区），
               * 时间跨度越大，要扫的分区越多、Count 越慢。跨度放开到「任意区间」时，
               * 用户随手选个大范围就能把一次查询拖到几十秒。
               *
               * ★ 这里踩过一次坑，记下来别再犯：
               *   rc-picker 的 disabledDate 第二个参数是 `{ type, from }`，
               *   其中 from 是**日期对象**（本次选择里用户先定下的那一端，
               *   也就是「另一端」），不是 'start' | 'end' 字符串。
               *   见 node_modules/rc-picker/es/interface.d.ts 的 DisabledDate
               *   与 PickerInput/hooks/useRangeDisabledDate.js —— 后者把
               *   getFromDate(...) 的结果合并进 info 后再回调。
               *   最初写成 `from === 'start'` 判断，条件恒为 false，
               *   等于整段跨度限制一行没生效（只剩 onChange 兜底在夹）。
               *
               * 所以正确写法是：拿到另一端日期后，直接卡「与它相距 ≤ 30 天」
               * （含首尾共 31 天）。from 为空说明本次还没定下任何一端，
               * 第一下随便选，由第二次点击时的 from 来约束。
               *
               * 注意：这里只是交互层约束。若将来支持通过 URL 参数注入区间，
               * 必须在 buildQuery 或后端再补一次跨度校验，别只靠 UI 挡。
               */
              disabledDate={(current, info) => {
                if (!current) return false;
                // 未来日期一律不可选（库里不可能有未来日志）
                if (current.isAfter(dayjs(), 'day')) return true;
                const from = (info as { from?: Dayjs } | undefined)?.from;
                if (from) {
                  return Math.abs(current.diff(from, 'day')) > MAX_RANGE_DAYS - 1;
                }
                return false;
              }}
              /*
               * 关掉 allowClear：清空在语义上是「看全部时间」，
               * 而我们不希望用户无意间触发一次全历史扫描。
               * 想看更早的数据，直接把开始日期往前拖即可（上限 31 天）。
               */
              allowClear={false}
              style={{ width: 250 }}
            />
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => {
                setModelFilter('');
                setTypeFilter(undefined);
                /*
                 * 重置回默认近 7 天，而不是「全部时间」。
                 * 理由同上：全部时间会重新触发全历史扫描。
                 */
                setRange(buildDefaultRange());
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
          // 列宽合计 = 158+104+168+92+92+92+110+90+70+80 = 1056
          scroll: { x: 1056 },
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
