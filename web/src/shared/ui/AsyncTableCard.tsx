import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import './page-panel.css';

export type AsyncTableCardProps<RecordType extends object = Record<string, unknown>> = {
  /** 顶部工具栏：筛选器、重置、导出等由页面自行编排 */
  toolbar?: React.ReactNode;
  /** 表格与工具栏之间的摘要条（可选） */
  statusBar?: React.ReactNode;
  /** 透传给 antd Table */
  tableProps: TableProps<RecordType>;
  panelStyle?: React.CSSProperties;
  className?: string;
  tableWrapClassName?: string;
  tableWrapStyle?: React.CSSProperties;
  /** 工具栏与表格之间的底部分割线，默认显示 */
  toolbarBordered?: boolean;
  /** 嵌在已有 PagePanel 内时使用：不渲染外层白卡片，避免双层卡片 */
  bare?: boolean;
};

/**
 * 列表页通用外壳：面板容器 + 可选工具栏 + 可选状态条 + Table。
 * 数据请求与筛选状态由页面持有，避免「万能表格」配置膨胀。
 */
export function AsyncTableCard<RecordType extends object = Record<string, unknown>>({
  toolbar,
  statusBar,
  tableProps,
  panelStyle,
  className,
  tableWrapClassName,
  tableWrapStyle,
  toolbarBordered = true,
  bare = false,
}: AsyncTableCardProps<RecordType>) {
  const resolvedTableWrapStyle =
    tableWrapStyle ?? (bare ? { paddingTop: 12 } : { padding: '4px 20px 20px' });

  const body = (
    <>
      {toolbar != null && (
        <div
          style={{
            ...(bare ? {} : { padding: '18px 20px' }),
            ...(toolbarBordered ? { borderBottom: '1px solid var(--border-default)' } : {}),
          }}
        >
          {toolbar}
        </div>
      )}
      {statusBar}
      <div style={resolvedTableWrapStyle} className={tableWrapClassName}>
        <Table<RecordType> {...tableProps} />
      </div>
    </>
  );

  if (bare) {
    return <div className={className}>{body}</div>;
  }

  return (
    <div
      style={{ overflow: 'hidden', ...panelStyle }}
      className={['lynx-page-panel', className].filter(Boolean).join(' ')}
    >
      {body}
    </div>
  );
}
