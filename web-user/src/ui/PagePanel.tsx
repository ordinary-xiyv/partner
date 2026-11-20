import React from 'react';
import './page-panel.css';

export interface PagePanelProps {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  style?: React.CSSProperties;
}

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
