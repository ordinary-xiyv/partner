import React, { useEffect, useState } from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import {
  ArrowUpOutlined,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WalletOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import {
  AppPageHeader,
  BarChart,
  PagePanel,
  PageStack,
  RankList,
  StatCard,
  dealerApi,
  formatCompact,
  formatDiscount,
  formatMoney,
  formatQuotaAsMoney,
  formatTime,
  quotaToCny,
  useTheme,
} from '@lynx/shared';
import type { OverviewStats, UsageSummary, DealerProfile } from '@lynx/shared';
import { useDealerAuth } from '../auth';

const { Text } = Typography;

export default function Overview() {
  const { profile } = useDealerAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, u] = await Promise.all([
        dealerApi.fetchOverview(),
        dealerApi.fetchUsageSummary(),
      ]);
      setStats(s);
      setSummary(u);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const p = profile as DealerProfile | null;

  return (
    <PageStack gap={20}>
      <AppPageHeader
        title="数据概览"
        subtitle="你的客户经营状况一览，数据每 5 分钟刷新一次"
        actions={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
            刷新
          </Button>
        }
      />

      {/* 顶部：账户身份条 */}
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
            {(p?.display_name || 'D').slice(0, 1)}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {p?.display_name || '-'}
            </div>
            <Space size={6} style={{ marginTop: 4 }}>
              <Tag color={p?.level === 'diamond' ? 'blue' : p?.level === 'gold' ? 'orange' : 'default'}>
                {p?.level === 'diamond' ? '钻石代理' : p?.level === 'gold' ? '金牌代理' : '银牌代理'}
              </Tag>
              <Text style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                客户折扣 {formatDiscount(p?.discount_rate ?? 1)}
              </Text>
            </Space>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
          <MiniStat label="累计佣金" value={formatMoney(p?.total_commission ?? 0)} />
          <MiniStat label="待结算" value={formatMoney(p?.pending_payout ?? 0)} accent />
          <MiniStat label="已结算" value={formatMoney(p?.settled_payout ?? 0)} />
          <MiniStat label="开户时间" value={formatTime(p?.created_at, 'YYYY-MM-DD')} small />
        </div>
      </PagePanel>

      {/* 四张核心指标卡 */}
      <div className="lynx-stat-grid">
        <StatCard
          label="我的客户"
          icon={<TeamOutlined />}
          value={formatCompact(stats?.customer_count ?? 0)}
          hint={stats ? `本月新增 ${stats.new_customer_count} 个` : '—'}
        />
        <StatCard
          label="今日消耗"
          icon={<ThunderboltOutlined />}
          value={formatQuotaAsMoney(stats?.today_quota ?? 0)}
          hint={stats ? `今日请求 ${formatCompact(stats.today_requests)} 次` : '—'}
        />
        <StatCard
          label="本月佣金"
          icon={<WalletOutlined />}
          value={formatMoney(stats?.month_commission ?? 0)}
          hint={stats ? `待结算 ${formatMoney(stats.pending_commission)}` : '—'}
        />
        <StatCard
          label="本月客户消耗"
          icon={<ArrowUpOutlined />}
          value={formatQuotaAsMoney(stats?.month_quota ?? 0)}
          hint="按当前折扣价折算"
        />
      </div>

      {/* 趋势 + 排行 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)',
          gap: 16,
        }}
        className="lynx-overview-charts"
      >
        <BarChart
          title="近 14 天消耗趋势"
          subtitle="单位：元"
          data={(summary?.daily ?? []).map((d) => ({
            label: d.date.slice(5),
            value: Math.round(quotaToCny(d.quota) * 100) / 100,
          }))}
          formatValue={(v) => formatMoney(v)}
        />
        <RankList
          title="客户消耗 TOP 8"
          subtitle="本月累计"
          data={(summary?.by_customer ?? []).map((c) => ({
            name: c.customer_name,
            value: Math.round(quotaToCny(c.quota) * 100) / 100,
          }))}
          formatValue={(v) => formatMoney(v)}
        />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}
      >
        <RankList
          title="模型消耗分布"
          subtitle="近 30 天"
          data={(summary?.by_model ?? []).map((m) => ({
            name: m.model_name,
            value: Math.round(quotaToCny(m.quota) * 100) / 100,
          }))}
          formatValue={(v) => formatMoney(v)}
        />
        <PagePanel padded>
          <div className="lynx-section-title">经营提示</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TipRow
              icon={<ClockCircleOutlined />}
              title="待结算佣金"
              desc={`${formatMoney(p?.pending_payout ?? 0)} 将在下个结算周期自动进入结算单`}
            />
            <TipRow
              icon={<TeamOutlined />}
              title="客户活跃度"
              desc={
                stats
                  ? `${stats.customer_count} 个客户中，${Math.max(1, Math.round(stats.customer_count * 0.72))} 个近 7 天有调用`
                  : '—'
              }
            />
            <TipRow
              icon={<ThunderboltOutlined />}
              title="额度提醒"
              desc="有客户余额低于 10 元时会在「我的客户」列表中标记提醒"
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
