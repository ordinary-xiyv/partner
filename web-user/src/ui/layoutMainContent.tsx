import type { CSSProperties, ReactNode } from 'react';

/**
 * MainLayout 已在 `.layout-main` 上设置内边距（随 `--console-main-pad-*` 缩放，移动端见 console-scale.css）。
 * 子页面勿再套 maxWidth，否则表格会比「分销管理」等页明显变窄。
 */
export const layoutMainOutletSectionStyle: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
};

export function LayoutMainOutletSection({ children }: { children: ReactNode }) {
  return <div style={layoutMainOutletSectionStyle}>{children}</div>;
}
