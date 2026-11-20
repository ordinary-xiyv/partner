import React from 'react';
import './page-panel.css';

export interface PagePanelProps {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  style?: React.CSSProperties;
}

/** 列表/内容白卡片外壳，叠在 --bg-page 灰底之上 */
export function PagePanel({ children, className = '', padded = false, style }: PagePanelProps) {
  const classes = ['lynx-page-panel', padded ? 'lynx-page-panel--padded' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}

export function PageStack({
  children,
  gap = 16,
  className = '',
}: {
  children: React.ReactNode;
  gap?: number;
  className?: string;
}) {
  return (
    <div className={['lynx-page-stack', className].filter(Boolean).join(' ')} style={{ gap }}>
      {children}
    </div>
  );
}
