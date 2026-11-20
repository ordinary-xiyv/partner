import React from 'react';
import './stats.css';

/** 指标卡：label + 大数字 + 提示。数值统一 tabular-nums 对齐 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  small = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** 涨跌：正数显示红色（国内习惯），负数绿色 */
  trend?: number;
  small?: boolean;
}) {
  return (
    <div className="lynx-stat-card">
      <div className="lynx-stat-card__label">
        {icon ? <span style={{ fontSize: 13, display: 'inline-flex' }}>{icon}</span> : null}
        {label}
      </div>
      <div className={['lynx-stat-card__value', small ? 'lynx-stat-card__value--sm' : ''].filter(Boolean).join(' ')}>
        {value}
      </div>
      {trend !== undefined ? (
        <div
          className={[
            'lynx-stat-card__trend',
            trend >= 0 ? 'lynx-stat-card__trend--up' : 'lynx-stat-card__trend--down',
          ].join(' ')}
        >
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          {hint ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 4 }}>{hint}</span> : null}
        </div>
      ) : hint ? (
        <div className="lynx-stat-card__hint">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * 柱状图：纯 CSS/SVG，无额外图表库依赖。
 * 顶部标注峰值、底部给日期，中间不加网格线，避免视觉噪音。
 */
export function BarChart({
  title,
  subtitle,
  data,
  formatValue = (v: number) => String(v),
  action,
}: {
  title: string;
  subtitle?: string;
  data: Array<{ label: string; value: number }>;
  formatValue?: (v: number) => string;
  action?: React.ReactNode;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  /** 容器实际宽度：标签密度要按真实可用宽度算，不能拍脑袋写死根数 */
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = React.useState(0);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setChartWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /**
   * X 轴标签密度：柱子一多，每根柱子只有十几像素，日期全画上去必然互相挤压。
   * 标签本身用绝对定位居中（不再受柱子宽度裁切），这里只负责控制「隔几根显示一个」，
   * 保证相邻两个可见标签之间的间距 >= 一个标签的宽度（约 34px）。
   */
  const labelStep = Math.max(1, Math.ceil((data.length * 34) / Math.max(320, chartWidth)));
  return (
    <div className="lynx-chart" ref={wrapRef}>
      <div className="lynx-chart__head">
        <div>
          <div className="lynx-chart__title">{title}</div>
          {subtitle ? <div className="lynx-chart__sub">{subtitle}</div> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {action}
          <span className="lynx-chart__peak" title="区间内最高值">
            峰值 {formatValue(max)}
          </span>
        </div>
      </div>
      <div className="lynx-chart__body">
        <div className="lynx-bars">
          {data.map((d, i) => (
            <div
              className="lynx-bars__col"
              key={`${d.label}-${i}`}
              title={`${d.label}: ${formatValue(d.value)}`}
            >
              <div className="lynx-bars__value">{formatValue(d.value)}</div>
              <div
                className="lynx-bars__bar"
                style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
              />
              <div className="lynx-bars__x">{i % labelStep === 0 ? d.label : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 横向排行条 */
export function RankList({
  title,
  subtitle,
  data,
  formatValue = (v: number) => String(v),
  emptyText = '暂无数据',
  action,
}: {
  title: string;
  subtitle?: string;
  data: Array<{ name: string; value: number }>;
  formatValue?: (v: number) => string;
  emptyText?: string;
  action?: React.ReactNode;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="lynx-chart">
      <div className="lynx-chart__head">
        <div>
          <div className="lynx-chart__title">{title}</div>
          {subtitle ? <div className="lynx-chart__sub">{subtitle}</div> : null}
        </div>
        {action}
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '20px 0' }}>{emptyText}</div>
      ) : (
        <div className="lynx-ranks">
          {data.map((d, i) => (
            <div className="lynx-ranks__row" key={`${d.name}-${i}`}>
              <div className="lynx-ranks__meta">
                <span className="lynx-ranks__name">{d.name}</span>
                <span className="lynx-ranks__value">{formatValue(d.value)}</span>
              </div>
              <div className="lynx-ranks__track">
                <div className="lynx-ranks__fill" style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 详情网格：标签 + 值 */
export function DescGrid({
  items,
  columns,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
  columns?: number;
}) {
  return (
    <div
      className="lynx-desc-grid"
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {items.map((it, i) => (
        <div className="lynx-desc-item" key={`${it.label}-${i}`}>
          <span className="lynx-desc-item__label">{it.label}</span>
          <span className="lynx-desc-item__value">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
