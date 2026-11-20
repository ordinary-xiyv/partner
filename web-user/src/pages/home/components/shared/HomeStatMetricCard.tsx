import { Card } from 'antd';
import type { ReactNode } from 'react';
import './home-shared.css';

interface HomeStatMetricCardProps {
  value: ReactNode;
  label: string;
  note: string;
  accentValue?: boolean;
}

export function HomeStatMetricCard({ value, label, note, accentValue = false }: HomeStatMetricCardProps) {
  const className = ['home-stat-metric-card', accentValue ? 'home-stat-metric-card--accent' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <Card className={className} bordered={false} styles={{ body: { padding: '20px 22px' } }}>
      <div className="home-stat-value">{value}</div>
      <div className="home-stat-label">{label}</div>
      <p className="home-stat-note">{note}</p>
    </Card>
  );
}
