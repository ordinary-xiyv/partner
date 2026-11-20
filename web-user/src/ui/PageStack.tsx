import React from 'react';
import './page-panel.css';

export function PageStack({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`lynx-page-stack ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
