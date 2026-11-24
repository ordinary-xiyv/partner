import React, { useEffect, useState } from 'react';
import { Button, Typography } from 'antd';
import {
  ArrowUpOutlined,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  AppPageHeader,
  BarChart,
  PagePanel,
  PageStack,
  StatCard,
  dealerApi,
  formatCompact,
  formatMoney,
  formatQuotaAsMoney,
  notifyApiError,
  quotaToCny,
} from '@lynx/shared';
import type { OverviewStats, TrendPoint, DealerProfile } from '@lynx/shared';
import { useDealerAuth } from '../auth';

const { Text } = Typography;

export default function Overview() {
  const { profile } = useDealerAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        dealerApi.fetchOverview(),
        dealerApi.fetchOverviewTrend(),
      ]);
      setStats(s);
      setTrend(t);
    } catch (err) {
      notifyApiError(err, '概览加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const p = profile as DealerProfile | null;

  /*
   * 数据区间文案。
   * 后端 billing 默认「本月 1 号 ~ 今天」，所以「本月」这几个字是准确的；
   * 把具体区间标出来，是为了让对账的人知道这数字截止到哪一天。
   */
  const rangeText = stats?.start_date ? `${stats.start_date} ~ ${stats.end_date}` : '本月';

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title="数据概览"
        subtitle={
          stats?.start_date
            ? `统计区间 ${rangeText}，点刷新可拉取最新数据`
            : '你的客户经营状况一览'
        }
        actions={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
            刷新
          </Button>
        }
      />

      {/*
       * 身份条只显示后端真的有的字段：商户名 + 商户编码。
       *
       * 上一版这里有「钻石代理 / 累计佣金 ¥0.00 / 待结算 / 已结算」四个块，
       * 全部来自前端硬编码（level 写死 'diamond'，佣金类字段后端一个都不返回），
       * 看起来像真实经营数据。已经整体删掉 —— 想恢复必须先让后端返回这些数字。
       */}
      <PagePanel padded style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--accent-primary-rgba-12, rgba(109,81,254,0.12))',
              color: 'var(--accent-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            {(p?.display_name || 'P').slice(0, 1)}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {p?.display_name || '-'}
            </div>
            <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              商户编码 {p?.merchant_code || '-'}
            </Text>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
          <MiniStat label="名下客户" value={formatCompact(stats?.customer_count ?? 0)} />
          <MiniStat label="本月活跃客户" value={formatCompact(stats?.month_active_users ?? 0)} accent />
          <MiniStat label="统计区间" value={stats?.end_date ? rangeText : '—'} small />
        </div>
      </PagePanel>

      {/* 四张核心指标卡 —— 每个数字都能在接口里指到出处 */}
      <div className="lynx-stat-grid">
        <StatCard
          label="我的客户"
          icon={<TeamOutlined />}
          value={formatCompact(stats?.customer_count ?? 0)}
          hint="名下全部客户账号"
        />
        <StatCard
          label="本月消耗"
          icon={<ThunderboltOutlined />}
          value={formatQuotaAsMoney(stats?.month_quota ?? 0)}
          hint={stats ? `净消耗，${stats.start_date} 起` : '—'}
        />
        <StatCard
          label="本月请求"
          icon={<ArrowUpOutlined />}
          value={formatCompact(stats?.month_requests ?? 0)}
          hint={stats ? `${stats.month_active_users} 个客户有调用` : '—'}
        />
        <StatCard
          label="本月消费金额"
          icon={<WalletOutlined />}
          value={formatMoney(stats?.month_amount_cny ?? 0)}
          hint="账单口径，含退款冲销"
        />
      </div>

      {/* 14 天趋势 */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16 }}
        className="lynx-overview-charts"
      >
        <BarChart
          title="近 14 天消耗趋势"
          subtitle="单位：元 · 截止昨天"
          data={trend.map((d) => ({
            label: d.summary_date.slice(5),
            value: Math.round((d.amount_cny ?? quotaToCny(d.quota)) * 100) / 100,
          }))}
          formatValue={(v) => formatMoney(v)}
        />
        <PagePanel padded>
          <div className="lynx-section-title">数据说明</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TipRow
              icon={<ThunderboltOutlined />}
              title="消耗口径"
              desc="按账单口径统计：消费 + 预扣 + 补扣 − 退款。与单条日志的 quota 直接相加不同。"
            />
            <TipRow
              icon={<ArrowUpOutlined />}
              title="趋势不含今天"
              desc="趋势取近 14 个已完成的自然日，今天的消耗要到次日汇总后才会出现在这里。"
            />
          </div>
        </PagePanel>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .lynx-overview-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </PageStack>
  );
}

function MiniStat({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: small ? 13 : 17,
          fontWeight: 700,
          color: accent ? 'var(--accent-primary)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TipRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 13,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}
