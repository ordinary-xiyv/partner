import type { ReactNode } from 'react';
import { TOKEN_STAT_PLACEHOLDER_IMAGES } from './tokenStatPlaceholders';

export interface TokenStatSummaryLabels {
  total: string;
  totalDesc: string;
  enabled: string;
  enabledDesc: string;
  expiringSoon: string;
  expiringSoonDesc: string;
  spend7d: string;
  spend7dDesc: string;
}

export interface TokenStatSummaryProps {
  totalCount: number;
  enabledCount: number;
  expiringSoonCount: number;
  /** 近 7 天消费展示文案（已含货币符号） */
  spend7dDisplay: string;
  labels: TokenStatSummaryLabels;
}

/** 令牌管理页顶部统计卡片（对齐设计稿） */
export function TokenStatSummary({
  totalCount,
  enabledCount,
  expiringSoonCount,
  spend7dDisplay,
  labels,
}: TokenStatSummaryProps) {
  const cards: Array<{
    key: string;
    label: string;
    value: ReactNode;
    desc: string;
    icon: ReactNode;
  }> = [
    {
      key: 'total',
      label: labels.total,
      value: totalCount,
      desc: labels.totalDesc,
      icon: <img src={TOKEN_STAT_PLACEHOLDER_IMAGES.total} alt="" />,
    },
    {
      key: 'enabled',
      label: labels.enabled,
      value: enabledCount,
      desc: labels.enabledDesc,
      icon: <img src={TOKEN_STAT_PLACEHOLDER_IMAGES.enabled} alt="" />,
    },
    {
      key: 'expiring',
      label: labels.expiringSoon,
      value: expiringSoonCount,
      desc: labels.expiringSoonDesc,
      icon: <img src={TOKEN_STAT_PLACEHOLDER_IMAGES.expiring} alt="" />,
    },
    {
      key: 'spend7d',
      label: labels.spend7d,
      value: spend7dDisplay,
      desc: labels.spend7dDesc,
      icon: <span aria-hidden>¥</span>,
    },
  ];

  return (
    <section className="tokens-summary">
      {cards.map((card) => (
        <div key={card.key} className="tokens-stat-card">
          <div className="tokens-stat-icon">{card.icon}</div>
          <div>
            <div className="tokens-stat-label">{card.label}</div>
            <div className="tokens-stat-value">{card.value}</div>
            <div className="tokens-stat-desc">{card.desc}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
