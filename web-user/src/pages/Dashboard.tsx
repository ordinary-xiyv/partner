import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Empty, Switch } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useUser } from '../contexts/UserContext';
import { getLogsStat, getLogsSelfStat, getUserLogs, getLogs, getMyLogDailyTrend } from '../api';
import { getMineBalanceAlert, saveMineBalanceAlert } from '../api/balanceAlert';
import { fetchCatalogModels } from '../api/catalog';
import { renderAmount, renderNumber, formatTime, formatMoneyMajorUnits } from '../utils';
import { getUserDisplayQuota } from '../utils/quotaDisplay';
import { QuotaAmount } from '../components/QuotaAmount';
import BalanceAlertSettingsModal from '../components/balance-alert/BalanceAlertSettingsModal';
import { hasPermission } from '../utils';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import { useCurrency } from '../hooks/useCurrency';
import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';
import { markModelsConsoleEmbed } from '../utils/modelsConsoleEmbed';
import type { LogEntry } from '../types';
import type { CatalogCardDTO } from '../types/catalog';
import type { BalanceAlertMine } from '../types/balanceAlert';
import { openDocsInNewTab } from '../config/docs';
import { normalizeLocale } from '../i18n/resolveLocale';
import { ModelIcon, resolveModelIconName } from '../components/model-picker';
import { logTypeTag } from '../ui/logTypeTag';
import styles from './dashboard/dashboard.module.css';

const shimmerKeyframes = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}`;

function Skeleton({ width, height, style }: { width: string | number; height: string | number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width, height, borderRadius: 6,
      background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 50%, var(--bg-elevated) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      ...style,
    }} />
  );
}

const DASH_RECENT_VISIBLE_ROWS = 3;
const DASH_RECENT_LOG_FETCH_SIZE = 50;
const DASH_CHART_DAY_COUNT = 14;
const DASH_RECOMMEND_COUNT = 3;
/** 最近调用 / 账单消费明细：消耗(2)、退款(6)、预扣(7)、补扣(8) */
const DASH_CONSUME_LOG_TYPES = '2,6,7,8';

function signedLogQuota(log: LogEntry): number {
  const q = Number(log.quota) || 0;
  return log.type === 6 ? -Math.abs(q) : q;
}

/** 推荐模型头图：从左到右 图1 / 图2 / 图3 */
const RECOMMEND_BANNER_IMAGES = [
  '/images/dashboard/recommend-1.png',
  '/images/dashboard/recommend-2.png',
  '/images/dashboard/recommend-3.png',
] as const;

/** 快捷入口图标：API Key / 文档 / 日志（充值入口已下线，原 quick-4 不再使用） */
const QUICK_ENTRY_ICONS = [
  '/images/dashboard/quick/quick-1.svg',
  '/images/dashboard/quick/quick-2.svg',
  '/images/dashboard/quick/quick-3.svg',
] as const;

function bindDashPanelWheelGuard(
  scrollEl: HTMLElement,
  options?: { blockPageWhenNoScroll?: boolean },
): () => void {
  const onWheel = (e: WheelEvent) => {
    const { scrollTop, scrollHeight, clientHeight } = scrollEl;
    const canScroll = scrollHeight > clientHeight + 1;
    if (!canScroll) {
      if (options?.blockPageWhenNoScroll) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const delta = e.deltaY;
    if (delta === 0) return;
    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
    if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  scrollEl.addEventListener('wheel', onWheel, { passive: false });
  return () => scrollEl.removeEventListener('wheel', onWheel);
}

type TrendMetric = 'tokens' | 'count' | 'fee';

interface ChartDataPoint {
  date: string;
  value: number;
}

interface TrendDayPoint {
  date: string;
  tokens: number;
  fee: number;
  count: number;
}

const TREND_METRIC_BAR_COLOR: Record<TrendMetric, string> = {
  tokens: 'var(--theme-color-primary, #6d51ff)',
  count: '#3B82F6',
  fee: '#E8A317',
};

function computeChartScaleMax(values: number[], metric: TrendMetric): { scaleMax: number; hasOutlier: boolean } {
  const floor = metric === 'fee' ? 0.01 : 1;
  const positives = values.filter((v) => v > 0);
  if (positives.length === 0) return { scaleMax: floor, hasOutlier: false };
  const max = Math.max(...positives);
  // Token 柱状图按真实最大值缩放，不做异常值裁切，避免高日被压到刻度顶却显示更大数值
  return { scaleMax: Math.max(max * 1.08, floor), hasOutlier: false };
}

function formatTokenAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function formatFeeAxisValue(value: number, currencySymbol: string): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${currencySymbol}${(value / 1000).toFixed(1)}K`;
  if (abs >= 10) return `${currencySymbol}${value.toFixed(0)}`;
  if (abs >= 1) return `${currencySymbol}${value.toFixed(1)}`;
  if (abs <= 0) return `${currencySymbol}0`;
  return `${currencySymbol}${value.toFixed(2)}`;
}

function formatTrendAxisValue(value: number, metric: TrendMetric, currencySymbol: string): string {
  if (metric === 'fee') return formatFeeAxisValue(value, currencySymbol);
  return formatTokenAxisValue(value);
}

function formatTrendTooltipValue(value: number, metric: TrendMetric, currencySymbol: string): string {
  if (metric === 'fee') return `${currencySymbol}${formatMoneyMajorUnits(value)}`;
  return renderNumber(value);
}

function TrendChartSvg({
  data,
  metric,
  currencySymbol,
  chartScrollRef,
}: {
  data: ChartDataPoint[];
  metric: TrendMetric;
  currencySymbol: string;
  chartScrollRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; value: string; clipped?: boolean } | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const barColor = TREND_METRIC_BAR_COLOR[metric];
  const gradId = `dashBarGrad-${metric}`;

  const W = 600;
  const H = 200;
  const PAD_LEFT = 44;
  const PAD_RIGHT = 16;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 20;
  const plotBaseline = H - PAD_BOTTOM;
  const plotH = plotBaseline - PAD_TOP;
  const plotLeft = PAD_LEFT;
  const plotRight = W - PAD_RIGHT;
  const plotW = plotRight - plotLeft;
  const TOOLTIP_BOX_W = metric === 'fee' ? 120 : 96;
  const TOOLTIP_BOX_H = 24;
  const TOOLTIP_OFFSET = 10;
  const Y_TICK_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;

  const bindChartScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      chartScrollRef.current = el;
    },
    [chartScrollRef],
  );

  useEffect(() => {
    setTooltip(null);
    setActiveIndex(null);
  }, [metric, data]);

  const chartLayout = useMemo(() => {
    if (!data.length) return null;
    const values = data.map((d) => d.value);
    const { scaleMax, hasOutlier } = computeChartScaleMax(values, metric);
    const slotW = plotW / data.length;
    const barW = Math.max(6, Math.min(18, slotW * 0.55));
    const bars = data.map((d, i) => {
      const clipped = d.value > scaleMax;
      const scaled = Math.min(d.value, scaleMax);
      const barH = scaleMax > 0 ? (scaled / scaleMax) * plotH : 0;
      const x = plotLeft + i * slotW + (slotW - barW) / 2;
      const y = plotBaseline - Math.max(barH, d.value > 0 ? 2 : 0);
      return {
        x,
        y,
        width: barW,
        height: Math.max(barH, d.value > 0 ? 2 : 0),
        centerX: x + barW / 2,
        clipped,
      };
    });
    const yTicks = Y_TICK_RATIOS.map((ratio) => {
      const value = scaleMax * (1 - ratio);
      return {
        ratio,
        y: PAD_TOP + ratio * plotH,
        label: formatTrendAxisValue(value, metric, currencySymbol),
      };
    });
    // 横坐标隔天：第 1、3、5… 天（0-based 偶数下标）
    const uniqueLabels = data.map((_, i) => i).filter((i) => i % 2 === 0);
    return { bars, slotW, uniqueLabels, hasOutlier, yTicks };
  }, [currencySymbol, data, metric, plotH, plotLeft, plotW, plotBaseline]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const layout = chartLayout;
      const svg = svgRef.current;
      if (!layout || !svg || !data.length) return;
      const { bars, slotW } = layout;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const { x: mouseX } = pt.matrixTransform(ctm.inverse());
      const idx = Math.max(0, Math.min(bars.length - 1, Math.floor((mouseX - plotLeft) / slotW)));
      const bar = bars[idx];
      setActiveIndex(idx);
      setTooltip({
        x: bar.centerX,
        y: bar.y,
        date: data[idx].date,
        value: formatTrendTooltipValue(data[idx].value, metric, currencySymbol),
        clipped: bar.clipped,
      });
    },
    [chartLayout, currencySymbol, data, metric, plotLeft],
  );

  if (!data.length || !chartLayout) {
    return (
      <div ref={bindChartScrollRef} className={styles.trendChartWrap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>—</span>
      </div>
    );
  }

  const { bars, uniqueLabels, hasOutlier, yTicks } = chartLayout;

  return (
    <div ref={bindChartScrollRef} className={styles.trendChartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', minHeight: 160, display: 'block', cursor: 'crosshair', overflow: 'visible' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setTooltip(null);
          setActiveIndex(null);
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barColor} stopOpacity="0.95" />
            <stop offset="100%" stopColor={barColor} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick.ratio}>
            <line
              x1={plotLeft}
              y1={tick.y}
              x2={plotRight}
              y2={tick.y}
              stroke="var(--border-default)"
              strokeWidth="0.5"
            />
            <text
              x={plotLeft - 6}
              y={tick.y + 3}
              textAnchor="end"
              style={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
            >
              {tick.label}
            </text>
          </g>
        ))}
        {bars.map((bar, i) => (
          <rect
            key={data[i].date}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={Math.min(4, bar.width / 2)}
            ry={Math.min(4, bar.width / 2)}
            fill={`url(#${gradId})`}
            opacity={activeIndex === null || activeIndex === i ? 1 : 0.35}
          />
        ))}
        {hasOutlier && (
          <line
            x1={plotLeft}
            y1={PAD_TOP + 2}
            x2={plotRight}
            y2={PAD_TOP + 2}
            stroke="var(--text-tertiary)"
            strokeWidth="0.75"
            strokeDasharray="4,4"
            strokeOpacity="0.65"
          />
        )}
        {uniqueLabels.map((i) => (
          <text
            key={i}
            x={bars[i].centerX}
            y={H - 4}
            textAnchor="middle"
            style={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
          >
            {data[i].date.slice(5)}
          </text>
        ))}
        {tooltip && (() => {
          const halfW = TOOLTIP_BOX_W / 2;
          const boxX = Math.max(plotLeft, Math.min(plotRight - TOOLTIP_BOX_W, tooltip.x - halfW));
          const labelX = boxX + halfW;
          const showAbove = tooltip.y - TOOLTIP_BOX_H - TOOLTIP_OFFSET >= PAD_TOP + 2;
          const boxY = showAbove
            ? tooltip.y - TOOLTIP_BOX_H - TOOLTIP_OFFSET
            : Math.min(plotBaseline - TOOLTIP_BOX_H, tooltip.y + TOOLTIP_OFFSET);
          const textY = showAbove ? boxY + TOOLTIP_BOX_H - 7 : boxY + 15;
          return (
            <>
              <rect x={boxX} y={boxY} width={TOOLTIP_BOX_W} height={TOOLTIP_BOX_H} rx="4"
                fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth="0.5" />
              <text x={labelX} y={textY} textAnchor="middle"
                style={{ fontSize: 10, fontWeight: 600, fill: 'var(--text-primary)' }}>
                {tooltip.date.slice(5)} {tooltip.value}{tooltip.clipped ? ' ↑' : ''}
              </text>
            </>
          );
        })()}
      </svg>
    </div>
  );
}

function truncateText(text: string, maxLen: number): string {
  const s = text.trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

/** 与模型广场卡片一致：优先 tags，不足时用分类名补齐，最多 3 个 */
function modelCardTags(model: CatalogCardDTO, t: (key: string) => string): string[] {
  const tags: string[] = [];
  for (const tag of model.tags || []) {
    if (tags.length >= 3) break;
    const trimmed = String(tag).trim();
    if (trimmed && !tags.includes(trimmed)) tags.push(trimmed);
  }
  if (tags.length === 0 && model.category) {
    const catKey = `catalog.category.${model.category}`;
    const label = t(catKey);
    tags.push(label === catKey ? model.category : label);
  }
  if (tags.length === 0 && model.usage_description) {
    tags.push(truncateText(model.usage_description, 8));
  }
  return tags.slice(0, 3);
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const qpu = useQuotaPerUnit();
  const cc = useCurrency();
  const navigate = useNavigate();
  const [stat, setStat] = useState<{ quota: number; rpm: number; tpm: number } | null>(null);
  const [trendDays, setTrendDays] = useState<TrendDayPoint[]>([]);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('tokens');
  const [chartLoading, setChartLoading] = useState(true);
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [featuredModels, setFeaturedModels] = useState<CatalogCardDTO[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [balanceAlertEnabled, setBalanceAlertEnabled] = useState(false);
  const [balanceAlertMine, setBalanceAlertMine] = useState<BalanceAlertMine | null>(null);
  const [balanceAlertSaving, setBalanceAlertSaving] = useState(false);
  const [balanceAlertModalOpen, setBalanceAlertModalOpen] = useState(false);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const canReadAllLogs = hasPermission(user, 'log_read_all');
  const displayQuota = getUserDisplayQuota(user);
  // 「账户充值」按钮与快捷入口「充值」已下线（个人、企业一视同仁）。
  // 充值页 /topup、对公充值页 /org/bank-transfer 的路由仍在，这里只是不再给入口。

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';
  const dateStr = useMemo(
    () =>
      new Date().toLocaleDateString(normalizeLocale(i18n.language), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }),
    [i18n.language],
  );

  useEffect(() => {
    (async () => {
      try {
        const api = canReadAllLogs ? getLogsStat : getLogsSelfStat;
        const res = await api();
        if (res.data.success) setStat(res.data.data);
      } catch { /* ignore */ }
    })();
  }, [canReadAllLogs]);

  useEffect(() => {
    (async () => {
      try {
        // 数据源：日志每日汇总表（仅当前用户），一次请求出全部数据，
        // 避免对日志表按天 COUNT + 全量分页扫描；
        // 范围为过去 14 天，不含今天（汇总任务凌晨才聚合昨天）。
        const today = dayjs().startOf('day');
        const res = await getMyLogDailyTrend({
          start_date: today.subtract(DASH_CHART_DAY_COUNT, 'day').format('YYYY-MM-DD'),
          end_date: today.subtract(1, 'day').format('YYYY-MM-DD'),
        });
        type TrendRow = {
          summary_date?: string;
          model_name?: string;
          prompt_tokens?: number;
          completion_tokens?: number;
          request_count?: number;
          quota?: number;
        };
        const items = res.data.success ? res.data.data?.items : undefined;
        if (Array.isArray(items)) {
          const byDay = new Map<string, TrendRow>();
          for (const r of items as TrendRow[]) {
            if (typeof r.summary_date !== 'string') continue;
            const date = r.summary_date.slice(0, 10);
            const previous = byDay.get(date);
            byDay.set(date, {
              prompt_tokens: (previous?.prompt_tokens ?? 0) + (r.prompt_tokens ?? 0),
              completion_tokens: (previous?.completion_tokens ?? 0) + (r.completion_tokens ?? 0),
              request_count: (previous?.request_count ?? 0) + (r.request_count ?? 0),
              quota: (previous?.quota ?? 0) + (r.quota ?? 0),
            });
          }
          const series: TrendDayPoint[] = [];
          for (let i = DASH_CHART_DAY_COUNT; i >= 1; i--) {
            const date = today.subtract(i, 'day').format('YYYY-MM-DD');
            const row = byDay.get(date);
            series.push({
              date,
              tokens: (row?.prompt_tokens ?? 0) + (row?.completion_tokens ?? 0),
              fee: ((row?.quota ?? 0) / qpu) * cc.rate,
              count: row?.request_count ?? 0,
            });
          }
          setTrendDays(series);
        }
      } catch { /* ignore */ }
      finally { setChartLoading(false); }
    })();
  }, [qpu, cc.rate]);

  useEffect(() => {
    (async () => {
      try {
        const api = canReadAllLogs ? getLogs : getUserLogs;
        const res = await api({
          p: 1,
          page_size: DASH_RECENT_LOG_FETCH_SIZE,
          type: DASH_CONSUME_LOG_TYPES,
        });
        if (res.data.success) {
          setRecentLogs(res.data.data?.items || []);
        }
      } catch { /* ignore */ }
      setLogsLoading(false);
    })();
  }, [canReadAllLogs]);

  // 推荐模型：优先精选；不足 3 个时用广场列表补全（去重）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [featuredRes, plazaRes] = await Promise.all([
          fetchCatalogModels({
            featured: true,
            include_unavailable: false,
            page: 1,
            page_size: 20,
          }),
          fetchCatalogModels({
            include_unavailable: false,
            page: 1,
            page_size: 20,
          }),
        ]);
        if (cancelled) return;

        const featuredOnly = (featuredRes.items || []).filter((m) => m.featured);
        const seen = new Set<number>();
        const merged: CatalogCardDTO[] = [];

        for (const m of featuredOnly) {
          if (merged.length >= DASH_RECOMMEND_COUNT) break;
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          merged.push(m);
        }
        for (const m of plazaRes.items || []) {
          if (merged.length >= DASH_RECOMMEND_COUNT) break;
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          merged.push(m);
        }

        setFeaturedModels(merged);
      } catch { /* ignore */ }
      if (!cancelled) setFeaturedLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const chartEl = chartScrollRef.current;
    if (!chartEl) return undefined;
    chartEl.style.overscrollBehavior = 'contain';
    return bindDashPanelWheelGuard(chartEl, { blockPageWhenNoScroll: true });
  }, [chartLoading, trendDays.length]);

  const displayRecentLogs = useMemo(
    () =>
      recentLogs
        .filter((log) => String(log.model_name ?? '').trim().length > 0)
        .slice(0, DASH_RECENT_VISIBLE_ROWS),
    [recentLogs],
  );

  const recentLogRowKey = useCallback(
    (log: LogEntry, index?: number) =>
      log.request_id
      || (log.id > 0 ? `${log.id}-${log.created_at}` : `recent-${index ?? 0}-${log.created_at}-${log.quota}-${log.model_name}`),
    [],
  );

  const quotaLimit = user?.quota_display?.quota_limit;
  const totalQuota = quotaLimit && quotaLimit > 0
    ? Number(quotaLimit)
    : displayQuota + (user?.used_quota || 0);
  const usedPercent = totalQuota > 0 ? Math.min(100, ((user?.used_quota || 0) / totalQuota) * 100) : 0;

  const chartData = useMemo<ChartDataPoint[]>(
    () => trendDays.map((d) => ({
      date: d.date,
      value: trendMetric === 'count' ? d.count : trendMetric === 'fee' ? d.fee : d.tokens,
    })),
    [trendDays, trendMetric],
  );

  const trendTokenTotal = useMemo(
    () => trendDays.reduce((sum, d) => sum + (d.tokens || 0), 0),
    [trendDays],
  );

  const trendRequestTotal = useMemo(
    () => trendDays.reduce((sum, d) => sum + (d.count || 0), 0),
    [trendDays],
  );

  const trendFeeTotal = useMemo(
    () => trendDays.reduce((sum, d) => sum + (d.fee || 0), 0),
    [trendDays],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMineBalanceAlert();
        if (cancelled || !res.data.success || !res.data.data) return;
        setBalanceAlertMine(res.data.data);
        setBalanceAlertEnabled(res.data.data.enabled);
      } catch {
        /* ignore — switch stays off until settings modal loads */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBalanceAlertChange = async (checked: boolean) => {
    let mine = balanceAlertMine;
    if (!mine) {
      setBalanceAlertSaving(true);
      try {
        const res = await getMineBalanceAlert();
        if (!res.data.success || !res.data.data) {
          notifyApiError(res.data.message, { fallbackKey: 'balanceAlert.loadFailed' });
          return;
        }
        mine = res.data.data;
        setBalanceAlertMine(mine);
      } catch (err) {
        notifyApiErrorFromErr(err, { fallbackKey: 'balanceAlert.loadFailed' });
        return;
      } finally {
        setBalanceAlertSaving(false);
      }
    }

    if (checked) {
      // 短信渠道暂未开放：仅依赖邮箱绑定
      const emailBound = mine.email.bound;
      if (!emailBound) {
        setBalanceAlertModalOpen(true);
        return;
      }

      setBalanceAlertSaving(true);
      try {
        const res = await saveMineBalanceAlert({
          enabled: true,
          threshold_amount: mine.threshold_amount,
          sms_enabled: false, // 短信渠道暂未开放
          email_enabled: true,
        });
        if (res.data.success && res.data.data) {
          const saved = res.data.data;
          setBalanceAlertEnabled(true);
          setBalanceAlertMine((prev) =>
            prev
              ? {
                  ...prev,
                  enabled: true,
                  threshold_amount: saved.threshold_amount,
                  sms: { ...prev.sms, enabled: saved.sms_enabled },
                  email: { ...prev.email, enabled: saved.email_enabled },
                }
              : {
                  ...mine!,
                  enabled: true,
                  threshold_amount: saved.threshold_amount,
                  sms: { ...mine!.sms, enabled: saved.sms_enabled },
                  email: { ...mine!.email, enabled: saved.email_enabled },
                },
          );
          notifyApiSuccess(t('balanceAlert.enabledToast'));
        } else {
          notifyApiError(res.data.message);
        }
      } catch (err) {
        notifyApiErrorFromErr(err);
      } finally {
        setBalanceAlertSaving(false);
      }
      return;
    }

    setBalanceAlertSaving(true);
    try {
      const res = await saveMineBalanceAlert({
        enabled: false,
        threshold_amount: mine.threshold_amount,
        sms_enabled: false, // 短信渠道暂未开放
        email_enabled: mine.email.enabled,
      });
      if (res.data.success && res.data.data) {
        setBalanceAlertEnabled(false);
        setBalanceAlertMine((prev) =>
          prev
            ? {
                ...prev,
                enabled: false,
                threshold_amount: res.data.data!.threshold_amount,
                sms: { ...prev.sms, enabled: res.data.data!.sms_enabled },
                email: { ...prev.email, enabled: res.data.data!.email_enabled },
              }
            : prev,
        );
      } else {
        notifyApiError(res.data.message);
      }
    } catch (err) {
      notifyApiErrorFromErr(err);
    } finally {
      setBalanceAlertSaving(false);
    }
  };

  const handleBalanceAlertSaved = (enabled: boolean) => {
    setBalanceAlertEnabled(enabled);
    void getMineBalanceAlert()
      .then((res) => {
        if (res.data.success && res.data.data) {
          setBalanceAlertMine(res.data.data);
          setBalanceAlertEnabled(res.data.data.enabled);
        }
      })
      .catch(() => {
        /* keep local enabled from save result */
      });
  };

  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div className={styles.page}>
        {/* Row 1: 概览 + 趋势 */}
        <div className={styles.topRow}>
          <div className={`lynx-interactive-card ${styles.overviewCard}`}>
            <div className={styles.overviewHero}>
              <div className={styles.overviewLeft}>
                <div className={styles.overviewTitle}>{t('overview')}</div>
                <h1 className={styles.overviewGreeting}>
                  {t(greetingKey)}，{user?.display_name || user?.username}
                </h1>
                <p className={styles.overviewDate}>{dateStr}</p>
                <div className={styles.overviewActions}>
                  <button type="button" className={styles.btnPrimary} onClick={() => navigate('/tokens')}>
                    {t('createTokenAction')}
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={() => openDocsInNewTab()}>
                    {t('viewDocs')}
                  </button>
                </div>
              </div>

              <div className={styles.balancePanel}>
                <div className={styles.balancePanelHead}>
                  <span className={styles.balanceLabel}>{t('currentBalance')}</span>
                </div>
                <div className={styles.balanceAmount}>
                  <QuotaAmount
                    quotaUnits={displayQuota}
                    qpu={qpu}
                    digits={4}
                    showOverdraftLabel
                    style={{ fontWeight: 400 }}
                  />
                </div>
                <div className={styles.balanceAlertRow}>
                  <span className={styles.balanceAlertLabel}>{t('availableBalanceAlert')}</span>
                  <Switch
                    size="small"
                    checked={balanceAlertEnabled}
                    loading={balanceAlertSaving}
                    onChange={(checked) => void handleBalanceAlertChange(checked)}
                  />
                  <button
                    type="button"
                    className={styles.balanceAlertSettingsBtn}
                    aria-label={t('balanceAlert.settingsTitle')}
                    onClick={() => setBalanceAlertModalOpen(true)}
                  >
                    <SettingOutlined />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className={styles.overviewProgress}>
                <div
                  className={styles.overviewProgressFill}
                  style={{
                    width: `${usedPercent}%`,
                    background: usedPercent > 80 ? '#f87171' : undefined,
                  }}
                />
              </div>
              <div className={styles.overviewMetrics}>
                <div className={styles.metricItem}>
                  <div className={styles.metricLabel}>{t('usedQuota')}</div>
                  <div className={styles.metricValue}>{renderAmount(user?.used_quota || 0, 4, qpu)}</div>
                </div>
                <div className={`${styles.metricItem} ${styles.metricItemCenter}`}>
                  <div className={styles.metricLabel}>{t('tpm')}</div>
                  <div className={`${styles.metricValue} ${styles.metricValueCenter}`}>
                    {renderNumber(stat?.tpm || 0)}
                  </div>
                </div>
                <div className={`${styles.metricItem} ${styles.metricItemRight}`}>
                  <div className={styles.metricLabel}>{t('requestCount')}</div>
                  <div className={styles.metricValue}>{renderNumber(user?.request_count || 0)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className={`lynx-interactive-card ${styles.trendCard}`}>
            <h2 className={styles.trendTitle}>{t('dashboard.trend14Days')}</h2>
            <div className={styles.trendStats}>
              <div className={styles.trendStat}>
                <span className={styles.trendStatLabel}>{t('dashboard.tokensLabel')}</span>
                <span className={styles.trendStatValue}>
                  {chartLoading ? '…' : renderNumber(trendTokenTotal)}
                </span>
              </div>
              <div className={styles.trendStat}>
                <span className={styles.trendStatLabel}>{t('requestCount')}</span>
                <span className={styles.trendStatValue}>
                  {chartLoading ? '…' : renderNumber(trendRequestTotal)}
                </span>
              </div>
              <div className={styles.trendStat}>
                <span className={styles.trendStatLabel}>{t('dashboard.feeLabel')}</span>
                <span className={styles.trendStatValue}>
                  {chartLoading ? '…' : `${cc.symbol}${formatMoneyMajorUnits(trendFeeTotal)}`}
                </span>
              </div>
            </div>
            {chartLoading ? (
              <div className={styles.trendChartWrap}>
                <Skeleton width="100%" height="100%" style={{ minHeight: 160 }} />
              </div>
            ) : chartData.length === 0 ? (
              <div className={styles.trendChartWrap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{t('noChartData')}</span>
              </div>
            ) : (
              <TrendChartSvg
                data={chartData}
                metric={trendMetric}
                currencySymbol={cc.symbol}
                chartScrollRef={chartScrollRef}
              />
            )}
            <div className={styles.trendLegend} role="tablist" aria-label={t('dashboard.trend14Days')}>
              {([
                { key: 'tokens' as const, label: t('dashboard.callVolumeToken'), dotClass: styles.trendLegendDotTokens },
                { key: 'count' as const, label: t('requestCount'), dotClass: styles.trendLegendDotCount },
                { key: 'fee' as const, label: t('dashboard.feeLabel'), dotClass: styles.trendLegendDotFee },
              ]).map((item) => {
                const isActive = trendMetric === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`${styles.trendLegendItem}${isActive ? ` ${styles.trendLegendItemActive}` : ''}`}
                    onClick={() => setTrendMetric(item.key)}
                  >
                    <span className={`${styles.trendLegendDot} ${item.dotClass}`} />
                    <span className={`${styles.trendLegendText}${isActive ? ` ${styles.trendLegendTextActive}` : ''}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 2–3: 推荐模型 */}
        <div className={styles.recommendHeader}>
          <h2 className={styles.recommendTitle}>{t('dashboard.recommendedModels')}</h2>
          <button type="button" className={styles.btnViewAllModels} onClick={() => {
            markModelsConsoleEmbed();
            navigate('/models');
          }}>
            {t('dashboard.viewAllModels')}
            <span aria-hidden>→</span>
          </button>
        </div>

        <div className={styles.recommendGrid}>
          {featuredLoading ? (
            Array.from({ length: DASH_RECOMMEND_COUNT }, (_, i) => (
              <div key={`sk-model-${i}`} className={styles.recommendCard} style={{ cursor: 'default' }}>
                <div
                  className={styles.recommendBanner}
                  style={{ backgroundImage: `url(${RECOMMEND_BANNER_IMAGES[i]})` }}
                />
                <div className={styles.recommendBody}>
                  <Skeleton width="60%" height={24} />
                  <Skeleton width="100%" height={40} style={{ marginTop: 12 }} />
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                    <Skeleton width={80} height={28} />
                    <Skeleton width={80} height={28} />
                  </div>
                </div>
              </div>
            ))
          ) : featuredModels.length === 0 ? (
            <div className={styles.recommendEmpty}>{t('dashboard.noRecommendedModels')}</div>
          ) : (
            featuredModels.map((model, index) => {
              const tags = modelCardTags(model, t);
              const desc = truncateText(model.description || model.usage_description || '', 72);
              const banner = RECOMMEND_BANNER_IMAGES[index] ?? RECOMMEND_BANNER_IMAGES[0];
              return (
                <button
                  key={model.id}
                  type="button"
                  className={styles.recommendCard}
                  style={{ cursor: 'default' }}
                  // onClick={() => navigate(`/models?open=${model.id}`)}
                >
                  <div
                    className={styles.recommendBanner}
                    style={{ backgroundImage: `url(${banner})` }}
                  />
                  <div className={styles.recommendBody}>
                    <h3 className={styles.recommendName} title={model.name}>{model.name}</h3>
                    <p className={styles.recommendDesc}>{desc || t('dashboard.noModelDesc')}</p>
                    <div className={styles.recommendTags}>
                      {tags.map((tag) => (
                        <span key={tag} className={styles.recommendTag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Row 4: 快捷入口 + 最近调用 */}
        <div className={styles.bottomRow}>
          <div className={`lynx-interactive-card ${styles.quickCard}`}>
            <h2 className={styles.sectionTitle}>{t('dashboard.quickEntry')}</h2>
            <div className={styles.quickGrid}>
              <button type="button" className={styles.quickItem} onClick={() => navigate('/tokens')}>
                <span
                  className={styles.quickIcon}
                  style={{ WebkitMaskImage: `url(${QUICK_ENTRY_ICONS[0]})`, maskImage: `url(${QUICK_ENTRY_ICONS[0]})` }}
                  aria-hidden
                />
                {t('dashboard.apiKeyManage')}
              </button>
              <button type="button" className={styles.quickItem} onClick={() => openDocsInNewTab()}>
                <span
                  className={styles.quickIcon}
                  style={{ WebkitMaskImage: `url(${QUICK_ENTRY_ICONS[1]})`, maskImage: `url(${QUICK_ENTRY_ICONS[1]})` }}
                  aria-hidden
                />
                {t('dashboard.viewDevDocs')}
              </button>
              <button type="button" className={styles.quickItem} onClick={() => navigate('/logs')}>
                <span
                  className={styles.quickIcon}
                  style={{ WebkitMaskImage: `url(${QUICK_ENTRY_ICONS[2]})`, maskImage: `url(${QUICK_ENTRY_ICONS[2]})` }}
                  aria-hidden
                />
                {t('dashboard.callLogs')}
              </button>
            </div>
          </div>

          <div className={`lynx-interactive-card ${styles.recentCard}`}>
            <div className={styles.recentHeader}>
              <h2 className={styles.sectionTitle}>{t('recentActivity')}</h2>
              <button type="button" className={styles.recentViewAll} onClick={() => navigate('/logs')}>
                {t('viewAll')}
                <span aria-hidden>→</span>
              </button>
            </div>
            <div className={styles.recentList}>
              {logsLoading ? (
                Array.from({ length: DASH_RECENT_VISIBLE_ROWS }, (_, i) => (
                  <div key={`sk-log-${i}`} className={styles.recentRow}>
                    <div className={styles.recentModelCell}>
                      <Skeleton width={20} height={20} style={{ borderRadius: 4, flexShrink: 0 }} />
                      <Skeleton width="70%" height={14} />
                    </div>
                    <Skeleton width={48} height={20} />
                    <Skeleton width={56} height={14} />
                    <Skeleton width={96} height={14} />
                  </div>
                ))
              ) : displayRecentLogs.length === 0 ? (
                <div className={styles.recentEmpty}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('noActivityYet')} />
                </div>
              ) : (
                displayRecentLogs.map((log, index) => {
                  const when = dayjs.unix(log.created_at);
                  const modelName = String(log.model_name ?? '').trim();
                  return (
                    <div key={recentLogRowKey(log, index)} className={styles.recentRow}>
                      <div className={styles.recentModelCell}>
                        <ModelIcon
                          label={modelName}
                          iconName={resolveModelIconName(undefined, modelName)}
                          className={styles.recentModelIcon}
                        />
                        <span className={styles.recentModel} title={modelName}>{modelName}</span>
                      </div>
                      <span className={styles.recentType}>{logTypeTag(log.type, t)}</span>
                      <span className={styles.recentAmount}>{renderAmount(signedLogQuota(log), 4, qpu)}</span>
                      <span className={styles.recentTime} title={formatTime(log.created_at)}>
                        {when.format('MM-DD HH:mm:ss')}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <BalanceAlertSettingsModal
        open={balanceAlertModalOpen}
        onClose={() => setBalanceAlertModalOpen(false)}
        onSaved={handleBalanceAlertSaved}
      />
    </>
  );
}
